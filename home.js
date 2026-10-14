// Главная: шапка, доходы, счета, категории, перетаскивание, режим «Изменить»,
// «Не потратил», вопрос о процентах, итоги месяца.
import { S, App, accounts, accById, catById, srcById, base, balance, totals, monthFlows, save, saveData, accList, isGoal, isSavings, allTxns } from './state.js';
import { $, $$, esc, uid, today, nowTime, monthOf, monthName, shiftMonth, daysIn, plural, agoText, toast, openSheet, closeSheet, sheetHead, sheetOpen, groupInput, applyKey, humanDate, dateStr, MONTHS_GEN } from './util.js';
import { curInfo, fmt, fmtUnits, fmtCompact, fmtUnitsCompact, parseAmount, toUnits, fromUnits, minorToInput } from './money.js';
import { ICONS, UI, svg } from './icons.js';
import { openEntry, snapshot, restore } from './entry.js';
import { debtTotals } from './debts.js';

const shortBase = (v) => (v ? (Math.abs(v) >= 1e6 ? fmtUnitsCompact(v, base()).replace(/ \S+$/, '') : Math.round(v).toLocaleString('ru-RU')) : '0');
const goalPct = (a) => (a.target > 0 ? Math.max(0, Math.min(100, Math.round((balance(a.id) / a.target) * 100))) : 0);

function coin(o) {
  return `<button type="button" class="coin ${o.cls || ''}" ${o.attrs || ''} ${o.style ? `style="${o.style}"` : ''}>
    <span class="disc" style="--c:${esc(o.color)}">${svg(ICONS[o.icon] || ICONS.dots)}</span>
    ${o.badge || ''}
    <span class="nm">${esc(o.name)}</span>
    <span class="sm num">${o.sum ?? '&nbsp;'}</span>
  </button>`;
}
const accSum = (a) => (isGoal(a) ? `${goalPct(a)}% · ${fmtCompact(balance(a.id), a.cur)}` : fmtCompact(balance(a.id), a.cur));

/* =========================================================
   Главная
   ========================================================= */
