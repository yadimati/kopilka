// Точка входа: загрузка данных, отрисовка вкладок, события, курсы, service worker.
import * as store from './store.js';
import { S, App, defaults, migrate, refreshResolver } from './state.js';
import { fetchRates } from './money.js';
import { $, $$, esc, toast, sheetOpen, shareFile } from './util.js';
import { viewHome, afterHome, bindHome, homeTap } from './home.js';
import { viewOps } from './ops.js';
import { viewDebts } from './debts.js';
import { viewAnalytics } from './analytics.js';
import { viewSettings, onRateChange, onCurrencyAdd } from './settings.js';
import { registerTap, resetTaps, onCodeKey, lockVault } from './secret.js';
import { showOnboarding, bindOnboarding } from './onboarding.js';
import { updateBar, checkUpdates, finishPendingUpdate } from './updates.js';
import './entry.js';

const VIEWS = { home: viewHome, ops: viewOps, debts: viewDebts, analytics: viewAnalytics, settings: viewSettings };

/* ---------- отрисовка ---------- */
function render() {
  if (!S.data) return;
  $('#secret-bar').hidden = !S.vault;
  document.body.classList.toggle('secret', !!S.vault);
  const ub = $('#update-bar');
  ub.innerHTML = updateBar();
  ub.hidden = !S.update;
  document.body.classList.toggle('has-update', !!S.update);
  $$('#tabs [data-tab]').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === S.ui.tab ? 'page' : 'false'));
  const v = $('#view');
  const focusQ = document.activeElement?.id === 'f-q';
  v.innerHTML = VIEWS[S.ui.tab]();
  if (S.ui.tab === 'home') afterHome();
  if (focusQ) { const q = $('#f-q'); q?.focus(); q?.setSelectionRange(q.value.length, q.value.length); }
}
App.render = render;

/** Поиск: перерисовываем всё, кроме самого поля, чтобы на iPhone не пряталась клавиатура. */
function refreshOpsKeepSearch() {
  const view = $('#view');
  const keep = $('label.search', view);
  if (!keep || S.ui.tab !== 'ops') return render();
  const tmp = document.createElement('div');
  tmp.innerHTML = viewOps();
  const fresh = $('label.search', tmp);
  keep.querySelector('.small')?.remove();
  const cnt = fresh.querySelector('.small');
  if (cnt) keep.appendChild(cnt);
  const nodes = [...tmp.childNodes];
  const i = nodes.indexOf(fresh);
  for (const n of [...view.childNodes]) if (n !== keep) n.remove();
  keep.before(...nodes.slice(0, i));
  keep.after(...nodes.slice(i + 1));
}

/* ---------- курсы ---------- */
let ratesLoading = false;
async function updateRates(force = false) {
  if (ratesLoading) return;
  if (!force && S.rates && Date.now() - S.rates.ts < 3600e3) return;
  if (!navigator.onLine) { if (force) toast('Нет интернета — курсы прежние'); return; }
  ratesLoading = true;
  try {
    S.rates = await fetchRates(S.rates);
    await store.set('rates', S.rates);
    refreshResolver();
    if (force) { toast('Курсы обновлены'); store.addLog('Курсы обновлены вручную'); }
    if (!sheetOpen()) render();
  } catch (e) {
    store.addLog('Курсы не загрузились');
    if (force) toast('Курсы не загрузились, попробуйте позже');
  } finally {
    ratesLoading = false;
  }
}

/* ---------- события ---------- */
let qTimer = null;
function bind() {
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    const tab = b.dataset.tab;
    if (S.ui.tab === tab) { registerTap(tab); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    resetTaps();
    S.ui.tab = tab; S.ui.selected = null; S.ui.edit = false;
    render(); window.scrollTo(0, 0);
  });
  $('#secret-close').addEventListener('click', lockVault);
  $('#code').addEventListener('click', (e) => { const b = e.target.closest('[data-ck]'); if (b) onCodeKey(b.dataset.ck); });

  const view = $('#view');
  bindHome(view);
  const onAct = (e) => {
    if (e.currentTarget === view && homeTap(e.target)) return;
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = App.actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el); }
  };
  view.addEventListener('click', onAct);
  $('#update-bar').addEventListener('click', onAct);
  view.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.rate !== undefined || t.dataset.rateQ !== undefined) return onRateChange(t);
    App.changes[t.id]?.(t);
  });
  view.addEventListener('input', (e) => {
    if (e.target.id !== 'f-q') return;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { S.ui.q = e.target.value; S.ui.opsLimit = 150; refreshOpsKeepSearch(); }, 180);
  });
  view.addEventListener('submit', (e) => {
    if (e.target.id !== 'cur-form') return;
    e.preventDefault(); onCurrencyAdd();
  });
  bindOnboarding();

  // свернул приложение — особый режим закрывается; вернулся — свежие курсы и проверка обновлений
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) lockVault();
    else { updateRates(); checkUpdates(); }
  });
  window.addEventListener('online', () => updateRates());
}
Object.assign(App.actions, {
  'refresh-rates': () => updateRates(true),
  go: (el) => { S.ui.tab = el.dataset.tab; S.ui.selected = null; render(); window.scrollTo(0, 0); },
});

/* ---------- запуск ---------- */
function fatal(raw, err) {
  $('#view').innerHTML = `<section class="card pad fatal">
    <h1>Не получилось открыть данные</h1>
    <p>Копилка обновилась, но перевести ваши данные в новый формат не удалось (${esc(err?.message || 'ошибка')}). Данные не тронуты.</p>
    <p>Сохраните их в файл и напишите разработчику — это поможет всё вернуть.</p>
    <button type="button" class="btn primary full" id="fatal-save">Сохранить данные в файл</button>
  </section>`;
  $('#fatal-save').addEventListener('click', () => shareFile('kopilka-data.json', JSON.stringify(raw), 'application/json'));
}

async function start() {
  bind();
  let raw = null;
  try {
    raw = (await store.get('data')) || null;
    S.vaultBlob = (await store.get('vault')) || null;
    S.rates = (await store.get('rates')) || null;
    S.cloudKey = (await store.get('ck')) || null;
  } catch (e) {
    toast('Хранилище недоступно — данные не сохранятся');
  }
  if (raw) {
    const backup = JSON.parse(JSON.stringify(raw));
    try {
      const steps = migrate(raw);
      raw.settings = { ...defaults().settings, ...raw.settings };
      S.data = raw;
      if (steps.length) {
        for (const s of steps) await store.addLog(s);
        await store.set('data', raw);
      }
    } catch (e) {
      await store.addLog('Ошибка перевода данных: ' + e.message);
      const snap = await store.get('snapshot').catch(() => null);
      try {
        if (!snap?.data) throw e;
        migrate(snap.data);
        S.data = snap.data; S.vaultBlob = snap.vault || S.vaultBlob;
        await store.addLog('Данные возвращены к копии перед обновлением');
        toast('Данные возвращены к копии перед обновлением', { top: true, ms: 6000 });
      } catch (e2) {
        return fatal(backup, e);
      }
    }
  } else {
    S.data = defaults();
  }
  refreshResolver();
  await finishPendingUpdate();
  render();
  if (!S.data.settings.onboarded) showOnboarding();
  store.persist();
  updateRates();
  setTimeout(() => checkUpdates(), 2500);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
start();
