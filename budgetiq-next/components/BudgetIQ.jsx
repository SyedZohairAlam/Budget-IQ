'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { M, NOW, tot, R, K, S, scan, insights, ans, parseCSV, SAMPLE, seed } from '../lib/budget';

const KEY = 'budgetiq-university-v1';
const NAV = [['ov', '◫', 'Overview'], ['va', '↗', 'Variance'], ['fo', '⌁', 'Forecast'], ['ex', '⌕', 'Detective'], ['ap', '✓', 'Approvals'], ['as', '✦', 'Assistant'], ['gu', 'ⓘ', 'Guide']];
const NOTES = {
  sma: 'SMA gives equal importance to the last three months.',
  wma: 'Weighted average gives the latest month the greatest importance (weights 1, 2 and 3).',
  exp: 'Exponential smoothing updates the level using alpha; higher alpha reacts faster to recent changes.',
};

const Badge = ({ t, c }) => <span className="bd" style={{ '--c': `var(--${c})` }}>{t}</span>;
const Insights = ({ list }) => list.map((x, i) => <div key={i} className={`ins ${x[0]}`}><b>{x[1]}</b>{x[2]}</div>);
const Status = ({ d, c }) => {
  const s = S(d, c);
  return s.g < 0 ? <Badge t="Will overspend" c="red" /> : s.pv < -15 ? <Badge t="Underspending" c="blue" /> : <Badge t="On track" c="green" />;
};

