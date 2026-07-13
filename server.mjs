import http from 'node:http';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { basename, extname, join, normalize, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual
} from 'node:crypto';

const root = fileURLToPath(new URL('.', import.meta.url));
const normalizedRoot = normalize(root).replace(/[\\/]+$/, '') + sep;
const port = Number(process.env.PORT || 4173);
const host = String(process.env.HOST || '127.0.0.1');
const localKeyPath = join(root, '.keeper-key');
const configuredAccessKeySource = process.env.NG_ACCESS_KEY
  ? 'environment'
  : existsSync(localKeyPath) ? 'file' : 'none';
const configuredAccessKey = String(
  process.env.NG_ACCESS_KEY || (existsSync(localKeyPath) ? readFileSync(localKeyPath, 'utf8') : '')
).trim();
const allowedOrigins = new Set(String(process.env.NG_ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => {
    try { return new URL(value).origin; } catch { return ''; }
  })
  .filter(Boolean));
const dataDirectory = String(process.env.NG_DATA_DIR || '').trim()
  ? resolve(String(process.env.NG_DATA_DIR).trim())
  : join(root, '.data');
const usersPath = join(dataDirectory, 'users.json');
const modulesPath = join(dataDirectory, 'modules.json');
const moduleUploadDirectory = join(dataDirectory, 'module-uploads');
const authSessionCookie = 'ng_site_session';
const keeperSessionCookie = 'ng_keeper_session';
const sessionLifetimeMs = 12 * 60 * 60 * 1000;
const maxJsonBodyBytes = 256 * 1024;
const maxUploadBodyBytes = 32 * 1024 * 1024;
const maxAvatarDataLength = 180 * 1024;
const ownerId = 'site-owner-3250292496';
const ownerAccount = '3250292496';
const ownerPasswordHash = String(process.env.NG_OWNER_PASSWORD_HASH || 'scrypt$32768$8$1$Rb6x9PsMNAcDWeU8kvyUMg$leDZTheJKPhTrPjpzHAcVNK2DUMl0XvrP4vd9ark9T1Xdce5QMmBJ7fwmXmjfFuajDggXs7uiy_ZzzpbKwsXFQ');

const authSessions = new Map();
const keeperSessions = new Map();
const loginAttempts = new Map();

const moduleCategories = new Set(['info', 'map', 'rules', 'builder', 'module', 'handouts', 'other']);
const moduleAudiences = new Set(['player', 'keeper', 'creator']);
const moduleExtensions = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.csv', '.tsv', '.txt', '.md', '.json', '.yaml', '.yml', '.rtf',
  '.zip', '.png', '.jpg', '.jpeg', '.webp'
]);

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
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.rtf': 'application/rtf',
  '.zip': 'application/zip'
};

const publicFiles = new Set([
  'index.html', 'styles.css', 'font-size.css', 'font-size.js', 'app.js', 'access.js', 'site-auth.js', 'modules-data.js',
  'profile.html', 'profile.css', 'profile.js',
  'studio.html', 'studio.css', 'studio.js',
  'module.html', 'module.css', 'module.js',
  'run.html', 'run.css', 'run.js',
  'gm.html', 'gm.css', 'gm.js', 'gm-gate.js',
  'player.html', 'player.css', 'player.js', 'player-data.js',
  'coc7.html', 'coc7.css', 'coc7.js', 'coc7-data.js', 'coc7-core.js', 'coc7-xlsx.js',
  'combat.html', 'combat.css', 'combat.js',
  'secure/manifest.json', 'secure/verifier.enc', 'secure/gm-data.enc',
  'secure/book-1-main-module.docx.enc',
  'secure/book-2-npc-servants.docx.enc',
  'secure/book-4-keeper-tools.docx.enc',
  'secure/player-handout-print-pack.docx.enc',
  'secure/staged-clue-pack.docx.enc',
  'NullGrail《零之圣杯》/四册正文/《零之圣杯》第三册·玩家手册.docx',
  'NullGrail《零之圣杯》/配套资料/《零之圣杯》统一规则与跨册索引.docx',
  'NullGrail《零之圣杯》/配套资料/《零之圣杯》玩家公开资料包.docx',
  'NullGrail《零之圣杯》/规则书/《零之圣杯》通用圣杯战争规则书.docx',
  '圣杯/零之圣杯_完整套件/自动车卡/《零之圣杯》完整自动车卡表_v1.1.xlsx',
  'assets/rules/COC七版规则空白卡.xlsx'
].map((item) => item.toLowerCase()));

const protectedFiles = new Set([
  'gm-data.js',
  'NullGrail《零之圣杯》/四册正文/《零之圣杯》第一册·主模组.docx',
  'NullGrail《零之圣杯》/四册正文/《零之圣杯》第二册·NPC与英灵手册.docx',
  'NullGrail《零之圣杯》/四册正文/《零之圣杯》第四册·主持人工具书.docx',
  'NullGrail《零之圣杯》/配套资料/《零之圣杯》分阶段线索发放包.docx',
  'NullGrail《零之圣杯》/配套资料/《零之圣杯》玩家手卡打印包.docx'
].map((item) => item.toLowerCase()));

const publicAssetExtensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp']);

function nowIso() {
  return new Date().toISOString();
}

function accountKey(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function cleanText(value, maximum) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maximum);
}

function generateModuleAccessKey() {
  const compact = randomBytes(12).toString('hex').toUpperCase();
  return compact.match(/.{1,4}/g).join('-');
}

function normalizeRunbook(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const itemId = (candidate, prefix) => moduleIdValue(candidate) || prefix + '-' + randomUUID().slice(0, 12);
  const list = (name, limit, normalizer) => (Array.isArray(source[name]) ? source[name] : [])
    .slice(0, limit)
    .map((item) => normalizer(item && typeof item === 'object' && !Array.isArray(item) ? item : {}))
    .filter(Boolean);
  return {
    opening: cleanText(source.opening, 4000),
    scenes: list('scenes', 80, (item) => {
      const title = cleanText(item.title, 120);
      if (!title) return null;
      return {
        id: itemId(item.id, 'scene'),
        title,
        summary: cleanText(item.summary, 1200),
        goal: cleanText(item.goal, 1200)
      };
    }),
    npcs: list('npcs', 120, (item) => {
      const name = cleanText(item.name, 100);
      if (!name) return null;
      return {
        id: itemId(item.id, 'npc'),
        name,
        role: cleanText(item.role, 160),
        note: cleanText(item.note, 1600)
      };
    }),
    clues: list('clues', 160, (item) => {
      const title = cleanText(item.title, 120);
      if (!title) return null;
      return {
        id: itemId(item.id, 'clue'),
        title,
        text: cleanText(item.text, 2400)
      };
    }),
    trackers: list('trackers', 24, (item) => {
      const name = cleanText(item.name, 80);
      if (!name) return null;
      const maximum = Math.max(1, Math.min(20, Number.parseInt(item.maximum, 10) || 4));
      return { id: itemId(item.id, 'tracker'), name, maximum };
    })
  };
}

function avatarDataUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length > maxAvatarDataLength) return null;
  return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(text) ? text : null;
}

function moduleIdValue(value) {
  const candidate = cleanText(value, 64).toLowerCase();
  return /^[a-z0-9](?:[a-z0-9_-]{0,63})$/.test(candidate) ? candidate : '';
}

function moduleMime(fileName) {
  return types[extname(String(fileName || '')).toLowerCase()] || 'application/octet-stream';
}

function cleanFileName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '_')
    .trim()
    .slice(0, 180);
}

function fileSize(relativePath) {
  try {
    const filePath = normalize(join(root, relativePath));
    if (!filePath.startsWith(normalizedRoot) || !existsSync(filePath)) return 0;
    const statistics = statSync(filePath);
    return statistics.isFile() ? statistics.size : 0;
  } catch {
    return 0;
  }
}

function seededResource(id, title, category, audience, relativePath) {
  const fileName = basename(relativePath);
  return {
    id,
    title,
    category,
    audience,
    fileName,
    mime: moduleMime(fileName),
    size: fileSize(relativePath),
    legacyPath: relativePath,
    storageName: null,
    uploadedAt: '2026-07-13T00:00:00.000Z'
  };
}

