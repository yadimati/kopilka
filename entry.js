// Шторка ввода операции: расход / доход / перевод, валюта суммы, подкатегории,
// разделение чека, «Записать и ещё», отмена.
import { S, App, accounts, accById, catById, srcById, isSecretAcc, balance, base, save, saveData, sub, txCur } from './state.js';
import { $, esc, uid, today, nowTime, toast, openSheet, closeSheet, sheetHead, groupInput, applyKey } from './util.js';
import { allCurrencies, curInfo, parseAmount, toUnits, fromUnits, fmt, minorToInput } from './money.js';
import { ICONS, UI, svg } from './icons.js';

/* ---------- валюты в шторке ---------- */
const accSideId = (e) => (e.type === 'income' ? e.to : e.from);
const accSideCur = (e) => accById(accSideId(e))?.cur || 'RUB';
const fromCur = (e) => (e.type === 'income' ? accSideCur(e) : accById(e.from)?.cur) || 'RUB';
const toCur = (e) => (e.type === 'transfer' ? accById(e.to)?.cur : fromCur(e)) || 'RUB';
const amountCur = (e) => (e.type === 'transfer' ? fromCur(e) : e.opCur || accSideCur(e));
const secondCur = (e) => (e.type === 'transfer' ? toCur(e) : accSideCur(e));
const isCross = (e) => amountCur(e) !== secondCur(e);
function defaultOpCur(e) {
  const saved = S.data.settings.opCur?.[accSideId(e)];
  if (saved && allCurrencies()[saved]) return saved;
  const c = accSideCur(e);
  return curInfo(c).crypto ? base() : c;
}
function normalize(e, typeChanged = false) {
  const accs = accounts();
  const first = accById(S.data.settings.lastAcc) ? S.data.settings.lastAcc : accs[0]?.id;
  if (e.type === 'expense') {
    if (!accById(e.from)) e.from = typeChanged && accById(e.to) ? e.to : first;
    if (!catById(e.to)) e.to = S.data.cats[0]?.id;
  } else if (e.type === 'income') {
    if (typeChanged && accById(e.from)) e.to = e.from;
    if (!srcById(e.from)) e.from = S.data.sources[0]?.id;
    if (!accById(e.to)) e.to = first;
  } else {
    if (!accById(e.from)) e.from = first;
    if (!accById(e.to) || e.to === e.from) e.to = accs.find((a) => a.id !== e.from)?.id;
  }
  if (e.type !== 'expense') e.parts = null;
  if (e.type === 'transfer') e.opCur = null;
  else if (!e.opCur || typeChanged) e.opCur = defaultOpCur(e);
  if (!isCross(e)) { if (e.focus === 'amountTo') e.focus = 'amount'; e.amountTo = ''; }
}

