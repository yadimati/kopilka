// Обновления: проверка version.json, обновление в одно касание, копия данных перед ним и откат.
import * as store from './store.js';
import { S, App, cloudNow, migrate, refreshResolver, saveData } from './state.js';
import { APP_VERSION } from './config.js';
import { $, esc, toast, openSheet, closeSheet, sheetHead } from './util.js';

const newer = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

let lastCheck = 0;
/** manual — пользователь сам нажал «Проверить»: показываем результат в любом случае. */
export async function checkUpdates(manual = false) {
  if (!manual && Date.now() - lastCheck < 6 * 3600e3) return;
  if (!navigator.onLine) { if (manual) toast('Нет интернета'); return; }
  lastCheck = Date.now();
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const v = await r.json();
    if (v.version && newer(v.version, APP_VERSION)) {
      const was = S.update?.version;
      S.update = v;
      if (was !== v.version) store.addLog(`Найдено обновление ${v.version}`);
      App.render();
      if (manual) openDetails();
    } else if (manual) toast(`У вас последняя версия — ${APP_VERSION}`);
  } catch (e) {
    if (manual) toast('Не получилось проверить обновления');
  }
}

export function updateBar() {
  const u = S.update;
  if (!u) return '';
  return `<span>Доступна версия <b>${esc(u.version)}</b></span>
    <button type="button" class="linkish" data-act="update-details">Подробности</button>
    <button type="button" class="btn primary sm" data-act="update-apply">Обновить</button>`;
}

function openDetails() {
  const u = S.update;
  if (!u) return;
  const cloudOn = S.data.settings.cloud?.enabled && S.cloudKey;
  openSheet(`${sheetHead('Версия ' + esc(u.version))}
    ${u.date ? `<p class="small muted">${esc(u.date)} · сейчас у вас ${APP_VERSION}</p>` : ''}
    <ul class="notes">${(u.notes || []).map((n) => `<li>${esc(n)}</li>`).join('') || '<li>Исправления и улучшения</li>'}</ul>
    <p class="small muted">Перед обновлением Копилка сохранит копию ваших данных на телефоне${cloudOn ? ' и в облако' : ''}. Если что-то пойдёт не так, данные можно вернуть в Настройки → Журнал.</p>
    <button type="button" class="btn primary full" data-x="go">Обновить сейчас</button>`, (sheet) => {
    sheet.querySelector('[data-x="go"]').addEventListener('click', applyUpdate);
  });
}

export async function applyUpdate() {
  const u = S.update;
  if (!u) return;
  closeSheet();
  toast('Обновляю…', { ms: 10000 });
  await store.addLog(`Обновление ${APP_VERSION} → ${u.version}: начато`);
  try {
    await store.set('snapshot', { ts: Date.now(), from: APP_VERSION, data: S.data, vault: S.vaultBlob });
    await store.addLog('Копия данных перед обновлением сохранена');
  } catch (e) {
    await store.addLog('Копию данных сохранить не удалось — обновление отменено');
    return toast('Не получилось сохранить копию данных, обновление отменено');
  }
  if (S.data.settings.cloud?.enabled && S.cloudKey) {
    const ok = await cloudNow();
    await store.addLog(ok ? 'Облачная копия перед обновлением отправлена' : 'Облачная копия перед обновлением не отправилась');
  }
  await store.set('pendingUpdate', { from: APP_VERSION, to: u.version, ts: Date.now() });
  try {
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch { /* перезагрузка всё равно возьмёт свежие файлы из сети */ }
  await store.addLog('Файлы приложения загружаются заново');
  location.reload();
}

/** Вызывается при запуске: закрываем начатое обновление записью в журнал. */
export async function finishPendingUpdate() {
  const p = await store.get('pendingUpdate').catch(() => null);
  if (!p) return;
  await store.del('pendingUpdate');
  if (p.to === APP_VERSION || newer(APP_VERSION, p.from)) {
    await store.addLog(`Обновление до ${APP_VERSION} завершено`);
    setTimeout(() => toast(`Копилка обновлена до ${APP_VERSION}`, { top: true, action: { label: 'Что нового', fn: showWhatsNew } }), 600);
  } else {
    await store.addLog(`Обновление до ${p.to} не применилось — телефон отдал старые файлы. Попробуйте ещё раз позже`);
  }
}
async function showWhatsNew() {
  try {
    const v = await (await fetch('version.json', { cache: 'no-store' })).json();
    openSheet(`${sheetHead('Что нового в ' + esc(v.version))}<ul class="notes">${(v.notes || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`);
  } catch { toast('Нет интернета'); }
}

/** Откат данных к копии, сделанной перед последним обновлением. */
export async function snapshotInfo() {
  try { const s = await store.get('snapshot'); return s ? { ts: s.ts, from: s.from } : null; } catch { return null; }
}
export async function rollbackData() {
  const s = await store.get('snapshot');
  if (!s?.data) return toast('Копии нет');
  migrate(s.data);
  S.data = s.data; S.vaultBlob = s.vault || null; S.vault = null; S.vaultKey = null;
  await store.set('data', S.data);
  if (S.vaultBlob) await store.set('vault', S.vaultBlob); else await store.del('vault');
  refreshResolver();
  await saveData();
  await store.addLog(`Данные возвращены к копии от ${new Date(s.ts).toLocaleString('ru-RU')}`);
  closeSheet(); App.render(); toast('Данные возвращены');
}

Object.assign(App.actions, {
  'update-details': openDetails,
  'update-apply': applyUpdate,
});