function seedNullGrail() {
  return {
    id: 'null-grail',
    title: '零之圣杯',
    english: 'NULL GRAIL',
    summary: '七日轮回的圣杯战争里，你们是系统无法命名的空白变量。',
    description: '东湖市跨年夜，天空像玻璃一样裂开。规则书、自动车卡器、主模组、人物手册、玩家资料和主持工具共同组成这一份完整作品。',
    systems: ['fate', 'agnostic'],
    rulesetId: 'null-grail-core-d20-v2.1',
    systemLabel: '《零之圣杯》通用圣杯战争规则 · 规则版本 2.1',
    type: 'campaign',
    typeLabel: '完整长篇战役模组',
    tone: 'gold',
    accent: '#d4ad6b',
    icon: 'grail',
    players: '3–5 人（4 人最佳）',
    duration: '标准 8 次 × 3–4 小时',
    era: '2018 年末 · 架空现代东湖市',
    difficulty: '进阶',
    tags: ['轮回', '都市异闻', '角色抉择', '完整工具链'],
    status: 'published',
    ownerId,
    edition: '战役资料 · 规则 2.1',
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    resources: [
      seededResource(
        'rules-v2-1', '通用圣杯战争规则书 · 规则版本 2.1（现行）', 'rules', 'player',
        'NullGrail《零之圣杯》/规则书/《零之圣杯》通用圣杯战争规则书.docx'
      ),
      seededResource(
        'builder-v1-1', '完整自动车卡器 v1.1', 'builder', 'player',
        '圣杯/零之圣杯_完整套件/自动车卡/《零之圣杯》完整自动车卡表_v1.1.xlsx'
      ),
      seededResource(
        'player-guide-v3-2', '第三册 · 玩家手册', 'info', 'player',
        'NullGrail《零之圣杯》/四册正文/《零之圣杯》第三册·玩家手册.docx'
      ),
      seededResource(
        'player-pack-v3-2', '玩家公开资料包', 'handouts', 'player',
        'NullGrail《零之圣杯》/配套资料/《零之圣杯》玩家公开资料包.docx'
      ),
      seededResource(
        'cross-index-v3-2', '统一规则与跨册索引', 'info', 'player',
        'NullGrail《零之圣杯》/配套资料/《零之圣杯》统一规则与跨册索引.docx'
      ),
      seededResource(
        'eastlake-map', '东湖市完整地图', 'map', 'player',
        'assets/art/eastlake-map.webp'
      ),
      seededResource(
        'main-module-v3-2', '第一册 · 主模组', 'module', 'keeper',
        'NullGrail《零之圣杯》/四册正文/《零之圣杯》第一册·主模组.docx'
      ),
      seededResource(
        'npc-guide-v3-2', '第二册 · NPC 与英灵手册', 'info', 'keeper',
        'NullGrail《零之圣杯》/四册正文/《零之圣杯》第二册·NPC与英灵手册.docx'
      ),
      seededResource(
        'keeper-toolkit-v3-2', '第四册 · 主持人工具书（战役内容，非规则书）', 'info', 'keeper',
        'NullGrail《零之圣杯》/四册正文/《零之圣杯》第四册·主持人工具书.docx'
      ),
      seededResource(
        'player-handouts-v3-2', '玩家手卡打印包', 'handouts', 'keeper',
        'NullGrail《零之圣杯》/配套资料/《零之圣杯》玩家手卡打印包.docx'
      ),
      seededResource(
        'staged-clues-v3-2', '分阶段线索发放包', 'handouts', 'keeper',
        'NullGrail《零之圣杯》/配套资料/《零之圣杯》分阶段线索发放包.docx'
      )
    ]
  };
}

function normalizedTimestamp(value, fallback) {
  const candidate = cleanText(value, 40);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? new Date(candidate).toISOString() : fallback;
}

function normalizeResource(resource) {
  if (!resource || typeof resource !== 'object') return null;
  const fileName = cleanFileName(resource.fileName || resource.name);
  if (!fileName) return null;
  const category = moduleCategories.has(resource.category) ? resource.category : 'other';
  const audience = moduleAudiences.has(resource.audience)
    ? resource.audience
    : resource.secret ? 'keeper' : 'player';
  const storageName = /^[a-zA-Z0-9._-]{1,200}$/.test(String(resource.storageName || ''))
    ? String(resource.storageName)
    : null;
  let legacyPath = cleanText(resource.legacyPath || (!storageName ? resource.href : ''), 500) || null;
  if (legacyPath && (legacyPath.startsWith('/') || legacyPath.split(/[\\/]/).some((part) => part === '..' || part.startsWith('.')))) {
    legacyPath = null;
  }
  if (!storageName && !legacyPath) return null;
  let webHref = null;
  if (resource.webHref) {
    try {
      const parsedHref = new URL(String(resource.webHref), 'http://local.invalid/');
      const relativeHrefPath = normalizeRequestPath(decodeURIComponent(parsedHref.pathname));
      if (parsedHref.origin === 'http://local.invalid' && relativeHrefPath && accessClass(relativeHrefPath) === 'public') {
        webHref = relativeHrefPath + parsedHref.search + parsedHref.hash;
      }
    } catch {
      webHref = null;
    }
  }
  const id = moduleIdValue(resource.id) || randomUUID();
  return {
    id,
    title: cleanText(resource.title || resource.name || fileName.replace(/\.[^.]+$/, ''), 120) || fileName,
    category,
    audience,
    fileName,
    mime: cleanText(resource.mime, 120) || moduleMime(fileName),
    size: Number.isSafeInteger(resource.size) && resource.size >= 0 ? resource.size : 0,
    legacyPath,
    storageName,
    webHref,
    uploadedAt: normalizedTimestamp(resource.uploadedAt, '2026-07-13T00:00:00.000Z')
  };
}

function normalizeModule(module) {
  if (!module || typeof module !== 'object') return null;
  const id = moduleIdValue(module.id);
  if (!id) return null;
  const createdAt = normalizedTimestamp(module.createdAt, '2026-07-13T00:00:00.000Z');
  const resources = [];
  const resourceIds = new Set();
  for (const source of Array.isArray(module.resources) ? module.resources : []) {
    const resource = normalizeResource(source);
    if (!resource || resourceIds.has(resource.id)) continue;
    resourceIds.add(resource.id);
    resources.push(resource);
  }
  const suppliedRulesetId = cleanText(module.rulesetId, 64).toLowerCase();
  const rulesetId = ['null-grail-core-d20-v2', 'null-grail-core-d20-v2.0'].includes(suppliedRulesetId)
    ? 'null-grail-core-d20-v2.1'
    : suppliedRulesetId;
  return {
    id,
    title: cleanText(module.title, 100) || '未命名模组',
    english: cleanText(module.english, 100),
    summary: cleanText(module.summary, 400),
    description: cleanText(module.description, 5000),
    systems: Array.isArray(module.systems) ? module.systems.map((system) => cleanText(system, 32).toLowerCase()).filter(Boolean).slice(0, 8) : [],
    rulesetId: rulesetId || (id === 'null-grail' ? 'null-grail-core-d20-v2.1' : ''),
    systemLabel: cleanText(module.systemLabel, 120),
    type: ['campaign', 'guide', 'toolkit', 'handout'].includes(module.type) ? module.type : 'campaign',
    typeLabel: cleanText(module.typeLabel, 120),
    tone: cleanText(module.tone, 24),
    accent: /^#[0-9a-f]{6}$/i.test(cleanText(module.accent, 16)) ? cleanText(module.accent, 16) : '',
    icon: cleanText(module.icon, 32),
    players: cleanText(module.players, 60),
    duration: cleanText(module.duration, 60),
    era: cleanText(module.era, 80),
    difficulty: cleanText(module.difficulty, 80),
    tags: Array.isArray(module.tags)
      ? module.tags.map((tag) => cleanText(tag, 32)).filter(Boolean).slice(0, 16)
      : [],
    status: module.status === 'published' ? 'published' : 'draft',
    ownerId: cleanText(module.ownerId, 80) || (id === 'null-grail' ? ownerId : ownerId),
    edition: cleanText(module.edition, 40),
    createdAt,
    updatedAt: normalizedTimestamp(module.updatedAt, createdAt),
    accessKey: id === 'null-grail'
      ? ''
      : cleanText(module.accessKey, 80) || generateModuleAccessKey(),
    runbook: normalizeRunbook(module.runbook),
    resources
  };
}

