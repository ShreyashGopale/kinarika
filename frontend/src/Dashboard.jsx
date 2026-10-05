import React, { Component, useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, IndianRupee, Smartphone, Wallet,
  Receipt, Plus, ArrowUpRight, ArrowDownRight,
  Calendar, Package, X, List, RefreshCw
} from 'lucide-react';


// Error Boundary – prevents a blank screen if a child component throws during render
// (e.g. Chart.js / flatpickr init failing in a production build)
class DashboardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: '100%', overflowY: 'auto', background: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif" }}>
          <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem', textAlign: 'center' }}>
            <h2 style={{ color: '#ef4444', marginBottom: '.5rem' }}>Something went wrong</h2>
            <p style={{ color: '#64748b', fontSize: '.85rem', marginBottom: '1rem' }}>
              The dashboard failed to load. Please refresh the page or try again later.
            </p>
            <pre style={{
              background: '#1e293b', color: '#ef4444', padding: '.75rem', borderRadius: '8px',
              fontSize: '.7rem', maxWidth: '100%', overflowX: 'auto', textAlign: 'left'
            }}>{this.state.error?.message || String(this.state.error)}</pre>
            <button
              style={{ marginTop: '1rem', padding: '.6rem 1.2rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '.85rem' }}
              onClick={() => window.location.reload()}
            >Reload Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/themes/light.css';
import api from './api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,   // explicitly register controllers (needed in production builds)
  LineController,
  Title,
  Tooltip,
  Legend
);

const fmt = (val) =>
  '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(val || 0);

/* ─── inline design tokens (safe from global CSS conflicts) ─── */
const C = {
  white: '#ffffff',
  bg: '#f8fafc',
  border: '#e2e8f0',
  dark: '#0f172a',
  dark2: '#1e293b',
  muted: '#64748b',
  light: '#94a3b8',
  primary: '#6366f1',
  primaryLight: '#eef2ff',
  green: '#10b981',
  greenLight: '#ecfdf5',
  greenBorder: '#a7f3d0',
  amber: '#f59e0b',
  amberLight: '#fffbeb',
  rose: '#f43f5e',
  roseLight: '#fff1f2',
  roseBorder: '#fecdd3',
  indigo: '#4f46e5',
  indigoLight: '#eef2ff',
  indigoBorder: '#c7d2fe',
  shadow: '0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04)',
  shadowMd: '0 4px 6px -1px rgba(0,0,0,.10), 0 2px 4px -2px rgba(0,0,0,.10)',
  shadowLg: '0 10px 15px -3px rgba(0,0,0,.10), 0 4px 6px -4px rgba(0,0,0,.10)',
};

const r = { sm: '6px', md: '10px', lg: '12px', xl: '16px', '2xl': '20px', '3xl': '24px', full: '9999px' };

function Dashboard({ dashStats, expenses, addExpense, newExpense, setNewExpense, refreshDashboard }) {
  const [reportStart, setReportStart] = useState(new Date(Date.now() - 13 * 86400000));
  const [reportEnd, setReportEnd] = useState(new Date());
  const [expStart, setExpStart] = useState(new Date(Date.now() - 6 * 86400000));
  const [expEnd, setExpEnd] = useState(new Date());
  const [periodData, setPeriodData] = useState({ chart_data: [], items_data: [], summary: { total_sales: 0, total_profit: 0, total_expenses: 0 } });
  const [addModal, setAddModal] = useState(false);
  const [logModal, setLogModal] = useState(false);

  useEffect(() => {
    const start = reportStart.toISOString().split('T')[0];
    const end = reportEnd.toISOString().split('T')[0];
    api.get(`dashboard/?start_date=${start}&end_date=${end}`)
      .then(r => {
        if (r.data?.period) {
          setPeriodData({
            chart_data: Array.isArray(r.data.period.chart_data) ? r.data.period.chart_data : [],
            items_data: Array.isArray(r.data.period.items_data) ? r.data.period.items_data : [],
            summary: {
              total_sales: r.data.period.summary?.total_sales || 0,
              total_profit: r.data.period.summary?.total_profit || 0,
              total_expenses: r.data.period.summary?.total_expenses || 0,
            }
          });
        }
      })
      .catch(console.error);
  }, [reportStart, reportEnd]);

  const today = dashStats?.today || { total: 0, upi: 0, cash: 0, upi_count: 0, cash_count: 0, expenses: 0, trend_percentage: 0, is_positive: true };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newExpense.name || !newExpense.price) return;
    await addExpense();
    setAddModal(false);
    refreshDashboard();
  };

  const chartData = useMemo(() => {
    const list = Array.isArray(periodData?.chart_data) ? periodData.chart_data : [];
    return {
      labels: list.map(d => d?.date || ''),
      datasets: [
        { type: 'line', label: 'Sales', data: list.map(d => d?.sales || 0), borderColor: C.primary, backgroundColor: 'rgba(99,102,241,.08)', borderWidth: 2.5, fill: true, tension: 0.4, pointRadius: 0 },
        { type: 'bar',  label: 'Profit', data: list.map(d => d?.profit || 0), backgroundColor: C.green, borderRadius: 4, barThickness: 10 },
        { type: 'line', label: 'Expenses', data: list.map(d => d?.expenses || 0), borderColor: C.rose, borderWidth: 2.5, fill: false, tension: 0.4, pointRadius: 0 },
      ]
    };
  }, [periodData]);

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: C.white, titleColor: C.dark2, bodyColor: C.muted, borderColor: C.border, borderWidth: 1, padding: 10, boxPadding: 4, callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: C.muted, font: { size: 11 } } },
      y: { grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { color: C.muted, font: { size: 11 }, callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) } }
    }
  };

  const filteredExp = (Array.isArray(expenses) ? expenses : []).filter(e => {
    if (!e?.timestamp) return false;
    const d = new Date(e.timestamp).getTime();
    return d >= new Date(expStart).setHours(0,0,0,0) && d <= new Date(expEnd).setHours(23,59,59,999);
  });

  /* ─── styles ─── */
  const S = {
    page:     { height: '100%', overflowY: 'auto', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif", scrollbarWidth: 'none' },
    inner:    { maxWidth: '900px', margin: '0 auto', padding: '1rem' },
    // header
    header:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' },
    h1:       { fontSize: '1.35rem', fontWeight: 900, color: C.dark2, letterSpacing: '-.02em', margin: 0 },
    sub:      { fontSize: '.75rem', color: C.muted, fontWeight: 500, marginTop: '2px' },
    refreshBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2.2rem', height: '2.2rem', border: `1px solid ${C.border}`, borderRadius: r.lg, background: C.white, cursor: 'pointer', color: C.muted, flexShrink: 0 },
    // section heading
    secHead:  { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' },
    secIcon:  (bg, color) => ({ width: '2rem', height: '2rem', borderRadius: r.lg, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }),
    secTitle: { fontSize: '.95rem', fontWeight: 800, color: C.dark2, margin: 0 },
    // stat cards row
    cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '.7rem', marginBottom: '1.25rem' },
    // dark total card
    totalCard: { gridColumn: '1/-1', background: C.dark2, borderRadius: r['2xl'], padding: '1rem 1.1rem', position: 'relative', overflow: 'hidden' },
    totalLabel: { fontSize: '.72rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' },
    totalAmt:  { fontSize: '1.85rem', fontWeight: 900, color: C.white, marginBottom: '10px', letterSpacing: '-.02em' },
    trendBadge: (pos) => ({ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: r.full, background: pos ? 'rgba(16,185,129,.15)' : 'rgba(244,63,94,.15)', color: pos ? '#34d399' : '#fb7185', border: `1px solid ${pos ? 'rgba(16,185,129,.3)' : 'rgba(244,63,94,.3)'}` }),
    // small stat cards
    statCard:  { background: C.white, border: `1px solid ${C.border}`, borderRadius: r['2xl'], padding: '.85rem', boxShadow: C.shadow },
    statIconWrap: (bg, color) => ({ width: '2.2rem', height: '2.2rem', borderRadius: r.lg, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, marginBottom: '.6rem' }),
    statLabel: { fontSize: '.72rem', fontWeight: 600, color: C.muted, marginBottom: '3px' },
    statAmt:  { fontSize: '1.25rem', fontWeight: 900, color: C.dark2 },
    statBadge: { fontSize: '.68rem', fontWeight: 700, color: C.muted, background: C.bg, padding: '2px 8px', borderRadius: r.full, display: 'inline-block', marginTop: '4px' },
    // expense card extra
    addBtn:    { width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.roseLight, border: 'none', borderRadius: r.full, cursor: 'pointer', color: C.rose, marginLeft: 'auto' },
    // reports section
    reports:   { background: C.white, border: `1px solid ${C.border}`, borderRadius: r['2xl'], padding: '1rem', boxShadow: C.shadow, marginBottom: '1rem' },
    reportHdr: { display: 'flex', flexDirection: 'column', gap: '.65rem', marginBottom: '1rem', paddingBottom: '.85rem', borderBottom: `1px solid ${C.border}` },
    dateWrap:  { position: 'relative', width: '100%' },
    dateInput: { width: '100%', paddingLeft: '2rem', paddingRight: '.75rem', paddingTop: '.5rem', paddingBottom: '.5rem', border: `1px solid ${C.border}`, borderRadius: r.lg, fontSize: '.8rem', fontWeight: 600, color: C.dark2, background: C.white, outline: 'none', cursor: 'pointer', fontFamily: 'inherit' },
    dateIcon:  { position: 'absolute', left: '.6rem', top: '50%', transform: 'translateY(-50%)', color: C.primary, pointerEvents: 'none' },
    // chart area
    chartGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1rem' },
    chartWrap:  { height: '220px', width: '100%' },
    // summary mini cards
    sumCards:  { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.5rem' },
    sumCard:  (bg, border) => ({ background: bg, border: `1px solid ${border}`, borderRadius: r.xl, padding: '.65rem .75rem' }),
    sumLabel:  (color) => ({ fontSize: '.65rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '4px' }),
    sumAmt:    (color) => ({ fontSize: '.95rem', fontWeight: 900, color }),
    // table
    tableWrap: { overflowX: 'auto', borderRadius: r.xl, border: `1px solid ${C.border}` },
    table:     { width: '100%', borderCollapse: 'collapse', minWidth: '420px', fontSize: '.8rem' },
    th:        { padding: '.65rem .85rem', textAlign: 'left', fontWeight: 700, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.04em', color: C.muted, background: C.bg, borderBottom: `1px solid ${C.border}` },
    td:        { padding: '.65rem .85rem', borderBottom: `1px solid ${C.bg}`, color: C.dark2, fontWeight: 600 },
    // modal overlay
    overlay:   { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
    modalCard: { background: C.white, borderRadius: r['2xl'], padding: '1.25rem', width: '100%', maxWidth: '22rem', boxShadow: C.shadowLg, position: 'relative' },
    modalCardLg: { background: C.white, borderRadius: r['2xl'], padding: '1.25rem', width: '100%', maxWidth: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: C.shadowLg, position: 'relative' },
    closeBtn:  { position: 'absolute', top: '1rem', right: '1rem', background: C.bg, border: 'none', borderRadius: r.full, width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.muted },
    modalH2:   { fontSize: '1rem', fontWeight: 800, color: C.dark2, margin: '0 0 .2rem' },
    modalSub:  { fontSize: '.75rem', color: C.muted, marginBottom: '1.1rem' },
    label:     { display: 'block', fontSize: '.75rem', fontWeight: 700, color: C.dark2, marginBottom: '.35rem' },
    inputFld:  { width: '100%', padding: '.6rem .85rem', border: `1.5px solid ${C.border}`, borderRadius: r.lg, fontSize: '.875rem', fontFamily: 'inherit', outline: 'none', background: C.white, marginBottom: '.85rem', color: C.dark2 },
    submitBtn: { width: '100%', padding: '.75rem', background: C.rose, color: C.white, border: 'none', borderRadius: r.lg, fontWeight: 700, fontSize: '.875rem', cursor: 'pointer', fontFamily: 'inherit' },
    // expense log list
    expRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.7rem .85rem', borderBottom: `1px solid ${C.bg}` },
    expName:   { fontWeight: 700, fontSize: '.85rem', color: C.dark2 },
    expDate:   { fontSize: '.7rem', color: C.muted, marginTop: '2px' },
    expAmt:    { fontWeight: 800, fontSize: '.95rem', color: C.rose },
    logScroll: { flex: 1, overflowY: 'auto', scrollbarWidth: 'none' },
  };

  const rankColors = [
    { bg: '#fef3c7', color: '#92400e' },
    { bg: '#f1f5f9', color: '#475569' },
    { bg: '#ffedd5', color: '#9a3412' },
  ];

  return (
    <div style={S.page}>
      <div style={S.inner}>

        {/* ── HEADER ── */}
        <div style={S.header}>
          <div>
            <h1 style={S.h1}>Business Overview</h1>
            <p style={S.sub}>Daily collections, expenses &amp; historical reports</p>
          </div>
          <button style={S.refreshBtn} onClick={refreshDashboard} title="Refresh"><RefreshCw size={15}/></button>
        </div>

        {/* ── TODAY CARDS ── */}
        <div style={{ ...S.secHead }}>
          <div style={S.secIcon(C.greenLight, C.green)}><IndianRupee size={16}/></div>
          <p style={S.secTitle}>Today's Income &amp; Expenses</p>
        </div>

        <div style={S.cardGrid}>
          {/* Total Collections – full width */}
          <div style={S.totalCard}>
            <div style={{ position: 'absolute', right: '-20px', top: '-20px', width: '100px', height: '100px', background: 'rgba(255,255,255,.05)', borderRadius: '50%' }}/>
            <p style={S.totalLabel}>Total Collections</p>
            <p style={S.totalAmt}>{fmt(today.total)}</p>
            <span style={S.trendBadge(today.is_positive)}>
              {today.is_positive ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
              {today.is_positive ? '+' : ''}{today.trend_percentage}% vs Yesterday
            </span>
          </div>

          {/* UPI */}
          <div style={S.statCard}>
            <div style={S.statIconWrap('#eef2ff', C.indigo)}><Smartphone size={16}/></div>
            <p style={S.statLabel}>UPI &amp; Online</p>
            <p style={S.statAmt}>{fmt(today.upi)}</p>
            <span style={S.statBadge}>{today.upi_count} txns</span>
          </div>

          {/* Cash */}
          <div style={S.statCard}>
            <div style={S.statIconWrap(C.amberLight, C.amber)}><Wallet size={16}/></div>
            <p style={S.statLabel}>Cash</p>
            <p style={S.statAmt}>{fmt(today.cash)}</p>
            <span style={S.statBadge}>{today.cash_count} txns</span>
          </div>

          {/* Expenses – clickable */}
          <div style={{ ...S.statCard, gridColumn: '1/-1', cursor: 'pointer' }} onClick={() => setLogModal(true)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={S.statIconWrap(C.roseLight, C.rose)}><Receipt size={16}/></div>
                <p style={{ ...S.statLabel, marginBottom: 0 }}>Today's Expenses</p>
              </div>
              <button
                style={S.addBtn}
                onClick={e => { e.stopPropagation(); setAddModal(true); }}
                title="Add Expense"
              >
                <Plus size={14}/>
              </button>
            </div>
            <p style={{ ...S.statAmt, fontSize: '1.5rem' }}>{fmt(today.expenses)}</p>
            <span style={{ ...S.statBadge, color: C.rose }}>Tap to view log →</span>
          </div>
        </div>

        {/* ── CUSTOM REPORTS ── */}
        <div style={S.reports}>
          <div style={S.reportHdr}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={S.secIcon(C.indigoLight, C.indigo)}><TrendingUp size={16}/></div>
              <div>
                <p style={{ ...S.secTitle, marginBottom: '2px' }}>Custom Reports</p>
                <p style={{ fontSize: '.72rem', color: C.muted }}>Sales, Profit &amp; Expenses by date range</p>
              </div>
            </div>
            <div style={S.dateWrap}>
              <Flatpickr
                options={{ mode: 'range', dateFormat: 'M j, Y', defaultDate: [reportStart, reportEnd] }}
                onChange={([s, e]) => { if (s && e) { setReportStart(s); setReportEnd(e); } }}
                style={S.dateInput}
                placeholder="Select Date Range"
              />
              <Calendar size={14} style={S.dateIcon}/>
            </div>
          </div>

          {/* Period summary mini cards */}
          <div style={{ ...S.sumCards, marginBottom: '1rem' }}>
            <div style={S.sumCard(C.indigoLight, C.indigoBorder)}>
              <p style={S.sumLabel(C.indigo)}>Sales</p>
              <p style={S.sumAmt(C.indigo)}>{fmt(periodData?.summary?.total_sales || 0)}</p>
            </div>
            <div style={S.sumCard(C.greenLight, C.greenBorder)}>
              <p style={S.sumLabel(C.green)}>Profit</p>
              <p style={S.sumAmt(C.green)}>{fmt(periodData?.summary?.total_profit || 0)}</p>
            </div>
            <div style={S.sumCard(C.roseLight, C.roseBorder)}>
              <p style={S.sumLabel(C.rose)}>Expenses</p>
              <p style={S.sumAmt(C.rose)}>{fmt(periodData?.summary?.total_expenses || 0)}</p>
            </div>
          </div>

          {/* Chart */}
          <div style={S.chartWrap}>
            <Chart type="bar" data={chartData} options={chartOpts}/>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '.65rem', marginBottom: '1.25rem', justifyContent: 'center' }}>
            {[['Sales', C.primary], ['Profit', C.green], ['Expenses', C.rose]].map(([label, color]) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '.72rem', fontWeight: 600, color: C.muted }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: color, display: 'inline-block' }}/>
                {label}
              </span>
            ))}
          </div>

          {/* Item Performance Table */}
          <div style={{ ...S.secHead, marginBottom: '.75rem' }}>
            <div style={S.secIcon('#f3e8ff', '#7c3aed')}><Package size={16}/></div>
            <p style={S.secTitle}>Item Performance</p>
          </div>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>#</th>
                  <th style={S.th}>Item</th>
                  <th style={{ ...S.th, textAlign: 'center' }}>Qty</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {(!periodData?.items_data || periodData.items_data.length === 0) ? (
                  <tr><td colSpan="4" style={{ ...S.td, textAlign: 'center', color: C.muted, padding: '1.5rem' }}>No sales data for this period.</td></tr>
                ) : (periodData?.items_data || []).map((item, i) => {
                  const rc = rankColors[i] || { bg: C.bg, color: C.muted };
                  return (
                    <tr key={i}>
                      <td style={S.td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1.6rem', height: '1.6rem', borderRadius: r.md, background: rc.bg, color: rc.color, fontWeight: 800, fontSize: '.75rem' }}>
                          {i + 1}
                        </span>
                      </td>
                      <td style={S.td}>{item.name}</td>
                      <td style={{ ...S.td, textAlign: 'center' }}>
                        <span style={{ background: C.indigoLight, color: C.indigo, padding: '2px 10px', borderRadius: r.full, fontWeight: 700, fontSize: '.75rem' }}>{item.qty}</span>
                      </td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{fmt(item.revenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* bottom breathing room for nav bar */}
        <div style={{ height: '1rem' }}/>
      </div>

      {/* ── ADD EXPENSE MODAL ── */}
      {addModal && (
        <div style={S.overlay} onClick={() => setAddModal(false)}>
          <div style={S.modalCard} onClick={e => e.stopPropagation()}>
            <button style={S.closeBtn} onClick={() => setAddModal(false)}><X size={15}/></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
              <div style={{ ...S.statIconWrap(C.roseLight, C.rose), marginBottom: 0 }}><Receipt size={16}/></div>
              <div>
                <p style={S.modalH2}>Record Expense</p>
                <p style={{ ...S.modalSub, marginBottom: 0 }}>Add a new expense for today</p>
              </div>
            </div>
            <form onSubmit={handleAdd}>
              <label style={S.label}>Description</label>
              <input
                type="text" required
                placeholder="e.g. Vegetables, Gas bill"
                value={newExpense.name}
                onChange={e => setNewExpense({ ...newExpense, name: e.target.value })}
                style={S.inputFld}
              />
              <label style={S.label}>Amount (₹)</label>
              <input
                type="number" required min="1"
                placeholder="0"
                value={newExpense.price}
                onChange={e => setNewExpense({ ...newExpense, price: e.target.value })}
                style={{ ...S.inputFld, marginBottom: '1.1rem' }}
              />
              <button type="submit" style={S.submitBtn}>Save Expense</button>
            </form>
          </div>
        </div>
      )}

      {/* ── EXPENSE LOG MODAL ── */}
      {logModal && (
        <div style={S.overlay} onClick={() => setLogModal(false)}>
          <div style={S.modalCardLg} onClick={e => e.stopPropagation()}>
            <button style={S.closeBtn} onClick={() => setLogModal(false)}><X size={15}/></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '.75rem' }}>
              <div style={{ ...S.statIconWrap(C.roseLight, C.rose), marginBottom: 0 }}><List size={16}/></div>
              <div>
                <p style={S.modalH2}>Expense Log</p>
                <p style={{ ...S.modalSub, marginBottom: 0 }}>All recorded outgoings</p>
              </div>
            </div>
            {/* date filter */}
            <div style={{ ...S.dateWrap, marginBottom: '.75rem' }}>
              <Flatpickr
                options={{ mode: 'range', dateFormat: 'M j, Y', defaultDate: [expStart, expEnd] }}
                onChange={([s, e]) => { if (s && e) { setExpStart(s); setExpEnd(e); } }}
                style={S.dateInput}
                placeholder="Filter by dates"
              />
              <Calendar size={13} style={S.dateIcon}/>
            </div>
            <div style={S.logScroll}>
              {filteredExp.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: C.muted }}>
                  <Receipt size={32} style={{ opacity: .2, marginBottom: '.5rem' }}/>
                  <p style={{ fontSize: '.85rem' }}>No expenses for this period.</p>
                </div>
              ) : (
                [...filteredExp]
                  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                  .map(exp => (
                    <div key={exp.id} style={S.expRow}>
                      <div>
                        <p style={S.expName}>{exp.item_name}</p>
                        <p style={S.expDate}>{new Date(exp.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                      <p style={S.expAmt}>{fmt(exp.purchase_price)}</p>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardWithBoundary(props) {
  return (
    <DashboardErrorBoundary>
      <Dashboard {...props} />
    </DashboardErrorBoundary>
  );
}
