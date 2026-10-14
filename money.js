// Валюты, суммы и курсы.
// Суммы везде хранятся целыми числами в минимальных единицах валюты (копейки, сатоши),
// чтобы не ловить ошибки округления на дробях.

export const BUILTIN_CURRENCIES = {
  RUB: { s: '₽', n: 'Российский рубль', d: 2 },
  USD: { s: '$', n: 'Доллар США', d: 2 },
  EUR: { s: '€', n: 'Евро', d: 2 },
  CNY: { s: '¥', n: 'Юань', d: 2 },
  KZT: { s: '₸', n: 'Тенге', d: 2 },
  BYN: { s: 'Br', n: 'Белорусский рубль', d: 2 },
  TRY: { s: '₺', n: 'Турецкая лира', d: 2 },
  AED: { s: 'AED', n: 'Дирхам ОАЭ', d: 2 },
  GBP: { s: '£', n: 'Фунт стерлингов', d: 2 },
  GEL: { s: '₾', n: 'Грузинский лари', d: 2 },
  AMD: { s: '֏', n: 'Армянский драм', d: 2 },
  BTC: { s: '₿', n: 'Bitcoin', d: 8, crypto: true },
  ETH: { s: 'ETH', n: 'Ethereum', d: 8, crypto: true },
  USDT: { s: 'USDT', n: 'Tether', d: 6, crypto: true },
  USDC: { s: 'USDC', n: 'USD Coin', d: 6, crypto: true },
  TON: { s: 'TON', n: 'Toncoin', d: 8, crypto: true },
  SOL: { s: 'SOL', n: 'Solana', d: 8, crypto: true },
};

// id монет в CoinGecko
const COINGECKO_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', USDT: 'tether', USDC: 'usd-coin', TON: 'the-open-network', SOL: 'solana',
};

let customCurrencies = {};
export function setCustomCurrencies(c) { customCurrencies = c || {}; }
export const allCurrencies = () => ({ ...BUILTIN_CURRENCIES, ...customCurrencies });
export const curInfo = (c) => allCurrencies()[c] || { s: c, n: c, d: 2 };
export const decimals = (c) => curInfo(c).d;

/** "1 299,90" -> 129990 (для RUB). NaN, если строка не число или слишком много знаков. */
export function parseAmount(str, cur) {
  const d = decimals(cur);
  const s = String(str ?? '').replace(/[\s ]/g, '').replace(',', '.');
  if (s === '') return 0;
  if (!new RegExp('^\\d+(\\.\\d{0,' + d + '})?$').test(s)) return NaN;
  const [int, frac = ''] = s.split('.');
  return Number(int) * 10 ** d + Number((frac + '0'.repeat(d)).slice(0, d) || 0);
}

export const toUnits = (minor, cur) => minor / 10 ** decimals(cur);
export const fromUnits = (units, cur) => Math.round(units * 10 ** decimals(cur));

/** Число в единицах -> "1 299,90 ₽". */
export function fmtUnits(v, cur, { sign = false, short = false } = {}) {
  const info = curInfo(cur);
  const crypto = info.crypto;
  const maxFrac = short ? 0 : crypto ? info.d : 2;
  const minFrac = short || crypto ? 0 : 2;
  let s = Math.abs(v).toLocaleString('ru-RU', { minimumFractionDigits: minFrac, maximumFractionDigits: maxFrac });
  if (v < 0) s = '−' + s; else if (sign && v > 0) s = '+' + s;
  return s + ' ' + info.s;
}
export const fmt = (minor, cur, opts) => fmtUnits(toUnits(minor, cur), cur, opts);

/** Строка для клавиатуры: 129990 -> "1299,9" (без лишних нулей). */
export function minorToInput(minor, cur) {
  const d = decimals(cur);
  const v = (minor / 10 ** d).toFixed(d);
  return v.replace(/\.?0+$/, '').replace('.', ',');
}

/* ---------------- курсы ---------------- */
// rates.rub = { USD: 83.87, BTC: 9200000, ... } — сколько рублей стоит 1 единица.
// manual = { BTC: { value: 110000, quote: 'USD' } } — ручные курсы важнее автоматических.

export function makeRateResolver(cache, manual) {
  const rub = (cache && cache.rub) || {};
  const memo = {};
  function rateRub(cur, seen = new Set()) {
    if (cur === 'RUB') return 1;
    if (cur in memo) return memo[cur];
    let r = null;
    const m = manual && manual[cur];
    if (m && m.value > 0 && !seen.has(cur)) {
      seen.add(cur);
      const q = rateRub(m.quote, seen);
      r = q == null ? null : m.value * q;
    } else if (rub[cur] > 0) {
      r = rub[cur];
    }
    memo[cur] = r;
    return r;
  }
  return {
    rateRub,
    /** перевод суммы в единицах из одной валюты в другую; null, если курса нет */
    convert(units, from, to) {
      if (from === to) return units;
      const a = rateRub(from), b = rateRub(to);
      return a == null || b == null ? null : (units * a) / b;
    },
  };
}

async function fetchJson(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** Свежие курсы: фиат по ЦБ РФ, крипта с CoinGecko (запасной — Binance). */
export async function fetchRates(prev) {
  const out = { ts: Date.now(), rub: { ...(prev?.rub || {}) }, sources: [] };
  let fiatOk = false, cryptoOk = false;
  try {
    const cbr = await fetchJson('https://www.cbr-xml-daily.ru/daily_json.js');
    for (const v of Object.values(cbr.Valute || {})) out.rub[v.CharCode] = v.Value / v.Nominal;
    out.cbrDate = cbr.Date;
    out.sources.push('ЦБ РФ');
    fiatOk = true;
  } catch (e) { /* остаются прошлые курсы */ }

  const usd = out.rub.USD;
  if (usd) {
    try {
      const ids = Object.values(COINGECKO_IDS).join(',');
      const cg = await fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
      for (const [code, id] of Object.entries(COINGECKO_IDS)) {
        if (cg[id]?.usd) out.rub[code] = cg[id].usd * usd;
      }
      out.sources.push('CoinGecko');
      cryptoOk = true;
    } catch (e) {
      try {
        const pairs = ['BTCUSDT', 'ETHUSDT', 'TONUSDT', 'SOLUSDT', 'USDCUSDT'];
        const bn = await fetchJson('https://api.binance.com/api/v3/ticker/price?symbols=' + encodeURIComponent(JSON.stringify(pairs)));
        for (const p of bn) out.rub[p.symbol.replace('USDT', '')] = Number(p.price) * usd; // USDT ≈ USD
        out.rub.USDT = usd;
        out.sources.push('Binance');
        cryptoOk = true;
      } catch (e2) { /* без крипты */ }
    }
  }
  if (!fiatOk && !cryptoOk) throw new Error('Курсы не загрузились');
  return out;
}

/** Компактный вид для монеток и плиток: до миллиона полностью, дальше «1,24 млн ₽», «3,15 трлн ₽». */
export function fmtUnitsCompact(v, cur) {
  const a = Math.abs(v);
  const info = curInfo(cur);
  for (const [n, label] of [[1e12, 'трлн'], [1e9, 'млрд'], [1e6, 'млн']]) {
    if (a >= n) {
      const x = v / n;
      const s = x.toLocaleString('ru-RU', { maximumFractionDigits: Math.abs(x) >= 100 ? 0 : 2 });
      return `${s} ${label} ${info.s}`;
    }
  }
  return fmtUnits(v, cur, { short: !info.crypto });
}
export const fmtCompact = (minor, cur) => fmtUnitsCompact(toUnits(minor, cur), cur);
