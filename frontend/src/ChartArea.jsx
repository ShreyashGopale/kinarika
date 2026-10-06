/**
 * ChartArea – contains the heavy Chart.js + Flatpickr rendering logic.
 * This file is dynamically imported by Dashboard.jsx so that the ~150KB
 * Chart.js / Flatpickr bundles are only loaded when the Dashboard tab
 * is actually opened, keeping the initial app bundle small and fast.
 */
import React, { useMemo } from 'react';
import { Calendar, Package } from 'lucide-react';
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

// Register Chart.js components (controllers are required in production builds
// – dev mode registers them implicitly via ESM side-effects)
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  Title,
  Tooltip,
  Legend
);

export default function ChartArea({
  periodData,
  reportStart, reportEnd,
  setReportStart, setReportEnd,
  C, S, r, fmt,
}) {
  const list = Array.isArray(periodData?.chart_data) ? periodData.chart_data : [];

  const chartData = useMemo(() => ({
    labels: list.map(d => d?.date || ''),
    datasets: [
      { type: 'line', label: 'Sales', data: list.map(d => d?.sales || 0), borderColor: C.primary, backgroundColor: 'rgba(99,102,241,.08)', borderWidth: 2.5, fill: true, tension: 0.4, pointRadius: 0 },
      { type: 'bar',  label: 'Profit', data: list.map(d => d?.profit || 0), backgroundColor: C.green, borderRadius: 4, barThickness: 10 },
      { type: 'line', label: 'Expenses', data: list.map(d => d?.expenses || 0), borderColor: C.rose, borderWidth: 2.5, fill: false, tension: 0.4, pointRadius: 0 },
    ]
  }), [list, C]);

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

  return (
    <>
      <div style={S.reports}>
        <div style={S.reportHdr}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={S.secIcon(C.indigoLight, C.indigo)}><Package size={16}/></div>
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
                const rankColors = [
                  { bg: '#fef3c7', color: '#92400e' },
                  { bg: '#f1f5f9', color: '#475569' },
                  { bg: '#ffedd5', color: '#9a3412' },
                ];
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
    </>
  );
}
