// Долги и напоминания.
import { S, App, accById, saveData, base, inBase } from './state.js';
import { $, esc, uid, today, humanDate, MONTHS_GEN, toast, openSheet, closeSheet, sheetHead, dateStr, shareFile } from './util.js';
import { parseAmount, fmt, fmtUnits, minorToInput, allCurrencies } from './money.js';
import { UI, svg } from './icons.js';

export const debtTx = (d) => S.data.txns.filter((t) => t.type === 'debt' && t.debt === d.id);
export function debtLeft(d) {
  const repDir = d.dir === 'owe_me' ? 'in' : 'out';
  const repaid = debtTx(d).filter((t) => t.repay && t.dir === repDir).reduce((s, t) => s + t.amount, 0);
  return Math.max(0, d.amount - repaid);
}
export function debtTotals() {
  let owe = 0, iowe = 0;
  for (const d of S.data.debts) {
    if (d.closed) continue;
    const v = inBase(debtLeft(d), d.cur);
    if (v == null) continue;
    if (d.dir === 'owe_me') owe += v; else iowe += v;
  }
  return { owe, iowe };
}
export function allReminders() {
  const own = S.data.reminders.map((r) => ({ ...r, kind: 'own' }));
  const fromDebts = S.data.debts.filter((d) => !d.closed && d.due && debtLeft(d) > 0).map((d) => ({
    id: 'd-' + d.id, debtId: d.id, kind: 'debt', date: d.due, repeat: 'none',
    title: d.dir === 'owe_me' ? `${d.person} возвращает ${fmt(debtLeft(d), d.cur)}` : `Вернуть ${d.person} ${fmt(debtLeft(d), d.cur)}`,
  }));
  return [...own, ...fromDebts].sort((a, b) => a.date.localeCompare(b.date));
}
const curOptions = (sel) => Object.entries(allCurrencies()).map(([c, i]) => `<option value="${esc(c)}" ${c === sel ? 'selected' : ''}>${esc(c)} — ${esc(i.n)}</option>`).join('');

export function viewDebts() {
  const B = base();
  const d = debtTotals();
  const open = S.data.debts.filter((x) => !x.closed), closed = S.data.debts.filter((x) => x.closed);
  const row = (x) => {
    const left = debtLeft(x), paid = x.amount - left;
    const overdue = x.due && x.due < today() && left > 0;
    const dueText = x.closed ? 'закрыт' : x.due ? (overdue ? `просрочено с ${humanDate(x.due).toLowerCase()}` : `до ${humanDate(x.due).toLowerCase()}`) : 'без срока';
    return `<button type="button" class="debt" data-act="debt" data-id="${x.id}">
      <span class="avatar ${x.dir === 'owe_me' ? 'pos' : 'neg'}">${esc((x.person || '?').slice(0, 1).toUpperCase())}</span>
      <span class="what"><b>${esc(x.person)}</b><span class="${overdue ? 'neg' : ''}">${dueText}</span>
        ${paid > 0 && left > 0 ? `<span class="bar"><i style="width:${Math.round((paid / x.amount) * 100)}%"></i></span>` : ''}</span>
      <span class="amt"><span class="num ${x.dir === 'owe_me' ? 'pos' : 'neg'}">${fmt(left, x.cur)}</span><span class="small muted">${x.dir === 'owe_me' ? 'мне должны' : 'я должен'}</span></span>
    </button>`;
  };
  const rem = allReminders();
  return `
  <header class="page-head"><h1>Долги</h1></header>
  <div class="two">
    <div class="stat"><span class="small muted">Мне должны</span><b class="num pos">${fmtUnits(d.owe, B)}</b></div>
    <div class="stat"><span class="small muted">Я должен</span><b class="num neg">${fmtUnits(d.iowe, B)}</b></div>
  </div>
  <div class="two">
    <button type="button" class="btn primary" data-act="lend">Дал в долг</button>
    <button type="button" class="btn outline" data-act="borrow">Взял в долг</button>
  </div>
  <div class="card list">${open.map(row).join('') || '<div class="empty">Открытых долгов нет.</div>'}</div>
  ${closed.length ? `<details class="closed"><summary class="small muted">Закрытые (${closed.length})</summary><div class="card list">${closed.map(row).join('')}</div></details>` : ''}
  <div class="row between section-title"><span class="label">Напоминания</span><button type="button" class="linkish" data-act="new-reminder">+ Добавить</button></div>
  <div class="card list">${rem.map((r) => {
    const [, M, D] = r.date.split('-').map(Number);
    const late = r.date < today();
    return `<button type="button" class="rem" data-act="reminder" data-id="${r.id}">
      <span class="when ${late ? 'neg' : ''}"><b class="num">${D}</b><span>${MONTHS_GEN[M - 1].slice(0, 3)}</span></span>
      <span class="what"><b>${esc(r.title)}</b><span>${r.kind === 'debt' ? 'из долгов' : { none: 'один раз', week: 'каждую неделю', month: 'каждый месяц' }[r.repeat]}${r.amount ? ' · ' + fmt(r.amount, r.cur || 'RUB') : ''}</span></span>
      ${svg(UI.bell, 18)}
    </button>`;
  }).join('') || '<div class="empty">Напоминаний нет. Добавьте подписку или платёж.</div>'}</div>`;
}

