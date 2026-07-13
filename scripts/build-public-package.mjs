import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.secure-publish');
const files = [
  'index.html', 'styles.css', 'font-size.css', 'font-size.js', 'app.js', 'access.js', 'site-auth.js',
  'modules-data.js', 'module.html', 'module.css', 'module.js',
  'studio.html', 'studio.css', 'studio.js',
  'run.html', 'run.css', 'run.js',
  'profile.html', 'profile.css', 'profile.js',
  'gm.html', 'gm.css', 'gm.js', 'gm-gate.js',
  'player.html', 'player.css', 'player.js', 'player-data.js',
  'coc7.html', 'coc7.css', 'coc7.js', 'coc7-data.js', 'coc7-core.js', 'coc7-xlsx.js',
  'combat.html', 'combat.css', 'combat.js',
  '.nojekyll',
  'NullGrail《零之圣杯》/规则书/《零之圣杯》通用圣杯战争规则书.docx',
  '圣杯/零之圣杯_完整套件/自动车卡/《零之圣杯》完整自动车卡表_v1.1.xlsx',
  'NullGrail《零之圣杯》/四册正文/《零之圣杯》第三册·玩家手册.docx',
  'NullGrail《零之圣杯》/配套资料/《零之圣杯》统一规则与跨册索引.docx',
  'NullGrail《零之圣杯》/配套资料/《零之圣杯》玩家公开资料包.docx',
  'assets/rules/COC七版规则空白卡.xlsx'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const relative of files) {
  const target = resolve(output, relative);
  await mkdir(dirname(target), { recursive: true });
  await cp(resolve(root, relative), target);
}
for (const directory of ['assets/art', 'secure']) {
  await cp(resolve(root, directory), resolve(output, directory), { recursive: true });
}
const secureEntries = await readdir(resolve(output, 'secure'));
if (secureEntries.some((name) => !name.endsWith('.enc') && name !== 'manifest.json')) {
  throw new Error('Public package contains a non-encrypted secure asset.');
}
console.log(`Positive-whitelist package built at ${output}`);
