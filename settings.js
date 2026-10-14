// Настройки, счета, источники, категории, бэкапы, облако, экспорт, журнал.
import * as store from './store.js';
import { S, App, accounts, accById, catById, srcById, allTxns, shownTxns, balance, base, save, saveData, refreshResolver, defaults, sub, accList, txList, isGoal, isSavings, txCur, partsOf, partsCur, cloudNow, migrate } from './state.js';
import { deriveKey, encryptJson, decryptJson, randomSalt, newRecoveryKey, normalizeKey } from './crypto.js';
import { allCurrencies, curInfo, decimals, parseAmount, fmt, fmtUnits, minorToInput, toUnits } from './money.js';
import { ICONS, UI, svg, PALETTE } from './icons.js';
import { $, $$, esc, uid, today, nowTime, toast, openSheet, closeSheet, sheetHead, shareFile, agoText, humanDate, plural } from './util.js';
import { APP_VERSION, DEV_CONTACT, CLOUD_URL } from './config.js';
import * as cloud from './cloud.js';
import { gesture, TAB_NAMES, openCode, moveToVault, moveToData } from './secret.js';
import { checkUpdates, snapshotInfo, rollbackData } from './updates.js';

export const curOptions = (sel) => {
  const g = { 'Валюты': [], 'Криптовалюты': [] };
  for (const [c, i] of Object.entries(allCurrencies())) g[i.crypto ? 'Криптовалюты' : 'Валюты'].push(`<option value="${esc(c)}" ${c === sel ? 'selected' : ''}>${esc(c)} — ${esc(i.n)}</option>`);
  return Object.entries(g).map(([k, o]) => `<optgroup label="${k}">${o.join('')}</optgroup>`).join('');
};

/* =========================================================
   Экран настроек
   ========================================================= */