function openDebtForm(dir) {
  openSheet(`${sheetHead(dir === 'owe_me' ? 'Дал в долг' : 'Взял в долг')}
    <form class="form" id="debt-form">
      <label>Кто<input id="d-person" maxlength="40" required placeholder="Имя"></label>
      <label>Счёт<select id="d-acc"><option value="">Не трогать счета</option>${S.data.accounts.map((a) => `<option value="${a.id}">${esc(a.name)} (${a.cur})</option>`).join('')}</select></label>
      <div class="two">
        <label>Сумма<input id="d-amount" inputmode="decimal" placeholder="0" required></label>
        <label id="d-cur-l">Валюта<select id="d-cur">${curOptions(base())}</select></label>
      </div>
      <div class="two">
        <label>Когда<input id="d-date" type="date" value="${today()}"></label>
        <label>Вернуть до<input id="d-due" type="date"></label>
      </div>
      <label>Комментарий<input id="d-note" maxlength="80"></label>
      <div class="err" id="d-err"></div>
      <button class="btn primary full" type="submit">Записать</button>
    </form>`, (sheet) => {
    $('#d-acc', sheet).addEventListener('change', () => { $('#d-cur-l', sheet).hidden = !!$('#d-acc', sheet).value; });
    $('#debt-form', sheet).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const accId = $('#d-acc', sheet).value || null;
      const cur = accId ? accById(accId).cur : $('#d-cur', sheet).value;
      const amount = parseAmount($('#d-amount', sheet).value, cur);
      const person = $('#d-person', sheet).value.trim();
      if (!person) return ($('#d-err', sheet).textContent = 'Укажите, кто');
      if (!(amount > 0)) return ($('#d-err', sheet).textContent = 'Сумма должна быть больше нуля');
      const d = { id: uid('d'), person, dir, cur, amount, date: $('#d-date', sheet).value || today(), due: $('#d-due', sheet).value || null, note: $('#d-note', sheet).value.trim(), closed: false };
      S.data.debts.push(d);
      if (accId) S.data.txns.push({ id: uid('t'), type: 'debt', dir: dir === 'owe_me' ? 'out' : 'in', acc: accId, debt: d.id, amount, date: d.date, time: '12:00', note: '', created: Date.now() });
      await saveData(); closeSheet(); toast('Долг записан'); App.render();
    });
  });
}

