// Простое хранилище "ключ -> значение" поверх IndexedDB.
// Ключи: 'data' (обычные данные), 'vault' (зашифрованный сейф), 'rates' (кэш курсов).

const DB_NAME = 'kopilka';
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function get(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function set(key, value) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function del(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Просим браузер не вычищать данные (на iPhone с экрана «Домой» это и так так). */
export async function persist() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* не критично */ }
}

/* ---------- журнал процессов (без сумм и названий) ---------- */
export async function addLog(text) {
  try {
    const log = (await get('log')) || [];
    log.push({ ts: Date.now(), text });
    await set('log', log.slice(-200));
  } catch { /* журнал не критичен */ }
}
export const getLog = async () => { try { return (await get('log')) || []; } catch { return []; } };
