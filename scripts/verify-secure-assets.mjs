import { createDecipheriv, createHash, pbkdf2Sync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'secure/manifest.json'), 'utf8'));
const passphrase = String(process.env.NG_ARCHIVE_KEY || '').trim().toUpperCase();
if (!passphrase) throw new Error('NG_ARCHIVE_KEY is required.');

const key = pbkdf2Sync(
  passphrase,
  Buffer.from(manifest.kdf.salt, 'base64'),
  manifest.kdf.iterations,
  32,
  'sha256'
);

async function decrypt(entry) {
  const payload = await readFile(resolve(root, entry.path));
  const ciphertext = payload.subarray(0, -16);
  const tag = payload.subarray(-16);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(entry.iv, 'base64'));
  decipher.setAAD(Buffer.from(entry.aad || '', 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

const verifier = await decrypt(manifest.verifier);
if (verifier.toString('utf8') !== 'NOCTURNE_KEEPER_V1') throw new Error('Verifier mismatch.');

const data = JSON.parse((await decrypt(manifest.data)).toString('utf8'));
if (data.id !== 'null-grail-v3.2' || !Array.isArray(data.scenes) || !Array.isArray(data.npcs)) {
  throw new Error('Keeper data did not round-trip.');
}

const archive = resolve(root, 'NullGrail《零之圣杯》v3.2 最终版');
const sources = {
  'main-module': resolve(archive, '四册正文', '《零之圣杯》第一册·主模组（v3.2）.docx'),
  'npc-guide': resolve(archive, '四册正文', '《零之圣杯》第二册·NPC与英灵手册（v3.2）.docx'),
  'keeper-toolkit': resolve(archive, '四册正文', '《零之圣杯》第四册·主持人工具书（v3.2）.docx'),
  'staged-clues': resolve(archive, '配套资料', '《零之圣杯》分阶段线索发放包（v3.2）.docx'),
  'player-handouts': resolve(archive, '配套资料', '《零之圣杯》玩家手卡打印包（v3.2）.docx')
};

for (const [id, source] of Object.entries(sources)) {
  const [plaintext, original] = await Promise.all([decrypt(manifest.resources[id]), readFile(source)]);
  const digest = value => createHash('sha256').update(value).digest('hex');
  if (digest(plaintext) !== digest(original)) throw new Error(`${id} did not round-trip.`);
}

key.fill(0);
console.log('Encrypted verifier, keeper data, and five documents verified.');