function persistModules() {
  mkdirSync(dataDirectory, { recursive: true });
  mkdirSync(moduleUploadDirectory, { recursive: true });
  const temporaryPath = modulesPath + '.' + process.pid + '.' + randomBytes(6).toString('hex') + '.tmp';
  writeFileSync(temporaryPath, JSON.stringify(moduleDatabase, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600
  });
  renameSync(temporaryPath, modulesPath);
}

function loadModules() {
  mkdirSync(dataDirectory, { recursive: true });
  mkdirSync(moduleUploadDirectory, { recursive: true });
  let parsed = { version: 1, modules: [] };
  if (existsSync(modulesPath)) parsed = JSON.parse(readFileSync(modulesPath, 'utf8'));
  const source = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.modules) ? parsed.modules : null;
  if (!source) throw new Error('Invalid .data/modules.json structure.');
  const modules = [];
  const ids = new Set();
  for (const value of source) {
    let prepared = value;
    if (value && moduleIdValue(value.id) === 'null-grail') {
      const seed = seedNullGrail();
      const suppliedResources = Array.isArray(value.resources) ? value.resources : seed.resources;
      const currentRule = seed.resources.find((resource) => resource.id === 'rules-v2-1');
      const seededResources = new Map(seed.resources.map((resource) => [resource.id, resource]));
      const migratedResources = suppliedResources
        .filter((resource) => resource && !['rules-v2-0-character-library', 'rules-v2-1'].includes(resource.id))
        .map((resource) => seededResources.has(resource.id) ? { ...resource, ...seededResources.get(resource.id) } : resource);
      if (currentRule && !migratedResources.some((resource) => resource.id === currentRule.id)) migratedResources.unshift(currentRule);
      prepared = {
        ...seed,
        ...value,
        rulesetId: 'null-grail-core-d20-v2.1',
        systemLabel: seed.systemLabel,
        edition: '战役资料 · 规则 2.1',
        resources: migratedResources
      };
    }
    // COC7 is a rules reference and a set of site tools, not a community
    // module. Version 5 migrates the old misclassified archive entry out of
    // the module database while keeping coc7.html and combat.html public.
    if (value && moduleIdValue(value.id) === 'coc7') continue;
    const module = normalizeModule(prepared);
    if (!module || ids.has(module.id)) continue;
    ids.add(module.id);
    modules.push(module);
  }
  if (!ids.has('null-grail')) modules.unshift(seedNullGrail());
  if (Number(parsed && parsed.version || 1) < 2) {
    const nullGrail = modules.find((module) => module.id === 'null-grail');
    if (nullGrail && !nullGrail.resources.some((resource) => resource.id === 'eastlake-map')) {
      const mapResource = seedNullGrail().resources.find((resource) => resource.id === 'eastlake-map');
      if (mapResource) nullGrail.resources.push(mapResource);
    }
  }
  const database = { version: 6, modules };
  return {
    database,
    changed: !existsSync(modulesPath) || JSON.stringify(parsed) !== JSON.stringify(database)
  };
}

function baseOwner() {
  return {
    id: ownerId,
    account: ownerAccount,
    accountKey: ownerAccount,
    passwordHash: ownerPasswordHash,
    displayName: '夜航模组馆馆主',
    bio: '愿这座档案馆既方便自己的创作，也让每一位跑团同好都能更轻松地找到、阅读并使用好故事。',
    avatar: '',
    role: 'owner',
    authorStatus: 'verified',
    authorApplication: null,
    locked: true,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z'
  };
}

function persistUsers() {
  mkdirSync(dataDirectory, { recursive: true });
  const temporaryPath = usersPath + '.' + process.pid + '.' + randomBytes(6).toString('hex') + '.tmp';
  writeFileSync(temporaryPath, JSON.stringify(userDatabase, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600
  });
  renameSync(temporaryPath, usersPath);
}

function loadUsers() {
  mkdirSync(dataDirectory, { recursive: true });
  let database = { version: 1, users: [] };
  if (existsSync(usersPath)) {
    const parsed = JSON.parse(readFileSync(usersPath, 'utf8'));
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.users)) {
      throw new Error('Invalid .data/users.json structure.');
    }
    database = parsed;
  }

  const ownerTemplate = baseOwner();
  const existingIndex = database.users.findIndex((user) =>
    user && (user.id === ownerId || accountKey(user.account) === ownerAccount)
  );
  if (existingIndex < 0) {
    database.users.unshift(ownerTemplate);
    return { database, changed: true };
  }

  const existing = database.users[existingIndex] || {};
  database.users[existingIndex] = {
    ...ownerTemplate,
    displayName: cleanText(existing.displayName, 40) || ownerTemplate.displayName,
    bio: cleanText(existing.bio, 500) || ownerTemplate.bio,
    avatar: avatarDataUrl(existing.avatar) || '',
    createdAt: existing.createdAt || ownerTemplate.createdAt,
    updatedAt: existing.updatedAt || ownerTemplate.updatedAt
  };
  return {
    database,
    changed: JSON.stringify(existing) !== JSON.stringify(database.users[existingIndex])
  };
}

const loadedUsers = loadUsers();
const userDatabase = loadedUsers.database;
if (loadedUsers.changed || !existsSync(usersPath)) persistUsers();

const loadedModules = loadModules();
const moduleDatabase = loadedModules.database;
if (loadedModules.changed || !existsSync(modulesPath)) persistModules();

