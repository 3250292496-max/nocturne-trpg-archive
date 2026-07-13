import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.secure-publish');
const forbiddenNames = new Set(['.keeper-key', 'gm-data.js']);
const publicTextExtensions = new Set([
  '.cjs', '.conf', '.css', '.csv', '.cts', '.htm', '.html', '.ini', '.js', '.json', '.jsonc', '.jsx',
  '.less', '.map', '.markdown', '.md', '.mjs', '.mts', '.properties', '.sass', '.scss', '.svg', '.toml',
  '.ts', '.tsv', '.tsx', '.txt', '.webmanifest', '.xml', '.yaml', '.yml'
]);
const forbiddenFragments = ['第一册·主模组', '第二册·NPC与英灵手册', '第四册·主持人工具书', '分阶段线索发放包', '玩家手卡打印包'];
const violations = [];
const publicFiles = new Set();
const requiredFiles = [
  'index.html', 'module.html', 'module.js', 'modules-data.js',
  'studio.html', 'studio.js', 'run.html', 'run.css', 'run.js', 'player.html', 'player.js', 'player-data.js',
  'player.css', 'gm.html', 'gm.js',
  'coc7.html', 'coc7.css', 'coc7.js', 'coc7-data.js', 'coc7-core.js', 'coc7-xlsx.js',
  'combat.html', 'combat.css', 'combat.js',
  'assets/rules/COC七版规则空白卡.xlsx'
];

async function readKeeperKey() {
  try {
    const value = (await readFile(resolve(root, '.keeper-key'), 'utf8')).trim();
    return value || null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

const keeperKey = await readKeeperKey();

function shouldScanForKeeperKey(path) {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith('.enc')) return false;
  return publicTextExtensions.has(extname(lowerPath));
}

async function walk(directory) {
  for (const name of await readdir(directory)) {
    const path = resolve(directory, name);
    const info = await stat(path);
    if (info.isDirectory()) {
      const rel = relative(output, path).replace(/\\/g, '/');
      if (name.toLowerCase() === '.data') violations.push(`forbidden .data directory: ${rel}`);
      await walk(path);
    } else {
      const rel = relative(output, path).replace(/\\/g, '/');
      publicFiles.add(rel);
      if (forbiddenNames.has(name) || forbiddenFragments.some((fragment) => rel.includes(fragment))) violations.push(rel);
      if (rel.startsWith('secure/') && !rel.endsWith('.enc') && rel !== 'secure/manifest.json') violations.push(rel);
      if (keeperKey && shouldScanForKeeperKey(rel)) {
        const source = await readFile(path, 'utf8');
        if (source.includes(keeperKey)) violations.push(`${rel} contains the complete keeper key`);
      }
    }
  }
}

await walk(output);
for (const name of requiredFiles) {
  if (!publicFiles.has(name)) violations.push(`missing required public file: ${name}`);
}
const html = await readFile(resolve(output, 'gm.html'), 'utf8');
if (html.includes('gm-data.js')) violations.push('gm.html directly references plaintext gm-data.js');
const playerHtml = await readFile(resolve(output, 'player.html'), 'utf8');
const playerSource = await readFile(resolve(output, 'player.js'), 'utf8');
const playerDataSource = await readFile(resolve(output, 'player-data.js'), 'utf8');
const gmSource = await readFile(resolve(output, 'gm.js'), 'utf8');
const featureSentinels = [
  [playerHtml.includes('id="player-map-view"'), 'player.html is missing the interactive map view'],
  [playerHtml.includes('id="player-map-open"'), 'player.html is missing the always-visible map action'],
  [playerSource.includes("message.type === 'map-state'"), 'player.js is missing the map-state protocol'],
  [playerSource.includes('function mergePlayerMapPayload('), 'player.js is missing public/projection map merging'],
  [playerDataSource.includes('publicMap: playerSafeMap'), 'player-data.js is missing the PLAYER SAFE base map'],
  [html.includes('id="publish-today-map"'), 'gm.html is missing the player-map publish action'],
  [gmSource.includes('function publicMapPayload('), 'gm.js is missing the safe map projection']
];
for (const [present, message] of featureSentinels) if (!present) violations.push(message);
if (violations.length) throw new Error(`Unsafe public package:\n${[...new Set(violations)].join('\n')}`);
console.log('Public package verified: positive whitelist, interactive map sentinels, no .data directory, no keeper key leak, and no plaintext keeper sources.');
