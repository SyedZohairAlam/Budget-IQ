export const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const NOW = 10;
export const tot = a => a.reduce((s, x) => s + x, 0);
export const R = n => (n < 0 ? '-' : '') + 'Rs ' + Math.round(Math.abs(n)).toLocaleString('en-PK');
export const K = n => (n < 0 ? '-' : '') + (Math.abs(n) >= 1e6 ? 'Rs ' + (Math.abs(n) / 1e6).toFixed(2) + 'M' : 'Rs ' + Math.round(Math.abs(n) / 1e3) + 'K');

export function seed() {
  const D = [['Marketing',600,[40,42,45,48,50,52,55,58,60,60]],['Human Resources',400,[24,26,25,27,26,26,27,26,27,26]],['IT',700,[45,48,50,52,55,58,60,62,64,66]],['Operations',800,[40,42,45,50,52,55,56,58,55,57]]].map(x => ({ n: x[0], b: x[1] * 1e3, a: x[2].map(v => v * 1e3) }));
  const L = [['INV-101','Marketing','Digital advertising',125000,9],['INV-102','Marketing','Influencer campaign',60000,9],['INV-103','IT','Software subscription',85000,9],['INV-103','IT','Software subscription',85000,9],['INV-104','Operations','Equipment purchase',210000,8],['INV-105','Human Resources','Recruitment fees',40000,8],['INV-106','IT','Cloud hosting',45000,9],['INV-107','Operations','Logistics',52000,9],['INV-108','Marketing','Print media',30000,7],['INV-109','Human Resources','Training',25000,9],['INV-110','IT','Security audit',100000,9]].map(x => ({ inv: x[0], dept: x[1], desc: x[2], amt: x[3], m: x[4] }));
  const RQ = [{ id: 1, d: 'Marketing', a: 50000, r: 'Additional campaign requirement', s: 'Pending' }, { id: 2, d: 'IT', a: 30000, r: 'Security software renewal', s: 'Pending' }];
  return { D, L, RQ };
}

export const SAMPLE = 'INV-201,Marketing,Billboard campaign,90000,2026-10-04\nINV-202,IT,Cloud migration,150000,2026-10-09\nINV-202,IT,Cloud migration,150000,2026-10-09\nINV-203,Operations,Packaging supplies,48000,2026-10-15\nINV-204,Human Resources,Team workshop,100000,2026-10-20';

// c = { method, alpha, sc }
export function forecastMonthly(a, { method, alpha }) {
  const n = a.length; if (!n) return 0;
  const last = a.slice(-3);
  if (method === 'wma') { const w = [1, 2, 3].slice(3 - last.length); return last.reduce((sum, v, i) => sum + v * w[i], 0) / w.reduce((x, y) => x + y, 0); }
  if (method === 'exp') { let level = a[0]; for (let i = 1; i < n; i++) level = alpha * a[i] + (1 - alpha) * level; return level; }
  return tot(last) / last.length;
}

export function S(d, c) {
  const y = tot(d.a), p = d.b * NOW / 12, l = forecastMonthly(d.a, c), f = y + l * (12 - NOW) * (1 + c.sc / 100), g = d.b - f, pv = (y - p) / p * 100;
  return { y, p, f, g, pv, h: Math.max(0, Math.round(100 - Math.min(50, Math.abs(pv)) - (g < 0 ? Math.min(30, -g / d.b * 300) : 0))) };
}

export function scan(L) {
  const mean = tot(L.map(x => x.amt)) / L.length;
  return L.map(x => {
    let r = 0, w = [];
    if (L.filter(y => y.inv === x.inv && y.amt === x.amt).length > 1) { r += 50; w.push('Duplicate invoice'); }
    if (x.amt > 2 * mean) { r += 30; w.push('Unusually large'); }
    if (x.amt >= 1e5 && x.amt % 5e4 === 0) { r += 15; w.push('Round figure'); }
    return { ...x, r, w };
  }).sort((a, b) => b.r - a.r);
}

export function insights(D, L, c) {
  const o = [], s = D.map(d => ({ d, ...S(d, c) }));
  s.filter(x => x.g < 0).forEach(x => o.push(['r', x.d.n + ': ' + K(-x.g) + ' over by December', `${x.d.n}: cut about ${K(-x.g / (12 - NOW))} per month to stay on budget.`]));
  s.filter(x => x.pv < -15).forEach(x => o.push(['a', x.d.n + ': ' + K(x.g) + ' unused', `${x.d.n}: ${(x.y / x.d.b * 100).toFixed(0)}% spent, ${(NOW / 12 * 100).toFixed(0)}% of year gone. Consider reallocating.`]));
  const dup = scan(L).filter(x => x.w.includes('Duplicate invoice'));
  if (dup.length) o.push(['r', 'Possible duplicate payment', `${K(dup[0].amt * (dup.length - 1))} may be paid twice. Verify.`]);
  const w = s.filter(x => x.g < 0), u = s.filter(x => x.g > 0).sort((a, b) => b.g - a.g)[0];
  if (w.length && u) o.push(['ok', 'Smart reallocation', `Move ${K(Math.min(u.g * .5, -w[0].g))} from ${u.d.n} to ${w[0].d.n}. No new money needed.`]);
  if (!o.length) o.push(['ok', 'All clear', 'No overspend or anomalies detected.']);
  return o;
}

export function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field.trim()); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field.trim()); if (row.some(v => v !== '')) rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  row.push(field.trim()); if (row.some(v => v !== '')) rows.push(row);
  return rows;
}

export function ans(q, D, L, c) {
  const b = tot(D.map(d => d.b)), y = tot(D.map(d => tot(d.a))), f = tot(D.map(d => S(d, c).f)), w = D.filter(d => S(d, c).g < 0);
  if (/brief|summary|report/i.test(q)) return `Through October ${K(y)} of ${K(b)} is spent (${(y / b * 100).toFixed(1)}%). The year-end forecast is ${K(f)}, ${f > b ? K(f - b) + ' over' : K(b - f) + ' under'} budget. ` + insights(D, L, c).map(x => x[2]).join(' ');
  if (/forecast|year.?end|breach|exceed/i.test(q)) return w.length ? w.map(d => `${d.n} is forecast to end ${K(-S(d, c).g)} over budget.`).join(' ') + ` Organisation total: ${K(f)} vs ${K(b)}.` : `No department is forecast to exceed its budget. Total forecast is ${K(f)}.`;
  if (/over.?budget|overspend/i.test(q)) return w.length ? w.map(d => d.n).join(', ') + ' will overspend by year-end if nothing changes. Nobody has exceeded the full-year budget yet.' : 'No department is on course to overspend.';
  if (/remain|left/i.test(q)) return `${K(b - y)} of the annual budget is left, with 2 months to go.`;
  if (/duplic|fraud|risk|invoice|anomal/i.test(q)) { const t = scan(L).filter(x => x.r > 0); return `${t.length} transactions are flagged. Highest risk: ${t[0].inv} (${t[0].dept}, ${R(t[0].amt)}) – ${t[0].w.join(', ')}.`; }
  if (/save|cut|realloc|reduce/i.test(q)) return insights(D, L, c).filter(x => x[0] !== 'r' || /Overspend/.test(x[1])).map(x => x[2]).join(' ');
  if (/health|score/i.test(q)) return D.map(d => d.n + ': ' + S(d, c).h + '/100').join(' · ');
  return 'Try: board summary, year-end forecast, who will overspend, duplicate invoices, or how to save.';
}
