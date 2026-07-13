import { pbkdf2Sync, randomBytes, createCipheriv } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = resolve(ROOT, 'secure');
const TEMP_DIR = resolve(ROOT, `.secure-build-${process.pid}`);

const ITERATIONS = 310_000;
const KEY_BYTES = 32;
const SALT_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const VERIFIER_PLAINTEXT = Buffer.from('NOCTURNE_KEEPER_V1', 'utf8');

const ARCHIVE_DIR = resolve(ROOT, 'NullGrail《零之圣杯》');
const RESOURCE_SPECS = [
  {
    id: 'data',
    path: 'secure/gm-data.enc',
    filename: 'gm-data.json',
    mime: 'application/json',
    kind: 'data'
  },
  {
    id: 'main-module',
    path: 'secure/book-1-main-module.docx.enc',
    filename: '《零之圣杯》第一册·主模组.docx',
    mime: DOCX_MIME,
    kind: 'document',
    source: resolve(ARCHIVE_DIR, '四册正文', '《零之圣杯》第一册·主模组.docx')
  },
  {
    id: 'npc-guide',
    path: 'secure/book-2-npc-servants.docx.enc',
    filename: '《零之圣杯》第二册·NPC与英灵手册.docx',
    mime: DOCX_MIME,
    kind: 'document',
    source: resolve(ARCHIVE_DIR, '四册正文', '《零之圣杯》第二册·NPC与英灵手册.docx')
  },
  {
    id: 'keeper-toolkit',
    path: 'secure/book-4-keeper-tools.docx.enc',
    filename: '《零之圣杯》第四册·主持人工具书.docx',
    mime: DOCX_MIME,
    kind: 'document',
    source: resolve(ARCHIVE_DIR, '四册正文', '《零之圣杯》第四册·主持人工具书.docx')
  },
  {
    id: 'staged-clues',
    path: 'secure/staged-clue-pack.docx.enc',
    filename: '《零之圣杯》分阶段线索发放包.docx',
    mime: DOCX_MIME,
    kind: 'document',
    source: resolve(ARCHIVE_DIR, '配套资料', '《零之圣杯》分阶段线索发放包.docx')
  },
  {
    id: 'player-handouts',
    path: 'secure/player-handout-print-pack.docx.enc',
    filename: '《零之圣杯》玩家手卡打印包.docx',
    mime: DOCX_MIME,
    kind: 'document',
    source: resolve(ARCHIVE_DIR, '配套资料', '《零之圣杯》玩家手卡打印包.docx')
  }
];

async function requirePassphrase() {
  const environmentPassphrase = String(process.env.NG_ARCHIVE_KEY || '').trim();
  if (environmentPassphrase) return environmentPassphrase.toUpperCase();

  try {
    const localPassphrase = String(await readFile(resolve(ROOT, '.keeper-key'), 'utf8')).trim();
    if (localPassphrase) return localPassphrase.toUpperCase();
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }

  throw new Error('NG_ARCHIVE_KEY or a local .keeper-key is required to build secure assets.');
}

async function loadGmData() {
  const sourcePath = resolve(ROOT, 'gm-data.js');
  const source = await readFile(sourcePath, 'utf8');
  const sandbox = { window: Object.create(null) };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, {
    filename: sourcePath,
    timeout: 5_000
  });

  if (!sandbox.window.NG_DATA || typeof sandbox.window.NG_DATA !== 'object') {
    throw new Error('gm-data.js did not assign an object to window.NG_DATA.');
  }

  const json = JSON.stringify(sandbox.window.NG_DATA);
  if (!json) {
    throw new Error('window.NG_DATA could not be serialized.');
  }
  return Buffer.from(json, 'utf8');
}

function encrypt(plaintext, key, resourceId) {
  const iv = randomBytes(IV_BYTES);
  const aad = `ng-archive/v1:${resourceId}`;
  const cipher = createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: TAG_BYTES
  });
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const payload = Buffer.concat([ciphertext, cipher.getAuthTag()]);
  return { aad, iv, payload };
}

async function writeEncryptedItem(spec, plaintext, key) {
  const encrypted = encrypt(plaintext, key, spec.id);
  const outputName = spec.path.replace(/^secure\//, '');
  await writeFile(resolve(TEMP_DIR, outputName), encrypted.payload);
  return {
    id: spec.id,
    kind: spec.kind,
    path: spec.path,
    iv: encrypted.iv.toString('base64'),
    aad: encrypted.aad,
    filename: spec.filename,
    mime: spec.mime,
    plaintextBytes: plaintext.length,
    encryptedBytes: encrypted.payload.length
  };
}

async function build() {
  const passphrase = await requirePassphrase();
  const salt = randomBytes(SALT_BYTES);
  const key = pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_BYTES, 'sha256');
  const resources = {};

  await rm(TEMP_DIR, { recursive: true, force: true });
  await mkdir(TEMP_DIR, { recursive: true });

  try {
    const verifier = await writeEncryptedItem({
      id: 'verifier',
      kind: 'verifier',
      path: 'secure/verifier.enc',
      filename: 'verifier.json',
      mime: 'application/json'
    }, VERIFIER_PLAINTEXT, key);

    const gmData = await loadGmData();
    let data;
    try {
      data = await writeEncryptedItem(RESOURCE_SPECS[0], gmData, key);
    } finally {
      gmData.fill(0);
    }

    for (const spec of RESOURCE_SPECS.slice(1)) {
      const plaintext = await readFile(spec.source);
      try {
        const item = await writeEncryptedItem(spec, plaintext, key);
        resources[spec.id] = {
          path: item.path,
          iv: item.iv,
          aad: item.aad,
          filename: item.filename,
          mime: item.mime
        };
      } finally {
        plaintext.fill(0);
      }
    }

    const manifest = {
      version: 1,
      kdf: {
        name: 'PBKDF2',
        hash: 'SHA-256',
        iterations: ITERATIONS,
        salt: salt.toString('base64')
      },
      verifier: {
        path: verifier.path,
        iv: verifier.iv,
        aad: verifier.aad
      },
      data: {
        path: data.path,
        iv: data.iv,
        aad: data.aad
      },
      resources
    };

    await writeFile(
      resolve(TEMP_DIR, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8'
    );

    await rm(OUTPUT_DIR, { recursive: true, force: true });
    await rename(TEMP_DIR, OUTPUT_DIR);
    console.log(`Built ${Object.keys(resources).length} encrypted documents in secure/.`);
  } catch (error) {
    await rm(TEMP_DIR, { recursive: true, force: true });
    throw error;
  } finally {
    key.fill(0);
  }
}

await build();
