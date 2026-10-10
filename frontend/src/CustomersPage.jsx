import React, { useState, useEffect } from 'react';
import { Search, Users, Gift, List, X } from 'lucide-react';
import api from './api';

/**
 * Customers tab – search a customer by their 10-digit mobile
 * number to see their bills (horizontal cards) and loyalty
 * points. No data is shown until a complete number is searched.
 */
export default function CustomersPage() {
  const [phone, setPhone] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');   // all | veg | non-veg
  const [actionFilter, setActionFilter] = useState('all'); // all | earned | redeemed

  const runSearch = async (p) => {
    const num = (p || '').trim();
    if (!/^\d{10}$/.test(num)) {
      setError('Enter a complete 10-digit mobile number');
      setData(null);
      setSearched(false);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.get(`customers/${num}/`);
      setData(res.data);
      setSearched(true);
    } catch (err) {
      setData(null);
      setSearched(true);
      setError(err.response?.status === 404
        ? 'No customer found with this number'
        : 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  };

  // Auto-search as soon as a full 10-digit number is entered
  useEffect(() => {
    if (/^\d{10}$/.test(phone.trim())) {
      runSearch(phone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const onKey = (e) => { if (e.key === 'Enter') runSearch(phone); };

  const vegRows = (data?.loyalty_history || []).filter(
    h => h.type === 'veg' && (actionFilter === 'all' || h.action === actionFilter)
  );
  const nonvegRows = (data?.loyalty_history || []).filter(
    h => h.type === 'non-veg' && (actionFilter === 'all' || h.action === actionFilter)
  );
  const showVeg = typeFilter === 'all' || typeFilter === 'veg';
  const showNonveg = typeFilter === 'all' || typeFilter === 'non-veg';
  const anyRows = (showVeg && vegRows.length > 0) || (showNonveg && nonvegRows.length > 0);

  const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div className="page">
      <div className="page__scroll">
        {/* header */}
        <div className="page__header">
          <div className="flex items-center justify-between">
            <h1>Customers</h1>
            <div style={S.secIconWrap}><Users size={16} /></div>
          </div>
          <p className="text-xs text-muted">Search by mobile number to view bills &amp; loyalty</p>
        </div>

        {/* search bar – the only input; no data until a full number is entered */}
        <div className="search-wrap mb-1">
          <Search className="search-wrap__icon" size={17} />
          <input
            className="input"
            placeholder="Enter 10-digit mobile number…"
            value={phone}
            inputMode="numeric"
            maxLength={10}
            onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
            onKeyDown={onKey}
          />
          {phone && (
            <button style={S.clearBtn} onClick={() => { setPhone(''); setData(null); setSearched(false); setError(''); }}>
              <X size={15} />
            </button>
          )}
        </div>
        {loading && <p className="text-xs text-muted" style={{ textAlign: 'center' }}>Loading…</p>}
        {error && <p className="text-xs" style={{ color: 'var(--danger)', textAlign: 'center' }}>{error}</p>}

        {/* empty state – nothing shown until searched */}
        {!searched && !loading && (
          <div className="empty-state">
            <Users size={40} style={{ opacity: .2, marginBottom: '.5rem' }} />
            <p>Enter a customer's mobile number</p>
          </div>
        )}

        {/* customer profile */}
        {data && (
          <>
            <div style={S.profileCard}>
              <div className="flex items-center justify-between">
                <div>
                  <p style={S.customerName}>{data.name || 'Customer'}</p>
                  <p className="text-xs text-muted">{data.phone_number}</p>
                </div>
                <button className="btn btn--primary btn--sm" onClick={() => setLoyaltyOpen(true)}>
                  <Gift size={14} /> Check Loyalty Points
                </button>
              </div>
              <div className="flex gap-sm" style={{ marginTop: '.6rem' }}>
                <div style={S.pointsChip('#f0fdf4')}>
                  <span className="text-xs text-muted">Veg Points</span>
                  <span className="fw-900" style={{ color: 'var(--success)' }}>{data.loyalty.veg_points}</span>
                </div>
                <div style={S.pointsChip('#fff1f2')}>
                  <span className="text-xs text-muted">Non-Veg Points</span>
                  <span className="fw-900" style={{ color: 'var(--danger)' }}>{data.loyalty.nonveg_points}</span>
                </div>
              </div>
            </div>

            {/* orders heading */}
            <div style={S.secHead}>
              <div style={S.secIcon('#eff6ff', 'var(--info)')}><List size={16} /></div>
              <p style={S.secTitle}>Recent Orders</p>
            </div>

            {/* horizontal order cards */}
            <div style={S.cardRow}>
              {data.orders.length === 0 ? (
                <p className="text-xs text-muted">No completed orders yet.</p>
              ) : data.orders.map(o => (
                <div key={o.id} style={S.orderCard}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="fw-800" style={{ fontSize: '.9rem' }}>{o.order_number}</span>
                    <span className="text-xs text-muted">{fmtDate(o.completed_at)}</span>
                  </div>
                  {o.table_name && <p className="text-xs text-muted mb-1">📍 {o.table_name}</p>}
                  <div style={{ margin: '.5rem 0', borderTop: '1px solid var(--border)', paddingTop: '.4rem' }}>
                    {o.items.map((it, i) => (
                      <div key={i} className="flex justify-between text-xs" style={{ padding: '2px 0' }}>
                        <span>
                          {it.quantity}× {it.name_snapshot}
                          {it.is_loyalty_eligible ? ' ⭐' : ''}
                          {it.is_free_redemption ? ' (free)' : ''}
                        </span>
                        <span className="fw-700">₹{(parseFloat(it.price_snapshot) * it.quantity).toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                  {o.free_thali_adjustment > 0 && (
                    <div className="flex justify-between text-xs" style={{ color: 'var(--warning)' }}>
                      <span>Free Thali Adj</span><span>-₹{parseFloat(o.free_thali_adjustment).toFixed(0)}</span>
                    </div>
                  )}
                  {o.discount_amount > 0 && (
                    <div className="flex justify-between text-xs" style={{ color: 'var(--danger)' }}>
                      <span>Discount</span><span>-₹{parseFloat(o.discount_amount).toFixed(0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between" style={{ borderTop: '1px solid var(--border)', paddingTop: '.4rem', marginTop: '.3rem' }}>
                    <span className="fw-700 text-sm">Total</span>
                    <span className="fw-900">₹{parseFloat(o.final_total).toFixed(0)}</span>
                  </div>
                  {o.payment && <p className="text-xs text-muted" style={{ marginTop: '.25rem' }}>Paid via {o.payment.method}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Loyalty points popup */}
      {loyaltyOpen && data && (
        <div className="modal" onClick={() => setLoyaltyOpen(false)}>
          <div className="modal__card" onClick={e => e.stopPropagation()} style={{ maxWidth: '34rem' }}>
            <h2 className="mb-2 flex items-center gap-sm"><Gift size={18} /> Loyalty Points</h2>

            {/* points summary */}
            <div className="flex gap-sm mb-2">
              <div style={S.pointsSummary('#f0fdf4', '#bbf7d0')}>
                <p className="text-xs text-muted">Veg Points</p>
                <p className="fw-900" style={{ fontSize: '1.4rem', color: 'var(--success)' }}>{data.loyalty.veg_points}</p>
              </div>
              <div style={S.pointsSummary('#fff1f2', '#fecdd3')}>
                <p className="text-xs text-muted">Non-Veg Points</p>
                <p className="fw-900" style={{ fontSize: '1.4rem', color: 'var(--danger)' }}>{data.loyalty.nonveg_points}</p>
              </div>
            </div>

            {/* filters */}
            <div className="flex gap-sm mb-1">
              <button className={`btn btn--sm flex-1 ${typeFilter === 'all' ? 'btn--primary' : 'btn--outline'}`} onClick={() => setTypeFilter('all')}>All</button>
              <button className={`btn btn--sm flex-1 ${typeFilter === 'veg' ? 'btn--success' : 'btn--outline'}`} onClick={() => setTypeFilter('veg')}>🟢 Veg</button>
              <button className={`btn btn--sm flex-1 ${typeFilter === 'non-veg' ? 'btn--danger' : 'btn--outline'}`} onClick={() => setTypeFilter('non-veg')}>🔴 Non-Veg</button>
            </div>
            <div className="flex gap-sm mb-2">
              <button className={`btn btn--sm flex-1 ${actionFilter === 'all' ? 'btn--primary' : 'btn--outline'}`} onClick={() => setActionFilter('all')}>All</button>
              <button className={`btn btn--sm flex-1 ${actionFilter === 'earned' ? 'btn--success' : 'btn--outline'}`} onClick={() => setActionFilter('earned')}>Earned</button>
              <button className={`btn btn--sm flex-1 ${actionFilter === 'redeemed' ? 'btn--warning' : 'btn--outline'}`} onClick={() => setActionFilter('redeemed')}>Redeemed</button>
            </div>

            {/* table – veg section first, then non-veg */}
            <div style={{ maxHeight: '15rem', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                <thead>
                  <tr>
                    <th style={S.th}>Dish</th>
                    <th style={S.th}>Date</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {showVeg && (
                    <>
                      <tr>
                        <td colSpan="3" style={S.groupRow('#f0fdf4', 'var(--success)')}>
                          🟢 Veg · {data.loyalty.veg_points} points
                        </td>
                      </tr>
                      {vegRows.map((h, i) => (
                        <tr key={`v${i}`}>
                          <td style={S.td}>🟢 {h.dish}{h.action === 'redeemed' ? ' (free)' : ''}</td>
                          <td style={S.td}>{fmtDate(h.date)}</td>
                          <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: h.points >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {h.points >= 0 ? '+' : ''}{h.points}
                          </td>
                        </tr>
                      ))}
                      {vegRows.length === 0 && (
                        <tr><td colSpan="3" style={S.emptyCell}>No veg activity.</td></tr>
                      )}
                    </>
                  )}
                  {showNonveg && (
                    <>
                      <tr>
                        <td colSpan="3" style={S.groupRow('#fff1f2', 'var(--danger)')}>
                          🔴 Non-Veg · {data.loyalty.nonveg_points} points
                        </td>
                      </tr>
                      {nonvegRows.map((h, i) => (
                        <tr key={`n${i}`}>
                          <td style={S.td}>🔴 {h.dish}{h.action === 'redeemed' ? ' (free)' : ''}</td>
                          <td style={S.td}>{fmtDate(h.date)}</td>
                          <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: h.points >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {h.points >= 0 ? '+' : ''}{h.points}
                          </td>
                        </tr>
                      ))}
                      {nonvegRows.length === 0 && (
                        <tr><td colSpan="3" style={S.emptyCell}>No non-veg activity.</td></tr>
                      )}
                    </>
                  )}
                  {!anyRows && (
                    <tr><td colSpan="3" style={S.emptyCell}>No loyalty activity for this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <button className="btn btn--outline btn--full" style={{ marginTop: '.75rem' }} onClick={() => setLoyaltyOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  secIconWrap: { width: '2.2rem', height: '2.2rem', borderRadius: 'var(--r-xl)', background: '#eff6ff', color: 'var(--info)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  clearBtn: { position: 'absolute', right: '.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer' },
  profileCard: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-2xl)', padding: '1rem', marginBottom: '1rem', boxShadow: 'var(--shadow-sm)' },
  customerName: { fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 },
  secHead: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '.75rem' },
  secIcon: (bg, color) => ({ width: '2rem', height: '2rem', borderRadius: 'var(--r-xl)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }),
  secTitle: { fontSize: '.95rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 },
  cardRow: { display: 'flex', gap: '1rem', overflowX: 'auto', padding: '.25rem', scrollbarWidth: 'none' },
  orderCard: { minWidth: '16rem', maxWidth: '16rem', flexShrink: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-2xl)', padding: '1rem', boxShadow: 'var(--shadow-sm)' },
  pointsChip: (bg) => ({ flex: 1, background: bg, borderRadius: 'var(--r-xl)', padding: '.5rem .75rem', display: 'flex', flexDirection: 'column', gap: '2px' }),
  pointsSummary: (bg, border) => ({ flex: 1, background: bg, border: `1px solid ${border}`, borderRadius: 'var(--r-xl)', padding: '.65rem', textAlign: 'center' }),
  th: { padding: '.5rem', textAlign: 'left', fontWeight: 700, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-light)', borderBottom: '1px solid var(--border)' },
  td: { padding: '.5rem', borderBottom: '1px solid var(--bg)', color: 'var(--text-main)', fontWeight: 600 },
  groupRow: (bg, color) => ({ padding: '.5rem', background: bg, fontWeight: 800, color, fontSize: '.72rem' }),
  emptyCell: { textAlign: 'center', padding: '1rem', color: 'var(--text-light)' },
};
