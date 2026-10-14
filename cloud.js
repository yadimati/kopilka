// Облачная копия: данные шифруются на телефоне ключом восстановления,
// на сервер уходит только зашифрованный блок. Сервер не может его прочитать.
import { CLOUD_URL } from './config.js';
import { deriveKey, encryptJson, decryptJson, normalizeKey, sha256hex } from './crypto.js';

const SALT = btoa('kopilka-cloud-v1');
let cache = { norm: null, id: null, key: null };

async function material(recoveryKey) {
  const norm = normalizeKey(recoveryKey);
  if (cache.norm === norm) return cache;
  const id = await sha256hex('kopilka:' + norm);
  const key = await deriveKey(norm, SALT);
  cache = { norm, id, key };
  return cache;
}

export const cloudConfigured = () => !!CLOUD_URL;

export async function upload(recoveryKey, payload) {
  const m = await material(recoveryKey);
  const body = JSON.stringify({ v: 1, ...(await encryptJson(m.key, payload)) });
  const r = await fetch(`${CLOUD_URL.replace(/\/$/, '')}/b/${m.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
  if (!r.ok) throw new Error('сервер ответил ' + r.status);
}

/** null — копии с таким ключом нет; undefined — ключ не подошёл */
export async function download(recoveryKey) {
  const m = await material(recoveryKey);
  const r = await fetch(`${CLOUD_URL.replace(/\/$/, '')}/b/${m.id}`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('сервер ответил ' + r.status);
  const plain = await decryptJson(m.key, await r.json());
  return plain ?? undefined;
}
