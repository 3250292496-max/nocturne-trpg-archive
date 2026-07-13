import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const context = { window: {} };
vm.runInNewContext(await readFile(resolve(root, 'gm-data.js'), 'utf8'), context, { filename: 'gm-data.js' });
const data = context.window.NG_DATA;
const errors = [];
const ids = (list) => new Set(list.map((item) => item.id));
const sceneIds = ids(data.scenes);
const npcIds = ids(data.npcs);
const handoutIds = ids(data.handouts);
const locationIds = ids(data.locations);
const truthIds = ids(data.truths);

for (const day of data.days) for (const id of day.sceneIds) if (!sceneIds.has(id)) errors.push(`${day.id} references missing scene ${id}`);
for (const scene of data.scenes) {
  if (!locationIds.has(scene.location)) errors.push(`${scene.id} references missing location ${scene.location}`);
  for (const id of scene.npcs) if (!npcIds.has(id)) errors.push(`${scene.id} references missing NPC ${id}`);
  for (const id of scene.handouts) if (!handoutIds.has(id)) errors.push(`${scene.id} references missing handout ${id}`);
}

const requireDetailedScene = (id) => {
  const scene = data.scenes.find((item) => item.id === id);
  if (!scene) return null;
  for (const field of ['readAloud', 'interventions', 'exits']) {
    if (!Array.isArray(scene[field]) || !scene[field].length) errors.push(`${id} is missing structured ${field}`);
  }
  for (const field of ['ifUnattended', 'loopEcho']) if (!String(scene[field] || '').trim()) errors.push(`${id} is missing ${field}`);
  for (const [index, paragraph] of (scene.readAloud || []).entries()) if (!String(paragraph || '').trim()) errors.push(`${id} readAloud paragraph ${index + 1} is empty`);
  for (const [index, intervention] of (scene.interventions || []).entries()) {
    for (const field of ['action', 'check', 'successCost']) if (!String(intervention[field] || '').trim()) errors.push(`${id} intervention ${index + 1} is missing ${field}`);
  }
  for (const [index, exit] of (scene.exits || []).entries()) {
    for (const field of ['condition', 'result']) if (!String(exit[field] || '').trim()) errors.push(`${id} exit ${index + 1} is missing ${field}`);
  }
  return scene;
};

const requireExecutableScene = (id) => {
  const scene = requireDetailedScene(id);
  if (!scene) return null;
  for (const field of ['castGoals', 'clueSources']) {
    if (!Array.isArray(scene[field]) || !scene[field].length) errors.push(`${id} is missing structured ${field}`);
  }
  for (const [index, castGoal] of (scene.castGoals || []).entries()) {
    for (const field of ['actor', 'goal']) if (!String(castGoal[field] || '').trim()) errors.push(`${id} cast goal ${index + 1} is missing ${field}`);
  }
  for (const [index, source] of (scene.clueSources || []).entries()) {
    for (const field of ['clue', 'source', 'alternate']) if (!String(source[field] || '').trim()) errors.push(`${id} clue source ${index + 1} is missing ${field}`);
    if (source.truth && !truthIds.has(source.truth)) errors.push(`${id} clue source ${index + 1} references missing truth ${source.truth}`);
  }
  if ((scene.clueSources || []).length !== (scene.clues || []).length) errors.push(`${id} must provide one ordered source/alternate row for every clue.`);
  return scene;
};

for (let index = 1; index <= 27; index += 1) requireExecutableScene(`E${String(index).padStart(2, '0')}`);

const e14 = requireDetailedScene('E14');
if (e14) {
  if (!Array.isArray(e14.clocks) || e14.clocks.length !== 2 || e14.clocks.some((clock) => clock.max !== 4)) errors.push('E14 must have one shared 4-step rescue clock and one shared 4-step threat clock.');
  const clockKinds = new Set((e14.clocks || []).map((clock) => clock.kind));
  if (!clockKinds.has('shared-target') || !clockKinds.has('shared-threat')) errors.push('E14 shared clock roles are incomplete.');
  const sideNames = new Set((e14.sideObjectives || []).map((item) => item.name));
  for (const name of ['平民撤离', '裂缝稳定', '茂回归']) if (!sideNames.has(name)) errors.push(`E14 is missing side objective ${name}`);
  if ((e14.sideObjectives || []).length !== 3) errors.push('E14 must keep exactly three independently checked side objectives.');
}