/* ---------- открытие ---------- */
export function openEntry(init = {}) {
  if (!accounts().length) return toast('Сначала добавьте счёт');
  const e = {
    type: init.type || 'expense', from: init.from, to: init.to,
    amount: '', amountTo: '', focus: 'amount', sub: init.sub || null,
    date: init.date || today(), time: init.time || nowTime(), note: init.note || '',
    editId: init.editId || null, opCur: init.opCur || null, parts: null,
    addingSub: false, last: null, count: 0,
  };
  normalize(e);
  if (init.amount != null) e.amount = minorToInput(init.amount, amountCur(e));
  if (init.amountTo != null && isCross(e)) e.amountTo = minorToInput(init.amountTo, secondCur(e));
  if (init.parts?.length > 1) {
    const cur = amountCur(e);
    e.parts = init.parts.map((p, i) => ({ cat: p.cat, sub: p.sub || null, amt: i === 0 ? '' : minorToInput(p.amount, cur) }));
  }

  openSheet('<div class="entry"></div>', (sheet) => {
    const box = $('.entry', sheet);
    const draw = () => { box.innerHTML = entryHtml(e); };
    draw();
    box.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.type) { e.type = d.type; e.sub = null; normalize(e, true); return draw(); }
      if (d.key) {
        if (e.focus.startsWith('part:')) {
          const i = Number(e.focus.slice(5));
          e.parts[i].amt = applyKey(e.parts[i].amt, d.key, amountCur(e));
        } else e[e.focus] = applyKey(e[e.focus], d.key, e.focus === 'amount' ? amountCur(e) : secondCur(e));
        return draw();
      }
      if (d.focus) { e.focus = d.focus; return draw(); }
      if (d.sub !== undefined) { e.sub = e.sub === d.sub ? null : d.sub; return draw(); }
      if (d.act === 'add-sub') { e.addingSub = true; draw(); $('#new-sub', box)?.focus(); return; }
      if (d.act === 'save-sub') {
        const name = $('#new-sub', box).value.trim();
        if (name) { const c = catById(e.to); const s = sub(name); c.subs = [...(c.subs || []), s]; e.sub = s.id; await saveData(); }
        e.addingSub = false; return draw();
      }
      if (d.act === 'split') {
        e.parts = [{ cat: e.to, sub: e.sub, amt: '' }, { cat: S.data.cats.find((c) => c.id !== e.to)?.id || e.to, sub: null, amt: '' }];
        e.focus = 'part:1'; return draw();
      }
      if (d.act === 'add-part') { e.parts.push({ cat: S.data.cats[0]?.id, sub: null, amt: '' }); e.focus = 'part:' + (e.parts.length - 1); return draw(); }
      if (d.delPart) {
        e.parts.splice(Number(d.delPart), 1);
        if (e.parts.length < 2) { e.to = e.parts[0].cat; e.sub = e.parts[0].sub; e.parts = null; }
        e.focus = 'amount'; return draw();
      }
      if (d.act === 'undo-last') return undoLast(e, draw);
      if (d.act === 'save') return saveEntry(e, box, false, draw);
      if (d.act === 'save-more') return saveEntry(e, box, true, draw);
      if (d.act === 'delete') { const snap = snapshot(); deleteTxn(e.editId); await save(); closeSheet(); App.render(); toast('Операция удалена', { top: true, action: { label: 'Отменить', fn: () => restore(snap) } }); }
    });
    box.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.id === 'e-from') { e.from = t.value; if (e.type === 'expense') e.opCur = null; normalize(e); draw(); }
      if (t.id === 'e-to') { e.to = t.value; e.sub = null; if (e.type === 'income') e.opCur = null; if (e.parts) e.parts[0].cat = t.value; normalize(e); draw(); }
      if (t.id === 'e-cur') { e.opCur = t.value; e.amountTo = ''; e.focus = 'amount'; normalize(e); draw(); }
      if (t.dataset.partCat) { const p = e.parts[Number(t.dataset.partCat)]; p.cat = t.value; p.sub = null; if (t.dataset.partCat === '0') e.to = t.value; draw(); }
      if (t.dataset.partSub) { e.parts[Number(t.dataset.partSub)].sub = t.value || null; }
      if (t.id === 'e-date') e.date = t.value || today();
      if (t.id === 'e-time') e.time = t.value || nowTime();
      if (t.id === 'e-note') e.note = t.value;
    });
  }, { tall: true });
}