export function viewHome() {
  if (S.ui.edit) return viewEdit();
  const B = base();
  const t = totals();
  const ym = monthOf(today());
  const f = monthFlows(ym);
  const d = debtTotals();
  const accs = accounts();
  const sel = S.ui.selected;
  const c = S.data.settings.cloud;
  const ratesTime = S.rates ? new Date(S.rates.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';
  const totalText = Math.abs(t.total) >= 1e9 ? fmtUnitsCompact(t.total, B) : fmtUnits(t.total, B, { short: !curInfo(B).crypto && Math.abs(t.total) >= 1000 });
  const debtNet = d.owe - d.iowe;

  const sources = S.data.sources.map((s) => coin({
    name: s.name, icon: s.icon, color: s.color, sum: shortBase(f.bySrc[s.id] || 0),
    cls: 'src' + (sel?.kind === 'src' && sel.id === s.id ? ' selected' : ''),
    attrs: `data-drag="src" data-id="${s.id}"`,
  })).join('') + `<button type="button" class="coin add" data-act="new-source" aria-label="Новый источник дохода"><span class="disc">${svg(UI.plus)}</span><span class="nm">Источник</span><span class="sm">&nbsp;</span></button>`;

  const accCoins = accs.map((a) => coin({
    name: a.name, icon: a.icon, color: a.color, sum: accSum(a),
    cls: 'acc' + (a.secret ? ' secret' : '') + (a.inTotal === false ? ' off' : '') + (isGoal(a) ? ' goal' : '') + (sel?.kind === 'acc' && sel.id === a.id ? ' selected' : ''),
    attrs: `data-drag="acc" data-drop="acc" data-id="${a.id}"`,
    style: isGoal(a) ? `--p:${goalPct(a)}%` : '',
  })).join('') + `<button type="button" class="coin add" data-act="new-account" aria-label="Новый счёт"><span class="disc">${svg(UI.plus)}</span><span class="nm">Счёт</span><span class="sm">&nbsp;</span></button>`;

  const cats = S.data.cats.map((k) => `
    <button type="button" class="cat" data-drop="cat" data-id="${k.id}">
      <span class="tile" style="--c:${esc(k.color)}">${svg(ICONS[k.icon] || ICONS.dots, 20)}</span>
      <span class="nm">${esc(k.name)}</span>
      <span class="sm num">${shortBase(f.byCat[k.id] || 0)}</span>
    </button>`).join('') + `<button type="button" class="cat add" data-act="new-cat"><span class="tile">${svg(UI.plus, 20)}</span><span class="nm">Категория</span><span class="sm">&nbsp;</span></button>`;

  let hint = 'тащите счёт на категорию';
  if (sel?.kind === 'acc') hint = `${esc(accById(sel.id)?.name)}: тапните категорию или счёт`;
  if (sel?.kind === 'src') hint = `${esc(srcById(sel.id)?.name)}: тапните счёт`;

  return `
  ${summaryCard()}
  <header class="home-head">
    <div class="top-row">
      <div class="chips">
        <button type="button" class="pill saved" data-act="saved">Не потратил <b class="num">${shortBase(f.saved)}&nbsp;${esc(curInfo(B).s)}</b></button>
        ${d.owe || d.iowe ? `<button type="button" class="pill" data-act="go" data-tab="debts">Долги <b class="num ${debtNet >= 0 ? 'pos' : 'neg'}">${debtNet >= 0 ? '+' : '−'}${shortBase(Math.abs(debtNet))}</b></button>` : ''}
      </div>
      <button type="button" class="status" data-act="refresh-rates">${c?.enabled ? `копия ${agoText(c.last)}<br>` : ''}курсы ${ratesTime}</button>
    </div>
    <div class="row between"><span class="label">Итого · ${monthName(ym)}${S.vault ? ' · со скрытыми' : ''}</span><button type="button" class="linkish strong" data-act="edit-on">Изменить</button></div>
    <div class="total num ${totalText.length > 14 ? 'long' : ''}">≈ ${totalText}</div>
    <div class="row gap num small"><span class="pos">${fmtUnits(f.inc, B, { sign: true, short: true })}</span><span class="neg">${fmtUnits(-f.exp, B, { short: true })}</span></div>
    ${t.noRate ? `<div class="warn small">${t.noRate} ${plural(t.noRate, 'счёт', 'счёта', 'счетов')} без курса не в итоге</div>` : ''}
  </header>
  <section class="strip-block"><span class="label">Доходы</span><div class="strip">${sources}</div></section>
  <section class="strip-block accs"><span class="label">Счета</span><div class="strip">${accCoins}</div>
    ${accs.length ? '' : `<p class="small muted">Добавьте первый счёт: карту, наличные или криптокошелёк.</p>`}</section>
  <section class="cats-block">
    <div class="row between"><span class="label">Расходы · ${monthName(ym)}</span><span class="small muted">${hint}</span></div>
    <div class="cat-grid">${cats}</div>
  </section>`;
}

export function afterHome() {
  $$('.strip').forEach((s) => s.classList.toggle('fits', s.scrollWidth <= s.clientWidth + 1));
  if (!S.ui.edit && !S.ui.interestShown && !sheetOpen() && $('#code').hidden && $('#onboard').hidden) {
    const p = pendingInterest();
    if (p) { S.ui.interestShown = true; setTimeout(() => openInterest(p), 300); }
  }
}

/* =========================================================
   Режим «Изменить»
   ========================================================= */
const delBadge = (kind, id, name) => `<span class="del-badge" role="button" tabindex="0" data-act="del-item" data-kind="${kind}" data-id="${id}" aria-label="Удалить ${esc(name)}">−</span>`;
function viewEdit() {
  const rot = (i) => ['-1.4deg', '1.2deg', '-0.8deg', '1.5deg', '-1.1deg', '0.9deg'][i % 6];
  const srcs = S.data.sources.map((s, i) => coin({ name: s.name, icon: s.icon, color: s.color, sum: '', cls: 'src jiggle', attrs: `data-reorder="src" data-id="${s.id}"`, style: `--r:${rot(i)}`, badge: delBadge('src', s.id, s.name) })).join('');
  const accs = accounts().map((a, i) => coin({ name: a.name, icon: a.icon, color: a.color, sum: '', cls: 'acc jiggle' + (a.secret ? ' secret' : '') + (isGoal(a) ? ' goal' : ''), attrs: `data-reorder="${a.secret ? 'vacc' : 'acc'}" data-id="${a.id}"`, style: `--r:${rot(i + 2)};${isGoal(a) ? `--p:${goalPct(a)}%` : ''}`, badge: delBadge('acc', a.id, a.name) })).join('');
  const cats = S.data.cats.map((k, i) => `
    <div class="cat jiggle" data-reorder="cat" data-id="${k.id}" style="--r:${rot(i + 1)}" role="button" tabindex="0">
      <span class="tile" style="--c:${esc(k.color)}">${svg(ICONS[k.icon] || ICONS.dots, 20)}</span>
      <span class="nm">${esc(k.name)}</span>${delBadge('cat', k.id, k.name)}
    </div>`).join('');
  return `
  <header class="page-head"><h1>Изменение</h1><button type="button" class="btn primary sm" data-act="edit-off">Готово</button></header>
  <p class="small muted" style="margin:0">Тащите, чтобы поменять порядок внутри ряда. Тап открывает настройки, «−» удаляет.</p>
  <section class="strip-block"><span class="label">Доходы</span><div class="strip edit">${srcs}<button type="button" class="coin add" data-act="new-source"><span class="disc">${svg(UI.plus)}</span><span class="nm">Источник</span><span class="sm"></span></button></div></section>
  <section class="strip-block accs"><span class="label">Счета</span><div class="strip edit">${accs}<button type="button" class="coin add" data-act="new-account"><span class="disc">${svg(UI.plus)}</span><span class="nm">Счёт</span><span class="sm"></span></button></div></section>
  <section class="cats-block"><span class="label">Категории расходов</span><div class="cat-grid edit">${cats}<button type="button" class="cat add" data-act="new-cat"><span class="tile">${svg(UI.plus, 20)}</span><span class="nm">Категория</span></button></div></section>`;
}
function reorder(kind, fromId, toId) {
  const list = kind === 'src' ? S.data.sources : kind === 'cat' ? S.data.cats : kind === 'acc' ? S.data.accounts : S.vault?.accounts;
  if (!list) return;
  const from = list.findIndex((x) => x.id === fromId), to = list.findIndex((x) => x.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  save();
}

/* =========================================================
   Перетаскивание (операции и перестановка) и тапы
   ========================================================= */
let drag = null, suppressClick = false;
const validDrop = (src, tgt) => !!tgt && (src.kind === 'src' ? tgt.kind === 'acc' : src.kind === 'acc' && (tgt.kind === 'cat' || (tgt.kind === 'acc' && tgt.id !== src.id)));
function targetAt(x, y, attr) {
  const el = document.elementFromPoint(x, y)?.closest(`[${attr}]`);
  return el ? { el, kind: el.getAttribute(attr), id: el.dataset.id } : null;
}
function onDown(e) {
  if (S.ui.tab !== 'home' || e.target.closest('.del-badge')) return;
  const edit = S.ui.edit;
  const el = e.target.closest(edit ? '[data-reorder]' : '[data-drag]');
  if (!el) return;
  drag = { el, edit, kind: edit ? el.dataset.reorder : el.dataset.drag, id: el.dataset.id, x0: e.clientX, y0: e.clientY, started: false, fits: edit || el.closest('.strip')?.classList.contains('fits') };
}
function onMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.started) {
    const vertical = Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx);
    if (!(vertical || (drag.fits && Math.hypot(dx, dy) > 8))) return;
    drag.started = true;
    const src = drag.el.querySelector('.disc, .tile');
    const g = src.cloneNode(true);
    g.className = (src.classList.contains('tile') ? 'tile' : 'disc') + ' ghost';
    g.style.cssText = src.getAttribute('style') || '';
    document.body.appendChild(g);
    drag.ghost = g;
    drag.el.classList.add('dragging');
    document.body.classList.add('is-dragging');
  }
  e.preventDefault();
  drag.ghost.style.left = e.clientX + 'px';
  drag.ghost.style.top = e.clientY + 'px';
  const tgt = drag.edit ? targetAt(e.clientX, e.clientY, 'data-reorder') : targetAt(e.clientX, e.clientY, 'data-drop');
  const ok = drag.edit ? tgt && tgt.kind === drag.kind && tgt.id !== drag.id : validDrop(drag, tgt);
  if (drag.hover && drag.hover !== tgt?.el) drag.hover.classList.remove('drop-ok');
  drag.hover = ok ? tgt.el : null;
  if (ok) tgt.el.classList.add('drop-ok');
}
function endDrag() {
  if (!drag) return;
  drag.ghost?.remove();
  drag.el.classList.remove('dragging');
  drag.hover?.classList.remove('drop-ok');
  document.body.classList.remove('is-dragging');
  drag = null;
}
function onUp(e) {
  if (!drag) return;
  const d = drag;
  if (!d.started) { endDrag(); return; }
  const tgt = d.edit ? targetAt(e.clientX, e.clientY, 'data-reorder') : targetAt(e.clientX, e.clientY, 'data-drop');
  endDrag();
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 60);
  if (d.edit) { if (tgt && tgt.kind === d.kind && tgt.id !== d.id) { reorder(d.kind, d.id, tgt.id); App.render(); } return; }
  if (validDrop(d, tgt)) startPair(d, tgt);
}
function startPair(src, tgt) {
  S.ui.selected = null;
  if (src.kind === 'src') openEntry({ type: 'income', from: src.id, to: tgt.id });
  else if (tgt.kind === 'cat') openEntry({ type: 'expense', from: src.id, to: tgt.id });
  else openEntry({ type: 'transfer', from: src.id, to: tgt.id });
  App.render();
}
export function bindHome(view) {
  view.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', endDrag);
  document.addEventListener('touchmove', (e) => { if (drag?.started) e.preventDefault(); }, { passive: false });
}
/** Тап по монетке/плитке. Возвращает true, если клик обработан. */
export function homeTap(target) {
  if (suppressClick) return true;
  if (S.ui.tab !== 'home') return false;
  if (S.ui.edit) {
    if (target.closest('.del-badge')) return false;
    const el = target.closest('[data-reorder]');
    if (!el) return false;
    const k = el.dataset.reorder;
    App.actions[k === 'src' ? 'src-edit' : k === 'cat' ? 'cat-edit' : 'acc-edit']?.(el);
    return true;
  }
  const el = target.closest('[data-drag], [data-drop]');
  if (!el) return false;
  const kind = el.dataset.drag || el.dataset.drop, id = el.dataset.id, sel = S.ui.selected;
  if (kind === 'src') { S.ui.selected = sel?.kind === 'src' && sel.id === id ? null : { kind: 'src', id }; App.render(); return true; }
  if (kind === 'acc') {
    if (sel?.kind === 'src' || (sel?.kind === 'acc' && sel.id !== id)) { startPair(sel, { kind: 'acc', id }); return true; }
    if (sel?.kind === 'acc' && sel.id === id) { S.ui.selected = null; App.render(); App.actions['acc-edit']?.(el); return true; }
    S.ui.selected = { kind: 'acc', id }; App.render(); return true;
  }
  if (kind === 'cat') {
    if (sel?.kind === 'acc') { startPair(sel, { kind: 'cat', id }); return true; }
    const accs = accounts();
    if (!accs.length) { toast('Сначала добавьте счёт'); return true; }
    const acc = accById(S.data.settings.lastAcc) ? S.data.settings.lastAcc : accs[0].id;
    S.ui.selected = null;
    openEntry({ type: 'expense', from: acc, to: id });
    return true;
  }
  return false;
}

