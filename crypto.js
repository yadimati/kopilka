// Шифрование скрытых счетов и бэкапов: PBKDF2-SHA256 -> ключ AES-GCM (Web Crypto, встроен в браузер).
// Сам код/пароль нигде не хранится. Верный код = блок расшифровался (AES-GCM проверяет целостность).

const ITERATIONS = 600000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function randomSalt() {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(secret, saltB64) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(saltB64), iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

/** null, если ключ неверный. */
export async function decryptJson(key, { iv, ct }) {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ct));
    return JSON.parse(dec.decode(pt));
  } catch {
    return null;
  }
}

/* ---------- ключ восстановления для облачной копии ---------- */
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих символов I, O, 0, 1
export function newRecoveryKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = '';
  for (const b of bytes) s += B32[b % 32];
  return 'KOPI-' + s.match(/.{4}/g).join('-');
}
export const normalizeKey = (k) => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^KOPI/, '');
export async function sha256hex(str) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