export function viewSettings() {
  const B = base();
  const accs = accounts();
  const c = S.data.settings.cloud;
  const used = [...new Set([...accs.map((a) => a.cur), ...Object.keys(S.data.settings.manualRates)])].filter((x) => x !== 'RUB');
  const rateRows = used.map((cur) => {
    const m = S.data.settings.manualRates[cur];
    const r = S.R.convert(1, cur, B);
    return `<div class="rate">
      <span class="cur">1 ${esc(cur)} =</span>
      <input inputmode="decimal" class="num" data-rate="${esc(cur)}" value="${m ? String(m.value).replace('.', ',') : ''}" placeholder="авто" aria-label="Ручной курс ${esc(cur)}">
      <select data-rate-q="${esc(cur)}" aria-label="В валюте">${['RUB', 'USD', 'EUR', 'USDT'].filter((q) => q !== cur).map((q) => `<option ${m?.quote === q ? 'selected' : ''}>${q}</option>`).join('')}</select>
      <span class="res small ${r == null ? 'warn' : 'muted'}">${r == null ? 'курса нет' : `сейчас ${fmtUnits(r, B)}${m ? ' · ручной' : ''}`}</span>
    </div>`;
  }).join('');
  const row = (act, title, value, icon) => `<button type="button" class="srow nav" data-act="${act}">${icon ? `<span class="disc xs plain">${svg(icon, 16)}</span>` : ''}<span class="what"><b>${title}</b></span><span class="muted small">${value || ''}</span><span class="chev">›</span></button>`;
  const g = gesture();
  return `
  <header class="page-head"><h1>Настройки</h1></header>

  ${CLOUD_URL ? `<section class="card pad">
    <div class="row between"><span class="label">Облачная копия</span><span class="small ${c.enabled ? 'pos' : 'muted'}">${c.enabled ? '● включена' : 'выключена'}</span></div>
    ${c.enabled
      ? `<span>Последняя копия: ${agoText(c.last)}. Данные шифруются на телефоне, на сервере только зашифрованный блок.</span>
         <div class="row gap wrap"><button type="button" class="btn outline sm" data-act="cloud-now">Сделать копию сейчас</button><button type="button" class="btn ghost sm" data-act="cloud-key">Показать ключ</button><button type="button" class="btn ghost sm" data-act="cloud-off">Выключить</button></div>`
      : `<span>Автоматическая копия всех данных в облако. Потеряли телефон — восстановите всё по ключу.</span>
         <div class="row gap wrap"><button type="button" class="btn primary sm" data-act="cloud-on">Включить</button><button type="button" class="btn outline sm" data-act="cloud-restore">Восстановить по ключу</button></div>`}
  </section>` : ''}

  <section class="card pad">
    <label class="field-l"><span class="label">Основная валюта</span><select id="s-base">${curOptions(B)}</select></label>
  </section>

  <section class="card list">
    <div class="list-head"><span class="label">Счета</span><button type="button" class="linkish" data-act="new-account">+ Счёт</button></div>
    ${accs.map((a) => `<button type="button" class="srow ${a.secret ? 'secret' : ''}" data-act="acc-edit" data-id="${a.id}">
      <span class="disc xs" style="--c:${esc(a.color)}">${svg(ICONS[a.icon] || ICONS.card, 16)}</span>
      <span class="what"><b>${esc(a.name)}</b><span>${esc(a.kind)} · ${esc(a.cur)}${a.inTotal === false ? ' · не в итоге' : ''}</span></span>
      <span class="num">${fmt(balance(a.id), a.cur)}</span></button>`).join('') || '<div class="empty">Счетов нет.</div>'}
  </section>

  <details class="card list"><summary class="list-head"><span class="label">Источники дохода · ${S.data.sources.length}</span><span class="chev">›</span></summary>
    ${S.data.sources.map((s) => `<button type="button" class="srow" data-act="src-edit" data-id="${s.id}"><span class="disc xs" style="--c:${esc(s.color)}">${svg(ICONS[s.icon] || ICONS.job, 16)}</span><span class="what"><b>${esc(s.name)}</b></span></button>`).join('')}
    <button type="button" class="srow" data-act="new-source"><span class="what"><b class="accent">+ Источник</b></span></button>
  </details>

  <details class="card list"><summary class="list-head"><span class="label">Категории · ${S.data.cats.length}</span><span class="chev">›</span></summary>
    ${S.data.cats.map((k) => `<button type="button" class="srow" data-act="cat-edit" data-id="${k.id}"><span class="disc xs" style="--c:${esc(k.color)}">${svg(ICONS[k.icon] || ICONS.dots, 16)}</span><span class="what"><b>${esc(k.name)}</b><span>${(k.subs || []).map((s) => esc(s.name)).join(', ') || 'без подкатегорий'}</span></span></button>`).join('')}
    <button type="button" class="srow" data-act="new-cat"><span class="what"><b class="accent">+ Категория</b></span></button>
  </details>

  <details class="card pad"><summary class="row between"><span class="label">Курсы · ${S.rates ? new Date(S.rates.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'не загружены'}</span><span class="chev">›</span></summary>
    <p class="small muted">${S.rates ? esc((S.rates.sources || []).join(', ')) + '. ' : ''}Ручной курс важнее автоматического; пустое поле — снова авто.</p>
    <button type="button" class="btn outline sm" data-act="refresh-rates">Обновить курсы</button>
    <div class="rates">${rateRows || '<p class="small muted">Счетов в других валютах нет.</p>'}</div>
    <form class="row gap wrap" id="cur-form">
      <input id="c-code" maxlength="8" placeholder="Своя монета, напр. DOGE" aria-label="Код">
      <input id="c-name" maxlength="30" placeholder="Название" aria-label="Название">
      <label class="check"><input type="checkbox" id="c-crypto" checked> крипта</label>
      <button class="btn primary sm" type="submit">Добавить</button>
    </form>
  </details>

  ${S.vault ? `<section class="card pad secret-card">
    <span class="label">Особый режим</span>
    <div class="two">
      <label>Вход: вкладка<select id="s-g-tab">${Object.entries(TAB_NAMES).map(([k, v]) => `<option value="${k}" ${g.t === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Сколько тапов<select id="s-g-n">${[4, 5, 6, 7, 8, 9].map((n) => `<option ${g.n === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    </div>
    <p class="small muted">Сейчас: ${g.n} ${plural(g.n, 'быстрый тап', 'быстрых тапа', 'быстрых тапов')} по «${TAB_NAMES[g.t]}», когда эта вкладка уже открыта. Хранится только на этом телефоне.</p>
    <button type="button" class="btn outline sm" data-act="change-code">Сменить код</button>
  </section>` : ''}

  <section class="two">
    <button type="button" class="btn outline" data-act="export">Экспорт в Excel</button>
    <button type="button" class="btn outline" data-act="backup">Бэкап в файл</button>
  </section>
  <label class="btn ghost full">Восстановить из файла<input type="file" id="restore-file" accept=".kopilka,.json,application/json" hidden></label>

  <section class="card list">
    ${row('log', 'Журнал', '', UI.log)}
    ${row('privacy', 'Конфиденциальность', '', UI.lock)}
    ${DEV_CONTACT ? `<a class="srow nav" href="${esc(DEV_CONTACT)}" target="_blank" rel="noopener"><span class="disc xs plain">${svg(UI.bell, 16)}</span><span class="what"><b>Написать разработчику</b></span><span class="chev">›</span></a>` : ''}
    ${row('check-updates', 'Версия ' + APP_VERSION, S.update ? 'есть ' + esc(S.update.version) : 'проверить обновления', UI.check)}
  </section>

  <button type="button" class="btn danger-ghost full" data-act="reset">Удалить все данные</button>
  <p class="small muted center">Копилка ${APP_VERSION} · данные хранятся на этом устройстве</p>`;
}

/* =========================================================
   Счёт
   ========================================================= */
const KINDS = ['Карта', 'Наличные', 'Накопительный', 'Вклад', 'Цель', 'Криптокошелёк', 'Биржа', 'Кредитная карта', 'Брокерский'];
const ACC_ICONS = ['card', 'cash', 'bank', 'usd', 'btc', 'box', 'target', 'chart', 'phone'];
function iconPicker(sel, keys) {
  return `<div class="icon-grid" role="radiogroup" aria-label="Иконка">${keys.map((k) => `<button type="button" role="radio" aria-checked="${k === sel}" data-icon="${k}" class="${k === sel ? 'on' : ''}">${svg(ICONS[k], 20)}</button>`).join('')}</div>`;
}
function colorPicker(sel) {
  return `<div class="color-grid" role="radiogroup" aria-label="Цвет">${PALETTE.map((c) => `<button type="button" role="radio" aria-checked="${c === sel}" data-color="${c}" style="--c:${c}" class="${c === sel ? 'on' : ''}" aria-label="Цвет"></button>`).join('')}</div>`;
}
function bindPickers(sheet, st) {
  sheet.addEventListener('click', (ev) => {
    const i = ev.target.closest('[data-icon]'), c = ev.target.closest('[data-color]');
    if (i) { st.icon = i.dataset.icon; $$('[data-icon]', sheet).forEach((b) => { b.classList.toggle('on', b === i); b.setAttribute('aria-checked', b === i); }); }
    if (c) { st.color = c.dataset.color; $$('[data-color]', sheet).forEach((b) => { b.classList.toggle('on', b === c); b.setAttribute('aria-checked', b === c); }); }
  });
}
export function openAccount(id) {
  const a = id ? accById(id) : null;
  const st = { icon: a?.icon || 'card', color: a?.color || '#0f6e5c', kind: a?.kind || 'Карта', per: a?.ratePer || 'year' };
  const n = a ? allTxns().filter((t) => t.acc === a.id || t.to === a.id).length : 0;
  const cur = a?.cur || base();
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const extras = () => `
    <div class="kind-extra" data-for="savings" ${['Накопительный', 'Вклад'].includes(st.kind) ? '' : 'hidden'}>
      <span class="label">Проценты</span>
      <div class="seg full" role="group" aria-label="Ставка указана"><button type="button" data-per="year" aria-pressed="${st.per === 'year'}">% в год</button><button type="button" data-per="month" aria-pressed="${st.per === 'month'}">% в месяц</button></div>
      <div class="two"><label>Ставка, %<input id="a-rate" inputmode="decimal" value="${a?.rate ? String(a.rate).replace('.', ',') : '0'}"></label>
        <label>Приходят<select id="a-payday">${days.map((d) => `<option value="${d}" ${(a?.payDay || new Date().getDate()) === d ? 'selected' : ''}>каждое ${d} число</option>`).join('')}</select></label></div>
      <span class="small muted">При ставке 0 проценты не считаются и вопросов не будет. В день начисления спросим, пришли ли они.</span>
    </div>
    <div class="kind-extra" data-for="goal" ${st.kind === 'Цель' ? '' : 'hidden'}>
      <span class="label">Цель</span>
      <div class="two"><label>Сколько нужно<input id="a-target" inputmode="decimal" value="${a?.target ? minorToInput(a.target, cur) : ''}" placeholder="120 000"></label>
        <label>К какой дате<input id="a-deadline" type="date" value="${a?.deadline || ''}"></label></div>
    </div>`;
  openSheet(`${sheetHead(a ? esc(a.name) : 'Новый счёт')}
    <form class="form" id="acc-form">
      <div class="tags" role="radiogroup" aria-label="Тип">${KINDS.map((k) => `<button type="button" class="tag ${st.kind === k ? 'on' : ''}" data-kind="${k}">${k}</button>`).join('')}</div>
      <label>Название<input id="a-name" maxlength="30" required value="${esc(a?.name || '')}" placeholder="Например, Т-Банк"></label>
      ${a
        ? `<div class="balance-box"><label>Текущий баланс<input id="a-bal" inputmode="decimal" value="${minorToInput(balance(a.id), a.cur)}"></label><span class="small muted" id="a-bal-note">Измените, если в банке другая сумма — разница запишется корректировкой и в траты не попадёт.</span></div>`
        : `<div class="two"><label>Сейчас на счёте<input id="a-start" inputmode="decimal" placeholder="0"></label><label>Валюта<select id="a-cur">${curOptions(cur)}</select></label></div>`}
      ${extras()}
      ${iconPicker(st.icon, ACC_ICONS)}
      ${colorPicker(st.color)}
      <label class="check"><input type="checkbox" id="a-total" ${a?.inTotal === false ? '' : 'checked'}> Учитывать в общем балансе</label>
      ${S.vault ? `<label class="check secret-check"><input type="checkbox" id="a-secret" ${a?.secret ? 'checked' : ''}> Скрытый счёт</label>` : ''}
      <div class="err" id="a-err"></div>
      <button class="btn primary full" type="submit">${a ? 'Сохранить' : 'Создать счёт'}</button>
      ${a ? `<button type="button" class="btn danger-ghost full" data-x="del">Удалить счёт</button>
        <div class="confirm" id="del-confirm" hidden>Удалить «${esc(a.name)}»${n ? ` и ${n} ${plural(n, 'операцию', 'операции', 'операций')}` : ''}? <button type="button" class="btn danger sm" data-x="del-yes">Удалить</button></div>` : ''}
    </form>`, (sheet) => {
    bindPickers(sheet, st);
    const showKind = () => {
      $$('[data-kind]', sheet).forEach((b) => b.classList.toggle('on', b.dataset.kind === st.kind));
      $$('.kind-extra', sheet).forEach((x) => { x.hidden = !((x.dataset.for === 'savings' && ['Накопительный', 'Вклад'].includes(st.kind)) || (x.dataset.for === 'goal' && st.kind === 'Цель')); });
      if (!a && st.kind === 'Цель' && st.icon === 'card') { st.icon = 'target'; $$('[data-icon]', sheet).forEach((b) => b.classList.toggle('on', b.dataset.icon === 'target')); }
    };
    sheet.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.kind) { st.kind = b.dataset.kind; return showKind(); }
      if (b.dataset.per) { st.per = b.dataset.per; $$('[data-per]', sheet).forEach((x) => x.setAttribute('aria-pressed', x.dataset.per === st.per)); return; }
      if (b.dataset.x === 'del') { $('#del-confirm', sheet).hidden = false; return; }
      if (b.dataset.x === 'del-yes') { await deleteAccount(a.id); closeSheet(); toast('Счёт удалён'); App.render(); }
    });
    $('#a-bal', sheet)?.addEventListener('input', (ev) => {
      const v = parseAmount(ev.target.value, a.cur), diff = v - balance(a.id);
      $('#a-bal-note', sheet).innerHTML = Number.isNaN(v) ? 'Введите число' : diff ? `Было ${fmt(balance(a.id), a.cur)}. Разница <b class="${diff < 0 ? 'neg' : 'pos'}">${fmt(diff, a.cur, { sign: true })}</b> запишется корректировкой — в траты не попадёт.` : 'Баланс не меняется.';
    });
    $('#acc-form', sheet).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = (m) => ($('#a-err', sheet).textContent = m);
      const name = $('#a-name', sheet).value.trim();
      if (!name) return err('Введите название');
      const c = a ? a.cur : $('#a-cur', sheet).value;
      const fields = { name, kind: st.kind, icon: st.icon, color: st.color, inTotal: $('#a-total', sheet).checked };
      if (['Накопительный', 'Вклад'].includes(st.kind)) {
        const rate = parseFloat(($('#a-rate', sheet).value || '0').replace(',', '.'));
        if (!(rate >= 0) || rate > 1000) return err('Ставка — число, например 16');
        Object.assign(fields, { rate, ratePer: st.per, payDay: Number($('#a-payday', sheet).value) });
      }
      if (st.kind === 'Цель') {
        const target = parseAmount($('#a-target', sheet).value, c);
        if (!(target > 0)) return err('Укажите, сколько нужно накопить');
        Object.assign(fields, { target, deadline: $('#a-deadline', sheet).value || null });
      }
      const wantSecret = !!$('#a-secret', sheet)?.checked;
      if (a) {
        const obj = accList(a.id).find((x) => x.id === a.id);
        Object.assign(obj, fields);
        const v = parseAmount($('#a-bal', sheet).value, a.cur);
        if (Number.isNaN(v)) return err('Баланс — число');
        const diff = v - balance(a.id);
        if (diff) txList(a.id).push({ id: uid('t'), type: 'adjust', dir: diff > 0 ? 'in' : 'out', acc: a.id, amount: Math.abs(diff), date: today(), time: nowTime(), note: '', created: Date.now() });
        await save();
        if (S.vault && wantSecret !== !!a.secret) { if (wantSecret) await moveToVault(a.id); else await moveToData(a.id); }
      } else {
        const start = parseAmount($('#a-start', sheet).value, c);
        if (Number.isNaN(start)) return err(`Сумма — число, до ${decimals(c)} знаков после запятой`);
        const acc = { id: uid('a'), cur: c, created: Date.now(), start, ...fields };
        (wantSecret && S.vault ? S.vault.accounts : S.data.accounts).push(acc);
        await save();
      }
      closeSheet(); toast(a ? 'Сохранено' : 'Счёт создан'); App.render();
    });
  }, { tall: true });
}
async function deleteAccount(id) {
  const kill = (t) => t.acc === id || t.to === id || t.peer === id;
  const linked = new Set(allTxns().filter(kill).map((t) => t.link || t.id));
  S.data.txns = S.data.txns.filter((t) => !kill(t) && !linked.has(t.id));
  S.data.accounts = S.data.accounts.filter((x) => x.id !== id);
  if (S.vault) {
    S.vault.txns = S.vault.txns.filter((t) => !kill(t) && !linked.has(t.link));
    S.vault.accounts = S.vault.accounts.filter((x) => x.id !== id);
  }
  await save();
}

