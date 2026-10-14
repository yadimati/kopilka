// Особый режим: вход по жесту и коду, сейф, перенос счетов.
import * as store from './store.js';
import { S, App, save, saveVault, migrateVault, accById } from './state.js';
import { deriveKey, decryptJson, randomSalt } from './crypto.js';
import { $, uid, toast, closeSheet } from './util.js';
import { UI, svg } from './icons.js';

export const TAB_NAMES = { home: 'Главная', ops: 'Операции', debts: 'Долги', analytics: 'Анализ', settings: 'Настройки' };
export const gesture = () => ({ t: 'home', n: 5, ...(S.data.settings.tp || {}) });

let taps = [];
export function registerTap(tab) {
  const g = gesture();
  if (tab !== g.t) { taps = []; return; }
  const now = Date.now();
  taps = [...taps.filter((t) => now - t < 2500), now];
  if (taps.length >= g.n) { taps = []; if (!S.vault) openCode(S.vaultBlob ? 'unlock' : 'create'); }
}
export const resetTaps = () => { taps = []; };

let code = null;
export function openCode(mode) {
  code = { mode, value: '', first: null, busy: false };
  drawCode();
  $('#code').hidden = false;
}
function closeCode() { $('#code').hidden = true; $('#code').innerHTML = ''; code = null; }
function drawCode() {
  const titles = { unlock: 'Код', create: 'Придумайте код из 6–8 цифр', confirm: 'Повторите код', change: 'Новый код из 6–8 цифр', change2: 'Повторите новый код' };
  const note = code.mode === 'create' ? '<p class="small">Без него не открыть. Забудете — восстановить нельзя.</p>' : '';
  const dots = Math.max(6, code.value.length);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'ok', '0', 'del'];
  $('#code').innerHTML = `<div class="code-box">
      <h2>${titles[code.mode]}</h2>${note}
      <div class="dots">${Array.from({ length: dots }, (_, i) => `<i class="${i < code.value.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="code-keys">${keys.map((k) => `<button type="button" data-ck="${k}" aria-label="${k === 'ok' ? 'Готово' : k === 'del' ? 'Стереть' : k}" class="${k === 'ok' || k === 'del' ? 'flat' : ''}">${k === 'ok' ? svg(UI.check, 26) : k === 'del' ? svg(UI.back, 26) : k}</button>`).join('')}</div>
      <button type="button" class="linkish" data-ck="cancel">Отмена</button>
    </div>`;
}
export async function onCodeKey(k) {
  if (!code || code.busy) return;
  if (k === 'cancel') return closeCode();
  if (k === 'del') { code.value = code.value.slice(0, -1); return drawCode(); }
  if (k !== 'ok') { if (code.value.length < 8) code.value += k; drawCode(); if (code.mode !== 'unlock' || code.value.length < 8) return; }
  const v = code.value;
  if (code.mode === 'unlock') {
    code.busy = true;
    const key = await deriveKey(v, S.vaultBlob.salt);
    const plain = await decryptJson(key, S.vaultBlob);
    closeCode();
    if (!plain) return; // неверный код: молча закрываемся
    S.vault = migrateVault(plain); S.vaultKey = key; S.ui.selected = null; S.ui.tab = 'home'; S.ui.interestShown = false;
    return App.render();
  }
  if (v.length < 6) return;
  if (code.mode === 'create' || code.mode === 'change') { code.first = v; code.value = ''; code.mode = code.mode === 'create' ? 'confirm' : 'change2'; return drawCode(); }
  if (v !== code.first) { code.value = ''; code.mode = code.mode === 'confirm' ? 'create' : 'change'; drawCode(); return toast('Коды не совпали, ещё раз'); }
  code.busy = true;
  const salt = randomSalt();
  S.vaultKey = await deriveKey(v, salt);
  if (code.mode === 'confirm') S.vault = { accounts: [], txns: [] };
  S.vaultBlob = { salt, iv: '', ct: '' };
  await saveVault();
  const changed = code.mode === 'change2';
  closeCode();
  toast(changed ? 'Код изменён' : 'Готово');
  S.ui.tab = changed ? 'settings' : 'home';
  App.render();
}
export function lockVault() {
  if (!S.vault) return;
  S.vault = null; S.vaultKey = null; S.ui.selected = null;
  closeSheet();
  App.render();
}

/* ---------- перенос счёта в сейф и обратно ---------- */
export async function moveToVault(id) {
  const a = S.data.accounts.find((x) => x.id === id);
  if (!a || !S.vault) return;
  S.data.accounts = S.data.accounts.filter((x) => x.id !== id);
  S.vault.accounts.push(a);
  const keep = [];
  for (const t of S.data.txns) {
    const touches = t.acc === id || t.to === id;
    if (!touches || t.type === 'debt') { keep.push(t); continue; }
    if (t.type === 'transfer' && t.acc !== t.to && (t.acc === id) !== (t.to === id)) {
      const other = t.acc === id ? t.to : t.acc;
      const base = { date: t.date, time: t.time, created: t.created, note: '' };
      if (t.to === id) { // обычный -> этот
        keep.push({ ...base, id: t.id, type: 'private_out', acc: other, amount: t.amount });
        S.vault.txns.push({ ...base, id: uid('t'), type: 'private_in', acc: id, amount: t.amountTo ?? t.amount, link: t.id, peer: other });
      } else { // этот -> обычный
        keep.push({ ...base, id: t.id, type: 'private_in', acc: other, amount: t.amountTo ?? t.amount });
        S.vault.txns.push({ ...base, id: uid('t'), type: 'private_out', acc: id, amount: t.amount, link: t.id, peer: other });
      }
      continue;
    }
    S.vault.txns.push(t);
  }
  S.data.txns = keep;
  await save();
}
export async function moveToData(id) {
  const a = S.vault?.accounts.find((x) => x.id === id);
  if (!a) return;
  S.vault.accounts = S.vault.accounts.filter((x) => x.id !== id);
  S.data.accounts.push(a);
  const keepV = [];
  for (const t of S.vault.txns) {
    if (t.acc !== id && t.to !== id) { keepV.push(t); continue; }
    if (t.type === 'private_in' || t.type === 'private_out') {
      // пара с обычным счётом снова становится обычным переводом
      const half = S.data.txns.find((x) => x.id === t.link);
      S.data.txns = S.data.txns.filter((x) => x.id !== t.link);
      const tr = { id: t.link || uid('t'), type: 'transfer', date: t.date, time: t.time, created: t.created, note: '' };
      if (t.type === 'private_in') Object.assign(tr, { acc: t.peer, to: id, amount: half?.amount ?? t.amount, amountTo: t.amount });
      else Object.assign(tr, { acc: id, to: t.peer, amount: t.amount, amountTo: half?.amount ?? t.amount });
      if (tr.amountTo === tr.amount) delete tr.amountTo;
      S.data.txns.push(tr);
      continue;
    }
    if (t.type === 'transfer') {
      // перевод между этим и другим скрытым счётом
      const other = t.acc === id ? t.to : t.acc;
      const base = { date: t.date, time: t.time, created: t.created, note: '' };
      if (t.acc === id) {
        S.data.txns.push({ ...base, id: t.id, type: 'private_out', acc: id, amount: t.amount });
        keepV.push({ ...base, id: uid('t'), type: 'private_in', acc: other, amount: t.amountTo ?? t.amount, link: t.id, peer: id });
      } else {
        S.data.txns.push({ ...base, id: t.id, type: 'private_in', acc: id, amount: t.amountTo ?? t.amount });
        keepV.push({ ...base, id: uid('t'), type: 'private_out', acc: other, amount: t.amount, link: t.id, peer: id });
      }
      continue;
    }
    S.data.txns.push(t);
  }
  S.vault.txns = keepV;
  await save();
}
export const accIsSecret = (id) => !!accById(id)?.secret;