/* ---------- разметка ---------- */
const optionList = (items, sel) => items.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
function chip(id, item, options, sublabel) {
  return `<label class="chip-sel">
    <span class="disc sm" style="--c:${esc(item?.color || '#6d7f9a')}">${svg(ICONS[item?.icon] || ICONS.dots, 18)}</span>
    <span class="txt"><b>${esc(item?.name || '—')}</b><span class="small muted">${sublabel || '&nbsp;'}</span></span>
    <select id="${id}" aria-label="Выбрать">${options}</select>
  </label>`;
}
function curPickOptions(sel, accCur) {
  const first = [...new Set([accCur, base(), 'RUB', 'USD', 'EUR', 'USDT'])];
  const rest = Object.keys(allCurrencies()).filter((c) => !first.includes(c));
  return [...first, ...rest].map((c) => `<option value="${esc(c)}" ${c === sel ? 'selected' : ''}>${esc(c)}${c === accCur ? ' (валюта счёта)' : ''}</option>`).join('');
}
/** Суммы частей чека в минимальных единицах; первая часть = остаток. */
function partAmounts(e) {
  const cur = amountCur(e);
  const total = parseAmount(e.amount, cur) || 0;
  const rest = e.parts.slice(1).map((p) => parseAmount(p.amt, cur) || 0);
  return [total - rest.reduce((s, x) => s + x, 0), ...rest];
}
function entryHtml(e) {
  const accOpts = (sel, excl) => optionList(accounts().filter((a) => a.id !== excl).map((a) => ({ id: a.id, label: `${a.secret ? '• ' : ''}${a.name} (${a.cur})` })), sel);
  const catOpts = (sel) => optionList(S.data.cats.map((c) => ({ id: c.id, label: c.name })), sel);
  let fromChip, toChip;
  if (e.type === 'income') {
    fromChip = chip('e-from', srcById(e.from), optionList(S.data.sources.map((s) => ({ id: s.id, label: s.name })), e.from), 'доход');
    const a = accById(e.to);
    toChip = chip('e-to', a, accOpts(e.to), a ? fmt(balance(a.id), a.cur) : '');
  } else {
    const a = accById(e.from);
    fromChip = chip('e-from', a, accOpts(e.from), a ? fmt(balance(a.id), a.cur) : '');
    if (e.type === 'expense') toChip = chip('e-to', catById(e.to), catOpts(e.to), e.parts ? 'и другие' : 'расход');
    else { const b = accById(e.to); toChip = chip('e-to', b, accOpts(e.to, e.from), b ? fmt(balance(b.id), b.cur) : ''); }
  }
  const ac = amountCur(e), sc = secondCur(e), cross = isCross(e);
  const amt = parseAmount(e.amount, ac);
  let side = amt, byRate = null;
  if (cross) {
    const v = amt > 0 ? S.R.convert(toUnits(amt, ac), ac, sc) : null;
    byRate = v == null ? null : fromUnits(v, sc);
    side = e.amountTo ? parseAmount(e.amountTo, sc) : byRate;
  }
  let after = '';
  if (e.type === 'expense' && side > 0 && accById(e.from)) after = `останется <span class="num">${fmt(balance(e.from) - side, sc)}</span>`;
  if (e.type === 'transfer' && amt > 0 && accById(e.from)) after = `останется <span class="num">${fmt(balance(e.from) - amt, ac)}</span>`;
  if (e.type === 'income' && side > 0 && accById(e.to)) after = `станет <span class="num">${fmt(balance(e.to) + side, sc)}</span>`;
  const secondLabel = { transfer: 'зачисление', income: 'на счёт придёт', expense: 'со счёта спишется' }[e.type];
  const curSymbol = e.type === 'transfer'
    ? `<span class="cur">${esc(curInfo(ac).s)}</span>`
    : `<label class="cur cur-pick">${esc(curInfo(ac).s)}<span class="caret">▾</span><select id="e-cur" aria-label="Валюта суммы">${curPickOptions(ac, accSideCur(e))}</select></label>`;

  const cat = e.type === 'expense' && !e.parts ? catById(e.to) : null;
  const subs = cat ? (cat.subs || []).map((s) => `<button type="button" class="tag ${e.sub === s.id ? 'on' : ''}" data-sub="${s.id}" aria-pressed="${e.sub === s.id}">${esc(s.name)}</button>`).join('') : '';
  let splitHtml = '';
  if (e.type === 'expense' && e.parts) {
    const am = partAmounts(e);
    const total = parseAmount(e.amount, ac) || 0;
    const ok = am[0] >= 0 && total > 0;
    splitHtml = `<div class="split">
      ${e.parts.map((p, i) => {
        const c = catById(p.cat);
        return `<div class="part">
          <label class="part-cat"><span class="dot" style="background:${esc(c?.color || '#7d8a86')}"></span><span>${esc(c?.name || '—')}</span><select data-part-cat="${i}" aria-label="Категория части">${catOpts(p.cat)}</select></label>
          <select class="part-sub" data-part-sub="${i}" aria-label="Подкатегория"><option value="">—</option>${(c?.subs || []).map((s) => `<option value="${s.id}" ${s.id === p.sub ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
          ${i === 0
            ? `<span class="part-amt num ${am[0] < 0 ? 'neg' : 'muted'}">${fmt(am[0], ac)}</span><span class="part-x"></span>`
            : `<button type="button" class="part-amt num ${e.focus === 'part:' + i ? 'focus' : ''}" data-focus="part:${i}">${esc(groupInput(p.amt)) || '0'}</button><button type="button" class="part-x" data-del-part="${i}" aria-label="Убрать часть">×</button>`}
        </div>`;
      }).join('')}
      <div class="row between"><button type="button" class="linkish" data-act="add-part">+ Ещё категория</button>
        <span class="small ${ok ? 'pos' : 'neg'}">${ok ? `Распределено ${fmt(total, ac)} ✓` : am[0] < 0 ? 'Части больше суммы чека' : 'Введите сумму чека'}</span></div>
    </div>`;
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'];
  const editing = !!e.editId;
  return `
    ${sheetHead(editing ? 'Правка' : '', `<div class="seg small-seg" role="group" aria-label="Тип">
      ${[['expense', 'Расход'], ['income', 'Доход'], ['transfer', 'Перевод']].map(([k, l]) => `<button type="button" data-type="${k}" aria-pressed="${e.type === k}">${l}</button>`).join('')}</div>`)}
    ${e.last ? `<div class="saved-line">${svg(UI.check, 18)}<span>Записано: ${esc(e.last.label)}</span><button type="button" data-act="undo-last">Отменить</button></div>` : ''}
    <div class="pair">${fromChip}<span class="arrow">${svg(UI.arrow, 18)}</span>${toChip}</div>
    <div class="amount-row">
      <button type="button" class="amount ${e.focus === 'amount' ? 'focus' : ''}" data-focus="amount"><span class="num big">${esc(groupInput(e.amount) || '0')}</span></button>
      ${curSymbol}
    </div>
    ${cross ? `<button type="button" class="amount second ${e.focus === 'amountTo' ? 'focus' : ''}" data-focus="amountTo">
      <span class="small muted">${secondLabel}</span><span class="num mid">${esc(groupInput(e.amountTo)) || `<span class="muted">${byRate != null ? esc(groupInput(minorToInput(byRate, sc))) : '—'}</span>`}</span><span class="cur">${esc(curInfo(sc).s)}</span></button>` : ''}
    <div class="small muted center">${cross && amt > 0 && byRate == null ? 'курса нет — введите сумму на счёте' : ''}${after ? 'на счёте ' + after : '&nbsp;'}</div>
    ${cat ? `<div class="tags" role="group" aria-label="Подкатегория">${subs}${e.addingSub
      ? `<span class="tag-input"><input id="new-sub" maxlength="30" placeholder="Название"><button type="button" class="tag on" data-act="save-sub">OK</button></span>`
      : `<button type="button" class="tag ghost" data-act="add-sub">+ Своя</button>`}<button type="button" class="tag ghost" data-act="split">${svg(UI.split, 14)} Разделить</button></div>` : ''}
    ${splitHtml}
    <div class="meta-row">
      <label class="field"><span class="sr">Дата</span><input id="e-date" type="date" value="${e.date}"></label>
      <label class="field"><span class="sr">Время</span><input id="e-time" type="time" value="${e.time}"></label>
      <label class="field note"><span class="sr">Комментарий</span><input id="e-note" maxlength="80" placeholder="Комментарий" value="${esc(e.note)}"></label>
    </div>
    <div class="keypad">${keys.map((k) => `<button type="button" data-key="${k}" aria-label="${k === 'del' ? 'Стереть' : k}">${k === 'del' ? svg(UI.back, 24) : k}</button>`).join('')}</div>
    <div class="err" id="e-err"></div>
    ${editing
      ? `<div class="row gap"><button type="button" class="btn danger-ghost" data-act="delete">Удалить</button><button type="button" class="btn primary grow" data-act="save">Сохранить</button></div>`
      : `<div class="two-btn"><button type="button" class="btn outline" data-act="save">Записать</button><button type="button" class="btn primary" data-act="save-more">Записать и ещё</button></div>`}`;
}

/* ---------- отмена ---------- */
export const snapshot = () => ({ d: S.data.txns.slice(), v: S.vault ? S.vault.txns.slice() : null, s: (S.data.saved || []).slice() });
export async function restore(snap) {
  S.data.txns = snap.d;
  if (S.vault && snap.v) S.vault.txns = snap.v;
  S.data.saved = snap.s;
  await save();
  App.render();
  toast('Отменено');
}
async function undoLast(e, draw) {
  if (!e.last) return;
  await restore(e.last.snap);
  e.last = null; e.count = Math.max(0, e.count - 1);
  draw();
}

/* ---------- сохранение ---------- */
async function saveEntry(e, box, more, draw) {
  const err = (m) => { $('#e-err', box).textContent = m; };
  const ac = amountCur(e), sc = secondCur(e);
  const amount = parseAmount(e.amount, ac);
  if (!(amount > 0)) return err('Введите сумму больше нуля');
  if (e.type === 'transfer' && (!e.to || e.to === e.from)) return err('Выберите другой счёт для зачисления');
  let parts = null;
  if (e.type === 'expense' && e.parts) {
    const am = partAmounts(e);
    if (am[0] < 0) return err('Части больше суммы чека');
    if (am.slice(1).some((x) => !(x > 0))) return err('У каждой части должна быть сумма');
    parts = e.parts.map((p, i) => ({ cat: p.cat, sub: p.sub, amount: am[i] }));
  }
  let amountTo = null;
  if (isCross(e)) {
    amountTo = parseAmount(e.amountTo, sc);
    if (!e.amountTo) {
      const v = S.R.convert(toUnits(amount, ac), ac, sc);
      if (v == null) return err(`Курса ${ac}/${sc} нет — введите сумму в ${sc}`);
      amountTo = fromUnits(v, sc);
    }
    if (!(amountTo > 0)) return err(`Сумма в ${sc} должна быть больше нуля`);
  }
  if (e.type !== 'transfer') S.data.settings.opCur = { ...(S.data.settings.opCur || {}), [accSideId(e)]: ac };
  const accAmount = e.type === 'transfer' ? amount : amountTo ?? amount;
  const orig = e.type !== 'transfer' && amountTo != null ? { amount, cur: ac } : null;

  const snap = snapshot();
  const id = e.editId || uid('t');
  if (e.editId) deleteTxn(e.editId);
  const baseTx = { id, date: e.date, time: e.time, note: e.note.trim(), created: Date.now() };
  let label = '';
  if (e.type === 'expense') {
    const t = { ...baseTx, type: 'expense', acc: e.from, cat: parts ? parts[0].cat : e.to, sub: parts ? parts[0].sub : e.sub, amount: accAmount };
    if (parts) t.parts = parts;
    if (orig) t.orig = orig;
    (isSecretAcc(e.from) ? S.vault.txns : S.data.txns).push(t);
    const c = catById(t.cat), s = c?.subs?.find((x) => x.id === t.sub);
    label = `${parts ? parts.map((p) => catById(p.cat)?.name).join(' + ') : (c?.name || '') + (s ? ' · ' + s.name : '')} · ${fmt(amount, ac)}`;
    if (!isSecretAcc(e.from)) S.data.settings.lastAcc = e.from;
  } else if (e.type === 'income') {
    const t = { ...baseTx, type: 'income', acc: e.to, source: e.from, amount: accAmount };
    if (orig) t.orig = orig;
    (isSecretAcc(e.to) ? S.vault.txns : S.data.txns).push(t);
    label = `${srcById(e.from)?.name || 'Доход'} · ${fmt(amount, ac)}`;
  } else {
    const sFrom = isSecretAcc(e.from), sTo = isSecretAcc(e.to);
    const recv = amountTo ?? amount;
    if (sFrom === sTo) {
      const t = { ...baseTx, type: 'transfer', acc: e.from, to: e.to, amount };
      if (amountTo != null) t.amountTo = amountTo;
      (sFrom ? S.vault.txns : S.data.txns).push(t);
    } else if (!sFrom && sTo) {
      S.data.txns.push({ ...baseTx, type: 'private_out', acc: e.from, amount, note: '' });
      S.vault.txns.push({ ...baseTx, id: uid('t'), type: 'private_in', acc: e.to, amount: recv, link: id, peer: e.from });
    } else {
      S.data.txns.push({ ...baseTx, type: 'private_in', acc: e.to, amount: recv, note: '' });
      S.vault.txns.push({ ...baseTx, id: uid('t'), type: 'private_out', acc: e.from, amount, link: id, peer: e.to });
    }
    label = `${accById(e.from)?.name} → ${accById(e.to)?.name} · ${fmt(amount, ac)}`;
  }
  await save();
  App.render();
  if (more) {
    e.last = { label, snap }; e.count++;
    e.amount = ''; e.amountTo = ''; e.parts = null; e.sub = null; e.note = ''; e.focus = 'amount'; e.time = nowTime();
    $('#e-err', box).textContent = '';
    return draw();
  }
  closeSheet();
  toast(e.editId ? 'Сохранено' : 'Записано: ' + label, { top: true, action: { label: 'Отменить', fn: () => restore(snap) } });
}

/** Удаляет операцию; вторая половина перевода «в сейф» удаляется вместе с ней. */
export function deleteTxn(id) {
  S.data.txns = S.data.txns.filter((t) => t.id !== id);
  if (S.vault) {
    const v = S.vault.txns.find((t) => t.id === id);
    S.vault.txns = S.vault.txns.filter((t) => t.id !== id && t.link !== id);
    if (v?.link) S.data.txns = S.data.txns.filter((t) => t.id !== v.link);
  }
}

/** Повтор операции сегодня. */
export async function repeatTxn(t) {
  const snap = snapshot();
  const copy = { ...t, id: uid('t'), date: today(), time: nowTime(), created: Date.now() };
  delete copy.secret;
  txListFor(t).push(copy);
  await save();
  App.render();
  toast('Повторено на сегодня', { top: true, action: { label: 'Отменить', fn: () => restore(snap) } });
}
const txListFor = (t) => (t.secret ? S.vault.txns : S.data.txns);
export { txCur };