/* ---------- источник и категория ---------- */
const SRC_ICONS = ['job', 'laptop', 'fee', 'gift', 'chart', 'bank', 'cash', 'smile'];
const CAT_ICONS = Object.keys(ICONS).filter((k) => !['plus', 'card', 'cash', 'usd', 'btc', 'job', 'laptop', 'home2', 'target'].includes(k));
function openSource(id) {
  const s = id ? srcById(id) : null;
  const st = { icon: s?.icon || 'job', color: s?.color || '#8a4b00' };
  openSheet(`${sheetHead(s ? 'Источник дохода' : 'Новый источник')}
    <form class="form" id="src-form">
      <label>Название<input id="i-name" maxlength="30" required value="${esc(s?.name || '')}"></label>
      ${iconPicker(st.icon, SRC_ICONS)}${colorPicker(st.color)}
      <button class="btn primary full" type="submit">${s ? 'Сохранить' : 'Добавить'}</button>
    </form>`, (sheet) => {
    bindPickers(sheet, st);
    $('#src-form', sheet).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const name = $('#i-name', sheet).value.trim(); if (!name) return;
      if (s) Object.assign(s, { name, icon: st.icon, color: st.color });
      else S.data.sources.push({ id: uid('i'), name, icon: st.icon, color: st.color });
      await saveData(); closeSheet(); App.render();
    });
  });
}
function openCategory(id) {
  const c = id ? catById(id) : null;
  const st = { icon: c?.icon || 'dots', color: c?.color || PALETTE[0], subs: c ? [...(c.subs || [])] : [] };
  const subList = () => st.subs.map((s) => `<span class="tag on">${esc(s.name)}<button type="button" class="x" data-del-sub="${s.id}" aria-label="Удалить ${esc(s.name)}">×</button></span>`).join('');
  openSheet(`${sheetHead(c ? 'Категория' : 'Новая категория')}
    <form class="form" id="cat-form">
      <label>Название<input id="k-name" maxlength="30" required value="${esc(c?.name || '')}"></label>
      ${iconPicker(st.icon, CAT_ICONS)}${colorPicker(st.color)}
      <span class="label">Подкатегории</span>
      <div class="tags" id="k-subs">${subList()}</div>
      <div class="row gap"><input id="k-sub" maxlength="30" placeholder="Новая подкатегория"><button type="button" class="btn outline sm" data-x="add-sub">Добавить</button></div>
      <button class="btn primary full" type="submit">${c ? 'Сохранить' : 'Создать'}</button>
    </form>`, (sheet) => {
    bindPickers(sheet, st);
    const addSub = () => { const inp = $('#k-sub', sheet); const v = inp.value.trim(); if (!v) return; st.subs.push(sub(v)); inp.value = ''; $('#k-subs', sheet).innerHTML = subList(); };
    $('#k-sub', sheet).addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addSub(); } });
    sheet.addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.x === 'add-sub') addSub();
      if (b.dataset.delSub) { st.subs = st.subs.filter((s) => s.id !== b.dataset.delSub); $('#k-subs', sheet).innerHTML = subList(); }
    });
    $('#cat-form', sheet).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const name = $('#k-name', sheet).value.trim(); if (!name) return;
      if (c) Object.assign(c, { name, icon: st.icon, color: st.color, subs: st.subs });
      else S.data.cats.push({ id: uid('c'), name, icon: st.icon, color: st.color, subs: st.subs });
      await saveData(); closeSheet(); App.render();
    });
  });
}

