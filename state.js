// Общее состояние приложения и расчёты по данным.
import * as store from './store.js';
import { encryptJson } from './crypto.js';
import { setCustomCurrencies, makeRateResolver, toUnits } from './money.js';
import { DATA_VERSION, CLOUD_URL } from './config.js';
import { uid, today, monthOf, pad } from './util.js';
import * as cloud from './cloud.js';

export const S = {
  data: null,        // обычные данные
  vault: null,       // { accounts, txns } — расшифровано, пока открыт особый режим
  vaultKey: null,
  vaultBlob: null,   // { salt, iv, ct } как лежит в хранилище
  rates: null,
  R: makeRateResolver(null, {}),
  cloudKey: null,    // ключ восстановления облачной копии (хранится на устройстве)
  update: null,      // найденное обновление { version, notes, date }
  ui: {
    tab: 'home', edit: false, selected: null,
    month: monthOf(today()), anMode: 'expense', expanded: null,
    q: '', fPeriod: 'month', fType: 'all', fAcc: 'all', fCat: 'all', opsLimit: 150,
    interestShown: false,
  },
};

/** Реестр: модули регистрируют здесь действия на data-act и обработчики change. */
export const App = { render() {}, actions: {}, changes: {} };

export const sub = (name) => ({ id: uid('s'), name });
export const INTEREST_SOURCE = { id: 'interest', name: 'Проценты', icon: 'bank', color: '#0f6e5c' };

export function defaults() {
  const cat = (name, icon, color, subs = []) => ({ id: uid('c'), name, icon, color, subs: subs.map(sub) });
  return {
    v: DATA_VERSION,
    accounts: [],
    sources: [
      { id: uid('i'), name: 'Зарплата', icon: 'job', color: '#8a5a00' },
      { id: uid('i'), name: 'Подработка', icon: 'laptop', color: '#8a5a00' },
      { id: uid('i'), name: 'Кэшбэк', icon: 'fee', color: '#8a5a00' },
    ],
    cats: [
      cat('Продукты', 'cart', '#2f8f5b', ['Супермаркет', 'Рынок', 'Доставка']),
      cat('Кафе', 'cup', '#c0641c', ['Кофе', 'Обеды', 'Рестораны', 'Доставка еды']),
      cat('Транспорт', 'bus', '#3b6fc4', ['Общественный', 'Такси', 'Каршеринг', 'Бензин']),
      cat('Жильё', 'home', '#7a5c3e', ['Аренда', 'ЖКХ', 'Ремонт']),
      cat('Связь', 'wifi', '#3a8597', ['Мобильная', 'Интернет']),
      cat('Здоровье', 'heart', '#b03a5f', ['Аптека', 'Врачи', 'Спорт']),
      cat('Одежда', 'shirt', '#8650b3', ['Одежда', 'Обувь']),
      cat('Развлечения', 'ticket', '#a5780f', ['Кино', 'Игры', 'Концерты']),
      cat('Подписки', 'repeat', '#4c5fc2'),
      cat('Подарки', 'gift', '#b8487c'),
      cat('Быт', 'tool', '#6d7f9a', ['Химия', 'Для дома']),
      cat('Прочее', 'dots', '#7d8a86', ['Комиссии']),
    ],
    txns: [], debts: [], reminders: [], saved: [],
    settings: {
      base: 'RUB', manualRates: {}, custom: {}, lastBackup: null, lastAcc: null, opCur: {},
      created: Date.now(), onboarded: false, tp: null, summarySeen: null,
      cloud: { enabled: false, last: null },
    },
  };
}

const timeOf = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** Перевод данных в текущий формат. Возвращает список выполненных шагов для журнала. */
export function migrate(d) {
  const done = [];
  if (!d.v || d.v < 2) {
    d.saved = d.saved || [];
    for (const t of d.txns || []) if (!t.time && t.created) t.time = timeOf(t.created);
    d.settings = { ...defaults().settings, ...d.settings, onboarded: true, cloud: d.settings?.cloud || { enabled: false, last: null } };
    d.v = 2;
    done.push('Данные переведены в новый формат (1 → 2)');
  }
  return done;
}
export function migrateVault(v) {
  for (const t of v.txns || []) if (!t.time && t.created) t.time = timeOf(t.created);
  return v;
}

/* ---------- сохранение ---------- */
let cloudTimer = null;
function markCloud() {
  const c = S.data?.settings?.cloud;
  if (!CLOUD_URL || !c?.enabled || !S.cloudKey || cloudTimer) return;
  // не чаще раза в 10 минут: бережём бесплатный лимит сервера
  const wait = Math.max(5000, (c.last || 0) + 10 * 60e3 - Date.now());
  cloudTimer = setTimeout(() => { cloudTimer = null; cloudNow(); }, wait);
}
export async function cloudNow() {
  const c = S.data.settings.cloud;
  if (!CLOUD_URL || !c?.enabled || !S.cloudKey || !navigator.onLine) return false;
  try {
    await cloud.upload(S.cloudKey, { data: S.data, vault: S.vaultBlob });
    c.last = Date.now();
    await store.set('data', S.data);
    return true;
  } catch (e) {
    store.addLog('Облачная копия: ошибка — ' + e.message);
    return false;
  }
}
export async function saveData() {
  try { await store.set('data', S.data); } catch (e) { store.addLog('Ошибка сохранения: ' + e.message); }
  markCloud();
}
export async function saveVault() {
  if (!S.vault || !S.vaultKey) return;
  const { iv, ct } = await encryptJson(S.vaultKey, S.vault);
  S.vaultBlob = { salt: S.vaultBlob.salt, iv, ct };
  await store.set('vault', S.vaultBlob);
  markCloud();
}
export async function save() { await saveData(); if (S.vault) await saveVault(); }