function openDebt(id) {
  const d = S.data.debts.find((x) => x.id === id);
  if (!d) return;
  const left = debtLeft(d);
  const hist = debtTx(d).sort((a, b) => b.date.localeCompare(a.date));
  const sameCur = S.data.accounts.filter((a) => a.cur === d.cur);
  openSheet(`${sheetHead(esc(d.person))}
    <p class="big-amt num ${d.dir === 'owe_me' ? 'pos' : 'neg'}">${fmt(left, d.cur)}</p>
    <p class="muted small">${d.dir === 'owe_me' ? 'мне должны' : 'я должен'} · всего было ${fmt(d.amount, d.cur)} · с ${humanDate(d.date).toLowerCase()}${d.due ? ' · до ' + humanDate(d.due).toLowerCase() : ''}${d.note ? ' · ' + esc(d.note) : ''}</p>
    ${!d.closed && left > 0 ? `<form class="form" id="rep-form">
      <div class="two">
        <label>${d.dir === 'owe_me' ? 'Получил возврат' : 'Вернул'}<input id="r-amount" inputmode="decimal" value="${minorToInput(left, d.cur)}"></label>
        <label>Счёт<select id="r-acc"><option value="">Не трогать счета</option>${sameCur.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>
      </div>
      <div class="err" id="r-err"></div>
      <button class="btn primary full" type="submit">Записать возврат</button>
    </form>` : ''}
    ${hist.length ? `<div class="card list">${hist.map((t) => `<div class="srow"><span class="what"><b>${t.repay ? 'Возврат' : 'Долг'}</b><span>${humanDate(t.date)}${t.acc ? ' · ' + esc(accById(t.acc)?.name || 'без счёта') : ' · без счёта'}</span></span><span class="num">${fmt(t.amount, d.cur)}</span></div>`).join('')}</div>` : ''}
    <div class="row gap wrap">
      ${d.due && !d.closed ? `<button type="button" class="btn outline" data-x="ics">В Календарь</button>` : ''}
      <button type="button" class="btn outline" data-x="toggle">${d.closed ? 'Открыть снова' : 'Закрыть долг'}</button>
      <button type="button" class="btn danger-ghost" data-x="del">Удалить</button>
    </div>
    <div class="confirm" id="del-confirm" hidden>Удалить долг и все его операции? <button type="button" class="btn danger sm" data-x="del-yes">Удалить</button></div>`, (sheet) => {
    sheet.addEventListener('click', async (ev) => {
      const x = ev.target.closest('[data-x]')?.dataset.x; if (!x) return;
      if (x === 'ics') return shareIcs({ title: d.dir === 'owe_me' ? `${d.person} возвращает ${fmt(left, d.cur)}` : `Вернуть ${d.person} ${fmt(left, d.cur)}`, date: d.due, repeat: 'none' });
      if (x === 'toggle') { d.closed = !d.closed; await saveData(); closeSheet(); return App.render(); }
      if (x === 'del') { $('#del-confirm', sheet).hidden = false; return; }
      if (x === 'del-yes') {
        S.data.txns = S.data.txns.filter((t) => t.debt !== d.id);
        S.data.debts = S.data.debts.filter((y) => y.id !== d.id);
        await saveData(); closeSheet(); toast('Долг удалён'); App.render();
      }
    });
    $('#rep-form', sheet)?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const amount = parseAmount($('#r-amount', sheet).value, d.cur);
      if (!(amount > 0)) return ($('#r-err', sheet).textContent = 'Сумма должна быть больше нуля');
      if (amount > left) return ($('#r-err', sheet).textContent = `Больше остатка ${fmt(left, d.cur)}`);
      S.data.txns.push({ id: uid('t'), type: 'debt', dir: d.dir === 'owe_me' ? 'in' : 'out', repay: true, acc: $('#r-acc', sheet).value || null, debt: d.id, amount, date: today(), time: '12:00', note: '', created: Date.now() });
      if (amount === left) d.closed = true;
      await saveData(); closeSheet(); toast(amount === left ? 'Долг закрыт' : 'Возврат записан'); App.render();
    });
  });
}