/* =========================================================
   Облачная копия
   ========================================================= */
function showKey(key, first) {
  openSheet(`${sheetHead('Ключ восстановления')}
    <p>${first ? 'Сохраните этот ключ вне телефона: в заметки на компьютере, менеджер паролей или на бумаге.' : 'Ключ от вашей облачной копии.'} Новый телефон + ключ = все данные назад. Без ключа копию не открыть никому — даже разработчику.</p>
    <div class="keybox num" id="rk">${esc(key)}</div>
    <div class="two"><button type="button" class="btn outline" data-x="copy">Скопировать</button><button type="button" class="btn primary" data-close-sheet>${first ? 'Я сохранил' : 'Готово'}</button></div>`, (sheet) => {
    sheet.querySelector('[data-x="copy"]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(key); toast('Скопировано'); }
      catch { const r = document.createRange(); r.selectNodeContents($('#rk', sheet)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Выделено — скопируйте вручную'); }
    });
  });
}
async function cloudOn() {
  const key = newRecoveryKey();
  S.cloudKey = key;
  await store.set('ck', key);
  S.data.settings.cloud = { enabled: true, last: null };
  await saveData();
  const ok = await cloudNow();
  store.addLog(ok ? 'Облачная копия включена' : 'Облачная копия включена, первая отправка не удалась');
  App.render();
  showKey(key, true);
}
function cloudRestore() {
  openSheet(`${sheetHead('Восстановить по ключу')}
    <form class="form" id="cr-form">
      <p class="small muted">Все данные на этом телефоне заменятся данными из облачной копии.</p>
      <label>Ключ восстановления<input id="cr-key" autocomplete="off" autocapitalize="characters" placeholder="KOPI-XXXX-XXXX-…"></label>
      <div class="err" id="cr-err"></div>
      <button class="btn danger full" type="submit">Восстановить</button>
    </form>`, (sheet) => {
    $('#cr-form', sheet).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = (m) => ($('#cr-err', sheet).textContent = m);
      const key = $('#cr-key', sheet).value.trim();
      if (normalizeKey(key).length < 20) return err('Ключ слишком короткий — проверьте его');
      err('Загружаю…');
      try {
        const plain = await cloud.download(key);
        if (plain === null) return err('Копии с таким ключом нет');
        if (!plain) return err('Ключ не подошёл');
        await applyRestore(plain.data, plain.vault);
        S.cloudKey = key; await store.set('ck', key);
        S.data.settings.cloud = { enabled: true, last: Date.now() };
        await saveData();
        store.addLog('Данные восстановлены из облачной копии');
        closeSheet(); toast('Данные восстановлены'); App.render();
      } catch (e) { err('Не получилось: ' + e.message); }
    });
  });
}
async function applyRestore(data, vaultBlob) {
  migrate(data);
  S.data = data; S.vaultBlob = vaultBlob || null; S.vault = null; S.vaultKey = null;
  await store.set('data', S.data);
  if (S.vaultBlob) await store.set('vault', S.vaultBlob); else await store.del('vault');
  refreshResolver();
}

