// Анализ месяца.
import { S, App, base, catById, srcById, monthFlows } from './state.js';
import { esc, today, monthOf, monthName, shiftMonth, daysIn, plural } from './util.js';
import { fmtUnits, fmtUnitsCompact } from './money.js';
import { UI, svg } from './icons.js';

const money = (v) => (Math.abs(v) >= 1e6 ? fmtUnitsCompact(v, base()) : fmtUnits(v, base(), { short: true }));

export function viewAnalytics() {
  const ym = S.ui.month;
  const cur = monthFlows(ym), prev = monthFlows(shiftMonth(ym, -1));
  const isNow = ym === monthOf(today());
  const days = isNow ? new Date().getDate() : daysIn(ym);
  const exp = S.ui.anMode === 'expense';
  const total = exp ? cur.exp : cur.inc, prevTotal = exp ? prev.exp : prev.inc;
  const delta = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  let rows;
  if (exp) {
    rows = Object.entries(cur.byCat).map(([id, v]) => {
      const c = catById(id) || { name: 'Без категории', color: '#7d8a86', subs: [] };
      const subs = Object.entries(cur.bySub).filter(([k]) => k.startsWith(id + '|')).map(([k, sv]) => ({ name: c.subs?.find((s) => s.id === k.split('|')[1])?.name || 'Без подкатегории', v: sv })).sort((a, b) => b.v - a.v);
      return { id, name: c.name, color: c.color, v, subs };
    });
  } else {
    rows = Object.entries(cur.bySrc).map(([id, v]) => { const s = srcById(id) || { name: 'Прочее', color: '#8a5a00' }; return { id, name: s.name, color: s.color, v, subs: [] }; });
  }
  rows.sort((a, b) => b.v - a.v);
  const max = rows[0]?.v || 1;
  const bars = rows.map((r) => `
    <button type="button" class="barrow" data-act="expand" data-id="${r.id}" aria-expanded="${S.ui.expanded === r.id}">
      <span class="nm">${esc(r.name)}</span>
      <span class="track"><i style="width:${Math.max(2, (r.v / max) * 100)}%;background:${esc(r.color)}"></i></span>
      <span class="num v">${money(r.v)}</span>
    </button>
    ${S.ui.expanded === r.id && r.subs.length ? `<div class="subrows">${r.subs.map((s) => `<div class="subrow"><span>${esc(s.name)}</span><span class="num">${money(s.v)} · ${Math.round((s.v / r.v) * 100)}%</span></div>`).join('')}</div>` : ''}`).join('');
  const topSaved = Object.entries(cur.savedByCat).sort((a, b) => b[1] - a[1])[0];
  return `
  <header class="page-head"><h1>Анализ</h1>
    <div class="monthnav">
      <button type="button" class="icon-btn" data-act="month" data-d="-1" aria-label="Предыдущий месяц">${svg(UI.left, 20)}</button>
      <span>${monthName(ym)[0].toUpperCase() + monthName(ym).slice(1)} ${ym.slice(0, 4)}</span>
      <button type="button" class="icon-btn" data-act="month" data-d="1" aria-label="Следующий месяц" ${isNow ? 'disabled' : ''}>${svg(UI.right, 20)}</button>
    </div>
  </header>
  <div class="seg full" role="group" aria-label="Что показывать">
    <button type="button" data-act="an" data-m="expense" aria-pressed="${exp}">Расходы</button>
    <button type="button" data-act="an" data-m="income" aria-pressed="${!exp}">Доходы</button>
  </div>
  <div class="stats3">
    <div><span class="small muted">${exp ? 'Потрачено' : 'Получено'}</span><b class="num">${money(total)}</b>
      <span class="small ${delta == null ? 'muted' : (delta > 0) === exp ? 'neg' : 'pos'}">${delta == null ? 'нет данных за прошлый' : (delta > 0 ? '+' : '') + delta + '% к прошлому'}</span></div>
    <div><span class="small muted">В среднем за день</span><b class="num">${money(total / days)}</b><span class="small muted">${days} ${plural(days, 'день', 'дня', 'дней')}</span></div>
    <div><span class="small muted">${exp ? 'Доходы' : 'Расходы'}</span><b class="num">${money(exp ? cur.inc : cur.exp)}</b><span class="small muted">за месяц</span></div>
  </div>
  <section class="card pad">
    <span class="label">${exp ? 'По категориям · тап раскрывает' : 'По источникам'}</span>
    <div class="bars">${bars || '<div class="empty">За этот месяц ничего нет.</div>'}</div>
    ${exp && cur.adj ? `<span class="small muted adj">Корректировки балансов: ${fmtUnits(cur.adj, base(), { sign: true, short: true })} — не входят в траты</span>` : ''}
    ${cur.noRate ? `<p class="small warn">${cur.noRate} опер. без курса не учтено</p>` : ''}
  </section>
  ${cur.saved ? `<section class="card pad amber-card">
    <div class="row between"><span class="label">Не потратил</span><b class="num">${money(cur.saved)} · ${cur.savedCnt} ${plural(cur.savedCnt, 'раз', 'раза', 'раз')}</b></div>
    ${topSaved ? `<span class="small">Чаще всего сдерживаетесь в «${esc(catById(topSaved[0])?.name || '—')}» — ${money(topSaved[1])}.</span>` : '<span class="small">Записывайте категорию — увидите, где сдерживаетесь чаще.</span>'}
  </section>` : ''}`;
}

Object.assign(App.actions, {
  month: (el) => { if (el.disabled) return; S.ui.month = shiftMonth(S.ui.month, Number(el.dataset.d)); S.ui.expanded = null; App.render(); },
  an: (el) => { S.ui.anMode = el.dataset.m; S.ui.expanded = null; App.render(); },
  expand: (el) => { S.ui.expanded = S.ui.expanded === el.dataset.id ? null : el.dataset.id; App.render(); },
});