/* =========================================================
   «Не потратил»
   ========================================================= */
function openSaved() {
  const B = base();
  const st = { amount: '', cat: null };
  const ym = monthOf(today());
  const list = () => (S.data.saved || []).filter((s) => monthOf(s.date) === ym).sort((a, b) => b.created - a.created);
  const draw = (sheet) => {
    const avail = totals().total;
    const amt = parseAmount(st.amount, B);
    const over = amt > 0 && toUnits(amt, B) > avail;
    $('.saved-body', sheet).innerHTML = `
      <p class="muted lead">Очень хотели купить, деньги на это были, но вы передумали? Запишите покупку, от которой отказались.</p>
      <div class="amount-row"><span class="amount focus"><span class="num big">${esc(groupInput(st.amount) || '0')}</span></span><span class="cur">${esc(curInfo(B).s)}</span></div>
      <div class="small center ${over ? 'neg' : 'muted'}">на счетах сейчас ${fmtUnits(avail, B, { short: true })}${over ? ' — столько записать нельзя' : ''}</div>
      <label class="field-l">От чего отказались<input id="sv-what" maxlength="60" placeholder="Например, кроссовки на распродаже" value="${esc(st.what || '')}"></label>
      <div class="tags" role="group" aria-label="Категория">${S.data.cats.map((k) => `<button type="button" class="tag amber ${st.cat === k.id ? 'on' : ''}" data-cat="${k.id}">${esc(k.name)}</button>`).join('')}</div>
      <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map((k) => `<button type="button" data-key="${k}" aria-label="${k === 'del' ? 'Стереть' : k}">${k === 'del' ? svg(UI.back, 24) : k}</button>`).join('')}</div>
      <div class="err" id="sv-err"></div>
      <button type="button" class="btn amber full" data-x="save">Сдержался — записать</button>
      <p class="small muted center">На баланс и анализ трат это не влияет. В конце месяца увидите, сколько сберегла ваша сила воли.</p>
      ${list().length ? `<div class="card list">${list().map((s) => `<div class="srow"><span class="what"><b>${esc(s.what || 'Без описания')}</b><span>${humanDate(s.date)}${s.cat ? ' · ' + esc(catById(s.cat)?.name || '') : ''}</span></span><span class="num">${fmt(s.amount, s.cur)}</span><button type="button" class="icon-btn" data-del-saved="${s.id}" aria-label="Удалить">×</button></div>`).join('')}</div>` : ''}`;
  };
  openSheet(`${sheetHead('Не потратил')}<div class="saved-body"></div>`, (sheet) => {
    draw(sheet);
    sheet.addEventListener('input', (e) => { if (e.target.id === 'sv-what') st.what = e.target.value; });
    sheet.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.key) { st.amount = applyKey(st.amount, b.dataset.key, B); return draw(sheet); }
      if (b.dataset.cat) { st.cat = st.cat === b.dataset.cat ? null : b.dataset.cat; return draw(sheet); }
      if (b.dataset.delSaved) { S.data.saved = S.data.saved.filter((s) => s.id !== b.dataset.delSaved); await saveData(); App.render(); return draw(sheet); }
      if (b.dataset.x === 'save') {
        const amt = parseAmount(st.amount, B);
        if (!(amt > 0)) return ($('#sv-err', sheet).textContent = 'Введите сумму');
        if (toUnits(amt, B) > totals().total) return ($('#sv-err', sheet).textContent = 'Сумма больше, чем есть на счетах');
        const snap = snapshot();
        S.data.saved.push({ id: uid('n'), amount: amt, cur: B, what: (st.what || '').trim(), cat: st.cat, date: today(), created: Date.now() });
        await saveData(); closeSheet(); App.render();
        toast(`Сдержался: ${fmt(amt, B)}`, { top: true, action: { label: 'Отменить', fn: () => restore(snap) } });
      }
    });
  }, { tall: true, cls: 'saved-sheet' });
}