/* =========================================================
   Бэкап файлом, экспорт, журнал, конфиденциальность, сброс
   ========================================================= */
function openBackup() {
  openSheet(`${sheetHead('Бэкап в файл')}
    <form class="form" id="bk-form">
      <p class="small muted">Придумайте пароль. Без него файл не открыть, восстановить пароль нельзя.</p>
      <label>Пароль<input id="b-p1" type="password" autocomplete="new-password" required minlength="4"></label>
      <label>Ещё раз<input id="b-p2" type="password" autocomplete="new-password" required></label>
      <div class="err" id="b-err"></div>
      <button class="btn primary full" type="submit">Сохранить файл</button>
    </form>`, (sheet) => {
    $('#bk-form', sheet).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const p1 = $('#b-p1', sheet).value, p2 = $('#b-p2', sheet).value;
      if (p1.length < 4) return ($('#b-err', sheet).textContent = 'Пароль — минимум 4 символа');
      if (p1 !== p2) return ($('#b-err', sheet).textContent = 'Пароли не совпадают');
      $('#b-err', sheet).textContent = 'Шифрую…';
      const salt = randomSalt();
      const key = await deriveKey(p1, salt);
      const payload = await encryptJson(key, { data: S.data, vault: S.vaultBlob });
      const ok = await shareFile(`kopilka-${today()}.kopilka`, JSON.stringify({ app: 'kopilka', v: 2, salt, ...payload }), 'application/json');
      if (ok) { S.data.settings.lastBackup = Date.now(); await saveData(); store.addLog('Сохранён бэкап в файл'); closeSheet(); toast('Бэкап сохранён'); }
      else $('#b-err', sheet).textContent = 'Отменено';
    });
  });
}
function openRestoreFile(file) {
  openSheet(`${sheetHead('Восстановить из файла')}
    <form class="form" id="rs-form">
      <p class="small muted">Все данные на этом телефоне заменятся данными из файла «${esc(file.name)}».</p>
      <label>Пароль бэкапа<input id="r-p" type="password" required></label>
      <div class="err" id="r-err"></div>
      <button class="btn danger full" type="submit">Заменить данные</button>
    </form>`, (sheet) => {
    $('#rs-form', sheet).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = (m) => ($('#r-err', sheet).textContent = m);
      let f;
      try { f = JSON.parse(await file.text()); } catch { return err('Это не файл бэкапа Копилки'); }
      if (f.app !== 'kopilka') return err('Это не файл бэкапа Копилки');
      err('Расшифровываю…');
      const plain = await decryptJson(await deriveKey($('#r-p', sheet).value, f.salt), f);
      if (!plain) return err('Неверный пароль');
      await applyRestore(plain.data, plain.vault);
      store.addLog('Данные восстановлены из файла');
      closeSheet(); toast('Данные восстановлены'); App.render();
    });
  });
}
async function exportCsv() {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const num = (minor, cur) => String(toUnits(minor, cur)).replace('.', ',');
  const rows = [['Дата', 'Время', 'Тип', 'Счёт', 'Категория / источник', 'Подкатегория', 'Сумма', 'Валюта', 'Исходная сумма', 'Исходная валюта', 'Комментарий']];
  const types = { expense: 'Расход', income: 'Доход', transfer: 'Перевод', private_in: 'Перевод', private_out: 'Перевод', debt: 'Долг', adjust: 'Корректировка' };
  const list = shownTxns().sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  for (const t of list) {
    const a = accById(t.acc), cur = a?.cur || 'RUB';
    const sign = ['expense', 'private_out', 'transfer'].includes(t.type) || ((t.type === 'debt' || t.type === 'adjust') && t.dir === 'out') ? -1 : 1;
    if (t.type === 'expense') {
      const parts = partsOf(t), pc = partsCur(t);
      for (const p of parts) {
        const c = catById(p.cat);
        const accAmt = parts.length > 1 ? Math.round(t.amount * (p.amount / parts.reduce((s, x) => s + x.amount, 0))) : t.amount;
        rows.push([t.date, t.time || '', types[t.type], a?.name || '', c?.name || '', c?.subs?.find((s) => s.id === p.sub)?.name || '', '-' + num(accAmt, cur), cur, t.orig || parts.length > 1 ? num(p.amount, pc) : '', t.orig ? t.orig.cur : parts.length > 1 ? pc : '', t.note || '']);
      }
      continue;
    }
    let what = '';
    if (t.type === 'income') what = srcById(t.source)?.name || '';
    if (t.type === 'transfer') what = '→ ' + (accById(t.to)?.name || '');
    if (t.type === 'debt') what = S.data.debts.find((d) => d.id === t.debt)?.person || '';
    rows.push([t.date, t.time || '', types[t.type], a?.name || '', what, '', (sign < 0 ? '-' : '') + num(t.amount, cur), cur, t.orig ? num(t.orig.amount, t.orig.cur) : '', t.orig?.cur || '', t.note || '']);
  }
  const csv = '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n');
  const ok = await shareFile(`kopilka-${today()}.csv`, csv, 'text/csv');
  if (ok) { store.addLog('Экспорт операций в Excel'); toast('Файл готов — откройте в Excel или Numbers'); }
}
async function openLog() {
  const log = (await store.getLog()).slice().reverse();
  const snap = await snapshotInfo();
  openSheet(`${sheetHead('Журнал')}
    <p class="small muted">Что происходило в приложении: обновления, копии, курсы, ошибки. Суммы и названия сюда не пишутся.</p>
    ${snap ? `<div class="card pad"><span class="small">Есть копия данных, сделанная перед обновлением ${new Date(snap.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} (версия ${esc(snap.from)}).</span>
      <button type="button" class="btn outline sm" data-x="rb">Вернуть данные к этой копии</button>
      <div class="confirm" id="rb-confirm" hidden>Всё, что записано после этой копии, пропадёт. <button type="button" class="btn danger sm" data-x="rb-yes">Вернуть</button></div></div>` : ''}
    <div class="log">${log.map((l) => `<div><span class="num">${new Date(l.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><span>${esc(l.text)}</span></div>`).join('') || '<div class="empty">Пока пусто.</div>'}</div>`, (sheet) => {
    sheet.addEventListener('click', (ev) => {
      const x = ev.target.closest('[data-x]')?.dataset.x;
      if (x === 'rb') $('#rb-confirm', sheet).hidden = false;
      if (x === 'rb-yes') rollbackData();
    });
  }, { tall: true });
}
function openPrivacy() {
  openSheet(`${sheetHead('Конфиденциальность')}
    <div class="prose">
      <p><b>Где хранятся данные.</b> Все счета, операции и настройки хранятся только на вашем устройстве. У Копилки нет аккаунтов и нет сервера с вашими финансами.</p>
      <p><b>Облачная копия</b> (если включена) шифруется на телефоне ключом восстановления до отправки. На сервер попадает только зашифрованный блок — прочитать его без ключа не может никто, включая разработчика.</p>
      <p><b>Бэкап в файл</b> шифруется паролем, который знаете только вы.</p>
      <p><b>Курсы валют</b> загружаются с открытых источников (ЦБ РФ, CoinGecko, Binance). При этом им не передаётся ничего о ваших счетах.</p>
      <p><b>Аналитики и рекламы нет.</b> Приложение не отслеживает, как вы им пользуетесь.</p>
      <p><b>Не финансовый совет.</b> Копилка — инструмент учёта. Прогнозы процентов и курсы приблизительны; точные суммы смотрите в своём банке.</p>
    </div>`, null, { tall: true });
}
function openReset() {
  openSheet(`${sheetHead('Удалить все данные')}
    <form class="form" id="rst-form">
      <p>Будут удалены все счета, операции и долги на этом устройстве. Вернуть можно только из бэкапа или облачной копии.</p>
      <label>Напишите «удалить»<input id="x-word" autocomplete="off"></label>
      <button class="btn danger full" type="submit">Удалить всё</button>
    </form>`, (sheet) => {
    $('#rst-form', sheet).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if ($('#x-word', sheet).value.trim().toLowerCase() !== 'удалить') return;
      S.data = defaults(); S.vault = null; S.vaultKey = null; S.vaultBlob = null; S.cloudKey = null;
      await store.set('data', S.data); await store.del('vault'); await store.del('ck');
      store.addLog('Все данные удалены');
      refreshResolver(); closeSheet(); S.ui.tab = 'home'; App.render(); toast('Все данные удалены');
    });
  });
}

/* ---------- регистрация ---------- */
App.del = {
  acc: deleteAccount,
  src: async (id) => { S.data.sources = S.data.sources.filter((x) => x.id !== id); await saveData(); },
  cat: async (id) => { S.data.cats = S.data.cats.filter((x) => x.id !== id); await saveData(); },
};
Object.assign(App.actions, {
  'new-account': () => openAccount(),
  'acc-edit': (el) => openAccount(el.dataset.id),
  'new-source': () => openSource(),
  'src-edit': (el) => openSource(el.dataset.id),
  'new-cat': () => openCategory(),
  'cat-edit': (el) => openCategory(el.dataset.id),
  'cloud-on': cloudOn,
  'cloud-off': async () => { S.data.settings.cloud.enabled = false; await saveData(); store.addLog('Облачная копия выключена'); App.render(); },
  'cloud-now': async () => { toast('Отправляю…'); const ok = await cloudNow(); toast(ok ? 'Копия сохранена' : 'Не получилось — проверьте интернет'); App.render(); },
  'cloud-key': () => S.cloudKey && showKey(S.cloudKey, false),
  'cloud-restore': cloudRestore,
  backup: openBackup,
  export: exportCsv,
  log: openLog,
  privacy: openPrivacy,
  reset: openReset,
  'change-code': () => openCode('change'),
  'check-updates': () => checkUpdates(true),
});
Object.assign(App.changes, {
  's-base': async (el) => { S.data.settings.base = el.value; await saveData(); toast('Итоги теперь в ' + el.value); App.render(); },
  's-g-tab': async () => { S.data.settings.tp = { t: $('#s-g-tab').value, n: Number($('#s-g-n').value) }; await saveData(); toast('Сохранено'); App.render(); },
  's-g-n': async () => { S.data.settings.tp = { t: $('#s-g-tab').value, n: Number($('#s-g-n').value) }; await saveData(); toast('Сохранено'); App.render(); },
  'restore-file': (el) => { const f = el.files[0]; el.value = ''; if (f) openRestoreFile(f); },
});
export async function onRateChange(el) {
  const row = el.closest('.rate');
  const c = el.dataset.rate || el.dataset.rateQ;
  const raw = row.querySelector('[data-rate]').value.replace(/\s/g, '').replace(',', '.');
  const quote = row.querySelector('[data-rate-q]').value;
  const value = parseFloat(raw);
  const mr = { ...S.data.settings.manualRates };
  if (raw === '') delete mr[c];
  else if (value > 0) mr[c] = { value, quote };
  else return toast('Курс — положительное число, например 83,5');
  S.data.settings.manualRates = mr;
  await saveData(); refreshResolver(); App.render();
}
export async function onCurrencyAdd() {
  const code = $('#c-code').value.trim().toUpperCase();
  const name = $('#c-name').value.trim() || code;
  const crypto = $('#c-crypto').checked;
  if (!/^[A-Z0-9]{2,8}$/.test(code)) return toast('Код — 2–8 латинских букв или цифр');
  if (allCurrencies()[code]) return toast('Такая валюта уже есть');
  S.data.settings.custom = { ...S.data.settings.custom, [code]: { s: code, n: name, d: crypto ? 8 : 2, crypto } };
  await saveData(); refreshResolver(); toast(`${code} добавлена — задайте ей курс`); App.render();
}