export function refreshResolver() {
  setCustomCurrencies(S.data.settings.custom);
  S.R = makeRateResolver(S.rates, S.data.settings.manualRates);
}

/* ---------- выборки ---------- */
export const base = () => S.data.settings.base;
export const accounts = () => [...S.data.accounts, ...(S.vault ? S.vault.accounts.map((a) => ({ ...a, secret: true })) : [])];
export const allTxns = () => [...S.data.txns, ...(S.vault ? S.vault.txns.map((t) => ({ ...t, secret: true })) : [])];
const isPrivate = (t) => t.type === 'private_in' || t.type === 'private_out';
/** Операции для списков, поиска, анализа: переводы «в сейф» видны только со стороны сейфа. */
export const shownTxns = () => allTxns().filter((t) => !(isPrivate(t) && !t.secret));
export const accById = (id) => accounts().find((a) => a.id === id);
export const catById = (id) => S.data.cats.find((c) => c.id === id);
export const srcById = (id) => (id === 'interest' ? INTEREST_SOURCE : S.data.sources.find((s) => s.id === id));
export const isSecretAcc = (id) => !!S.vault && S.vault.accounts.some((a) => a.id === id);
export const accList = (id) => (isSecretAcc(id) ? S.vault.accounts : S.data.accounts);
export const txList = (accId) => (isSecretAcc(accId) ? S.vault.txns : S.data.txns);
export const txCur = (t) => accById(t.acc)?.cur || 'RUB';
export const inBase = (minor, cur) => S.R.convert(toUnits(minor, cur), cur, base());
/** Части расхода (для разделённого чека) и их валюта. */
export const partsOf = (t) => (t.parts?.length ? t.parts : [{ cat: t.cat, sub: t.sub, amount: t.amount }]);
export const partsCur = (t) => (t.orig ? t.orig.cur : txCur(t));
export const isGoal = (a) => a?.kind === 'Цель';
export const isSavings = (a) => a?.kind === 'Накопительный' || a?.kind === 'Вклад';

export function balance(accId, all = allTxns()) {
  const a = accById(accId);
  if (!a) return 0;
  let b = a.start || 0;
  for (const t of all) {
    if (t.acc === accId) {
      if (t.type === 'income' || t.type === 'private_in') b += t.amount;
      else if (t.type === 'expense' || t.type === 'private_out' || t.type === 'transfer') b -= t.amount;
      else if (t.type === 'debt' || t.type === 'adjust') b += t.dir === 'in' ? t.amount : -t.amount;
    }
    if (t.type === 'transfer' && t.to === accId) b += t.amountTo ?? t.amount;
  }
  return b;
}

export function totals() {
  let total = 0, noRate = 0, hidden = 0;
  const all = allTxns();
  for (const a of accounts()) {
    if (a.inTotal === false) continue;
    const v = inBase(balance(a.id, all), a.cur);
    if (v == null) { noRate++; continue; }
    total += v;
    if (a.secret) hidden += v;
  }
  return { total, noRate, hidden };
}

/** Деньги месяца в основной валюте: доходы, расходы, разбивки, корректировки, «не потратил». */
export function monthFlows(ym) {
  const r = { inc: 0, exp: 0, adj: 0, noRate: 0, byCat: {}, bySub: {}, bySrc: {}, cnt: {}, saved: 0, savedCnt: 0, savedByCat: {} };
  for (const t of shownTxns()) {
    if (monthOf(t.date) !== ym) continue;
    if (t.type === 'adjust') { const v = inBase(t.amount, txCur(t)); if (v != null) r.adj += t.dir === 'in' ? v : -v; continue; }
    if (t.type === 'income') {
      const v = t.orig ? inBase(t.orig.amount, t.orig.cur) : inBase(t.amount, txCur(t));
      if (v == null) { r.noRate++; continue; }
      r.inc += v; r.bySrc[t.source || '_'] = (r.bySrc[t.source || '_'] || 0) + v;
    } else if (t.type === 'expense') {
      const cur = partsCur(t);
      for (const p of partsOf(t)) {
        const v = inBase(p.amount, cur);
        if (v == null) { r.noRate++; continue; }
        const c = p.cat || '_';
        r.exp += v;
        r.byCat[c] = (r.byCat[c] || 0) + v;
        r.cnt[c] = (r.cnt[c] || 0) + 1;
        const k = c + '|' + (p.sub || '_');
        r.bySub[k] = (r.bySub[k] || 0) + v;
      }
    }
  }
  for (const s of S.data.saved || []) {
    if (monthOf(s.date) !== ym) continue;
    const v = inBase(s.amount, s.cur);
    if (v == null) continue;
    r.saved += v; r.savedCnt++;
    if (s.cat) r.savedByCat[s.cat] = (r.savedByCat[s.cat] || 0) + v;
  }
  return r;
}