/* =========================================================
   Проценты по накопительным счетам
   ========================================================= */
const monthlyRate = (a) => (a.ratePer === 'month' ? a.rate : a.rate / 12) / 100;
export const interestForecast = (a) => Math.max(0, Math.round(balance(a.id) * monthlyRate(a)));
function lastDueDate(a) {
  const now = new Date();
  for (let k = 0; k < 2; k++) {
    const y = now.getFullYear(), m = now.getMonth() - k;
    const dt = new Date(y, m, 1);
    const day = Math.min(a.payDay, daysIn(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`));
    const due = new Date(dt.getFullYear(), dt.getMonth(), day);
    if (dateStr(due) <= today()) return dateStr(due);
  }
  return null;
}
function pendingInterest() {
  for (const a of accounts()) {
    if (!isSavings(a) || !(a.rate > 0) || !a.payDay) continue;
    const due = lastDueDate(a);
    if (!due) continue;
    if (a.lastPaid && a.lastPaid >= due) continue;
    if (a.snooze && a.snooze > today()) continue;
    if (a.created && dateStr(new Date(a.created)) >= due) continue;
    return { a, due };
  }
  return null;
}
function openInterest({ a, due }) {
  const fc = interestForecast(a);
  const accObj = () => accList(a.id).find((x) => x.id === a.id);
  const addIncome = async (amount) => {
    if (amount > 0) accList(a.id) === S.data.accounts
      ? S.data.txns.push({ id: uid('t'), type: 'income', source: 'interest', acc: a.id, amount, date: due, time: '12:00', note: '', created: Date.now() })
      : S.vault.txns.push({ id: uid('t'), type: 'income', source: 'interest', acc: a.id, amount, date: due, time: '12:00', note: '', created: Date.now() });
    const o = accObj(); o.lastPaid = due; delete o.snooze;
    await save(); closeSheet(); App.render();
    toast(amount > 0 ? `Проценты записаны: ${fmt(amount, a.cur)}` : 'Отмечено: проценты не пришли');
  };
  openSheet(`<div class="interest">
      <div class="row gap"><span class="disc" style="--c:${esc(a.color)}">${svg(ICONS[a.icon] || ICONS.bank)}</span>
        <span class="what"><b>${esc(a.name)}</b><span class="small muted">${String(a.rate).replace('.', ',')}% ${a.ratePer === 'month' ? 'в месяц' : 'годовых'} · ${a.payDay} числа</span></span></div>
      <p class="q">${due === today() ? 'Сегодня' : humanDate(due)} должны были начислиться проценты: <b class="num pos">≈ ${fmt(fc, a.cur)}</b>. Так ли это?</p>
      <div class="two"><button type="button" class="btn outline" data-x="no">Нет</button><button type="button" class="btn primary" data-x="yes">Да</button></div>
      <button type="button" class="linkish center-self" data-x="later">Перенести на другую дату</button>
      <div class="sub-panel" id="ip-no" hidden><b>Сколько пришло на самом деле?</b>
        <div class="row gap"><input id="ip-amt" inputmode="decimal" value="${minorToInput(fc, a.cur)}"><button type="button" class="btn primary" data-x="no-save">Записать</button></div>
        <span class="small muted">Ничего не пришло — оставьте 0.</span></div>
      <div class="sub-panel" id="ip-later" hidden><b>Когда напомнить?</b>
        <div class="row gap"><input id="ip-date" type="date" min="${today()}"><button type="button" class="btn primary" data-x="later-save">Готово</button></div></div>
    </div>`, (sheet) => {
    sheet.addEventListener('click', async (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
      if (x === 'yes') return addIncome(fc);
      if (x === 'no') { $('#ip-no', sheet).hidden = false; $('#ip-later', sheet).hidden = true; return; }
      if (x === 'later') { $('#ip-later', sheet).hidden = false; $('#ip-no', sheet).hidden = true; return; }
      if (x === 'no-save') { const v = parseAmount($('#ip-amt', sheet).value, a.cur); return addIncome(Number.isNaN(v) ? 0 : v); }
      if (x === 'later-save') {
        const dt = $('#ip-date', sheet).value; if (!dt) return;
        accObj().snooze = dt; await save(); closeSheet(); toast('Напомним ' + humanDate(dt).toLowerCase());
      }
    });
  }, { cls: 'center-sheet' });
}

/* =========================================================
   Итоги месяца
   ========================================================= */
function summaryCard() {
  const now = monthOf(today()), prev = shiftMonth(now, -1);
  if (S.data.settings.summarySeen === prev) return '';
  if (new Date(S.data.settings.created || Date.now()) >= new Date(now + '-01T00:00')) return '';
  const f = monthFlows(prev), p2 = monthFlows(shiftMonth(prev, -1));
  if (!f.inc && !f.exp) return '';
  const B = base();
  const delta = p2.exp ? Math.round(((f.exp - p2.exp) / p2.exp) * 100) : null;
  const top = Object.entries(f.byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const max = top[0]?.[1] || 1;
  const goal = accounts().find(isGoal);
  const interest = allTxns().filter((t) => t.source === 'interest' && monthOf(t.date) === prev).length;
  return `<section class="summary-card">
    <div class="row between"><h2>Итоги: ${monthName(prev)}</h2><button type="button" class="icon-btn light" data-act="summary-close" aria-label="Закрыть">×</button></div>
    <div class="sgrid">
      <div><span>Потратил</span><b class="num">${fmtUnits(f.exp, B, { short: true })}</b>${delta == null ? '' : `<span class="${delta > 0 ? 'neg' : 'pos'}">${delta > 0 ? '+' : ''}${delta}% к прошлому</span>`}</div>
      <div><span>Заработал</span><b class="num">${fmtUnits(f.inc, B, { short: true })}</b>${interest ? '<span>вкл. проценты</span>' : ''}</div>
      <div><span>Осталось сверху</span><b class="num ${f.inc - f.exp >= 0 ? 'pos' : 'neg'}">${fmtUnits(f.inc - f.exp, B, { sign: true, short: true })}</b></div>
      <div><span>Не потратил</span><b class="num amber">${fmtUnits(f.saved, B, { short: true })}</b><span>${f.savedCnt} ${plural(f.savedCnt, 'раз', 'раза', 'раз')}</span></div>
    </div>
    ${top.length ? `<div class="sbars">${top.map(([id, v]) => { const k = catById(id) || { name: 'Без категории', color: '#7d8a86' }; return `<div class="sbar"><span>${esc(k.name)}</span><i><u style="width:${(v / max) * 100}%;background:${esc(k.color)}"></u></i><span class="num">${shortBase(v)}</span></div>`; }).join('')}</div>` : ''}
    ${f.adj ? `<span class="small">Корректировки балансов: ${fmtUnits(f.adj, B, { sign: true, short: true })} — прошло мимо записей</span>` : ''}
    ${goal && f.saved > 0 ? `<button type="button" class="btn amber" data-act="summary-save" data-id="${goal.id}">Отложить ${fmtUnits(f.saved, B, { short: true })} на «${esc(goal.name)}»</button>` : ''}
  </section>`;
}

Object.assign(App.actions, {
  'edit-on': () => { S.ui.edit = true; S.ui.selected = null; App.render(); },
  'edit-off': () => { S.ui.edit = false; App.render(); },
  saved: openSaved,
  'summary-close': async () => { S.data.settings.summarySeen = shiftMonth(monthOf(today()), -1); await saveData(); App.render(); },
  'summary-save': async (el) => {
    const goal = accById(el.dataset.id);
    const prev = shiftMonth(monthOf(today()), -1);
    const f = monthFlows(prev);
    const from = accounts().find((a) => a.id === S.data.settings.lastAcc && !isGoal(a)) || accounts().find((a) => !isGoal(a));
    if (!from) return toast('Нужен счёт, с которого отложить');
    const v = S.R.convert(f.saved, base(), from.cur);
    S.data.settings.summarySeen = prev; await saveData();
    openEntry({ type: 'transfer', from: from.id, to: goal.id, amount: v == null ? null : fromUnits(v, from.cur) });
  },
  'del-item': (el) => {
    const { kind, id } = el.dataset;
    const name = kind === 'src' ? srcById(id)?.name : kind === 'cat' ? catById(id)?.name : accById(id)?.name;
    openSheet(`${sheetHead('Удалить?')}
      <p>Удалить «${esc(name)}»?${kind === 'acc' ? ' Все операции по этому счёту тоже удалятся.' : kind === 'cat' ? ' Траты останутся, но попадут в «Без категории».' : ' Доходы останутся в операциях.'}</p>
      <div class="two"><button type="button" class="btn outline" data-close-sheet>Отмена</button><button type="button" class="btn danger" data-x="yes">Удалить</button></div>`, (sheet) => {
      sheet.querySelector('[data-x="yes"]').addEventListener('click', async () => { await App.del[kind](id); closeSheet(); App.render(); toast('Удалено'); });
    });
  },
});