function encodePassword(password) {
  const salt = randomBytes(16);
  const cost = 32768;
  const blockSize = 8;
  const parallelization = 1;
  const derived = scryptSync(password, salt, 64, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: 64 * 1024 * 1024
  });
  return ['scrypt', cost, blockSize, parallelization, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

function passwordMatches(password, encoded) {
  try {
    const parts = String(encoded || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const cost = Number(parts[1]);
    const blockSize = Number(parts[2]);
    const parallelization = Number(parts[3]);
    if (cost < 16384 || blockSize < 1 || parallelization < 1) return false;
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    const supplied = scryptSync(String(password || ''), salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 64 * 1024 * 1024
    });
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  } catch {
    return false;
  }
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}

function sendJson(response, status, payload, headers) {
  response.writeHead(status, Object.assign({
    ...securityHeaders(),
    ...(response.corsHeaders || {}),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }, headers || {}));
  response.end(payload === undefined ? '' : JSON.stringify(payload));
}

function sendApiError(response, status, message, code) {
  sendJson(response, status, { ok: false, code: code || 'request_failed', message });
}

function cookieValue(request, name) {
  const cookie = request.headers.cookie || '';
  for (const part of cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return '';
}

function requestIsSecure(request) {
  return Boolean(request.socket.encrypted) || String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function requestOrigin(request) {
  const value = String(request.headers.origin || '').trim();
  if (!value) return '';
  try { return new URL(value).origin; } catch { return ''; }
}

function requestHostOrigin(request) {
  const protocol = requestIsSecure(request) ? 'https:' : 'http:';
  const hostValue = String(request.headers.host || '').trim();
  return hostValue ? protocol + '//' + hostValue : '';
}

function configuredCrossOrigin(request) {
  const origin = requestOrigin(request);
  return Boolean(origin && allowedOrigins.has(origin) && origin !== requestHostOrigin(request));
}

function corsHeaders(request) {
  const origin = requestOrigin(request);
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };
}

function sessionCookie(request, name, value, maxAgeSeconds) {
  const crossOrigin = configuredCrossOrigin(request);
  const parts = [name + '=' + value, 'HttpOnly', crossOrigin ? 'SameSite=None' : 'SameSite=Strict', 'Path=/', 'Max-Age=' + maxAgeSeconds];
  if (requestIsSecure(request) || crossOrigin) parts.push('Secure');
  return parts.join('; ');
}

function digestToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function pruneSessions(store) {
  const now = Date.now();
  for (const [key, session] of store) {
    if (!session || session.expiresAt <= now) store.delete(key);
  }
}

function createSession(store, metadata) {
  pruneSessions(store);
  const token = randomBytes(32).toString('base64url');
  store.set(digestToken(token), {
    ...metadata,
    createdAt: Date.now(),
    expiresAt: Date.now() + sessionLifetimeMs
  });
  return token;
}

function findUserByAccount(account) {
  const key = accountKey(account);
  return userDatabase.users.find((user) => user && user.accountKey === key) || null;
}

function findUserById(id) {
  return userDatabase.users.find((user) => user && user.id === id) || null;
}

function findModuleById(id) {
  return moduleDatabase.modules.find((module) => module && module.id === id) || null;
}

function authenticatedUser(request) {
  pruneSessions(authSessions);
  const token = cookieValue(request, authSessionCookie);
  if (!token) return null;
  const session = authSessions.get(digestToken(token));
  if (!session) return null;
  const user = findUserById(session.userId);
  if (!user || user.disabledAt) return null;
  return user;
}

function keeperSession(request) {
  pruneSessions(keeperSessions);
  const token = cookieValue(request, keeperSessionCookie);
  return token ? keeperSessions.get(digestToken(token)) || null : null;
}

function hasKeeperSession(request, moduleId = 'null-grail') {
  const session = keeperSession(request);
  return Boolean(session && session.moduleId === moduleId);
}

function hasCreatorAccess(request) {
  if (hasKeeperSession(request, 'null-grail')) return true;
  const user = authenticatedUser(request);
  // Protected files in this deployment all belong to Null Grail. A verified
  // author badge alone must never grant access to another author's work.
  return Boolean(user && user.id === ownerId && user.role === 'owner' && user.authorStatus === 'verified');
}

function publicUser(user) {
  return {
    id: user.id,
    account: user.account,
    displayName: cleanText(user.displayName, 40) || '夜航用户',
    bio: user.bio || '',
    avatar: avatarDataUrl(user.avatar) || '',
    role: user.role,
    authorStatus: user.authorStatus || 'none',
    authorApplication: user.authorApplication ? {
      statement: user.authorApplication.statement || '',
      submittedAt: user.authorApplication.submittedAt || null,
      reviewedAt: user.authorApplication.reviewedAt || null,
      status: user.authorApplication.status || user.authorStatus || 'pending'
    } : null,
    locked: Boolean(user.locked),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function canManageModule(user, module) {
  return Boolean(user && module && (
    user.role === 'owner' ||
    module.ownerId === user.id ||
    (module.id === 'null-grail' && user.id === ownerId)
  ));
}

function canOpenModuleConsole(request, module) {
  const user = authenticatedUser(request);
  return Boolean(module && (canManageModule(user, module) || hasKeeperSession(request, module.id)));
}

function resourcePayload(module, resource) {
  return {
    id: resource.id,
    title: resource.title,
    category: resource.category,
    audience: resource.audience,
    fileName: resource.fileName,
    mime: resource.mime || moduleMime(resource.fileName),
    size: resource.size || 0,
    href: resource.webHref || '/api/modules/' + encodeURIComponent(module.id) + '/resources/' + encodeURIComponent(resource.id),
    uploadedAt: resource.uploadedAt
  };
}

function modulePayload(module, includePrivateResources) {
  const owner = findUserById(module.ownerId);
  const payload = {
    id: module.id,
    title: module.title,
    english: module.english,
    summary: module.summary,
    description: module.description,
    systems: module.systems.slice(),
    rulesetId: module.rulesetId || '',
    systemLabel: module.systemLabel,
    type: module.type,
    typeLabel: module.typeLabel,
    tone: module.tone,
    accent: module.accent,
    icon: module.icon,
    players: module.players,
    duration: module.duration,
    era: module.era,
    difficulty: module.difficulty,
    tags: module.tags.slice(),
    status: module.status,
    ownerId: module.ownerId,
    author: {
      name: owner ? cleanText(owner.displayName, 40) || '夜航创作者' : '未知作者',
      displayName: owner ? cleanText(owner.displayName, 40) || '夜航创作者' : '未知作者',
      avatar: owner ? avatarDataUrl(owner.avatar) || '' : '',
      label: owner && owner.role === 'owner' ? '站长 · 已认证作者' : '认证作者'
    },
    edition: module.edition || '',
    createdAt: module.createdAt,
    updatedAt: module.updatedAt,
    resources: module.resources
      .filter((resource) => includePrivateResources || resource.audience === 'player')
      .map((resource) => resourcePayload(module, resource))
  };
  if (includePrivateResources) payload.runbook = normalizeRunbook(module.runbook);
  return payload;
}

function moduleConsolePayload(module) {
  const payload = modulePayload(module, false);
  payload.resources = module.resources
    .filter((resource) => resource.audience !== 'creator')
    .map((resource) => resourcePayload(module, resource));
  payload.runbook = normalizeRunbook(module.runbook);
  return payload;
}

function profilePayload(user) {
  const works = moduleDatabase.modules
    .filter((module) => module.ownerId === user.id)
    .map((module) => ({
      id: module.id,
      title: module.title,
      edition: module.edition || '',
      status: module.status,
      relationship: user.role === 'owner' ? '网站作者 / 作品所有者' : '作品所有者',
      updatedAt: module.updatedAt,
      accessKey: module.id === 'null-grail' ? configuredAccessKey || null : module.accessKey || null,
      accessKeyConfigured: module.id === 'null-grail' ? Boolean(configuredAccessKey) : Boolean(module.accessKey),
      accessKeyRotatable: module.id !== 'null-grail',
      accessKeySource: module.id === 'null-grail' ? configuredAccessKeySource : 'module-database'
    }));
  return { ok: true, user: publicUser(user), works };
}

function sameOriginRequest(request) {
  const origin = requestOrigin(request);
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  try {
    return new URL(origin).host === String(request.headers.host || '');
  } catch {
    return false;
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on('data', (chunk) => {
      total += chunk.length;
      if (total <= maxJsonBodyBytes) chunks.push(chunk);
    });
    request.on('end', () => {
      if (total > maxJsonBodyBytes) {
        reject(Object.assign(new Error('请求内容过大。'), { statusCode: 413 }));
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('请求内容不是有效的 JSON。'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function apiException(statusCode, message, apiCode) {
  return Object.assign(new Error(message), { statusCode, apiCode });
}

function readRawBody(request, maximum) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(request.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > maximum) {
      request.resume();
      reject(apiException(413, '文件大小不能超过 32 MB。', 'payload_too_large'));
      return;
    }
    const chunks = [];
    let total = 0;
    let completed = false;
    request.on('data', (chunk) => {
      total += chunk.length;
      if (total <= maximum) chunks.push(chunk);
    });
    request.on('end', () => {
      if (completed) return;
      completed = true;
      if (total > maximum) reject(apiException(413, '文件大小不能超过 32 MB。', 'payload_too_large'));
      else resolve(Buffer.concat(chunks));
    });
    request.on('aborted', () => {
      if (completed) return;
      completed = true;
      reject(apiException(400, '文件上传被中断。', 'upload_aborted'));
    });
    request.on('error', (error) => {
      if (completed) return;
      completed = true;
      reject(error);
    });
  });
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

const moduleTextLimits = {
  title: 100,
  english: 100,
  summary: 400,
  description: 5000,
  systemLabel: 120,
  typeLabel: 120,
  players: 60,
  duration: 60,
  era: 80,
  difficulty: 80
};

const rulesetLabels = new Map([
  ['null-grail-core-d20-v2.1', '《零之圣杯》通用圣杯战争规则 · 规则版本 2.1'],
  ['coc7-7e', 'Call of Cthulhu · 第七版 · 百分骰']
]);

function applyModuleMetadata(module, payload, creating) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw apiException(400, '模组信息必须是 JSON 对象。', 'invalid_module');
  }
  for (const [field, maximum] of Object.entries(moduleTextLimits)) {
    if (creating || hasOwn(payload, field)) module[field] = cleanText(payload[field], maximum);
  }
  if (creating || hasOwn(payload, 'systems')) {
    const suppliedSystems = hasOwn(payload, 'systems') ? payload.systems : [];
    if (!Array.isArray(suppliedSystems)) throw apiException(400, 'systems 必须是字符串数组。', 'invalid_module');
    module.systems = suppliedSystems.map((system) => cleanText(system, 32).toLowerCase()).filter(Boolean).slice(0, 8);
  }
  if (creating || hasOwn(payload, 'rulesetId')) {
    const suppliedRulesetId = cleanText(payload.rulesetId, 64).toLowerCase();
    const rulesetId = ['null-grail-core-d20-v2', 'null-grail-core-d20-v2.0'].includes(suppliedRulesetId)
      ? 'null-grail-core-d20-v2.1'
      : suppliedRulesetId;
    if (rulesetId && rulesetId !== 'custom' && !rulesetLabels.has(rulesetId)) {
      throw apiException(400, '请选择站内规则系统，或使用“其他 / 自定义规则”。', 'invalid_ruleset');
    }
    module.rulesetId = rulesetId;
    if (rulesetLabels.has(rulesetId) && !hasOwn(payload, 'systemLabel')) module.systemLabel = rulesetLabels.get(rulesetId);
  }
  if (creating || hasOwn(payload, 'type')) module.type = ['campaign', 'guide', 'toolkit', 'handout'].includes(payload.type) ? payload.type : 'campaign';
  if (creating || hasOwn(payload, 'tone')) module.tone = cleanText(payload.tone, 24);
  if (creating || hasOwn(payload, 'accent')) module.accent = /^#[0-9a-f]{6}$/i.test(cleanText(payload.accent, 16)) ? cleanText(payload.accent, 16) : '';
  if (creating || hasOwn(payload, 'icon')) module.icon = cleanText(payload.icon, 32);
  if (!module.title) throw apiException(400, '模组标题不能为空。', 'invalid_module');
  if (creating || hasOwn(payload, 'tags')) {
    const tags = hasOwn(payload, 'tags') ? payload.tags : [];
    if (!Array.isArray(tags)) {
      throw apiException(400, 'tags 必须是字符串数组。', 'invalid_module');
    }
    module.tags = tags.map((tag) => cleanText(tag, 32)).filter(Boolean).slice(0, 16);
  }
  if (creating || hasOwn(payload, 'status')) {
    const status = payload.status || (creating ? 'draft' : module.status);
    if (status !== 'draft' && status !== 'published') {
      throw apiException(400, 'status 必须是 draft 或 published。', 'invalid_module');
    }
    module.status = status;
  }
  if (creating || hasOwn(payload, 'runbook')) {
    module.runbook = normalizeRunbook(hasOwn(payload, 'runbook') ? payload.runbook : {});
  }
  return module;
}

function headerText(request, name) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] || '' : String(value || '');
}

function decodeUploadText(value) {
  const text = String(value || '');
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function uploadFileName(request, url) {
  let supplied = url.searchParams.get('filename') || url.searchParams.get('fileName') ||
    headerText(request, 'x-file-name') || headerText(request, 'x-resource-filename');
  if (!supplied) {
    const disposition = headerText(request, 'content-disposition');
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const quoted = disposition.match(/filename="([^"]+)"/i);
    supplied = encoded ? encoded[1] : quoted ? quoted[1] : '';
  }
  supplied = decodeUploadText(supplied).normalize('NFKC').trim();
  if (!supplied || supplied.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(supplied)) {
    throw apiException(400, '请提供有效的文件名。', 'invalid_file_name');
  }
  const fileName = cleanFileName(supplied);
  const extension = extname(fileName).toLowerCase();
  if (!extension || !moduleExtensions.has(extension)) {
    throw apiException(415, '不支持这个文件扩展名。', 'unsupported_file_type');
  }
  return { fileName, extension };
}

function uploadMetadata(request, url, fileName) {
  const category = cleanText(
    url.searchParams.get('category') || headerText(request, 'x-resource-category'), 20
  ).toLowerCase();
  if (!moduleCategories.has(category)) {
    throw apiException(400, '资源分类必须是 info、map、rules、builder、module、handouts 或 other。', 'invalid_category');
  }
  const audience = cleanText(
    url.searchParams.get('audience') || headerText(request, 'x-resource-audience') || 'creator', 20
  ).toLowerCase();
  if (!moduleAudiences.has(audience)) {
    throw apiException(400, '资源受众必须是 player、keeper 或 creator。', 'invalid_audience');
  }
  const fallbackTitle = fileName.replace(/\.[^.]+$/, '');
  const title = cleanText(
    url.searchParams.get('title') || headerText(request, 'x-resource-title') || fallbackTitle, 120
  );
  if (!title) throw apiException(400, '资源标题不能为空。', 'invalid_resource_title');
  return { category, audience, title };
}

function resourceFilePath(resource) {
  if (resource.storageName && /^[a-zA-Z0-9._-]{1,200}$/.test(resource.storageName)) {
    const uploadRoot = normalize(moduleUploadDirectory).replace(/[\\/]+$/, '') + sep;
    const filePath = normalize(join(moduleUploadDirectory, resource.storageName));
    if (filePath.startsWith(uploadRoot)) return filePath;
  }
  if (resource.legacyPath) {
    const relativePath = normalizeRequestPath(resource.legacyPath);
    const filePath = relativePath ? normalize(join(root, relativePath)) : '';
    if (filePath && filePath.startsWith(normalizedRoot)) return filePath;
  }
  return '';
}

function attachmentHeader(fileName) {
  const fallback = cleanFileName(fileName).replace(/[^A-Za-z0-9._-]/g, '_') || 'resource';
  const encoded = encodeURIComponent(cleanFileName(fileName)).replace(/[!'()*]/g, (character) =>
    '%' + character.charCodeAt(0).toString(16).toUpperCase()
  );
  return 'attachment; filename="' + fallback + '"; filename*=UTF-8\'\'' + encoded;
}

function loginAttemptKey(request, account) {
  return String(request.socket.remoteAddress || 'local') + '|' + accountKey(account);
}

function blockedLogin(request, account) {
  const key = loginAttemptKey(request, account);
  const state = loginAttempts.get(key);
  if (!state) return 0;
  if (state.resetAt <= Date.now()) {
    loginAttempts.delete(key);
    return 0;
  }
  return state.blockedUntil > Date.now() ? Math.ceil((state.blockedUntil - Date.now()) / 1000) : 0;
}

function recordLoginFailure(request, account) {
  const key = loginAttemptKey(request, account);
  const now = Date.now();
  const previous = loginAttempts.get(key);
  const state = !previous || previous.resetAt <= now
    ? { failures: 0, resetAt: now + 15 * 60 * 1000, blockedUntil: 0 }
    : previous;
  state.failures += 1;
  if (state.failures >= 8) state.blockedUntil = now + 15 * 60 * 1000;
  loginAttempts.set(key, state);
}

function clearLoginFailures(request, account) {
  loginAttempts.delete(loginAttemptKey(request, account));
}

function validateRegistration(payload) {
  const account = String(payload.account || '').normalize('NFKC').trim();
  const displayName = cleanText(payload.displayName, 40);
  const password = String(payload.password || '');
  if (!/^[A-Za-z0-9_.-]{4,32}$/.test(account)) {
    return { error: '账号需为 4–32 位英文字母、数字、点、短横线或下划线。' };
  }
  if (displayName.length < 1) return { error: '请填写显示名称。' };
  if (password.length < 8 || password.length > 128) return { error: '密码长度需为 8–128 位。' };
  return { account, displayName, password };
}

function requireUser(request, response) {
  const user = authenticatedUser(request);
  if (!user) sendApiError(response, 401, '请先登录账号。', 'authentication_required');
  return user;
}

function requireCreator(request, response) {
  const user = requireUser(request, response);
  if (!user) return null;
  if (user.role !== 'owner' && user.authorStatus !== 'verified') {
    sendApiError(response, 403, '需要通过作者认证后才能管理模组。', 'creator_access_required');
    return null;
  }
  return user;
}

function moduleAccessKey(module) {
  if (!module) return '';
  return module.id === 'null-grail' ? configuredAccessKey : cleanText(module.accessKey, 80);
}

function moduleAccessKeyPayload(module) {
  const key = moduleAccessKey(module);
  return {
    ok: true,
    workId: module.id,
    key: key || null,
    configured: Boolean(key),
    rotatable: module.id !== 'null-grail',
    source: module.id === 'null-grail' ? configuredAccessKeySource : 'module-database'
  };
}

function invalidateKeeperSessions(moduleId) {
  for (const [token, session] of keeperSessions) {
    if (session && session.moduleId === moduleId) keeperSessions.delete(token);
  }
}

async function handleKeeperAccess(request, response, module = null) {
  const selectedModule = module || findModuleById('null-grail');
  const expectedKey = moduleAccessKey(selectedModule);
  const expectedHash = expectedKey
    ? createHash('sha256').update(expectedKey.toUpperCase()).digest()
    : null;
  if (!expectedHash) {
    sendJson(response, 503, { ok: false, message: '尚未配置守秘人密钥' });
    return;
  }
  const payload = await readJsonBody(request);
  const supplied = createHash('sha256')
    .update(String(payload.key || '').trim().toUpperCase())
    .digest();
  if (!timingSafeEqual(supplied, expectedHash)) {
    sendJson(response, 401, { ok: false });
    return;
  }
  const token = createSession(keeperSessions, { kind: 'keeper', moduleId: selectedModule.id });
  sendJson(response, 200, { ok: true }, {
    'Set-Cookie': sessionCookie(request, keeperSessionCookie, token, sessionLifetimeMs / 1000)
  });
}

async function handleApi(request, response, pathname, url) {
  if (pathname === '/api/access' && request.method === 'POST') {
    if (!sameOriginRequest(request)) sendApiError(response, 403, '请求来源无效。', 'invalid_origin');
    else await handleKeeperAccess(request, response);
    return true;
  }
  if (pathname === '/api/access' && request.method === 'DELETE') {
    const token = cookieValue(request, keeperSessionCookie);
    if (token) keeperSessions.delete(digestToken(token));
    sendJson(response, 200, { ok: true }, {
      'Set-Cookie': sessionCookie(request, keeperSessionCookie, '', 0)
    });
    return true;
  }
  if (pathname === '/api/access/status' && request.method === 'GET') {
    sendJson(response, 200, { authorized: hasCreatorAccess(request) });
    return true;
  }

  const moduleAccessMatch = pathname.match(/^\/api\/modules\/([^/]+)\/access$/);
  if (moduleAccessMatch && request.method === 'POST') {
    if (!sameOriginRequest(request)) {
      sendApiError(response, 403, '请求来源无效。', 'invalid_origin');
      return true;
    }
    const module = findModuleById(moduleAccessMatch[1]);
    if (!module || module.status !== 'published') {
      sendApiError(response, 404, '找不到这个模组。', 'module_not_found');
      return true;
    }
    await handleKeeperAccess(request, response, module);
    return true;
  }
  if (moduleAccessMatch && request.method === 'GET') {
    const module = findModuleById(moduleAccessMatch[1]);
    const user = authenticatedUser(request);
    if (!module || (module.status !== 'published' && !canManageModule(user, module))) {
      sendApiError(response, 404, '找不到这个模组。', 'module_not_found');
      return true;
    }
    sendJson(response, 200, { authorized: canOpenModuleConsole(request, module) });
    return true;
  }
  if (moduleAccessMatch && request.method === 'DELETE') {
    const token = cookieValue(request, keeperSessionCookie);
    if (token) keeperSessions.delete(digestToken(token));
    sendJson(response, 200, { ok: true }, {
      'Set-Cookie': sessionCookie(request, keeperSessionCookie, '', 0)
    });
    return true;
  }

  const moduleConsoleMatch = pathname.match(/^\/api\/modules\/([^/]+)\/console$/);
  if (moduleConsoleMatch && request.method === 'GET') {
    const module = findModuleById(moduleConsoleMatch[1]);
    const user = authenticatedUser(request);
    if (!module || (module.status !== 'published' && !canManageModule(user, module))) {
      sendApiError(response, 404, '找不到这个模组。', 'module_not_found');
      return true;
    }
    if (!canOpenModuleConsole(request, module)) {
      sendApiError(response, 401, '需要作品所有者账号或该模组的开团密钥。', 'module_access_required');
      return true;
    }
    sendJson(response, 200, { ok: true, module: moduleConsolePayload(module) });
    return true;
  }

  const downloadMatch = pathname.match(/^\/api\/modules\/([^/]+)\/resources\/([^/]+)$/);
  if (downloadMatch && request.method === 'GET') {
    const module = findModuleById(downloadMatch[1]);
    const resource = module
      ? module.resources.find((candidate) => candidate.id === downloadMatch[2]) || null
      : null;
    const user = authenticatedUser(request);
    const publicDownload = Boolean(module && resource && module.status === 'published' && resource.audience === 'player');
    const keeperDownload = Boolean(module && resource && resource.audience === 'keeper' && hasKeeperSession(request, module.id));
    if (!module || !resource || (!publicDownload && !keeperDownload && !canManageModule(user, module))) {
      sendApiError(response, 404, '找不到这个资源。', 'resource_not_found');
      return true;
    }
    const filePath = resourceFilePath(resource);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      sendApiError(response, 404, '资源文件尚未归档。', 'resource_file_not_found');
      return true;
    }
    const statistics = statSync(filePath);
    response.writeHead(200, {
      ...securityHeaders(),
      ...(response.corsHeaders || {}),
      'Content-Type': moduleMime(resource.fileName),
      'Content-Length': statistics.size,
      'Content-Disposition': ['.png', '.jpg', '.jpeg', '.webp'].includes(extname(resource.fileName).toLowerCase())
        ? 'inline'
        : attachmentHeader(resource.fileName),
      'Cache-Control': publicDownload ? 'public, max-age=300' : 'no-store',
      'Cross-Origin-Resource-Policy': 'same-origin'
    });
    createReadStream(filePath).pipe(response);
    return true;
  }

  if (pathname === '/api/modules' && request.method === 'GET') {
    const modules = moduleDatabase.modules
      .filter((module) => module.status === 'published')
      .map((module) => modulePayload(module, false));
    sendJson(response, 200, { ok: true, modules });
    return true;
  }

  const publicModuleMatch = pathname.match(/^\/api\/modules\/([^/]+)$/);
  if (publicModuleMatch && request.method === 'GET') {
    const module = findModuleById(publicModuleMatch[1]);
    if (!module || module.status !== 'published') {
      sendApiError(response, 404, '找不到这个模组。', 'module_not_found');
      return true;
    }
    sendJson(response, 200, { ok: true, module: modulePayload(module, false) });
    return true;
  }

  if (pathname === '/api/creator/modules' && request.method === 'GET') {
    const creator = requireCreator(request, response);
    if (!creator) return true;
    const modules = moduleDatabase.modules
      .filter((module) => creator.role === 'owner' || module.ownerId === creator.id)
      .map((module) => modulePayload(module, true));
    sendJson(response, 200, { ok: true, modules });
    return true;
  }

  if (pathname === '/api/creator/modules' && request.method === 'POST') {
    if (!sameOriginRequest(request)) {
      sendApiError(response, 403, '请求来源无效。', 'invalid_origin');
      return true;
    }
    const creator = requireCreator(request, response);
    if (!creator) return true;
    const payload = await readJsonBody(request);
    let id = '';
    if (hasOwn(payload, 'id') && payload.id) {
      id = moduleIdValue(payload.id);
      if (!id) throw apiException(400, '模组 ID 只能包含小写字母、数字、短横线或下划线。', 'invalid_module_id');
    } else {
      do id = 'module-' + randomUUID().slice(0, 12); while (findModuleById(id));
    }
    if (findModuleById(id)) throw apiException(409, '这个模组 ID 已经存在。', 'module_exists');
    let moduleOwnerId = creator.id;
    if (hasOwn(payload, 'ownerId') && payload.ownerId && payload.ownerId !== creator.id) {
      if (creator.role !== 'owner') throw apiException(403, '不能替其他作者创建模组。', 'forbidden');
      const selectedOwner = findUserById(cleanText(payload.ownerId, 80));
      if (!selectedOwner) throw apiException(400, '指定的作品所有者不存在。', 'invalid_owner');
      moduleOwnerId = selectedOwner.id;
    }
    const timestamp = nowIso();
    const module = applyModuleMetadata({
      id,
      title: '',
      english: '',
      summary: '',
      description: '',
      systems: [],
      rulesetId: '',
      systemLabel: '',
      type: 'campaign',
      typeLabel: '',
      tone: '',
      accent: '',
      icon: '',
      players: '',
      duration: '',
      era: '',
      difficulty: '',
      tags: [],
      status: 'draft',
      ownerId: moduleOwnerId,
      edition: cleanText(payload.edition, 40),
      createdAt: timestamp,
      updatedAt: timestamp,
      accessKey: generateModuleAccessKey(),
      runbook: normalizeRunbook(payload.runbook),
      resources: []
    }, payload, true);
    moduleDatabase.modules.push(module);
    try {
      persistModules();
    } catch (error) {
      moduleDatabase.modules.pop();
      throw error;
    }
    sendJson(response, 201, { ok: true, module: modulePayload(module, true) });
    return true;
  }

  const creatorAccessKeyMatch = pathname.match(/^\/api\/creator\/modules\/([^/]+)\/access-key$/);
  if (creatorAccessKeyMatch && request.method === 'GET') {
    const user = requireUser(request, response);
    if (!user) return true;
    const module = findModuleById(creatorAccessKeyMatch[1]);
    if (!module) {
      sendApiError(response, 404, '找不到这个模组。', 'module_not_found');
      return true;
    }
    if (module.ownerId !== user.id) {
      sendApiError(response, 403, '只能读取自己作品的密钥。', 'forbidden');
      return true;
    }
    sendJson(response, 200, moduleAccessKeyPayload(module));
    return true;
  }

  const creatorAccessKeyResetMatch = pathname.match(/^\/api\/creator\/modules\/([^/]+)\/access-key\/reset$/);
  if (creatorAccessKeyResetMatch && request.method === 'POST') {
    if (!sameOriginRequest(request)) {
      sendApiError(response, 403, '请求来源无效。', 'invalid_origin');
      return true;
    }
    const user = requireUser(request, response);
    if (!user) return true;
    const module = findModuleById(creatorAccessKeyResetMatch[1]);
    if (!module) {
      sendApiError(response, 404, '找不到这个模组。', 'module_not_found');
      return true;
    }
    if (module.ownerId !== user.id) {
      sendApiError(response, 403, '只能轮换自己作品的密钥。', 'forbidden');
      return true;
    }
    if (module.id === 'null-grail') {
      sendApiError(response, 409, '《零之圣杯》的密钥同时保护加密剧透资料；请更新 NG_ACCESS_KEY 或 .keeper-key 后重新运行安全资源构建，不能只在网页中轮换。', 'managed_access_key');
      return true;
    }
    const previousKey = module.accessKey;
    const previousUpdatedAt = module.updatedAt;
    module.accessKey = generateModuleAccessKey();
    module.updatedAt = nowIso();
    try {
      persistModules();
    } catch (error) {
      module.accessKey = previousKey;
      module.updatedAt = previousUpdatedAt;
      throw error;
    }
    invalidateKeeperSessions(module.id);
    sendJson(response, 200, moduleAccessKeyPayload(module));
    return true;
  }

  const creatorResourceCollectionMatch = pathname.match(/^\/api\/creator\/modules\/([^/]+)\/resources$/);
  if (creatorResourceCollectionMatch && request.method === 'POST') {
    if (!sameOriginRequest(request)) {
      sendApiError(response, 403, '请求来源无效。', 'invalid_origin');
      return true;
    }
    const creator = requireCreator(request, response);
    if (!creator) return true;
    const module = findModuleById(creatorResourceCollectionMatch[1]);
    if (!module) {
      sendApiError(response, 404, '找不到这个模组。', 'module_not_found');
      return true;
    }
    if (!canManageModule(creator, module)) {
      sendApiError(response, 403, '只能管理自己的作品。', 'forbidden');
      return true;
    }
    const { fileName, extension } = uploadFileName(request, url);
    const metadata = uploadMetadata(request, url, fileName);
    const body = await readRawBody(request, maxUploadBodyBytes);
    if (!body.length) throw apiException(400, '不能上传空文件。', 'empty_file');
    const resourceId = randomUUID();
    const storageName = module.id + '-' + resourceId + extension;
    const storagePath = join(moduleUploadDirectory, storageName);
    writeFileSync(storagePath, body, { flag: 'wx', mode: 0o600 });
    const resource = {
      id: resourceId,
      title: metadata.title,
      category: metadata.category,
      audience: metadata.audience,
      fileName,
      mime: moduleMime(fileName),
      size: body.length,
      legacyPath: null,
      storageName,
      uploadedAt: nowIso()
    };
    const previousUpdatedAt = module.updatedAt;
    module.resources.push(resource);
    module.updatedAt = resource.uploadedAt;
    try {
      persistModules();
    } catch (error) {
      module.resources.pop();
      module.updatedAt = previousUpdatedAt;
      try { unlinkSync(storagePath); } catch {}
      throw error;
    }
    sendJson(response, 201, {
      ok: true,
      resource: resourcePayload(module, resource),
      module: modulePayload(module, true)
    });
    return true;
  }

  const creatorResourceMatch = pathname.match(/^\/api\/creator\/modules\/([^/]+)\/resources\/([^/]+)$/);
  if (creatorResourceMatch && request.method === 'DELETE') {
    if (!sameOriginRequest(request)) {
      sendApiError(response, 403, '请求来源无效。', 'invalid_origin');
      return true;
    }
    const creator = requireCreator(request, response);
    if (!creator) return true;
    const module = findModuleById(creatorResourceMatch[1]);
    if (!module) {
      sendApiError(response, 404, '找不到这个模组。', 'module_not_found');
      return true;
    }
    if (!canManageModule(creator, module)) {
      sendApiError(response, 403, '只能管理自己的作品。', 'forbidden');
      return true;
    }
    const resourceIndex = module.resources.findIndex((resource) => resource.id === creatorResourceMatch[2]);
    if (resourceIndex < 0) {
      sendApiError(response, 404, '找不到这个资源。', 'resource_not_found');
      return true;
    }
    const previousUpdatedAt = module.updatedAt;
    const [resource] = module.resources.splice(resourceIndex, 1);
    module.updatedAt = nowIso();
    try {
      persistModules();
    } catch (error) {
      module.resources.splice(resourceIndex, 0, resource);
      module.updatedAt = previousUpdatedAt;
      throw error;
    }
    if (resource.storageName) {
      const storagePath = resourceFilePath(resource);
      try {
        if (storagePath && existsSync(storagePath)) unlinkSync(storagePath);
      } catch (error) {
        console.error('Unable to remove orphaned module upload:', error);
      }
    }
    sendJson(response, 200, { ok: true, module: modulePayload(module, true) });
    return true;
  }

  const creatorModuleMatch = pathname.match(/^\/api\/creator\/modules\/([^/]+)$/);
  if (creatorModuleMatch && request.method === 'GET') {
    const creator = requireCreator(request, response);
    if (!creator) return true;
    const module = findModuleById(creatorModuleMatch[1]);
    if (!module) {
      sendApiError(response, 404, '找不到这个模组。', 'module_not_found');
      return true;
    }
    if (!canManageModule(creator, module)) {
      sendApiError(response, 403, '只能管理自己的作品。', 'forbidden');
      return true;
    }
    sendJson(response, 200, { ok: true, module: modulePayload(module, true) });
    return true;
  }

  if (creatorModuleMatch && request.method === 'PATCH') {
    if (!sameOriginRequest(request)) {
      sendApiError(response, 403, '请求来源无效。', 'invalid_origin');
      return true;
    }
    const creator = requireCreator(request, response);
    if (!creator) return true;
    const module = findModuleById(creatorModuleMatch[1]);
    if (!module) {
      sendApiError(response, 404, '找不到这个模组。', 'module_not_found');
      return true;
    }
    if (!canManageModule(creator, module)) {
      sendApiError(response, 403, '只能管理自己的作品。', 'forbidden');
      return true;
    }
    const payload = await readJsonBody(request);
    const previous = JSON.stringify(module);
    applyModuleMetadata(module, payload, false);
    if (hasOwn(payload, 'edition')) module.edition = cleanText(payload.edition, 40);
    module.updatedAt = nowIso();
    try {
      persistModules();
    } catch (error) {
      Object.assign(module, JSON.parse(previous));
      throw error;
    }
    sendJson(response, 200, { ok: true, module: modulePayload(module, true) });
    return true;
  }

  if (pathname === '/api/auth/register' && request.method === 'POST') {
    if (!sameOriginRequest(request)) {
      sendApiError(response, 403, '请求来源无效。', 'invalid_origin');
      return true;
    }
    const validation = validateRegistration(await readJsonBody(request));
    if (validation.error) {
      sendApiError(response, 400, validation.error, 'invalid_registration');
      return true;
    }
    if (findUserByAccount(validation.account)) {
      sendApiError(response, 409, '这个账号已经存在。', 'account_exists');
      return true;
    }
    const createdAt = nowIso();
    const user = {
      id: randomUUID(),
      account: validation.account,
      accountKey: accountKey(validation.account),
      passwordHash: encodePassword(validation.password),
      displayName: validation.displayName,
      bio: '',
      avatar: '',
      role: 'member',
      authorStatus: 'none',
      authorApplication: null,
      locked: false,
      createdAt,
      updatedAt: createdAt
    };
    userDatabase.users.push(user);
    persistUsers();
    const token = createSession(authSessions, { userId: user.id });
    sendJson(response, 201, { ok: true, user: publicUser(user) }, {
      'Set-Cookie': sessionCookie(request, authSessionCookie, token, sessionLifetimeMs / 1000)
    });
    return true;
  }

  if (pathname === '/api/auth/login' && request.method === 'POST') {
    if (!sameOriginRequest(request)) {
      sendApiError(response, 403, '请求来源无效。', 'invalid_origin');
      return true;
    }
    const payload = await readJsonBody(request);
    const account = String(payload.account || '').normalize('NFKC').trim();
    const retryAfter = blockedLogin(request, account);
    if (retryAfter) {
      sendJson(response, 429, {
        ok: false,
        code: 'too_many_attempts',
        message: '尝试次数过多，请稍后再试。'
      }, { 'Retry-After': retryAfter });
      return true;
    }
    const user = findUserByAccount(account);
    const passwordValid = passwordMatches(
      String(payload.password || ''),
      user ? user.passwordHash : ownerPasswordHash
    );
    if (!user || !passwordValid) {
      recordLoginFailure(request, account);
      sendApiError(response, 401, '账号或密码不正确。', 'invalid_credentials');
      return true;
    }
    clearLoginFailures(request, account);
    const token = createSession(authSessions, { userId: user.id });
    sendJson(response, 200, { ok: true, user: publicUser(user) }, {
      'Set-Cookie': sessionCookie(request, authSessionCookie, token, sessionLifetimeMs / 1000)
    });
    return true;
  }

  if (pathname === '/api/auth/logout' && (request.method === 'POST' || request.method === 'DELETE')) {
    const token = cookieValue(request, authSessionCookie);
    if (token) authSessions.delete(digestToken(token));
    sendJson(response, 200, { ok: true }, {
      'Set-Cookie': sessionCookie(request, authSessionCookie, '', 0)
    });
    return true;
  }

  if ((pathname === '/api/auth/me' || pathname === '/api/auth/session') && request.method === 'GET') {
    const user = authenticatedUser(request);
    sendJson(response, 200, { ok: true, authenticated: Boolean(user), user: user ? publicUser(user) : null });
    return true;
  }

  if (pathname === '/api/profile' && request.method === 'GET') {
    const user = requireUser(request, response);
    if (user) sendJson(response, 200, profilePayload(user));
    return true;
  }

  if (pathname === '/api/profile' && request.method === 'PATCH') {
    if (!sameOriginRequest(request)) {
      sendApiError(response, 403, '请求来源无效。', 'invalid_origin');
      return true;
    }
    const user = requireUser(request, response);
    if (!user) return true;
    const payload = await readJsonBody(request);
    const displayName = cleanText(payload.displayName, 40);
    const bio = cleanText(payload.bio, 500);
    const avatar = avatarDataUrl(payload.avatar);
    if (!displayName) {
      sendApiError(response, 400, '显示名称不能为空。', 'invalid_profile');
      return true;
    }
    if (avatar === null) {
      sendApiError(response, 400, '头像格式无效或压缩后仍然过大。', 'invalid_avatar');
      return true;
    }
    user.displayName = displayName;
    user.bio = bio;
    user.avatar = avatar;
    user.updatedAt = nowIso();
    persistUsers();
    sendJson(response, 200, profilePayload(user));
    return true;
  }

  if (pathname === '/api/author/apply' && request.method === 'POST') {
    if (!sameOriginRequest(request)) {
      sendApiError(response, 403, '请求来源无效。', 'invalid_origin');
      return true;
    }
    const user = requireUser(request, response);
    if (!user) return true;
    if (user.authorStatus === 'verified') {
      sendApiError(response, 409, '这个账号已经通过作者认证。', 'already_verified');
      return true;
    }
    if (user.authorStatus === 'pending') {
      sendApiError(response, 409, '作者认证申请正在审核中。', 'already_pending');
      return true;
    }
    const payload = await readJsonBody(request);
    const statement = cleanText(payload.statement, 800);
    if (statement.length < 10) {
      sendApiError(response, 400, '请用至少 10 个字介绍你的作品或创作计划。', 'invalid_application');
      return true;
    }
    user.authorStatus = 'pending';
    user.authorApplication = {
      status: 'pending',
      statement,
      submittedAt: nowIso(),
      reviewedAt: null
    };
    user.updatedAt = nowIso();
    persistUsers();
    sendJson(response, 200, profilePayload(user));
    return true;
  }

  if (pathname === '/api/author/applications' && request.method === 'GET') {
    const user = requireUser(request, response);
    if (!user) return true;
    if (user.role !== 'owner') {
      sendApiError(response, 403, '只有网站站长可以审核作者申请。', 'forbidden');
      return true;
    }
    const applications = userDatabase.users
      .filter((candidate) => candidate.id !== ownerId && candidate.authorApplication)
      .map((candidate) => publicUser(candidate));
    sendJson(response, 200, { ok: true, applications });
    return true;
  }

  const reviewMatch = pathname.match(/^\/api\/author\/applications\/([^/]+)$/);
  if (reviewMatch && request.method === 'PATCH') {
    if (!sameOriginRequest(request)) {
      sendApiError(response, 403, '请求来源无效。', 'invalid_origin');
      return true;
    }
    const owner = requireUser(request, response);
    if (!owner) return true;
    if (owner.role !== 'owner') {
      sendApiError(response, 403, '只有网站站长可以审核作者申请。', 'forbidden');
      return true;
    }
    const candidate = findUserById(decodeURIComponent(reviewMatch[1]));
    if (!candidate || candidate.id === ownerId || !candidate.authorApplication) {
      sendApiError(response, 404, '找不到这份作者申请。', 'application_not_found');
      return true;
    }
    const payload = await readJsonBody(request);
    const decision = payload.decision === 'verified' ? 'verified' : payload.decision === 'rejected' ? 'rejected' : '';
    if (!decision) {
      sendApiError(response, 400, '审核结果必须是 verified 或 rejected。', 'invalid_decision');
      return true;
    }
    candidate.authorStatus = decision;
    candidate.role = decision === 'verified' ? 'author' : 'member';
    candidate.authorApplication.status = decision;
    candidate.authorApplication.reviewedAt = nowIso();
    candidate.updatedAt = nowIso();
    persistUsers();
    sendJson(response, 200, { ok: true, user: publicUser(candidate) });
    return true;
  }

  if (pathname.startsWith('/api/')) {
    sendApiError(response, 404, '接口不存在。', 'not_found');
    return true;
  }
  return false;
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

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('400 · 无效路径');
      return;
    }

    response.corsHeaders = corsHeaders(request);
    if (pathname.startsWith('/api/') && request.method === 'OPTIONS') {
      if (!sameOriginRequest(request)) {
        sendApiError(response, 403, '请求来源无效。', 'invalid_origin');
        return;
      }
      response.writeHead(204, {
        ...securityHeaders(),
        ...response.corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        'Cache-Control': 'no-store'
      });
      response.end();
      return;
    }

    if (await handleApi(request, response, pathname, url)) return;

    const relativePath = normalizeRequestPath(pathname);
    const classification = relativePath ? accessClass(relativePath) : 'denied';
    if (classification === 'denied') {
      response.writeHead(404, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('404 · 这份档案未公开');
      return;
    }
    if (classification === 'protected' && !hasCreatorAccess(request)) {
      sendJson(response, 401, { ok: false, message: '需要作者账号或守秘人访问密钥' });
      return;
    }

    const filePath = normalize(join(root, relativePath));
    if (!filePath.startsWith(normalizedRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('404 · 这份档案尚未归档');
      return;
    }

    response.writeHead(200, {
      ...securityHeaders(),
      'Content-Type': types[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': classification === 'protected' ? 'no-store' : 'no-cache'
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath).pipe(response);
  } catch (error) {
    if (!response.headersSent) {
      sendApiError(response, error.statusCode || 500,
        error.statusCode && error.statusCode < 500 ? error.message : '服务器暂时无法处理请求。',
        error.apiCode || (error.statusCode === 413 ? 'payload_too_large' : 'server_error'));
    } else {
      response.destroy();
    }
    if (!error.statusCode || error.statusCode >= 500) console.error(error);
  }
});

server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.listen(port, host, () => {
  console.log('夜航模组馆已点亮：http://' + host + ':' + port);
  console.log('账号资料保存在：' + usersPath);
  console.log('模组资料保存在：' + modulesPath);
  if (!configuredAccessKey) {
    console.log('尚未配置守秘人密钥；请设置 NG_ACCESS_KEY 或创建本地 .keeper-key。');
  }
});