function openReminderForm() {
  openSheet(`${sheetHead('Напоминание')}
    <form class="form" id="rem-form">
      <label>Что<input id="m-title" maxlength="60" required placeholder="Например, Яндекс Плюс"></label>
      <div class="two">
        <label>Когда<input id="m-date" type="date" value="${today()}"></label>
        <label>Повтор<select id="m-rep"><option value="none">Один раз</option><option value="week">Каждую неделю</option><option value="month">Каждый месяц</option></select></label>
      </div>
      <label>Сумма, ${base()} (необязательно)<input id="m-amount" inputmode="decimal"></label>
      <div class="err" id="m-err"></div>
      <button class="btn primary full" type="submit">Добавить</button>
    </form>`, (sheet) => {
    $('#rem-form', sheet).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const title = $('#m-title', sheet).value.trim();
      const amount = parseAmount($('#m-amount', sheet).value, base());
      if (!title) return ($('#m-err', sheet).textContent = 'Напишите, о чём напомнить');
      if (Number.isNaN(amount)) return ($('#m-err', sheet).textContent = 'Сумма — число, например 399');
      S.data.reminders.push({ id: uid('r'), title, date: $('#m-date', sheet).value || today(), repeat: $('#m-rep', sheet).value, amount: amount || null, cur: base() });
      await saveData(); closeSheet(); toast('Напоминание добавлено'); App.render();
    });
  });
}

function openReminder(id) {
  const r = allReminders().find((x) => x.id === id);
  if (!r) return;
  if (r.kind === 'debt') return openDebt(r.debtId);
  openSheet(`${sheetHead(esc(r.title))}
    <p class="muted">${humanDate(r.date)} · ${{ none: 'один раз', week: 'каждую неделю', month: 'каждый месяц' }[r.repeat]}${r.amount ? ' · ' + fmt(r.amount, r.cur) : ''}</p>
    <div class="row gap wrap">
      <button type="button" class="btn primary" data-x="done">${r.repeat === 'none' ? 'Готово' : 'Готово, до следующего'}</button>
      <button type="button" class="btn outline" data-x="ics">В Календарь</button>
      <button type="button" class="btn danger-ghost" data-x="del">Удалить</button>
    </div>`, (sheet) => {
    sheet.addEventListener('click', async (ev) => {
      const x = ev.target.closest('[data-x]')?.dataset.x; if (!x) return;
      const own = S.data.reminders.find((y) => y.id === id);
      if (x === 'ics') return shareIcs(own);
      if (x === 'done') {
        if (own.repeat === 'none') S.data.reminders = S.data.reminders.filter((y) => y.id !== id);
        else {
          const dt = new Date(own.date + 'T12:00');
          do { if (own.repeat === 'week') dt.setDate(dt.getDate() + 7); else dt.setMonth(dt.getMonth() + 1); } while (dateStr(dt) <= today());
          own.date = dateStr(dt);
        }
      }
      if (x === 'del') S.data.reminders = S.data.reminders.filter((y) => y.id !== id);
      await saveData(); closeSheet(); App.render();
    });
  });
}

function icsText(r) {
  const e = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const rrule = r.repeat === 'week' ? 'RRULE:FREQ=WEEKLY\r\n' : r.repeat === 'month' ? 'RRULE:FREQ=MONTHLY\r\n' : '';
  const title = r.title + (r.amount ? ' · ' + fmt(r.amount, r.cur || 'RUB') : '');
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Kopilka//RU\r\nBEGIN:VEVENT\r\nUID:${uid('k')}@kopilka\r\nDTSTAMP:${stamp}\r\nDTSTART;VALUE=DATE:${r.date.replace(/-/g, '')}\r\n${rrule}SUMMARY:${e(title)}\r\nBEGIN:VALARM\r\nTRIGGER:PT10H\r\nACTION:DISPLAY\r\nDESCRIPTION:${e(title)}\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
}
const shareIcs = (r) => shareFile('kopilka-reminder.ics', icsText(r), 'text/calendar');

Object.assign(App.actions, {
  lend: () => openDebtForm('owe_me'),
  borrow: () => openDebtForm('i_owe'),
  'new-reminder': openReminderForm,
  debt: (el) => openDebt(el.dataset.id),
  reminder: (el) => openReminder(el.dataset.id),
});
