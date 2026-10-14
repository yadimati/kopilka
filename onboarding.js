// Первое знакомство: установка на экран «Домой», основная валюта, первые счета, как пользоваться.
import { S, App, saveData, save, refreshResolver } from './state.js';
import { addLog } from './store.js';
import { curOptions } from './settings.js';
import { parseAmount } from './money.js';
import { ICONS, svg } from './icons.js';
import { $, esc, uid } from './util.js';

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const QUICK = [
  { name: 'Карта', kind: 'Карта', icon: 'card', color: '#0f6e5c', on: true },
  { name: 'Наличные', kind: 'Наличные', icon: 'cash', color: '#2f8f5b', on: true },
  { name: 'Накопительный', kind: 'Накопительный', icon: 'bank', color: '#3b6fc4', on: false },
];

let st = null;
export function showOnboarding() {
  st = { step: 0, base: S.data.settings.base || 'RUB', accs: QUICK.map((q) => ({ ...q, amount: '' })) };
  draw();
  $('#onboard').hidden = false;
}
function finish() {
  $('#onboard').hidden = true;
  $('#onboard').innerHTML = '';
  st = null;
}
function draw() {
  const dots = `<div class="ob-dots">${[0, 1, 2, 3].map((i) => `<i class="${i === st.step ? 'on' : ''}"></i>`).join('')}</div>`;
  let body = '';
  if (st.step === 0) {
    body = `<div class="ob-logo">${svg(ICONS.box, 40)}</div>
      <h1>Копилка</h1>
      <p>Учёт денег без регистрации. Все данные хранятся только на этом телефоне.</p>
      ${isIos() && !standalone() ? `<div class="ob-tip"><b>Сначала установите на экран «Домой»</b>
        <span>В Safari нажмите «Поделиться» → «На экран Домой» и откройте Копилку с иконки. Данные в Safari и в установленной Копилке хранятся раздельно — начинайте вести учёт уже там.</span></div>` : ''}
      <button type="button" class="btn primary full" data-ob="next">Начать</button>
      <button type="button" class="linkish" data-ob="restore">У меня есть бэкап — восстановить</button>`;
  } else if (st.step === 1) {
    body = `<h1>Основная валюта</h1>
      <p>В ней считаются общий итог и аналитика. Счета могут быть в любых валютах и криптовалютах — курсы подтянутся сами.</p>
      <label class="ob-field">Валюта<select id="ob-base">${curOptions(st.base)}</select></label>
      <button type="button" class="btn primary full" data-ob="next">Дальше</button>`;
  } else if (st.step === 2) {
    body = `<h1>Ваши счета</h1>
      <p>Отметьте, что есть, и сколько там сейчас. Потом можно добавить ещё — карты, вклады, цели, криптокошельки.</p>
      <div class="ob-accs">${st.accs.map((a, i) => `
        <div class="ob-acc ${a.on ? 'on' : ''}">
          <button type="button" class="ob-check" data-ob-acc="${i}" aria-pressed="${a.on}"><span class="disc sm" style="--c:${a.color}">${svg(ICONS[a.icon], 18)}</span><b>${esc(a.name)}</b></button>
          <input inputmode="decimal" data-ob-amt="${i}" placeholder="0" value="${esc(a.amount)}" aria-label="Сколько на счёте «${esc(a.name)}»" ${a.on ? '' : 'disabled'}>
        </div>`).join('')}</div>
      <div class="err" id="ob-err"></div>
      <button type="button" class="btn primary full" data-ob="next">Дальше</button>`;
  } else {
    body = `<h1>Как записывать</h1>
      <ul class="ob-how">
        <li><b>Тап по категории</b> — расход с последнего счёта.</li>
        <li><b>Тащите счёт на категорию</b> — расход с этого счёта. Счёт на счёт — перевод, доход на счёт — поступление.</li>
        <li><b>«Записать и ещё»</b> — несколько трат подряд, не закрывая окно.</li>
        <li><b>«Изменить»</b> на главной — порядок, правка и удаление счетов и категорий.</li>
        <li><b>Не потратил</b> — запишите покупку, от которой отказались, и увидите, сколько сберегли.</li>
      </ul>
      <button type="button" class="btn primary full" data-ob="done">Поехали</button>`;
  }
  $('#onboard').innerHTML = `<div class="ob-box">${st.step ? `<button type="button" class="linkish ob-back" data-ob="back">Назад</button>` : ''}${body}${dots}</div>`;
}

async function onClick(e) {
  if (!st) return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.obAcc) { const a = st.accs[Number(b.dataset.obAcc)]; a.on = !a.on; return draw(); }
  const x = b.dataset.ob;
  if (x === 'back') { st.step--; return draw(); }
  if (x === 'restore') {
    S.data.settings.onboarded = true; await saveData(); finish();
    S.ui.tab = 'settings'; App.render(); return;
  }
  if (x === 'next') {
    if (st.step === 1) { st.base = $('#ob-base').value; S.data.settings.base = st.base; refreshResolver(); }
    if (st.step === 2) {
      for (const a of st.accs) if (a.on && Number.isNaN(parseAmount(a.amount, st.base))) return ($('#ob-err').textContent = `«${a.name}»: сумма — число, например 15 000`);
    }
    st.step++; return draw();
  }
  if (x === 'done') {
    for (const a of st.accs.filter((q) => q.on)) {
      if (S.data.accounts.some((y) => y.name === a.name)) continue;
      S.data.accounts.push({ id: uid('a'), name: a.name, kind: a.kind, icon: a.icon, color: a.color, cur: st.base, start: parseAmount(a.amount, st.base) || 0, inTotal: true, created: Date.now(), ...(a.kind === 'Накопительный' ? { rate: 0, ratePer: 'year', payDay: new Date().getDate() } : {}) });
    }
    S.data.settings.base = st.base;
    S.data.settings.onboarded = true;
    await save(); addLog('Первый запуск: настройка завершена'); finish(); S.ui.tab = 'home'; App.render();
  }
}
function onInput(e) {
  if (!st) return;
  const i = e.target.dataset.obAmt;
  if (i !== undefined) st.accs[Number(i)].amount = e.target.value;
}
export function bindOnboarding() {
  $('#onboard').addEventListener('click', onClick);
  $('#onboard').addEventListener('input', onInput);
}
export const onboardingOpen = () => !$('#onboard').hidden;
