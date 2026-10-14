// Сервер облачной копии Копилки для Cloudflare Workers.
// Хранит только зашифрованные блоки: ключ шифрования остаётся на телефоне,
// а адрес блока — это хэш от ключа восстановления. Прочитать данные сервер не может.
//
// Нужна привязка KV-хранилища с именем BACKUPS (см. DEPLOY.md).

const MAX_SIZE = 5 * 1024 * 1024; // 5 МБ на одну копию — с огромным запасом

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};
const reply = (body, status = 200, type = 'application/json') =>
  new Response(body, { status, headers: { ...CORS, 'content-type': type, 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === '/') return reply('Kopilka cloud: ok', 200, 'text/plain; charset=utf-8');

    const m = url.pathname.match(/^\/b\/([0-9a-f]{64})$/);
    if (!m) return reply('{"error":"not found"}', 404);
    const id = m[1];

    if (request.method === 'GET') {
      const value = await env.BACKUPS.get(id);
      return value == null ? reply('{"error":"no backup"}', 404) : reply(value);
    }

    if (request.method === 'PUT') {
      const text = await request.text();
      if (text.length > MAX_SIZE) return reply('{"error":"too large"}', 413);
      let body;
      try { body = JSON.parse(text); } catch { return reply('{"error":"bad json"}', 400); }
      if (typeof body.iv !== 'string' || typeof body.ct !== 'string') return reply('{"error":"bad format"}', 400);
      await env.BACKUPS.put(id, JSON.stringify({ v: body.v || 1, iv: body.iv, ct: body.ct, ts: Date.now() }));
      return reply('{"ok":true}');
    }

    return reply('{"error":"method not allowed"}', 405);
  },
};