function Chart({ D, c }) {
  const W = 640, H = 230, P = 40, tb = tot(D.map(d => d.b)), cu = [];
  for (let m = 0; m < NOW; m++) cu.push(tot(D.map(d => tot(d.a.slice(0, m + 1)))));
  const fl = tot(D.map(d => S(d, c).f)), mx = Math.max(tb, fl) * 1.1;
  const X = i => P + i * (W - P - 12) / 11, Y = v => H - 26 - v / mx * (H - 46);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cumulative spend chart">
        <line x1={X(0)} y1={Y(tb / 12)} x2={X(11)} y2={Y(tb)} stroke="var(--mut)" strokeDasharray="4 4" />
        <text x={X(11)} y={Y(tb) - 6} textAnchor="end" fontSize="11" fill="var(--mut)">Budget pace → {K(tb)}</text>
        <polyline fill="none" stroke="var(--blue)" strokeWidth="3" points={cu.map((v, i) => X(i) + ',' + Y(v)).join(' ')} />
        <line x1={X(NOW - 1)} y1={Y(cu[NOW - 1])} x2={X(11)} y2={Y(fl)} stroke="var(--amber)" strokeWidth="3" strokeDasharray="6 4" />
        <circle cx={X(11)} cy={Y(fl)} r="5" fill="var(--amber)" />
        {M.map((m, i) => <text key={m} x={X(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--mut)">{m}</text>)}
      </svg>
      <div className="mut">Blue = actual · Amber dashed = forecast ({K(fl)}) · Grey dashed = budget pace</div>
    </>
  );
}

export default function BudgetIQ() {
  const [init] = useState(seed);
  const [D, setD] = useState(init.D);
  const [L, setL] = useState(init.L);
  const [RQ, setRQ] = useState(init.RQ);
  const [sc, setSc] = useState(0);
  const [method, setMethod] = useState('sma');
  const [alpha, setAlpha] = useState(0.5);
  const [page, setPage] = useState('ov');
  const [loaded, setLoaded] = useState(false);
  const [bv, setBv] = useState(init.D.map(d => d.b));
  const [um, setUm] = useState('');
  const [cb, setCb] = useState(null);
  const [cm, setCm] = useState('');
  const [rd, setRd] = useState('');
  const [ra, setRa] = useState('');
  const [rr, setRr] = useState('');
  const [rm, setRm] = useState('');
  const [chat, setChat] = useState([]);
  const [ci, setCi] = useState('');
  const taRef = useRef(null);
  const chatRef = useRef(null);
  const c = { method, alpha, sc };

  useEffect(() => {
    try {
      const x = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (x && Array.isArray(x.D) && Array.isArray(x.L) && Array.isArray(x.RQ)) {
        setD(x.D); setL(x.L); setRQ(x.RQ);
        setSc(Number(x.sc) || 0);
        setMethod(['sma', 'wma', 'exp'].includes(x.forecastMethod) ? x.forecastMethod : 'sma');
        setAlpha(Number(x.alpha) || 0.5);
      }
    } catch (e) {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(KEY, JSON.stringify({ D, L, RQ, sc, forecastMethod: method, alpha })); } catch (e) {}
  }, [loaded, D, L, RQ, sc, method, alpha]);

  useEffect(() => { setBv(D.map(d => d.b)); }, [D, method, alpha]);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = 1e9; }, [chat]);

  if (!loaded) return null;

  const b = tot(D.map(d => d.b)), y = tot(D.map(d => tot(d.a))), f = tot(D.map(d => S(d, c).f));
  const flags = scan(L).filter(x => x.r > 0).length;
  const o = Math.round(tot(D.map(d => S(d, c).h)) / D.length);
  const title = NAV.find(n => n[0] === page)[2];

  function applyB() { setD(D.map((d, i) => ({ ...d, b: Math.max(1, +bv[i] || d.b) }))); }

  function imp(t) {
    let ok = 0, bad = 0, dupe = 0;
    const Dn = D.map(d => ({ ...d, a: [...d.a] })), Ln = [...L];
    parseCSV(t).forEach((r, i) => {
      if (i === 0 && /invoice/i.test(r[0] || '')) return;
      if (r.length < 5 || isNaN(+r[3])) { bad++; return; }
      const d = Dn.find(x => x.n.toLowerCase() === r[1].toLowerCase()), date = r[4], m = parseInt(date.slice(5, 7)) - 1, a = +r[3];
      if (!d || !(a > 0) || !(m >= 0 && m < NOW) || date.slice(0, 4) !== '2026') { bad++; return; }
      if (Ln.some(x => x.inv === r[0] && x.amt === a && x.dept === d.n)) { dupe++; return; }
      Ln.push({ inv: r[0], dept: d.n, desc: r[2], amt: a, m, up: 1 });
      d.a[m] += a; ok++;
    });
    setD(Dn); setL(Ln);
    setUm(ok + ' imported, ' + bad + ' skipped (invalid department, amount or date), ' + dupe + ' duplicate rows skipped.');
  }

  function up(el) {
    const file = el.files[0]; if (!file) return;
    const r = new FileReader(); r.onload = () => imp(r.result); r.readAsText(file);
  }

  function sub() {
    const a = +ra, r = rr.trim();
    if (!(a > 0) || !r) { setRm('Enter a valid amount and reason.'); return; }
    setRQ([...RQ, { id: Date.now(), d: rd || D[0].n, a, r, s: 'Pending' }]);
    setRa(''); setRr(''); setRm('Submitted.');
  }

  function dec(id, ok) {
    const r = RQ.find(x => x.id === id);
    setRQ(RQ.map(x => x.id === id ? { ...x, s: ok ? 'Approved' : 'Rejected' } : x));
    if (ok) setD(D.map(d => d.n === r.d ? { ...d, b: d.b + r.a } : d));
  }

  function ask(t) {
    const q = t || ci.trim(); if (!q) return;
    setChat([...chat, { q, a: ans(q, D, L, c) }]); setCi('');
  }

  function cp() {
    const t = ans('board summary', D, L, c);
    flushSync(() => setCb(t));
    const ta = taRef.current; ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    try { navigator.clipboard.writeText(t).catch(() => {}); } catch (e) {}
    setCm(ok ? 'Copied!' : 'Select the text below and copy it.');
  }

  function rst() {
    const s = seed();
    setD(s.D); setL(s.L); setRQ(s.RQ); setSc(0); setMethod('sma'); setAlpha(0.5);
    setUm(''); setCb(null); setCm('');
  }

  function exportReport() {
    const rows = [['Department', 'Annual budget (Rs)', 'Actual spend YTD (Rs)', 'Expected spend by Oct (Rs)', 'Variance (Rs)', 'Variance %', 'Year-end forecast (Rs)', 'Forecast gap (Rs)']];
    D.forEach(d => { const x = S(d, c); rows.push([d.n, d.b, x.y, x.p, x.y - x.p, x.pv.toFixed(2), x.f, x.g]); });
    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'BudgetIQ_department_report.csv'; a.click(); URL.revokeObjectURL(url);
  }

  const kp = [['TOTAL BUDGET', K(b), '4 departments', ''], ['SPENT YTD', K(y), (y / b * 100).toFixed(1) + '% used · ' + (NOW / 12 * 100).toFixed(0) + '% of year gone', ''], ['YEAR-END FORECAST', K(f), f > b ? 'Over budget' : 'Within budget', f > b ? 'bad' : 'good'], ['RISK FLAGS', flags, 'transactions to review', flags ? 'warn' : 'good']];
  const pg = id => 'pg' + (page === id ? ' on' : '');

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">Budget<span>IQ</span></div>
        <div className="tag">BUDGET INTELLIGENCE</div>
        {NAV.map(([id, ic, lb]) => <button key={id} className={page === id ? 'on' : ''} onClick={() => setPage(id)}>{ic} {lb}</button>)}
      </aside>
      <main className="main">
        <div className="top">
          <div><h1>{title}</h1><div className="sub">Spend, forecast and risk at a glance.</div></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="pill">● YTD OCT 2026</div>
            <button className="btn gr" onClick={exportReport}>↓ Export report</button>
            <button className="btn s" onClick={rst}>↺ Reset demo</button>
          </div>
        </div>

        <section className={pg('ov')}>
          <div className="ins ok" style={{ fontSize: 14 }}><b>Catch overspending 2 months early.</b>BudgetIQ forecasts year-end spend and flags risky payments.</div>
          <div className="g k4">{kp.map((x, i) => <div key={i} className="card"><div className="lb">{x[0]}</div><div className={`v ${x[3]}`}>{x[1]}</div><div className="mut">{x[2]}</div></div>)}</div>
          <div className="g t2">
            <div className="card"><h2>Cumulative spend vs budget pace</h2><div><Chart D={D} c={c} /></div></div>
            <div className="card">
              <h2>✦ Budget Guardian</h2>
              <div><Insights list={insights(D, L, c)} /></div>
              <button className="btn s" onClick={cp}>Copy board summary</button>
              <p className="mut">{cm}</p>
              <textarea ref={taRef} rows={5} readOnly value={cb || ''} style={{ display: cb === null ? 'none' : 'block' }} />
            </div>
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h2>Budget allocated by department</h2>
            <div className="g k4" style={{ marginBottom: 0 }}>
              {D.map(d => {
                const s = S(d, c), u = s.y / d.b * 100;
                return (
                  <div key={d.n} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
                    <div className="lb">{d.n.toUpperCase()}</div><div className="v">{K(d.b)}</div>
                    <div className="mut">{(d.b / b * 100).toFixed(0)}% of total budget</div>
                    <div className="bar"><i style={{ width: `${Math.min(100, u)}%`, background: `var(--${u > 100 ? 'red' : 'blue'})` }} /></div>
                    <div className="mut">Spent {K(s.y)} · Left {K(d.b - s.y)}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="g t2">
            <div className="card"><h2>Department health</h2>
              <div>{D.map(d => { const h = S(d, c).h; return (
                <Fragment key={d.n}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{d.n}</b><b>{h}/100</b></div>
                  <div className="bar"><i style={{ width: `${h}%`, background: `var(--${h >= 80 ? 'teal' : h >= 65 ? 'amber' : 'red'})` }} /></div>
                </Fragment>); })}</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <h2>Organisation score</h2>
              <div className="ring" style={{ background: `conic-gradient(var(--${o >= 80 ? 'teal' : 'amber'}) ${o * 3.6}deg,var(--line) 0)` }}><div>{o}</div></div>
              <p className="mut">Pace + forecast</p>
            </div>
          </div>
        </section>

        <section className={pg('va')}>
          <div className="card"><h2>Monthly spend heatmap</h2><p className="mut">Red = over monthly budget · Green = well under</p>
            <div style={{ overflow: 'auto' }}>
              <div className="hm" style={{ minWidth: 560, gridTemplateColumns: 'minmax(96px,1.6fr) repeat(10,minmax(34px,1fr))' }}>
                <div></div>
                {M.slice(0, NOW).map(m => <div key={m} className="mut">{m}</div>)}
                {D.map(d => (
                  <Fragment key={d.n}>
                    <div style={{ textAlign: 'left' }}><b>{d.n}</b></div>
                    {d.a.map((v, i) => {
                      const r = v / (d.b / 12), cl = r > 1.1 ? 'red' : r > 1 ? 'amber' : r < .8 ? 'teal' : 'blue', p = Math.round(Math.min(60, Math.abs(r - .9) * 120 + 15));
                      return <div key={i} style={{ background: `color-mix(in srgb,var(--${cl}) ${p}%,transparent)` }} title={`${Math.round(r * 100)}% of monthly budget`}>{Math.round(v / 1e3)}K</div>;
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
          <br />
          <div className="card"><h2>Variance &amp; budget editor</h2><p className="mut">Edit a budget, then press Apply.</p>
            <div style={{ overflow: 'auto' }}>
              <table>
                <thead><tr><th>Department</th><th>Annual budget (Rs)</th><th>Spent YTD</th><th>Expected by Oct</th><th>Variance</th><th>Var %</th><th>Year-end forecast</th><th>Status</th></tr></thead>
                <tbody>{D.map((d, i) => { const s = S(d, c), v = s.y - s.p; return (
                  <tr key={d.n}>
                    <td><b>{d.n}</b></td>
                    <td><input type="number" value={bv[i] ?? ''} onChange={e => setBv(bv.map((x, j) => j === i ? e.target.value : x))} /></td>
                    <td>{R(s.y)}</td><td>{R(s.p)}</td>
                    <td className={v > 0 ? 'bad' : 'good'}>{v > 0 ? '+' : ''}{R(v)}</td>
                    <td className={v > 0 ? 'bad' : 'good'}>{s.pv.toFixed(1)}%</td>
                    <td>{R(s.f)}</td><td><Status d={d} c={c} /></td>
                  </tr>); })}</tbody>
              </table>
            </div>
            <p><button className="btn" onClick={applyB}>Apply budgets</button></p>
          </div>
        </section>

        <section className={pg('fo')}>
          <div className="g e2">
            <div className="card"><h2>What-if simulator</h2><p className="mut">Compare forecasting methods and test Nov–Dec spending.</p>
              <label>Forecasting method</label>
              <select value={method} onChange={e => setMethod(e.target.value)}>
                <option value="sma">Simple moving average (last 3 months)</option>
                <option value="wma">Weighted moving average (recent months matter more)</option>
                <option value="exp">Exponential smoothing</option>
              </select>
              <div style={{ display: method === 'exp' ? 'block' : 'none' }}>
                <label>Alpha (weight on latest actual): <b>{alpha.toFixed(1)}</b></label>
                <input type="range" min="0.1" max="0.9" step="0.1" value={alpha} onChange={e => setAlpha(+e.target.value)} />
              </div>
              <p className="fn">{NOTES[method]}</p>
              <label>Change in monthly spending for Nov–Dec: <b>{(sc > 0 ? '+' : '') + sc + '%'}</b></label>
              <input type="range" min="-30" max="50" step="5" value={sc} onChange={e => setSc(+e.target.value)} />
              <div className="g e2" style={{ marginTop: 16 }}>
                <div><div className="lb">PROJECTED YEAR-END SPEND</div><div className="v">{K(f)}</div></div>
                <div><div className="lb">VS TOTAL BUDGET</div><div className={'v ' + (f <= b ? 'good' : 'bad')}>{(f <= b ? '+' : '-') + K(Math.abs(b - f)) + (f <= b ? ' spare' : ' over')}</div></div>
              </div>
            </div>
            <div className="card"><h2>Action plan</h2><div><Insights list={insights(D, L, c)} /></div></div>
          </div>
          <div className="card"><h2>Department forecast</h2>
            <div style={{ overflow: 'auto' }}>
              <table>
                <thead><tr><th>Department</th><th>Budget</th><th>Forecast</th><th>Gap</th><th>Monthly change needed</th></tr></thead>
                <tbody>{D.map(d => { const s = S(d, c); return (
                  <tr key={d.n}><td><b>{d.n}</b></td><td>{R(d.b)}</td><td>{R(s.f)}</td><td className={s.g < 0 ? 'bad' : 'good'}>{R(s.g)}</td><td>{s.g < 0 ? 'Cut ' + R(-s.g / (12 - NOW)) + ' / month' : 'None needed'}</td></tr>); })}</tbody>
              </table>
            </div>
          </div>
        </section>

        <section className={pg('ex')}>
          <div className="card"><h2>Expense Detective</h2><p className="mut">Flags duplicates, outliers and round figures. Upload a CSV to test.</p>
            <div className="g e2">
              <div><label>Upload CSV (invoice, dept, description, amount, date)</label><input type="file" accept=".csv,text/csv" onChange={e => up(e.target)} /></div>
              <div style={{ paddingTop: 20 }}><button className="btn s" onClick={() => imp(SAMPLE)}>Try sample upload</button> <span className="mut">{um}</span></div>
            </div>
            <div style={{ overflow: 'auto' }}>
              <table>
                <thead><tr><th>Invoice</th><th>Dept</th><th>Description</th><th>Amount</th><th>Risk</th><th>Why flagged</th></tr></thead>
                <tbody>{scan(L).map((x, i) => (
                  <tr key={i}><td>{x.inv}</td><td>{x.dept}</td><td>{x.desc}</td><td>{R(x.amt)}</td>
                    <td><Badge t={x.r ? x.r + '/100' : 'Clear'} c={x.r >= 50 ? 'red' : x.r ? 'amber' : 'green'} /></td>
                    <td className="mut">{x.w.join(', ') || '—'}</td></tr>))}</tbody>
              </table>
            </div>
            <p className="fn">Flags need review. They are not proof of fraud.</p>
          </div>
        </section>

        <section className={pg('ap')}>
          <div className="g e2">
            <div className="card"><h2>Request extra budget</h2>
              <label>Department</label>
              <select value={rd || D[0].n} onChange={e => setRd(e.target.value)}>{D.map(d => <option key={d.n}>{d.n}</option>)}</select>
              <label>Amount (Rs)</label><input type="number" min="1" placeholder="e.g. 50000" value={ra} onChange={e => setRa(e.target.value)} />
              <label>Reason</label><textarea rows={3} value={rr} onChange={e => setRr(e.target.value)} />
              <p><button className="btn" onClick={sub}>Submit</button> <span className="mut">{rm}</span></p>
            </div>
            <div className="card"><h2>Approval workflow</h2>
              <div>{RQ.length ? RQ.map(r => {
                const s = S(D.find(x => x.n === r.d), c), n = s.g + r.a;
                return (
                  <div key={r.id} style={{ padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{r.d} · {R(r.a)}</b><Badge t={r.s} c={r.s === 'Pending' ? 'amber' : r.s === 'Approved' ? 'green' : 'red'} /></div>
                    <div className="mut">{r.r}</div>
                    {r.s === 'Pending' && <>
                      <div className="mut">Year-end gap now {R(s.g)} → after approval {R(n)}</div>
                      <p><button className="btn gr" onClick={() => dec(r.id, 1)}>Approve</button> <button className="btn r" onClick={() => dec(r.id, 0)}>Reject</button></p>
                    </>}
                  </div>);
              }) : <p className="mut">No requests.</p>}</div>
            </div>
          </div>
        </section>

        <section className={pg('as')}>
          <div className="card"><h2>✦ BudgetIQ Assistant</h2><p className="mut">Rule-based answers from your live data.</p>
            <div className="chips">{['Board summary', 'Year-end forecast', 'Duplicate invoices', 'How can we save?'].map(t => <button key={t} onClick={() => ask(t)}>{t}</button>)}</div>
            <div className="chat" ref={chatRef}>
              <div className="bub">Hello! I answer from your live numbers. Pick a prompt above or type a question.</div>
              {chat.map((m, i) => <Fragment key={i}><div className="bub u">{m.q}</div><div className="bub">{m.a}</div></Fragment>)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="Ask about your budget…" value={ci} onChange={e => setCi(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(); }} />
              <button className="btn" onClick={() => ask()}>Send</button>
            </div>
          </div>
        </section>

        <section className={pg('gu')}>
          <div className="g e2">
            <div className="card"><h2>Project purpose</h2><p>BudgetIQ is a budget monitoring and decision-support prototype. It helps an organisation compare planned budgets with actual expenses, estimate year-end spending and identify transactions that may need review.</p><h2 style={{ marginTop: 18 }}>Main users</h2><ul><li>Finance manager: monitors organisation-wide spending.</li><li>Department manager: checks department budget performance.</li><li>Approver: reviews requests for additional funds.</li><li>Analyst: investigates unusual transactions.</li></ul></div>
            <div className="card"><h2>Key calculations</h2><p><b>Budget variance</b><br />Actual spending − Planned spending for the same period. A positive result means spending is above the planned pace.</p><p><b>Variance percentage</b><br />(Actual − Planned) ÷ Planned × 100.</p><p><b>Year-end forecast</b><br />Actual spending so far + Forecast monthly spending × Remaining months.</p><p><b>Budget utilisation</b><br />Actual spending ÷ Annual budget × 100.</p></div>
            <div className="card"><h2>Forecasting methods</h2><p><b>Simple moving average:</b> averages the latest three months equally. Useful when demand or spending is relatively stable.</p><p><b>Weighted moving average:</b> gives more importance to recent months. Useful when recent spending patterns are more relevant.</p><p><b>Exponential smoothing:</b> updates a forecast using alpha. A higher alpha reacts faster to recent changes.</p></div>
            <div className="card"><h2>How to use the demo</h2><ol><li>Review organisation and department KPIs on Overview.</li><li>Change annual budgets in Variance and press Apply budgets.</li><li>Choose a forecasting method and test spending changes in Forecast.</li><li>Upload a CSV or try the sample in Expense Detective.</li><li>Submit and review additional budget requests in Approvals.</li><li>Export a CSV report for further analysis.</li></ol></div>
            <div className="card"><h2>Important limitations</h2><ul><li>The supplied figures are fictional demonstration data, not real company accounts.</li><li>Expense flags are warning signals, not proof of fraud.</li><li>The assistant uses predefined, rule-based responses; it is not a generative AI model.</li><li>Forecasts assume recent spending patterns continue and may not capture seasonality or one-off events.</li><li>Browser storage is local to this device and browser; this prototype has no shared database or login security.</li></ul></div>
            <div className="card"><h2>Suggested project evaluation</h2><p>Test the system by changing a department budget, switching forecasting methods, uploading a duplicate invoice and submitting an approval request. Check whether the dashboard updates and whether the resulting advice makes sense.</p><p className="mut">Academic note: explain the assumptions behind each calculation and discuss where human review is still required.</p></div>
          </div>
        </section>
        <p className="fn">Not a substitute for audited financial records.</p>
      </main>
    </div>
  );
}
