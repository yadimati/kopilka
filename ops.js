// Операции: поиск, фильтры, список и карточка операции.
import { S, App, accounts, accById, catById, srcById, shownTxns, txCur, base, inBase, partsOf, partsCur, monthFlows } from './state.js';
import { esc, today, monthOf, shiftMonth, humanDate, dateStr, plural, openSheet, sheetHead } from './util.js';
import { fmt, fmtUnits, toUnits } from './money.js';
import { ICONS, UI, svg } from './icons.js';
import { openEntry, repeatTxn, deleteTxn, snapshot, restore } from './entry.js';
import { save } from './state.js';
import { toast, closeSheet } from './util.js';

const sortTx = (a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') || (b.created || 0) - (a.created || 0);

export function txView(t) {
  const a = accById(t.acc);
  const cur = a?.cur || 'RUB';
  let title, subl = a?.name || 'без счёта', color = '#6d7f9a', icon = ICONS.dots, sign = '', cls = '';
  let amountText = fmt(t.amount, cur);
  if (t.type === 'expense') {
    const parts = partsOf(t);
    if (parts.length > 1) { title = parts.map((p) => catById(p.cat)?.name || 'Без категории').join(' + '); icon = UI.split; }
    else { const c = catById(t.cat), s = c?.subs?.find((x) => x.id === t.sub); title = (c?.name || 'Без категории') + (s ? ' · ' + s.name : ''); color = c?.color || color; icon = ICONS[c?.icon] || icon; }
    sign = '−'; cls = 'neg';
  } else if (t.type === 'income') {
    const s = srcById(t.source);
    title = s?.name || 'Доход'; color = s?.color || '#8a5a00'; icon = ICONS[s?.icon] || ICONS.job; sign = '+'; cls = 'pos';
  } else if (t.type === 'transfer') {
    const b = accById(t.to);
    title = 'Перевод'; subl = `${a?.name || '?'} → ${b?.name || '?'}`; icon = ICONS.repeat;
    if (b && b.cur !== cur) amountText = `${fmt(t.amount, cur)} → ${fmt(t.amountTo ?? t.amount, b.cur)}`;
  } else if (t.type === 'private_out' || t.type === 'private_in') {
    const peer = accById(t.peer);
    title = 'Перевод'; icon = ICONS.repeat;
    subl = t.type === 'private_in' ? `${peer?.name || '?'} → ${a?.name || '?'}` : `${a?.name || '?'} → ${peer?.name || '?'}`;
    sign = t.type === 'private_in' ? '+' : '−'; cls = t.type === 'private_in' ? 'pos' : 'neg';
  } else if (t.type === 'debt') {
    const d = S.data.debts.find((x) => x.id === t.debt);
    title = (t.repay ? 'Возврат долга · ' : 'Долг · ') + (d?.person || '?'); icon = UI.debts;
    sign = t.dir === 'in' ? '+' : '−'; cls = t.dir === 'in' ? 'pos' : 'neg';
  } else if (t.type === 'adjust') {
    title = 'Корректировка баланса'; icon = UI.settings; sign = t.dir === 'in' ? '+' : '−';
  }
  if (t.orig && (t.type === 'income' || t.type === 'expense')) amountText = `${fmt(t.orig.amount, t.orig.cur)} → ${fmt(t.amount, cur)}`;
  return { title, subl, color, icon, amountText: sign + amountText, cls };
}

function matches(t, q) {
  if (!q) return true;
  const hay = [];
  const v = txView(t);
  hay.push(v.title, v.subl, t.note || '');
  for (const p of t.type === 'expense' ? partsOf(t) : []) { const c = catById(p.cat); hay.push(c?.name || '', c?.subs?.find((s) => s.id === p.sub)?.name || ''); }
  if (t.type === 'transfer') hay.push(accById(t.to)?.name || '');
  const units = toUnits(t.amount, txCur(t));
  hay.push(String(units), units.toFixed(2).replace('.', ','), String(Math.round(units)));
  if (t.orig) hay.push(String(toUnits(t.orig.amount, t.orig.cur)));
  return hay.join(' ').toLowerCase().includes(q.toLowerCase().trim());
}
function inPeriod(t) {
  const p = S.ui.fPeriod, ym = monthOf(today());
  if (p === 'month') return monthOf(t.date) === ym;
  if (p === 'prev') return monthOf(t.date) === shiftMonth(ym, -1);
  if (p === '7') { const d = new Date(); d.setDate(d.getDate() - 6); return t.date >= dateStr(d); }
  return true;
}
function typeOk(t) {
  const f = S.ui.fType;
  if (f === 'all') return true;
  if (f === 'transfer') return t.type === 'transfer' || t.type.startsWith('private_');
  return t.type === f;
}
export function filteredTxns() {
  return shownTxns()
    .filter(inPeriod).filter(typeOk)
    .filter((t) => S.ui.fAcc === 'all' || t.acc === S.ui.fAcc || t.to === S.ui.fAcc)
    .filter((t) => S.ui.fCat === 'all' || (t.type === 'expense' && partsOf(t).some((p) => p.cat === S.ui.fCat)))
    .filter((t) => matches(t, S.ui.q))
    .sort(sortTx);
}

export function viewOps() {
  const list = filteredTxns();
  let sum = 0;
  for (const t of list) {
    const v = t.orig ? inBase(t.orig.amount, t.orig.cur) : inBase(t.amount, txCur(t));
    if (v == null) continue;
    if (t.type === 'income') sum += v; else if (t.type === 'expense') sum -= v;
  }
  let html = '', last = '';
  for (const t of list.slice(0, S.ui.opsLimit)) {
    if (t.date !== last) { last = t.date; html += `<div class="day">${humanDate(t.date)}</div>`; }
    const v = txView(t);
    html += `<button type="button" class="tx ${t.secret ? 'secret' : ''}" data-act="tx" data-id="${t.id}">
      <span class="disc xs" style="--c:${esc(v.color)}">${svg(v.icon, 16)}</span>
      <span class="what"><b>${esc(v.title)}</b><span>${esc(v.subl)}${t.time ? ' · ' + t.time : ''}${t.note ? ' · ' + esc(t.note) : ''}</span></span>
      <span class="amt num ${v.cls}">${esc(v.amountText)}</span></button>`;
  }
  const sel = (id, val, opts) => `<label class="fchip ${val !== 'all' && val !== '' ? 'on' : ''}"><span>${esc(opts.find((o) => o[0] === val)?.[1] || '')}</span><span class="caret">▾</span><select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  return `
  <header class="page-head"><h1>Операции</h1><button type="button" class="btn primary sm" data-act="new-entry">+ Операция</button></header>
  <label class="search">${svg(UI.search, 18)}<span class="sr">Поиск</span><input id="f-q" type="search" placeholder="Поиск: кофе, 450, Т-Банк…" value="${esc(S.ui.q)}" autocomplete="off">${S.ui.q ? `<span class="small muted">${list.length}</span>` : ''}</label>
  <div class="fchips">
    ${sel('f-period', S.ui.fPeriod === 'all' ? 'all' : S.ui.fPeriod, [['month', 'Этот месяц'], ['prev', 'Прошлый месяц'], ['7', '7 дней'], ['all', 'Всё время']])}
    ${sel('f-type', S.ui.fType, [['all', 'Все типы'], ['expense', 'Расходы'], ['income', 'Доходы'], ['transfer', 'Переводы'], ['debt', 'Долги'], ['adjust', 'Корректировки']])}
    ${sel('f-acc', S.ui.fAcc, [['all', 'Все счета'], ...accounts().map((a) => [a.id, a.name])])}
    ${sel('f-cat', S.ui.fCat, [['all', 'Все категории'], ...S.data.cats.map((c) => [c.id, c.name])])}
  </div>
  <div class="row between small muted"><span>${list.length} ${plural(list.length, 'операция', 'операции', 'операций')}</span><span class="num ${sum >= 0 ? 'pos' : 'neg'}">${fmtUnits(sum, base(), { sign: true })}</span></div>
  <div class="ledger">${html || '<div class="empty">Ничего не найдено. Попробуйте другой период или запрос.</div>'}</div>
  ${list.length > S.ui.opsLimit ? `<button type="button" class="btn ghost full" data-act="more-ops">Показать ещё</button>` : ''}`;
}

/* ---------- карточка операции ---------- */
function catStats(t) {
  const ym = monthOf(t.date);
  const cur = monthFlows(ym), prev = monthFlows(shiftMonth(ym, -1));
  const p = partsOf(t)[0];
  const c = catById(p.cat);
  if (!c) return '';
  const v = cur.byCat[c.id] || 0, pv = prev.byCat[c.id] || 0, n = cur.cnt[c.id] || 1;
  const share = cur.exp ? Math.round((v / cur.exp) * 100) : 0;
  const d = pv ? Math.round(((v - pv) / pv) * 100) : null;
  const B = base();
  const s = p.sub && c.subs?.find((x) => x.id === p.sub);
  const sv = s ? cur.bySub[c.id + '|' + p.sub] || 0 : 0;
  const scnt = s ? shownTxns().filter((x) => x.type === 'expense' && monthOf(x.date) === ym && partsOf(x).some((q) => q.cat === c.id && q.sub === p.sub)).length : 0;
  return `<section class="mini">
    <span class="label">${esc(c.name)} · ${['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'][Number(ym.slice(5)) - 1]}</span>
    <div class="m3">
      <div><b class="num">${fmtUnits(v, B, { short: true })}</b><span>${share}% всех трат</span></div>
      <div><b class="num ${d == null ? '' : d > 0 ? 'neg' : 'pos'}">${d == null ? '—' : (d > 0 ? '+' : '') + d + '%'}</b><span>к прошлому месяцу</span></div>
      <div><b class="num">${fmtUnits(v / n, B, { short: true })}</b><span>средний чек</span></div>
    </div>
    ${s ? `<div class="row between small"><span>Из них «${esc(s.name)}»</span><span class="num">${fmtUnits(sv, B, { short: true })} · ${scnt} ${plural(scnt, 'раз', 'раза', 'раз')}</span></div>
      <span class="bar"><i style="width:${v ? Math.round((sv / v) * 100) : 0}%;background:${esc(c.color)}"></i></span>` : ''}
  </section>`;
}
function openCard(id) {
  const t = shownTxns().find((x) => x.id === id);
  if (!t) return;
  const v = txView(t);
  const a = accById(t.acc);
  const editable = ['expense', 'income', 'transfer'].includes(t.type);
  const parts = t.type === 'expense' ? partsOf(t) : [];
  const typeName = { expense: 'Расход', income: 'Доход', transfer: 'Перевод', private_in: 'Перевод', private_out: 'Перевод', debt: 'Долг', adjust: 'Корректировка' }[t.type];
  openSheet(`${sheetHead(`<span class="small muted block">${typeName}</span>${esc(v.title)}`)}
    <p class="big-amt num ${v.cls}">${esc(v.amountText)}</p>
    <dl class="details">
      <dt>Счёт</dt><dd>${esc(t.type === 'transfer' ? v.subl : a?.name || 'без счёта')}</dd>
      <dt>Дата</dt><dd>${humanDate(t.date)}${t.time ? ', ' + t.time : ''}</dd>
      ${t.note ? `<dt>Комментарий</dt><dd>${esc(t.note)}</dd>` : ''}
      ${parts.length > 1 ? `<dt>Части</dt><dd>${parts.map((p) => `${esc(catById(p.cat)?.name || '—')}: ${fmt(p.amount, partsCur(t))}`).join('<br>')}</dd>` : ''}
    </dl>
    ${t.type === 'expense' ? catStats(t) : ''}
    <div class="card-actions">
      ${editable ? `<button type="button" class="linkish" data-x="repeat">Повторить сегодня</button><button type="button" class="btn primary full" data-x="edit">Редактировать</button>`
        : `<button type="button" class="btn danger-ghost full" data-x="del">Удалить операцию</button>`}
    </div>`, (sheet) => {
    sheet.addEventListener('click', async (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
      if (x === 'repeat') { closeSheet(); return repeatTxn(t); }
      if (x === 'del') { const snap = snapshot(); deleteTxn(t.id); await save(); closeSheet(); App.render(); toast('Удалено', { top: true, action: { label: 'Отменить', fn: () => restore(snap) } }); }
      if (x === 'edit') {
        const init = { editId: t.id, type: t.type, date: t.date, time: t.time, note: t.note || '', amount: t.amount };
        if (t.orig) Object.assign(init, { amount: t.orig.amount, opCur: t.orig.cur, amountTo: t.amount });
        else if (t.type !== 'transfer') init.opCur = txCur(t);
        if (t.type === 'expense') Object.assign(init, { from: t.acc, to: t.cat, sub: t.sub, parts: t.parts });
        if (t.type === 'income') Object.assign(init, { from: t.source, to: t.acc });
        if (t.type === 'transfer') Object.assign(init, { from: t.acc, to: t.to, amountTo: t.amountTo });
        openEntry(init);
      }
    });
  });
}

Object.assign(App.actions, {
  tx: (el) => openCard(el.dataset.id),
  'new-entry': () => openEntry({ type: 'expense' }),
  'more-ops': () => { S.ui.opsLimit += 150; App.render(); },
});
Object.assign(App.changes, {
  'f-period': (el) => { S.ui.fPeriod = el.value; App.render(); },
  'f-type': (el) => { S.ui.fType = el.value; App.render(); },
  'f-acc': (el) => { S.ui.fAcc = el.value; App.render(); },
  'f-cat': (el) => { S.ui.fCat = el.value; App.render(); },
});
