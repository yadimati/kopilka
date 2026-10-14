// Мелкие помощники: даты, экранирование, тосты, шторки.
import { parseAmount, decimals } from './money.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const pad = (n) => String(n).padStart(2, '0');
export const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => dateStr(new Date());
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const monthOf = (ds) => ds.slice(0, 7);
export const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const monthName = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1];
export const shiftMonth = (ym, k) => { const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const daysIn = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
export const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
export function humanDate(ds) {
  if (!ds) return '';
  if (ds === today()) return 'Сегодня';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (ds === dateStr(y)) return 'Вчера';
  const [Y, M, D] = ds.split('-').map(Number);
  return `${D} ${MONTHS_GEN[M - 1]}${Y !== new Date().getFullYear() ? ' ' + Y : ''}`;
}
export const agoText = (ts) => {
  if (!ts) return 'ещё не было';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  return new Date(ts).toLocaleDateString('ru-RU');
};

/** "1250000,5" -> "1 250 000,5" для крупных цифр на экране ввода */
export const groupInput = (s) => { if (!s) return ''; const [i, f] = s.split(','); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f !== undefined ? ',' + f : ''); };

/** Нажатие клавиши цифровой клавиатуры. */
export function applyKey(s, k, cur) {
  s = s || '';
  if (k === 'del') return s.slice(0, -1);
  if (k === ',') return !s.includes(',') && decimals(cur) > 0 ? (s || '0') + ',' : s;
  const next = s === '0' ? k : s + k;
  return !Number.isNaN(parseAmount(next, cur)) && next.replace(',', '').length <= 15 ? next : s;
}

/* ---------- тост: msg, { action: {label, fn}, top: bool, ms } ---------- */
export function toast(msg, opts = {}) {
  const t = $('#toast');
  t.className = opts.top ? 'top' : '';
  t.innerHTML = `<span>${esc(msg)}</span>${opts.action ? `<button type="button">${esc(opts.action.label)}</button>` : ''}`;
  if (opts.action) t.querySelector('button').onclick = () => { t.hidden = true; opts.action.fn(); };
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), opts.ms || (opts.action ? 6000 : 2300));
}

/* ---------- шторка снизу ---------- */
let sheetCleanup = null;
export function openSheet(html, mount, { tall = false, cls = '' } = {}) {
  closeSheet();
  const root = $('#sheet-root');
  root.innerHTML = `<div class="scrim" data-scrim></div><section class="sheet ${tall ? 'tall' : ''} ${cls}" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div>${html}</section>`;
  root.hidden = false;
  const sheet = $('.sheet', root);
  root.querySelector('[data-scrim]').addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close-sheet]')) closeSheet(); });
  sheetCleanup = mount ? mount(sheet) : null;
  requestAnimationFrame(() => root.classList.add('open'));
  return sheet;
}
export function closeSheet() {
  const root = $('#sheet-root');
  if (typeof sheetCleanup === 'function') sheetCleanup();
  sheetCleanup = null;
  root.classList.remove('open');
  root.hidden = true;
  root.innerHTML = '';
}
export const sheetOpen = () => !$('#sheet-root').hidden;
export const closeBtn = () => `<button type="button" class="icon-btn" data-close-sheet aria-label="Закрыть"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
export const sheetHead = (title, extra = '') => `<div class="sheet-head"><h2>${title}</h2>${extra}${closeBtn()}</div>`;

/** Отдать файл: меню «Поделиться» iOS, иначе обычное скачивание. */
export async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return true; }
  } catch (e) {
    if (e.name === 'AbortError') return false;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
