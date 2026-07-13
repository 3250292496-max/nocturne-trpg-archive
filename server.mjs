import http from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const root = fileURLToPath(new URL('.', import.meta.url));
const normalizedRoot = normalize(root).replace(/[\\/]+$/, '') + sep;
const port = Number(process.env.PORT || 4173);
const localKeyPath = join(root, '.keeper-key');
const configuredAccessKey = String(
  process.env.NG_ACCESS_KEY || (existsSync(localKeyPath) ? readFileSync(localKeyPath, 'utf8') : '')
).trim();
const accessKeyHash = configuredAccessKey
  ? createHash('sha256').update(configuredAccessKey.toUpperCase()).digest()
  : null;
const sessionToken = randomBytes(32).toString('hex');
const sessionCookie = 'ng_keeper_session';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.enc': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

const publicFiles = new Set([
  'index.html', 'styles.css', 'app.js', 'access.js',
  'gm.html', 'gm.css', 'gm.js', 'gm-gate.js',
  'player.html', 'player.css', 'player.js', 'player-data.js',
  'secure/manifest.json', 'secure/verifier.enc', 'secure/gm-data.enc',
  'secure/book-1-main-module.docx.enc',
  'secure/book-2-npc-servants.docx.enc',
  'secure/book-4-keeper-tools.docx.enc',
  'secure/player-handout-print-pack.docx.enc',
  'secure/staged-clue-pack.docx.enc',
  'nullgrail《零之圣杯》v3.2 最终版/四册正文/《零之圣杯》第三册·玩家手册（v3.2）.docx',
  'nullgrail《零之圣杯》v3.2 最终版/配套资料/《零之圣杯》统一规则与跨册索引（v3.2）.docx',
  'nullgrail《零之圣杯》v3.2 最终版/配套资料/《零之圣杯》玩家公开资料包（v3.2）.docx'
].map((item) => item.toLowerCase()));

const protectedFiles = new Set([
  'gm-data.js',
  'nullgrail《零之圣杯》v3.2 最终版/四册正文/《零之圣杯》第一册·主模组（v3.2）.docx',
  'nullgrail《零之圣杯》v3.2 最终版/四册正文/《零之圣杯》第二册·npc与英灵手册（v3.2）.docx',
  'nullgrail《零之圣杯》v3.2 最终版/四册正文/《零之圣杯》第四册·主持人工具书（v3.2）.docx',
  'nullgrail《零之圣杯》v3.2 最终版/配套资料/《零之圣杯》分阶段线索发放包（v3.2）.docx',
  'nullgrail《零之圣杯》v3.2 最终版/配套资料/《零之圣杯》玩家手卡打印包（v3.2）.docx'
].map((item) => item.toLowerCase()));

const publicAssetExtensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp']);

function sendJson(response, status, payload, headers) {
  response.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, headers || {}));
  response.end(JSON.stringify(payload));
}

function hasSession(request) {
  const cookie = request.headers.cookie || '';
  return cookie.split(';').some((part) => {
    const pair = part.trim().split('=');
    return pair[0] === sessionCookie && pair[1] === sessionToken;
  });
}

function normalizeRequestPath(pathname) {
  const slashPath = String(pathname || '/').replace(/\\/g, '/');
  const requested = slashPath === '/' ? 'index.html' : slashPath.replace(/^\/+/, '');
  const normalized = posix.normalize('/' + requested).replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized.startsWith('../')) return null;
  if (normalized.split('/').some((segment) => !segment || segment.startsWith('.'))) return null;
  return normalized;
}

function accessClass(relativePath) {
  const folded = relativePath.toLowerCase();
  if (protectedFiles.has(folded)) return 'protected';
  if (publicFiles.has(folded)) return 'public';
  if (folded.startsWith('assets/') && publicAssetExtensions.has(extname(folded))) return 'public';
  return 'denied';
}

function handleAccess(request, response) {
  if (!accessKeyHash) {
    sendJson(response, 503, { ok: false, message: '尚未配置守秘人密钥' });
    return;
  }
  const chunks = [];
  let total = 0;
  request.on('data', (chunk) => {
    total += chunk.length;
    if (total <= 4096) chunks.push(chunk);
  });
  request.on('end', () => {
    if (total > 4096) {
      sendJson(response, 413, { ok: false });
      return;
    }
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const supplied = createHash('sha256')
        .update(String(payload.key || '').trim().toUpperCase())
        .digest();
      if (!timingSafeEqual(supplied, accessKeyHash)) {
        sendJson(response, 401, { ok: false });
        return;
      }
      sendJson(response, 200, { ok: true }, {
        'Set-Cookie': sessionCookie + '=' + sessionToken + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'
      });
    } catch {
      sendJson(response, 400, { ok: false });
    }
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('400 · 无效路径');
    return;
  }

  if (pathname === '/api/access' && request.method === 'POST') {
    handleAccess(request, response);
    return;
  }
  if (pathname === '/api/access' && request.method === 'DELETE') {
    sendJson(response, 200, { ok: true }, {
      'Set-Cookie': sessionCookie + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
    });
    return;
  }
  if (pathname === '/api/access/status' && request.method === 'GET') {
    sendJson(response, 200, { authorized: hasSession(request) });
    return;
  }

  const relativePath = normalizeRequestPath(pathname);
  const classification = relativePath ? accessClass(relativePath) : 'denied';
  if (classification === 'denied') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('404 · 这份档案未公开');
    return;
  }
  if (classification === 'protected' && !hasSession(request)) {
    sendJson(response, 401, { ok: false, message: '需要守秘人访问密钥' });
    return;
  }

  const filePath = normalize(join(root, relativePath));
  if (!filePath.startsWith(normalizedRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('404 · 这份档案尚未归档');
    return;
  }

  response.writeHead(200, {
    'Content-Type': types[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log('夜航模组馆已点亮：http://127.0.0.1:' + port);
  if (!accessKeyHash) {
    console.log('尚未配置守秘人密钥；请设置 NG_ACCESS_KEY 或创建本地 .keeper-key。');
  }
});