const e24 = requireDetailedScene('E24');
if (e24) {
  const clockNames = new Set((e24.clocks || []).map((clock) => clock.name));
  if (!Array.isArray(e24.clocks) || e24.clocks.length !== 3 || e24.clocks.some((clock) => clock.max !== 4)) errors.push('E24 must have three independent 4-step clocks.');
  for (const name of ['核心仪式保护', '平民撤离', '敌方格式化']) if (!clockNames.has(name)) errors.push(`E24 is missing clock ${name}`);
  if (e24.clocksIndependent !== true || !String(e24.clockRule || '').includes('独立')) errors.push('E24 must explicitly state that its clocks resolve independently.');
  if (!Array.isArray(e24.allyAssignments) || e24.allyAssignments.length !== 5) errors.push('E24 must preserve the five ally assignment groups.');
  if (e24.stopProtocol?.holder !== '川风茂' || !String(e24.stopProtocol?.rule || '').includes('停止仪式')) errors.push('E24 must preserve Shigeru\'s executable stop protocol.');
}

const e27 = requireDetailedScene('E27');
if (e27) {
  const audit = e27.consentAudit;
  const subjectIds = new Set((audit?.subjects || []).map((subject) => subject.id));
  if (!audit || !subjectIds.has('tano') || !subjectIds.has('shigeru') || subjectIds.size !== 2) errors.push('E27 must record Tano and Shigeru as two separate consent subjects.');
  if (audit?.separateAnswers !== true || audit?.withdrawable !== true || audit?.noCheckSubstitution !== true) errors.push('E27 consent must remain separate, withdrawable, and impossible to replace with a check.');
  if (!String(audit?.rule || '').includes('不能用') || !String(audit?.rule || '').includes('检定替代同意')) errors.push('E27 must explicitly forbid substituting a check for consent.');
  if (!Array.isArray(audit?.checks) || audit.checks.length !== 7) errors.push('E27 must include the seven-item informed-consent audit.');
  for (const outcome of ['继续', '修改', '暂停', '放弃当前方案']) if (!(audit?.allowedOutcomes || []).includes(outcome)) errors.push(`E27 is missing valid outcome ${outcome}`);
}
for (const location of data.locations) {
  for (const field of ['publicName', 'visible', 'routeNote']) if (!String(location[field] || '').trim()) errors.push(`${location.id} is missing player-safe ${field}`);
  if (!Array.isArray(location.playerTags) || !location.playerTags.length) errors.push(`${location.id} is missing player-safe tags`);
  for (const id of location.sceneIds || []) if (!sceneIds.has(id)) errors.push(`${location.id} references missing scene ${id}`);
}
for (const handout of data.handouts) {
  for (const id of handout.relatedScenes || []) if (!sceneIds.has(id)) errors.push(`${handout.id} references missing scene ${id}`);
  for (const id of handout.mapLocationIds || []) if (!locationIds.has(id)) errors.push(`${handout.id} references missing map location ${id}`);
  if (handout.mapFocusId && !locationIds.has(handout.mapFocusId)) errors.push(`${handout.id} references missing map focus ${handout.mapFocusId}`);
}
const coreNpcIds = ['shigeru','rhine','arold','kubo','ome','hiroshi','gokawa'];
const npcById = new Map(data.npcs.map((npc) => [npc.id, npc]));
const forbiddenOpeningSpoilers = /Rider|Saber|Lancer|Berserker|Archer|御主|英灵|魔术|父亲|日记|令咒|田乃|TN-?0\d|2008|旧事故/;
for (const id of coreNpcIds) {
  const npc = npcById.get(id);
  if (!npc) {
    errors.push(`Missing core NPC dossier ${id}`);
    continue;
  }
  for (const field of ['opening','afterEncounter']) if (!String(npc.playerSafe?.[field] || '').trim()) errors.push(`${id} is missing playerSafe.${field}`);
  if (forbiddenOpeningSpoilers.test(String(npc.playerSafe?.opening || ''))) errors.push(`${id} playerSafe.opening leaks encounter-gated information`);
  if (!Array.isArray(npc.playerSafe?.questions) || !npc.playerSafe.questions.length) errors.push(`${id} is missing player-safe questions`);
  if (!Array.isArray(npc.timeline) || npc.timeline.length !== 6) errors.push(`${id} must keep the six-row timeline`);
  for (const [index, row] of (npc.timeline || []).entries()) for (const field of ['period','event','impact']) if (!String(row[field] || '').trim()) errors.push(`${id} timeline row ${index + 1} is missing ${field}`);
  for (const field of ['knows','misbelieves','distorts','hides','refuses','loopOnly']) if (!String(npc.knowledge?.[field] || '').trim()) errors.push(`${id} knowledge is missing ${field}`);
  if (!Array.isArray(npc.relations) || npc.relations.length < 6) errors.push(`${id} is missing its relationship matrix`);
  for (const [index, relation] of (npc.relations || []).entries()) for (const field of ['target','surface','secret','intervention']) if (!String(relation[field] || '').trim()) errors.push(`${id} relation ${index + 1} is missing ${field}`);
  if (!Array.isArray(npc.stages) || npc.stages.length !== 4) errors.push(`${id} must keep four character stages`);
  if (!Array.isArray(npc.sceneHooks) || npc.sceneHooks.length !== 9) errors.push(`${id} must keep nine scene hooks`);
  for (const field of ['neutral','pressure','vulnerable']) if (!String(npc.voiceLines?.[field] || '').trim()) errors.push(`${id} voiceLines is missing ${field}`);
  for (const field of ['goal','never','pressure','retreat']) if (!String(npc.tactics?.[field] || '').trim()) errors.push(`${id} tactics is missing ${field}`);
  if (!Array.isArray(npc.endings) || npc.endings.length !== 7) errors.push(`${id} must keep seven ending routes`);
}
const requiredSupportIds = [
  'ramen-owner', 'kawakaze-captain', 'safety-liaison', 'noguchi-elder', 'old-priest',
  'rhine-mother', 'eastlake-citizens', 'repair-neighbors', 'kawakaze-researcher',
  'kawakaze-technician', 'kawakaze-familiar', 'church-executor'
];
for (const id of requiredSupportIds) if (!npcIds.has(id)) errors.push(`Missing required supporting dossier ${id}`);
for (const id of ['kawakaze-researcher', 'kawakaze-captain', 'kawakaze-technician', 'kawakaze-familiar']) {
  if (!npcIds.has(id)) errors.push(`Kawakaze execution chain is missing ${id}`);
}
if (data.scenes.length !== 28 || data.npcs.length !== 31 || !sceneIds.has('E28')) errors.push('Expected 28 scenes, 31 dossiers, and E28.');
if (data.locations.length !== 16) errors.push(`Expected 16 interactive map locations, found ${data.locations.length}.`);

for (const [scriptName, htmlName] of [['gm.js', 'gm.html'], ['player.js', 'player.html']]) {
  const [source, markup] = await Promise.all([readFile(resolve(root, scriptName), 'utf8'), readFile(resolve(root, htmlName), 'utf8')]);
  const domIds = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const references = [...source.matchAll(/getElementById\('([^']+)'\)/g)].map((match) => match[1]);
  for (const id of new Set(references)) if (!domIds.has(id)) errors.push(`${scriptName} references missing #${id}`);
}

if (errors.length) throw new Error(errors.join('\n'));
console.log(`Console data verified: ${data.scenes.length} scenes, ${data.npcs.length} dossiers, ${data.handouts.length} handouts.`);
