import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import api from './api';
import {
  Home, LayoutGrid, UtensilsCrossed, ShoppingCart, List,
  Plus, Minus, Search, X, Check, LogOut, Trash2, RefreshCw,
  Ticket, CreditCard, Banknote, Smartphone, ClipboardList,
  ToggleLeft, ToggleRight, ArrowLeft, Clock, Phone, Gift,
  Receipt, Printer, Eye, Edit2, MessageCircle, Bluetooth, Settings,
  Users
} from 'lucide-react';

import Dashboard from './Dashboard';
import CustomersPage from './CustomersPage';
import ErrorBoundary from './ErrorBoundary';

// Helper: safely parse a number, returning 0 instead of NaN for invalid input
const safeParseFloat = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};
const safeParseInt = (val) => {
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
};

const getApiError = (err, fallback = 'Something went wrong') => {
  const d = err?.response?.data;
  if (typeof d === 'string' && d.trim()) return d;
  if (d && typeof d === 'object') {
    if (typeof d.error === 'string' && d.error) return d.error;
    if (typeof d.detail === 'string' && d.detail) return d.detail;
    if (typeof d.message === 'string' && d.message) return d.message;
    try {
      const parts = Object.values(d)
        .flat()
        .map(v => (typeof v === 'string' ? v : (v && typeof v === 'object' ? JSON.stringify(v) : String(v))))
        .filter(Boolean);
      if (parts.length) return parts.join(', ');
    } catch (_) {}
  }
  if (err?.response?.status) return `${fallback} (${err.response.status})`;
  if (err?.message) return err.message;
  return fallback;
};

// ════════════════════════════════════════════════════════════
//  MAIN APP
// ════════════════════════════════════════════════════════════

export default function App() {
  // --- simple session cache (per device/session) to reduce refetching ---
  const CACHE_TTL = 5 * 60 * 1000;
  const cacheGet = (key, maxAge = CACHE_TTL) => {
    try {
      const raw = sessionStorage.getItem(`kinarika:${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.ts !== 'number') return null;
      if (Date.now() - parsed.ts > maxAge) return null;
      return parsed.data;
    } catch { return null; }
  };
  const cacheSet = (key, data) => {
    try { sessionStorage.setItem(`kinarika:${key}`, JSON.stringify({ ts: Date.now(), data })); } catch {}
  };
  const cacheClear = (...keys) => {
    try { keys.forEach(k => sessionStorage.removeItem(`kinarika:${k}`)); } catch {}
  };

  // --- auth state ---
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginUser, setLoginUser] = useState('kinarika');
  const [loginPass, setLoginPass] = useState('weservehealthy');

  // --- navigation ---
  const [tab, setTab] = useState('tables');

  // --- data from server ---
  const [tables, setTables] = useState([]);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [dashStats, setDashStats] = useState({ total_revenue_today: 0, completed_orders_today: 0, active_orders: 0 });

  // --- menu browsing ---
  const [activeCat, setActiveCat] = useState('');
  const [search, setSearch] = useState('');
  const [vegOnly, setVegOnly] = useState(false);

  // --- cart (local before sending to server) ---
  const [cart, setCart] = useState([]);

  // --- ordering context ---
  // When ordering for a table: { type:'dine-in', tableName:'Table 1' }
  // When ordering a token:     { type:'token' }
  // null when just browsing
  const [orderContext, setOrderContext] = useState(null);

  // --- modals ---
  const [addTableModal, setAddTableModal] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [billingOrder, setBillingOrder] = useState(null);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [billingDiscount, setBillingDiscount] = useState('0');
  const [billingMethod, setBillingMethod] = useState('CASH');
  const [billingPhone, setBillingPhone] = useState('');
  const [billingLoyalty, setBillingLoyalty] = useState(null);
  const [billingFreeVeg, setBillingFreeVeg] = useState(0);
  const [billingFreeNV, setBillingFreeNV] = useState(0);
  // FREETHALI coupon state
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [freeItemIds, setFreeItemIds] = useState([]);

  // --- add items to existing order modal ---
  const [addItemsOrder, setAddItemsOrder] = useState(null);
  const openAddItemsToOrder = (order) => {
    setAddItemsOrder(order);
  };
  const [addItemsCart, setAddItemsCart] = useState([]);
  const [addItemsSearch, setAddItemsSearch] = useState('');
  const [addItemsVegOnly, setAddItemsVegOnly] = useState(false);

  const addToAddItemsCart = (item) => {
    setAddItemsCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { id: item.id, name: item.name, price: parseFloat(item.price), qty: 1 }];
    });
  };

  const changeAddItemsQty = (id, delta) => {
    setAddItemsCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c).filter(c => c.qty > 0));
  };

  const submitAddItemsToOrder = async () => {
    if (!addItemsOrder || addItemsCart.length === 0) return;
    try {
      await api.post(`orders/${addItemsOrder.id}/add-items/`, { items: addItemsCart.map(c => ({ menu_item_id: c.id, quantity: c.qty })) });
      setAddItemsOrder(null);
      setAddItemsCart([]);
      await Promise.all([refreshOrders(), refreshTables()]);
    } catch (err) { console.error(err); alert(getApiError(err, 'Failed to add items')); }
  };

  // --- set menu ---
  const [allMenuItems, setAllMenuItems] = useState([]);
  const [setMenuSearch, setSetMenuSearch] = useState('');
  const [setMenuVegOnly, setSetMenuVegOnly] = useState(false);
  const [setMenuActiveCat, setSetMenuActiveCat] = useState('');
  const [addItemModal, setAddItemModal] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', price: '', item_type: 'veg', category_id: '', category_name: '', is_loyalty_eligible: false });
  const [editItemModal, setEditItemModal] = useState(false);
  const [editItemState, setEditItemState] = useState(null);

  // --- add items to existing order ---

  // --- expenses ---
  const [expenses, setExpenses] = useState([]);
  const [expensesModal, setExpensesModal] = useState(false);
  const [newExpense, setNewExpense] = useState({ name: '', price: '' });

  // --- settings ---
  const [printerWidth, setPrinterWidth] = useState(parseInt(localStorage.getItem('printerWidth') || '32'));
  const [settingsModal, setSettingsModal] = useState(false);

  // --- toast ---
  const [toast, setToast] = useState('');
  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 2200); }, []);

  const categoryById = useMemo(() => {
    const m = new Map();
    (categories || []).forEach(c => m.set(c.id, c));
    return m;
  }, [categories]);

  // ── Auth ──────────────────────────────────────────────────
  useEffect(() => {
    // hydrate from session cache for instant UI, then revalidate
    const cachedCats = cacheGet('categories', 30 * 60 * 1000);
    const cachedMenu = cacheGet('menu_items', 30 * 60 * 1000);
    const cachedTables = cacheGet('tables', 60 * 1000);
    const cachedOrders = cacheGet('active_orders', 30 * 1000);
    if (cachedCats) setCategories(cachedCats);
    if (cachedMenu) setMenuItems(cachedMenu);
    if (cachedTables) setTables(cachedTables);
    if (cachedOrders) setActiveOrders(cachedOrders);

    api.get('auth/session/').then(() => { setLoggedIn(true); loadEssential(); }).catch(() => {});
  }, []);

  // ── Browser history / back-button handling ────────────────
  // Push an initial history entry so pressing back doesn't immediately
  // close the browser tab. Navigating back from the first entry shows
  // a toast prompting the user to press again to leave.
  useEffect(() => {
    // Push current state into history so we have at least one entry
    window.history.pushState({ tab: 'tables' }, '', window.location.href);
    let exitConfirm = false;

    const handlePopState = (e) => {
      if (exitConfirm) {
        // User pressed back again — allow the navigation (close/leave)
        window.removeEventListener('popstate', handlePopState);
        window.history.pushState({ tab: 'tables' }, '', window.location.href);
        window.addEventListener('popstate', handlePopState);
      } else {
        // First back press — go to Tables tab and stay
        setTab('tables');
        exitConfirm = true;
        window.history.pushState({ tab: 'tables' }, '', window.location.href);
        showToast('Press back again to exit');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showToast]);

  // ── Auto-lookup loyalty when the billing phone is complete ──
  // Keeps the FREETHALI coupon's available-points display live.
  useEffect(() => {
    const p = (billingPhone || '').trim();
    if (/^\d{10}$/.test(p)) {
      api.get(`loyalty/${p}/`)
        .then(r => setBillingLoyalty(r.data))
        .catch(() => setBillingLoyalty(null));
    }
  }, [billingPhone]);



  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await api.post('auth/login/', { username: (loginUser || '').trim(), password: (loginPass || '').trim() });
      setLoggedIn(true);
      showToast('Welcome back!');
      loadEssential();
    } catch (err) {
      const fallback = err?.response
        ? 'Invalid credentials'
        : 'Cannot connect to backend server. Please verify backend is running.';
      alert(getApiError(err, fallback));
    }
  };

  const handleLogout = async () => {
    try { await api.post('auth/logout/'); } catch {}
    setLoggedIn(false);
    setLoginUser(''); setLoginPass('');
    cacheClear('categories', 'menu_items', 'menu_items_all', 'tables', 'active_orders', 'completed_orders_today');
  };

  // ── Data loading ──────────────────────────────────────────
  const loadEssential = async () => {
    try {
      const results = await Promise.allSettled([
        api.get('menu/categories/'),
        api.get('menu/items/'),
        api.get('tables/'),
        api.get('orders/active/'),
      ]);
      const [catR, itemR, tableR, orderR] = results;
      if (catR.status === 'fulfilled' && catR.value?.data) {
        setCategories(catR.value.data);
        cacheSet('categories', catR.value.data);
        setActiveCat(prev => prev || (catR.value.data[0]?.name || ''));
      }
      if (itemR.status === 'fulfilled' && itemR.value?.data) {
        setMenuItems(itemR.value.data);
        cacheSet('menu_items', itemR.value.data);
      }
      if (tableR.status === 'fulfilled' && tableR.value?.data) {
        setTables(tableR.value.data);
        cacheSet('tables', tableR.value.data);
      }
      if (orderR.status === 'fulfilled' && orderR.value?.data) {
        setActiveOrders(orderR.value.data);
        cacheSet('active_orders', orderR.value.data);
      }
    } catch (err) { console.error(err); }
  };

  // Full refresh including dashboard/inventory (used by dashboard/expenses tab)
  const loadAll = async () => {
    try {
      const results = await Promise.allSettled([
        api.get('menu/categories/'),
        api.get('menu/items/'),
        api.get('tables/'),
        api.get('orders/active/'),
        api.get('dashboard/'),
        api.get('inventory/'),
      ]);
      const [catR, itemR, tableR, orderR, dashR, expR] = results;
      if (catR.status === 'fulfilled' && catR.value?.data) {
        setCategories(catR.value.data);
        cacheSet('categories', catR.value.data);
        setActiveCat(prev => prev || (catR.value.data[0]?.name || ''));
      }
      if (itemR.status === 'fulfilled' && itemR.value?.data) {
        setMenuItems(itemR.value.data);
        cacheSet('menu_items', itemR.value.data);
      }
      if (tableR.status === 'fulfilled' && tableR.value?.data) {
        setTables(tableR.value.data);
        cacheSet('tables', tableR.value.data);
      }
      if (orderR.status === 'fulfilled' && orderR.value?.data) {
        setActiveOrders(orderR.value.data);
        cacheSet('active_orders', orderR.value.data);
      }
      if (dashR.status === 'fulfilled' && dashR.value?.data) setDashStats(dashR.value.data);
      if (expR.status === 'fulfilled' && expR.value?.data) setExpenses(expR.value.data);
    } catch (err) { console.error(err); }
  };

  const refreshTables = async () => {
    try {
      const r = await api.get('tables/');
      setTables(r.data);
      cacheSet('tables', r.data);
    } catch {}
  };
  const refreshOrders = async (opts = {}) => {
    const { includeDashboard = false } = opts;
    try {
      const reqs = [api.get('orders/active/')];
      if (includeDashboard) reqs.push(api.get('dashboard/'));
      const [o, d] = await Promise.all(reqs);
      setActiveOrders(o.data);
      cacheSet('active_orders', o.data);
      if (d?.data) setDashStats(d.data);
    } catch {}
  };

   const addExpense = async () => {
    if (!newExpense.name.trim() || !newExpense.price) return;
    try {
      const price = safeParseFloat(newExpense.price);
      if (price <= 0) { alert('Please enter a valid amount.'); return; }
      const payload = { item_name: newExpense.name, purchase_price: price };
      await api.post('inventory/', payload);
      setNewExpense({ name: '', price: '' });
      const [dashR, expR] = await Promise.all([api.get('dashboard/'), api.get('inventory/')]);
      setDashStats(dashR.data); setExpenses(expR.data);
      showToast('Expense added');
    } catch (err) { alert(getApiError(err, 'Failed to add expense')); }
  };

  // ── Set Menu ──────────────────────────────────────────────
  const openSetMenu = async () => {
    setTab('setmenu');
    setSetMenuSearch('');
    if (allMenuItems.length === 0) {
      const cachedAll = cacheGet('menu_items_all', 30 * 60 * 1000);
      if (cachedAll) setAllMenuItems(cachedAll);
    }
    try {
      const res = await api.get('menu/items/all/');
      setAllMenuItems(res.data);
      cacheSet('menu_items_all', res.data);
    } catch (err) { console.error(err); }
  };

  const toggleItem = async (itemId) => {
    try {
      const res = await api.patch(`menu/items/${itemId}/toggle/`);
      const updated = res.data;
      // Update local state so the toggle is instant
      setAllMenuItems(prev => {
        const next = prev.map(i => i.id === itemId ? { ...i, is_active: updated.is_active } : i);
        cacheSet('menu_items_all', next);
        return next;
      });
      setMenuItems(prev => {
        let next;
        if (updated.is_active) {
          const exists = prev.some(i => i.id === updated.id);
          next = exists ? prev.map(i => i.id === updated.id ? updated : i) : [...prev, updated];
        } else {
          next = prev.filter(i => i.id !== updated.id);
        }
        cacheSet('menu_items', next);
        return next;
      });
    } catch (err) { console.error(err); }
  };

  const addNewItem = async () => {
    if (!newItem.name.trim() || !newItem.price) {
      alert('Please enter dish name and price.');
      return;
    }
    if (!newItem.category_id && !newItem.category_name.trim()) {
      alert('Please select or type a category.');
      return;
    }
    try {
      const price = safeParseFloat(newItem.price);
      if (price <= 0) { alert('Please enter a valid price.'); return; }
      const payload = {
        name: newItem.name.trim(),
        price,
        item_type: newItem.item_type,
        is_loyalty_eligible: newItem.is_loyalty_eligible,
      };
      if (newItem.category_id) {
        payload.category_id = safeParseInt(newItem.category_id);
      } else {
        payload.category_name = newItem.category_name.trim();
      }
      const res = await api.post('menu/items/create/', payload);
      const created = res.data;

      setAllMenuItems(prev => { const next = [...prev, created]; cacheSet('menu_items_all', next); return next; });
      if (created.is_active) {
        setMenuItems(prev => { const next = [...prev, created]; cacheSet('menu_items', next); return next; });
      }
      // refresh categories only if a new one may have been created
      if (payload.category_name) {
        api.get('menu/categories/').then(catRes => { setCategories(catRes.data); cacheSet('categories', catRes.data); }).catch(() => {});
      }

      setNewItem({ name: '', price: '', item_type: 'veg', category_id: '', category_name: '', is_loyalty_eligible: false });
      setAddItemModal(false);
      showToast('New dish added!');
    } catch (err) {
      alert(getApiError(err, 'Failed to add item'));
    }
  };

  const updateItem = async () => {
    if (!editItemState.name.trim() || !editItemState.price) {
      alert('Name and price are required.'); return;
    }
    try {
      const price = safeParseFloat(editItemState.price);
      if (price <= 0) { alert('Please enter a valid price.'); return; }
      const payload = {
        name: editItemState.name.trim(),
        price,
        item_type: editItemState.item_type,
        category_id: editItemState.category_id ? safeParseInt(editItemState.category_id) : undefined,
        is_loyalty_eligible: editItemState.is_loyalty_eligible
      };
      const res = await api.patch(`menu/items/${editItemState.id}/edit/`, payload);
      const updated = res.data;
      setAllMenuItems(prev => { const next = prev.map(i => i.id === updated.id ? updated : i); cacheSet('menu_items_all', next); return next; });
      setMenuItems(prev => {
        let next;
        if (updated.is_active) {
          const exists = prev.some(i => i.id === updated.id);
          next = exists ? prev.map(i => i.id === updated.id ? updated : i) : [...prev, updated];
        } else {
          next = prev.filter(i => i.id !== updated.id);
        }
        cacheSet('menu_items', next);
        return next;
      });
      setEditItemModal(false);
      showToast('Dish updated!');
    } catch (err) { alert(getApiError(err, 'Failed to update dish')); }
  };

  const deleteMenuItem = async (itemId) => {
    if (!confirm('Delete this item from the menu? This cannot be undone.')) return;
    try {
      await api.delete(`menu/items/${itemId}/delete/`);
      setAllMenuItems(prev => { const next = prev.filter(i => i.id !== itemId); cacheSet('menu_items_all', next); return next; });
      setMenuItems(prev => { const next = prev.filter(i => i.id !== itemId); cacheSet('menu_items', next); return next; });
      showToast('Item deleted');
    } catch (err) {
      alert(getApiError(err, 'Failed to delete item'));
    }
  };

  const addTable = async () => {
    const name = newTableName.trim();
    if (!name) return;
    try {
      await api.post('tables/', { name });
      setNewTableName(''); setAddTableModal(false);
      refreshTables();
      showToast(`${name} added`);
    } catch (err) { alert(getApiError(err, 'Error')); }
  };

  const deleteTable = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this table?')) return;
    try {
      await api.delete(`tables/${id}/`);
      setTables(prev => { const next = prev.filter(t => t.id !== id); cacheSet('tables', next); return next; });
      showToast('Table removed');
    } catch (err) { alert(getApiError(err, 'Cannot delete')); }
  };

  const openTableOrder = (table) => {
    setOrderContext({ type: 'dine-in', tableName: table.name, activeOrderId: table.active_order_id });
    setCart([]);
    setTab('menu');
  };

  const startTokenOrder = () => {
    setOrderContext({ type: 'token' });
    setCart([]);
    setTab('menu');
  };

  // ── Cart ──────────────────────────────────────────────────
  const addToCart = (item) => {
    setCart(prev => {
      const found = prev.find(c => c.id === item.id);
      if (found) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { id: item.id, name: item.name, price: safeParseFloat(item.price), item_type: item.item_type, qty: 1 }];
    });
    showToast(`+ ${item.name}`);
  };

  const changeQty = (id, delta) => {
    setCart(prev => prev.map(c => {
      if (c.id !== id) return c;
      const nq = c.qty + delta;
      return nq <= 0 ? null : { ...c, qty: nq };
    }).filter(Boolean));
  };

  const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  // ── Place order (send cart → backend) ─────────────────────
  const placeOrder = async () => {
    if (cart.length === 0) return;
    try {
      let orderId;

      if (orderContext?.activeOrderId) {
        // Table already has an active order → append items
        orderId = orderContext.activeOrderId;
      } else {
        // Create a brand-new order
        const res = await api.post('orders/', {
          order_type: orderContext?.type || 'token',
          table_name: orderContext?.type === 'dine-in' ? orderContext.tableName : null,
        });
        orderId = res.data.id;
      }

      // Send cart items
      const payload = cart.map(c => ({ menu_item_id: c.id, quantity: c.qty }));
      await api.post(`orders/${orderId}/items/`, { items: payload });

      setCart([]);
      setOrderContext(null);
      setTab('orders');
      showToast('Order placed!');
      await Promise.all([refreshOrders(), refreshTables()]);
    } catch (err) {
      console.error(err);
      alert(getApiError(err, 'Failed to place order'));
    }
  };

  // ── Billing ───────────────────────────────────────────────
  const openBilling = (order) => {
    setBillingOrder(order);
    setBillingDiscount('0');
    setBillingMethod('CASH');
    setBillingPhone('');
    setBillingLoyalty(null);
    setBillingFreeVeg(0);
    setBillingFreeNV(0);
    setCouponInput('');
    setCouponCode('');
    setFreeItemIds([]);
  };

  // Apply the FREETHALI coupon – enables picking loyalty
  // dishes to give away for free (10 points per thali).
  const applyCoupon = () => {
    const code = (couponInput || '').trim().toUpperCase();
    if (code !== 'FREETHALI') {
      alert('Invalid coupon code.');
      return;
    }
    const hasLoyaltyItems = (billingOrder?.items || []).some(i => i.is_loyalty_eligible);
    if (!hasLoyaltyItems) {
      alert('No loyalty-eligible (⭐) dishes in this bill.');
      return;
    }
    if (!billingPhone.trim()) {
      alert('Enter the customer phone number to use FREETHALI.');
      return;
    }
    setCouponCode('FREETHALI');
    showToast('FREETHALI applied — pick free dishes');
  };

  const toggleFreeItem = (id) => {
    setFreeItemIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const lookupLoyalty = async () => {
    if (!billingPhone || billingPhone.length < 10) return;
    try {
      const res = await api.get(`loyalty/${billingPhone}/`);
      setBillingLoyalty(res.data);
      showToast('Customer found!');
    } catch {
      setBillingLoyalty(null);
      showToast('New customer');
    }
  };

  const completeBill = async () => {
    if (!billingOrder) return;
    try {
      const couponApplied = couponCode.trim().toUpperCase() === 'FREETHALI';
      const res = await api.post(`billing/${billingOrder.id}/complete/`, {
        discount_percentage: safeParseFloat(billingDiscount),
        payment_method: billingMethod,
        use_free_veg: couponApplied ? 0 : billingFreeVeg,
        use_free_nonveg: couponApplied ? 0 : billingFreeNV,
        phone_number: billingPhone.trim(),
        free_item_ids: couponApplied ? freeItemIds : [],
      });
      const completedOrder = (res.data && res.data.id) ? res.data : (await api.get(`orders/${billingOrder.id}/`)).data;
      setReceiptOrder(completedOrder);
      setBillingOrder(null);
      setTab('orders');
      showToast(res.data?.whatsapp?.sent ? 'Bill completed ✓ · WhatsApp sent' : 'Bill completed ✓');
      if (res.data?.loyalty) {
        setBillingLoyalty({
          free_veg_balance: res.data.loyalty.free_veg_balance,
          free_nonveg_balance: res.data.loyalty.free_nonveg_balance,
          veg_paid_count: res.data.loyalty.veg_paid_count,
          nonveg_paid_count: res.data.loyalty.nonveg_paid_count,
        });
      }
      await Promise.all([refreshOrders(), refreshTables()]);
    } catch (err) { alert(getApiError(err, 'Billing error')); }
  };

  // ── History ────────────────────────────────────────────────
  const loadHistory = async () => {
    const cached = cacheGet('completed_orders_today', 60 * 1000);
    if (cached && completedOrders.length === 0) setCompletedOrders(cached);
    try {
      const res = await api.get('orders/completed/');
      setCompletedOrders(res.data);
      cacheSet('completed_orders_today', res.data);
    } catch (err) { console.error(err); }
  };

  // ── Menu filtering (debounced for smoother typing) ─────────
  const debouncedSearch = useDebounce(search, 250);
  const debouncedSetMenuSearch = useDebounce(setMenuSearch, 250);

  const filtered = useMemo(() => {
    const q = (debouncedSearch || '').toLowerCase();
    return menuItems.filter(i => {
      if (vegOnly && i.item_type !== 'veg') return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [menuItems, debouncedSearch, vegOnly]);

  const visibleCats = useMemo(() => {
    const set = new Set();
    filtered.forEach(i => {
      const c = categoryById.get(i.category);
      if (c) set.add(c.name);
    });
    return [...set];
  }, [filtered, categoryById]);

  const shownItems = useMemo(() => {
    if (debouncedSearch || vegOnly || activeCat === '') return filtered;
    return filtered.filter(i => {
      const c = categoryById.get(i.category);
      return c && c.name === activeCat;
    });
  }, [filtered, debouncedSearch, vegOnly, activeCat, categoryById]);

  // ════════════════════════════════════════════════════════
  //  RENDER – LOGIN
  // ════════════════════════════════════════════════════════
  if (!loggedIn) {
    return (
      <div className="login">
        <div className="login__card">
          <h1 className="login__title">HOTEL KINARIKA</h1>
          <p className="login__sub">Veg & Non-Veg · Point of Sale</p>
          <form className="login__form" onSubmit={handleLogin}>
            <input className="input" placeholder="Username" value={loginUser} onChange={e => setLoginUser(e.target.value)} required />
            <input className="input" type="password" placeholder="Password" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
            <button type="submit" className="btn btn--primary btn--full" style={{ padding: '1rem', fontSize: '1rem' }}>
              LOGIN <Check size={18} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  //  PAGES
  // ════════════════════════════════════════════════════════

  // ── 1. TABLES PAGE ────────────────────────────────────
  const TablesPage = () => (
    <div className="page">
      <div className="page__header">
        <div className="flex items-center justify-between mb-1">
          <h1>Tables</h1>
          <div className="flex gap-sm">
            <button className="btn btn--warning btn--sm" onClick={openSetMenu}><ClipboardList size={15}/> Set Menu</button>
            <button className="btn btn--info btn--sm" onClick={startTokenOrder}><Ticket size={15}/> New Token</button>
            <button className="btn btn--icon" onClick={handleLogout}><LogOut size={16}/></button>
          </div>
        </div>
        <p className="text-xs text-muted">Tap a table to start or view its order</p>
      </div>
      <div className="page__scroll">
        <div className="table-grid">
          {tables.map(t => (
            <div
              key={t.id}
              className={`table-box ${t.has_active_order ? 'table-box--occupied' : 'table-box--free'}`}
              onClick={() => openTableOrder(t)}
            >
              {!t.has_active_order && (
                <button className="table-box__delete" onClick={(e) => deleteTable(t.id, e)}>
                  <X size={12}/>
                </button>
              )}
              <span className="table-box__name">{t.name}</span>
              <span className={`table-box__status ${t.has_active_order ? 'table-box__status--occupied' : 'table-box__status--free'}`}>
                {t.has_active_order ? t.active_order_status : 'Free'}
              </span>
            </div>
          ))}
          {/* Add-table button */}
          <div className="table-box table-box--add" onClick={() => setAddTableModal(true)}>
            <Plus size={28}/>
            <span style={{ fontSize: '.75rem', fontWeight: 600, marginTop: '.25rem' }}>Add Table</span>
          </div>
        </div>
      </div>

      {/* Add-Table Modal */}
      {addTableModal && (
        <div className="modal" onClick={() => setAddTableModal(false)}>
          <div className="modal__card" onClick={e => e.stopPropagation()}>
            <h2 className="mb-2">Add New Table</h2>
            <input className="input mb-2" placeholder="e.g. Table 9" value={newTableName} onChange={e => setNewTableName(e.target.value)} autoFocus />
            <div className="flex gap-sm">
              <button className="btn btn--outline flex-1" onClick={() => setAddTableModal(false)}>Cancel</button>
              <button className="btn btn--primary flex-1" onClick={addTable}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── SET MENU PAGE ─────────────────────────────────────
  // NOTE: no hooks may be called inside this component. It is invoked as a
  // plain function during App's render (see the main return below), so a hook
  // here would change App's hook count between tab switches and crash React
  // ("Rendered more hooks than during the previous render" → blank screen).
  // The debounced search value is therefore computed once at App level.
  const SetMenuPage = () => {
    const q = (debouncedSetMenuSearch || '').toLowerCase();
    const filteredSet = allMenuItems.filter(i => {
      if (setMenuVegOnly && i.item_type !== 'veg') return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });

    const visibleSetCats = [...new Set(filteredSet.map(i => {
      const c = categoryById.get(i.category);
      return c ? c.name : 'Other';
    }))];

    const shownSetItems = (q || setMenuVegOnly)
      ? filteredSet
      : setMenuActiveCat === ''
        ? filteredSet
        : filteredSet.filter(i => {
            const c = categoryById.get(i.category);
            const catName = c ? c.name : 'Other';
            return catName === setMenuActiveCat;
          });

    // Group items by category for rendering
    const grouped = {};
    shownSetItems.forEach(item => {
      const cat = categoryById.get(item.category);
      const catName = cat ? cat.name : 'Other';
      if (!grouped[catName]) grouped[catName] = [];
      grouped[catName].push(item);
    });

    const activeCount = allMenuItems.filter(i => i.is_active).length;

    return (
      <div className="page">
        <div className="page__scroll">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-sm">
              <button className="btn btn--icon" onClick={() => setTab('tables')}><ArrowLeft size={16}/></button>
              <h1>Set Today's Menu</h1>
            </div>
            <span className="text-xs text-muted fw-700">{activeCount}/{allMenuItems.length} active</span>
            <button className="btn btn--primary btn--sm" onClick={() => setAddItemModal(true)}><Plus size={14}/> Add Dish</button>
          </div>

          <div className="flex items-center justify-between mb-1">
            <button
              onClick={() => setSetMenuVegOnly(!setMenuVegOnly)}
              className={`btn btn--sm ${setMenuVegOnly ? 'btn--success' : 'btn--outline'}`}
            >Veg Only</button>
          </div>

          <div className="search-wrap mb-1">
            <Search className="search-wrap__icon" size={17}/>
            <input className="input" placeholder="Search items…" value={setMenuSearch} onChange={e => setSetMenuSearch(e.target.value)} />
            {setMenuSearch && <button style={{ position:'absolute', right:'.6rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-light)', cursor:'pointer' }} onClick={() => setSetMenuSearch('')}><X size={15}/></button>}
          </div>

          {!setMenuSearch && !setMenuVegOnly && visibleSetCats.length > 0 && (
            <div className="cat-tabs">
              <button className={`cat-tab ${setMenuActiveCat === '' ? 'active' : ''}`} onClick={() => setSetMenuActiveCat('')}>Full Menu</button>
              {visibleSetCats.map(c => (
                <button key={c} className={`cat-tab ${setMenuActiveCat === c ? 'active' : ''}`} onClick={() => setSetMenuActiveCat(c)}>{c}</button>
              ))}
            </div>
          )}

          {Object.keys(grouped).length === 0 ? (
            <div className="empty-state"><p>No items found</p></div>
          ) : (
            Object.entries(grouped).map(([catName, items]) => (
              <div key={catName} style={{ marginBottom: '1.25rem' }}>
                <h3 className="text-sm text-muted fw-700 mb-1" style={{ paddingLeft: '.25rem' }}>{catName}</h3>
                <div className="flex-col gap-sm">
                  {items.map(item => (
                    <div key={item.id} className="menu-row" style={{ opacity: item.is_active ? 1 : 0.5 }}>
                      <div className="menu-row__info">
                        <div className="menu-row__name">
                          <div className={`veg-dot ${item.item_type === 'veg' ? 'veg-dot--veg' : 'veg-dot--nv'}`}><div className="veg-dot__inner"/></div>
                          <h3>{item.name}{item.is_loyalty_eligible ? ' ⭐' : ''}</h3>
                        </div>
                        <span className="menu-row__price">₹{item.price}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: 0 }}>
                        <button
                          onClick={() => {
                            setEditItemState({
                              id: item.id,
                              name: item.name,
                              price: item.price,
                              item_type: item.item_type,
                              category_id: item.category || '',
                              is_loyalty_eligible: item.is_loyalty_eligible || false
                            });
                            setEditItemModal(true);
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '.25rem' }}
                          title="Edit Dish"
                        >
                          <Edit2 size={18} color="var(--text-light)" />
                        </button>
                        <button
                          onClick={() => deleteMenuItem(item.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '.25rem' }}
                          title="Delete Dish"
                        >
                          <Trash2 size={18} color="var(--danger)" />
                        </button>
                        <button
                          onClick={() => toggleItem(item.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '.25rem' }}
                          title={item.is_active ? 'Remove from today\'s menu' : 'Add to today\'s menu'}
                        >
                          {item.is_active
                            ? <ToggleRight size={26} color="var(--success)" />
                            : <ToggleLeft size={26} color="var(--text-light)" />
                          }
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add New Item Modal */}
        {addItemModal && (
          <div className="modal" onClick={() => setAddItemModal(false)}>
            <div className="modal__card" onClick={e => e.stopPropagation()}>
              <h2 className="mb-2">Add New Dish</h2>

              <label className="text-xs text-muted fw-700">Dish Name</label>
              <input className="input mb-2" placeholder="e.g. Chicken Curry" value={newItem.name}
                onChange={e => setNewItem({ ...newItem, name: e.target.value })} autoFocus />

              <label className="text-xs text-muted fw-700">Price (₹)</label>
              <input className="input mb-2" type="number" min="1" placeholder="e.g. 250" value={newItem.price}
                onChange={e => setNewItem({ ...newItem, price: e.target.value })} />

              <label className="text-xs text-muted fw-700">Type</label>
              <div className="flex gap-sm mb-2">
                <button className={`btn btn--sm flex-1 ${newItem.item_type === 'veg' ? 'btn--success' : 'btn--outline'}`}
                  onClick={() => setNewItem({ ...newItem, item_type: 'veg' })}>🟢 Veg</button>
                <button className={`btn btn--sm flex-1 ${newItem.item_type === 'non-veg' ? 'btn--danger' : 'btn--outline'}`}
                  onClick={() => setNewItem({ ...newItem, item_type: 'non-veg' })}>🔴 Non-Veg</button>
              </div>

              <div className="flex items-center gap-sm mb-2" style={{ marginTop: '.5rem' }}>
                <input type="checkbox" id="newLoyaltyCheck" checked={newItem.is_loyalty_eligible} 
                  onChange={e => setNewItem({ ...newItem, is_loyalty_eligible: e.target.checked })} />
                <label htmlFor="newLoyaltyCheck" className="text-sm fw-700">Loyalty Program Eligible (Thali)</label>
              </div>

              <label className="text-xs text-muted fw-700">Category</label>
              <select className="input mb-1" value={newItem.category_id}
                onChange={e => setNewItem({ ...newItem, category_id: e.target.value, category_name: '' })}>
                <option value="">-- Select existing --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-xs text-muted mb-1" style={{ textAlign: 'center' }}>or type a new category</p>
              <input className="input mb-2" placeholder="e.g. Chinese" value={newItem.category_name}
                onChange={e => setNewItem({ ...newItem, category_name: e.target.value, category_id: '' })} />

              <div className="flex gap-sm">
                <button className="btn btn--outline flex-1" onClick={() => setAddItemModal(false)}>Cancel</button>
                <button className="btn btn--primary flex-1" onClick={addNewItem}><Plus size={15}/> Add</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Item Modal */}
        {editItemModal && editItemState && (
          <div className="modal" onClick={() => setEditItemModal(false)}>
            <div className="modal__card" onClick={e => e.stopPropagation()}>
              <h2 className="mb-2">Edit Dish</h2>

              <label className="text-xs text-muted fw-700">Dish Name</label>
              <input className="input mb-2" placeholder="e.g. Chicken Curry" value={editItemState.name}
                onChange={e => setEditItemState({ ...editItemState, name: e.target.value })} autoFocus />

              <label className="text-xs text-muted fw-700">Price (₹)</label>
              <input className="input mb-2" type="number" min="1" placeholder="e.g. 250" value={editItemState.price}
                onChange={e => setEditItemState({ ...editItemState, price: e.target.value })} />

              <label className="text-xs text-muted fw-700">Type</label>
              <div className="flex gap-sm mb-2">
                <button className={`btn btn--sm flex-1 ${editItemState.item_type === 'veg' ? 'btn--success' : 'btn--outline'}`}
                  onClick={() => setEditItemState({ ...editItemState, item_type: 'veg' })}>🟢 Veg</button>
                <button className={`btn btn--sm flex-1 ${editItemState.item_type === 'non-veg' ? 'btn--danger' : 'btn--outline'}`}
                  onClick={() => setEditItemState({ ...editItemState, item_type: 'non-veg' })}>🔴 Non-Veg</button>
              </div>

              <label className="text-xs text-muted fw-700">Category</label>
              <select className="input mb-2" value={editItemState.category_id}
                onChange={e => setEditItemState({ ...editItemState, category_id: e.target.value })}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <div className="flex items-center gap-sm mb-2" style={{ marginTop: '.5rem' }}>
                <input type="checkbox" id="editLoyaltyCheck" checked={editItemState.is_loyalty_eligible} 
                  onChange={e => setEditItemState({ ...editItemState, is_loyalty_eligible: e.target.checked })} />
                <label htmlFor="editLoyaltyCheck" className="text-sm fw-700">Loyalty Program Eligible (Thali)</label>
              </div>

              <div className="flex gap-sm">
                <button className="btn btn--outline flex-1" onClick={() => setEditItemModal(false)}>Cancel</button>
                <button className="btn btn--primary flex-1" onClick={updateItem}><Check size={15}/> Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── 2. MENU PAGE (used for both table & token ordering) ─
  const MenuPage = () => (
    <div className="page">
      <div className="page__scroll">
        {/* Context banner */}
        {orderContext && (
          <div className="flex items-center justify-between mb-1" style={{ background: 'var(--primary-light)', padding: '.45rem .75rem', borderRadius: 'var(--r-xl)', marginBottom: '.75rem' }}>
            <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--primary-active)' }}>
              {orderContext.type === 'dine-in' ? `📍 ${orderContext.tableName}` : '🎫 Token Order'}
              {orderContext.activeOrderId ? ' (adding items)' : ''}
            </span>
            <button style={{ background: 'none', border: 'none', color: 'var(--primary-active)', cursor: 'pointer', fontWeight: 700, fontSize: '.8rem' }}
              onClick={() => { setOrderContext(null); setCart([]); setTab('tables'); }}>
              ✕ Cancel
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-1">
          <h1>Menu</h1>
          <button
            onClick={() => setVegOnly(!vegOnly)}
            className={`btn btn--sm ${vegOnly ? 'btn--success' : 'btn--outline'}`}
          >Veg Only</button>
        </div>

        {/* Search */}
        <div className="search-wrap mb-1">
          <Search className="search-wrap__icon" size={17}/>
          <input className="input" placeholder="Search dishes…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button style={{ position: 'absolute', right: '.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer' }} onClick={() => setSearch('')}><X size={15}/></button>}
        </div>

        {/* Category tabs */}
        {!search && !vegOnly && visibleCats.length > 0 && (
          <div className="cat-tabs">
            <button className={`cat-tab ${activeCat === '' ? 'active' : ''}`} onClick={() => setActiveCat('')}>Full Menu</button>
            {visibleCats.map(c => (
              <button key={c} className={`cat-tab ${activeCat === c ? 'active' : ''}`} onClick={() => setActiveCat(c)}>{c}</button>
            ))}
          </div>
        )}

        <div className="flex-col gap-md">
          {shownItems.length === 0 ? (
            <div className="empty-state"><p>No items found</p></div>
          ) : (
            shownItems.map(item => {
              const inCart = cart.find(c => c.id === item.id);
              const isVeg = item.item_type === 'veg';
              return (
                <div key={item.id} className="menu-row">
                  <div className="menu-row__info">
                    <div className="menu-row__name">
                      <div className={`veg-dot ${isVeg ? 'veg-dot--veg' : 'veg-dot--nv'}`}><div className="veg-dot__inner"/></div>
                      <h3>{item.name}{item.is_loyalty_eligible ? ' ⭐' : ''}</h3>
                    </div>
                    <span className="menu-row__price">₹{item.price}</span>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {inCart ? (
                      <div className="qty">
                        <button className="qty__btn" onClick={() => changeQty(item.id, -1)}><Minus size={15}/></button>
                        <span className="qty__val">{inCart.qty}</span>
                        <button className="qty__btn" onClick={() => changeQty(item.id, 1)}><Plus size={15}/></button>
                      </div>
                    ) : (
                      <button className="btn btn--outline btn--sm" style={{ minWidth: '4.5rem' }} onClick={() => addToCart(item)}>ADD</button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Sticky cart bar */}
      {cartCount > 0 && (
        <div className="page__footer">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-muted fw-700">{cartCount} items</span>
            <span className="fw-900" style={{ fontSize: '1.3rem', color: 'var(--primary)' }}>₹{cartTotal}</span>
          </div>
          <button className="btn btn--primary btn--full" style={{ padding: '.85rem', fontSize: '.95rem' }} onClick={placeOrder}>
            Place Order <Check size={18}/>
          </button>
        </div>
      )}
    </div>
  );

  // ── 3. ORDERS PAGE ────────────────────────────────────
  const OrdersPage = () => (
    <div className="page">
      <div className="page__header">
        <div className="flex items-center justify-between">
          <h1>Active Orders</h1>
          <button className="btn btn--icon" onClick={refreshOrders}><RefreshCw size={16}/></button>
        </div>
      </div>
      <div className="page__scroll">
        <div className="flex-col gap-md">
          {activeOrders.length === 0 ? (
            <div className="empty-state"><List size={40} style={{ opacity: .2, marginBottom: '.5rem' }}/><p>No active orders</p></div>
          ) : (
            activeOrders.map(order => {
              const subtotal = order.items?.reduce((s, i) => s + parseFloat(i.price_snapshot) * i.quantity, 0) || 0;
              return (
                <div key={order.id} className="order-card">
                  <div className="order-card__header">
                    <div>
                      <span className="fw-700" style={{ fontSize: '1.05rem' }}>{order.order_number}</span>
                      {order.table_name && <span className="text-xs text-muted" style={{ marginLeft: '.5rem' }}>· {order.table_name}</span>}
                    </div>
                    <span className={`btn btn--sm ${order.status === 'NEW' ? 'btn--warning' : order.status === 'PREPARING' ? 'btn--info' : 'btn--success'}`} style={{ pointerEvents: 'none' }}>
                      {order.status}
                    </span>
                  </div>
                  <div className="order-card__items">
                    {order.items?.map(item => (
                      <div key={item.id} className="order-card__item">
                        <span>{item.quantity}× {item.name_snapshot}{item.is_loyalty_eligible ? ' ⭐' : ''}</span>
                        <span className="fw-700">₹{(parseFloat(item.price_snapshot) * item.quantity).toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--border)', paddingTop: '.6rem' }}>
                    <span className="fw-900" style={{ color: 'var(--primary)', fontSize: '1.1rem' }}>₹{subtotal.toFixed(0)}</span>
                  <div className="flex gap-sm">
                    <button className="btn btn--info btn--sm" onClick={() => openAddItemsToOrder(order)}>
                      <Plus size={14}/> Add Items
                    </button>
                    <button className="btn btn--danger btn--sm" onClick={async () => {
                      if (!confirm('Delete this order?')) return;
                      try {
                        await api.delete(`orders/${order.id}/`);
                        await Promise.all([refreshOrders(), refreshTables()]);
                        showToast('Order deleted');
                      } catch (err) { alert(getApiError(err, 'Failed to delete order')); }
                    }}>
                      <Trash2 size={14}/>
                    </button>
                    <button className="btn btn--primary btn--sm" onClick={() => openBilling(order)}>
                      <CreditCard size={14}/> Bill
                    </button>
                  </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );



  // ════════════════════════════════════════════════════════
  //  BILLING MODAL (with loyalty)
  // ════════════════════════════════════════════════════════
  const BillingModal = () => {
    if (!billingOrder) return null;
    const couponApplied = couponCode.trim().toUpperCase() === 'FREETHALI';
    const subtotal = billingOrder.items?.reduce((s, i) => s + parseFloat(i.price_snapshot) * i.quantity, 0) || 0;
    // FREETHALI – chosen loyalty dishes become free
    const freeItemsTotal = couponApplied
      ? (billingOrder.items || []).filter(i => freeItemIds.includes(i.id))
          .reduce((s, i) => s + parseFloat(i.price_snapshot) * i.quantity, 0)
      : 0;
    const adjusted = subtotal - freeItemsTotal;
    const disc = parseFloat(billingDiscount) || 0;
    const discAmt = (adjusted * disc) / 100;
    const final_total = adjusted - discAmt;
    const vegPoints = billingLoyalty ? (billingLoyalty.free_veg_balance * 10 + billingLoyalty.veg_paid_count) : 0;
    const nonvegPoints = billingLoyalty ? (billingLoyalty.free_nonveg_balance * 10 + billingLoyalty.nonveg_paid_count) : 0;
    const loyaltyItems = (billingOrder.items || []).filter(i => i.is_loyalty_eligible);

    return (
      <div className="modal" onClick={() => setBillingOrder(null)}>
        <div className="modal__card" onClick={e => e.stopPropagation()}>
          <h2 className="mb-2">Complete Bill – {billingOrder.order_number}</h2>

          {/* Items summary */}
          <div className="flex-col gap-sm mb-2" style={{ maxHeight: '10rem', overflowY: 'auto' }}>
            {billingOrder.items?.map(i => (
              <div key={i.id} className="flex justify-between text-sm">
                <span>{i.quantity}× {i.name_snapshot}{i.is_loyalty_eligible ? ' ⭐' : ''}</span>
                <span className="fw-700">₹{(parseFloat(i.price_snapshot) * i.quantity).toFixed(0)}</span>
              </div>
            ))}
          </div>

          {/* FREETHALI coupon */}
          <p className="text-xs text-muted fw-700 mb-1">Coupon (optional)</p>
          <div className="flex gap-sm mb-1">
            <input className="input" placeholder="FREETHALI" value={couponInput}
              onChange={e => setCouponInput(e.target.value)}
              style={{ flex: 1, textTransform: 'uppercase' }} />
            <button className="btn btn--info btn--sm" onClick={applyCoupon} disabled={couponApplied}>Apply</button>
          </div>
          {couponApplied && (
            <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning-border)', borderRadius: 'var(--r-xl)', padding: '.75rem', marginBottom: '.75rem' }}>
              <p className="text-xs fw-700 mb-1" style={{ color: 'var(--warning)' }}>FREETHALI – pick dishes to give free (10 pts each)</p>
              <p className="text-xs text-muted mb-1">Veg points: {vegPoints} · Non-veg points: {nonvegPoints}</p>
              {loyaltyItems.length === 0 && <p className="text-xs text-muted">No loyalty-eligible (⭐) dishes in this bill.</p>}
              <div className="flex-col" style={{ gap: '.35rem' }}>
                {loyaltyItems.map(item => {
                  const isFree = freeItemIds.includes(item.id);
                  return (
                    <div key={item.id} className="flex justify-between items-center" style={{ padding: '.3rem 0', borderBottom: '1px solid var(--border)' }}>
                      <span className="text-sm">⭐ {item.name_snapshot} ×{item.quantity} <span className="text-xs text-muted">({item.item_type})</span></span>
                      <button className={`btn btn--sm ${isFree ? 'btn--success' : 'btn--outline'}`} onClick={() => toggleFreeItem(item.id)}>
                        {isFree ? 'Free ✓' : 'Make free'}
                      </button>
                    </div>
                  );
                })}
              </div>
              {freeItemsTotal > 0 && (
                <p className="text-xs fw-700 mt-1" style={{ color: 'var(--success)' }}>Free value: −₹{freeItemsTotal.toFixed(0)}</p>
              )}
            </div>
          )}

          {/* Customer phone (optional loyalty) */}
          <div style={{ background: 'var(--info-light)', border: '1px solid var(--info-border)', borderRadius: 'var(--r-xl)', padding: '.75rem', marginBottom: '.75rem' }}>
            <p className="text-xs fw-700 mb-1" style={{ color: 'var(--info)' }}><Gift size={13} style={{ verticalAlign: 'middle' }}/> Loyalty (Optional)</p>
            <div className="flex gap-sm items-center">
              <input className="input" placeholder="Phone number" value={billingPhone}
                onChange={e => setBillingPhone(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn--info btn--sm" onClick={lookupLoyalty} disabled={billingPhone.length < 10}><Search size={14}/></button>
            </div>
            {billingLoyalty && (
              <div style={{ marginTop: '.5rem', fontSize: '.8rem' }}>
                {/* Free-thali steppers – hidden once the coupon drives redemption */}
                {!couponApplied && (
                  <>
                    <div className="flex justify-between"><span>Free Veg Thalis: <b>{billingLoyalty.free_veg_balance}</b></span>
                      {billingLoyalty.free_veg_balance > 0 && <div className="flex items-center gap-sm">
                        <button className="btn btn--sm btn--outline" onClick={() => setBillingFreeVeg(Math.max(0, billingFreeVeg - 1))} disabled={billingFreeVeg <= 0}><Minus size={12}/></button>
                        <span className="fw-700">{billingFreeVeg}</span>
                        <button className="btn btn--sm btn--outline" onClick={() => setBillingFreeVeg(Math.min(billingLoyalty.free_veg_balance, billingFreeVeg + 1))}><Plus size={12}/></button>
                      </div>}
                    </div>
                    <div className="flex justify-between mt-1"><span>Free NV Thalis: <b>{billingLoyalty.free_nonveg_balance}</b></span>
                      {billingLoyalty.free_nonveg_balance > 0 && <div className="flex items-center gap-sm">
                        <button className="btn btn--sm btn--outline" onClick={() => setBillingFreeNV(Math.max(0, billingFreeNV - 1))} disabled={billingFreeNV <= 0}><Minus size={12}/></button>
                        <span className="fw-700">{billingFreeNV}</span>
                        <button className="btn btn--sm btn--outline" onClick={() => setBillingFreeNV(Math.min(billingLoyalty.free_nonveg_balance, billingFreeNV + 1))}><Plus size={12}/></button>
                      </div>}
                    </div>
                  </>
                )}
                <p className="text-xs text-muted mt-1">Veg progress: {billingLoyalty.veg_paid_count}/10 · NV progress: {billingLoyalty.nonveg_paid_count}/10</p>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', padding: '.75rem 0' }}>
            <div className="flex justify-between mb-1">
              <span className="text-sm text-muted">Subtotal</span>
              <span className="fw-700">₹{subtotal.toFixed(0)}</span>
            </div>
            {freeItemsTotal > 0 && (
              <div className="flex justify-between mb-1">
                <span className="text-sm" style={{ color: 'var(--success)' }}>− Free Thali (FREETHALI)</span>
                <span className="fw-700" style={{ color: 'var(--success)' }}>−₹{freeItemsTotal.toFixed(0)}</span>
              </div>
            )}
            <div className="flex items-center gap-sm mb-1">
              <span className="text-sm text-muted" style={{ whiteSpace: 'nowrap' }}>Discount %</span>
              <input className="input" type="number" min="0" max="100" value={billingDiscount}
                onChange={e => setBillingDiscount(e.target.value)} style={{ maxWidth: '5rem', textAlign: 'center' }} />
            </div>
            {disc > 0 && (
              <div className="flex justify-between mb-1">
                <span className="text-sm" style={{ color: 'var(--danger)' }}>− Discount ({disc}%)</span>
                <span className="fw-700" style={{ color: 'var(--danger)' }}>−₹{discAmt.toFixed(0)}</span>
              </div>
            )}
            <div className="flex justify-between" style={{ borderTop: '1px dashed var(--border-dark)', paddingTop: '.5rem' }}>
              <span className="fw-700">Final Total</span>
              <span className="fw-900" style={{ fontSize: '1.3rem', color: 'var(--primary)' }}>₹{final_total.toFixed(0)}</span>
            </div>
          </div>

          {/* Payment method */}
          <p className="text-xs text-muted fw-700 mb-1" style={{ marginTop: '.5rem' }}>Payment Method</p>
          <div className="flex gap-sm mb-2">
            {[['CASH', Banknote, 'Cash'], ['UPI', Smartphone, 'UPI'], ['CARD', CreditCard, 'Card']].map(([val, Icon, label]) => (
              <button key={val}
                className={`btn btn--sm flex-1 ${billingMethod === val ? 'btn--primary' : 'btn--outline'}`}
                onClick={() => setBillingMethod(val)}>
                <Icon size={14}/> {label}
              </button>
            ))}
          </div>

          <div className="flex gap-sm">
            <button className="btn btn--outline flex-1" onClick={() => setBillingOrder(null)}>Cancel</button>
            <button className="btn btn--primary flex-1" onClick={completeBill}>
              <Check size={16}/> Complete
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════
  //  RECEIPT MODAL & WHATSAPP
  // ════════════════════════════════════════════════════════
  const sendWhatsAppBill = async (order) => {
    let phone = order.customer?.phone_number;
    if (!phone) {
      phone = prompt("No customer linked. Enter phone number to send WhatsApp bill:");
      if (!phone) return;
    }
    try {
      // Attach the customer (grants loyalty points if the order was
      // completed while unattached) and send the receipt via the
      // Meta WhatsApp API.
      const res = await api.post(`orders/${order.id}/send_whatsapp/`, { phone });
      if (res.data?.sent) {
        showToast('WhatsApp sent ✓ · Loyalty updated');
      } else {
        sendWhatsAppFallback(order, phone);
        showToast('WhatsApp API not set up – opening WhatsApp');
      }
      loadHistory();
    } catch (err) {
      sendWhatsAppFallback(order, phone);
      showToast('Opening WhatsApp (fallback)');
    }
  };

  // Frontend fallback: open the wa.me deep link with the receipt
  // text (used when the backend WhatsApp API is not configured).
  const sendWhatsAppFallback = (order, phone) => {
    let text = `*Hotel Kinarika*\n\n`;
    text += `Order: ${order.order_number}\n`;
    text += `------------------------\n`;
    (order.items || []).forEach(i => {
      const star = i.is_loyalty_eligible ? ' ⭐' : '';
      text += `${i.quantity} x ${i.name_snapshot}${star} - ₹${(parseFloat(i.price_snapshot) * i.quantity).toFixed(0)}\n`;
    });
    text += `------------------------\n`;
    if (parseFloat(order.free_thali_adjustment) > 0) {
      text += `Free Thali Adj: -₹${parseFloat(order.free_thali_adjustment).toFixed(0)}\n`;
    }
    if (parseFloat(order.discount_amount) > 0) {
      text += `Discount (${parseFloat(order.discount_percentage)}%): -₹${parseFloat(order.discount_amount).toFixed(0)}\n`;
    }
    text += `*TOTAL: ₹${parseFloat(order.final_total).toFixed(0)}*\n\n`;
    text += `Thank you for dining with us!`;

    const finalPhone = phone.length === 10 ? `91${phone}` : phone;
    window.open(`https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const printBluetooth = async (order) => {
    try {
      if (!navigator.bluetooth) {
        alert("Web Bluetooth API is not supported in this browser. Please use Chrome on Android or Desktop.");
        return;
      }
      
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'] // Common thermal printer service
      });
      
      showToast('Connecting to ' + device.name + '...');
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
      
      // ESC/POS formatting
      const encoder = new TextEncoder();
      let receiptText = '\\x1B\\x40'; // Initialize
      receiptText += '\\x1B\\x61\\x01'; // Center align
      receiptText += 'HOTEL KINARIKA\\nVeg & Non-Veg\\n';
      receiptText += '-'.repeat(printerWidth) + '\\n';
      receiptText += '\\x1B\\x61\\x00'; // Left align
      receiptText += `Order: ${order.order_number}\\n`;
      receiptText += '-'.repeat(printerWidth) + '\\n';
      
      (order.items || []).forEach(i => {
        let line = `${i.quantity}x ${i.name_snapshot}`;
        let price = `Rs${(parseFloat(i.price_snapshot) * i.quantity).toFixed(0)}`;
        let spaces = printerWidth - (line.length + price.length);
        if (spaces < 1) spaces = 1;
        receiptText += line + ' '.repeat(spaces) + price + '\\n';
      });
      
      receiptText += '-'.repeat(printerWidth) + '\\n';
      receiptText += `TOTAL: Rs${parseFloat(order.final_total).toFixed(0)}\\n`;
      receiptText += '\\x1B\\x61\\x01'; // Center align
      receiptText += 'Thank you! Visit again.\\n\\n\\n';
      
      // Send chunks of 512 bytes (standard for BLE thermal printers)
      const data = encoder.encode(receiptText);
      const chunkSize = 512;
      for (let i = 0; i < data.length; i += chunkSize) {
        await characteristic.writeValue(data.slice(i, i + chunkSize));
      }
      
      showToast('Printed successfully!');
      device.gatt.disconnect();
    } catch (err) {
      console.error(err);
      alert("Bluetooth printing failed: " + err.message);
    }
  };

  const ReceiptModal = () => {
    if (!receiptOrder) return null;
    const items = receiptOrder.items || [];
    const sub = parseFloat(receiptOrder.original_subtotal) || 0;
    const discP = parseFloat(receiptOrder.discount_percentage) || 0;
    const discA = parseFloat(receiptOrder.discount_amount) || 0;
    const total = parseFloat(receiptOrder.final_total) || 0;
    const paymentMethod = receiptOrder.payment?.method || 'CASH';

    return (
      <div className="modal" onClick={() => setReceiptOrder(null)}>
        <div className="modal__card" onClick={e => e.stopPropagation()} style={{ fontFamily: 'monospace', fontSize: '.8rem', maxWidth: '22rem' }}>
          <div className="flex justify-end mb-1">
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)' }} onClick={() => setSettingsModal(true)}>
              <Settings size={16}/>
            </button>
          </div>
          <div className="text-center mb-2">
            <p className="fw-900" style={{ fontSize: '1rem' }}>HOTEL KINARIKA</p>
            <p className="text-xs text-muted">Veg & Non-Veg</p>
            <p className="text-xs text-muted">Geet Ganga Apt., Shaniwar Peth, Pune 30</p>
            <p style={{ borderBottom: '1px dashed var(--border-dark)', margin: '.5rem 0' }}></p>
            <p className="fw-700">{receiptOrder.order_number} · {receiptOrder.order_type}</p>
            {receiptOrder.table_name && <p className="text-xs">{receiptOrder.table_name}</p>}
            <p style={{ borderBottom: '1px dashed var(--border-dark)', margin: '.5rem 0' }}></p>
          </div>
          {items.map(i => (
            <div key={i.id} className="flex justify-between" style={{ marginBottom: '.2rem' }}>
              <span>{i.quantity}× {i.name_snapshot}{i.is_loyalty_eligible ? ' ⭐' : ''}</span>
              <span>₹{(parseFloat(i.price_snapshot) * i.quantity).toFixed(0)}</span>
            </div>
          ))}
          <p style={{ borderBottom: '1px dashed var(--border-dark)', margin: '.5rem 0' }}></p>
          <div className="flex justify-between"><span>Subtotal</span><span>₹{sub.toFixed(0)}</span></div>
          {discP > 0 && <div className="flex justify-between"><span>Discount ({discP}%)</span><span>-₹{discA.toFixed(0)}</span></div>}
          <div className="flex justify-between fw-900" style={{ fontSize: '.95rem', marginTop: '.25rem' }}>
            <span>TOTAL</span><span>₹{total.toFixed(0)}</span>
          </div>
          <p className="text-center text-xs mt-1">Paid via {paymentMethod}</p>
          <p style={{ borderBottom: '1px dashed var(--border-dark)', margin: '.5rem 0' }}></p>
          <p className="text-center text-xs text-muted">Thank you! Visit again.</p>
          <div className="flex gap-sm mt-2">
            <button className="btn btn--outline flex-1" onClick={() => setReceiptOrder(null)}>Close</button>
            <button className="btn btn--primary flex-1" onClick={() => window.print()}><Printer size={14}/> Print</button>
            <button className="btn btn--info flex-1" onClick={() => printBluetooth(receiptOrder)} title="Bluetooth Print">
              <Bluetooth size={14}/> BLE
            </button>
          </div>
          <button className="btn btn--success btn--full mt-1" onClick={() => sendWhatsAppBill(receiptOrder)}>
            <MessageCircle size={14}/> Send via WhatsApp
          </button>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════
  //  HISTORY PAGE
  // ════════════════════════════════════════════════════════
  const HistoryPage = () => (
    <div className="page">
      <div className="page__header">
        <div className="flex items-center justify-between">
          <h1>Bill History</h1>
          <button className="btn btn--icon" onClick={loadHistory}><RefreshCw size={16}/></button>
        </div>
        <p className="text-xs text-muted mt-1">Today's completed orders</p>
      </div>
      <div className="page__scroll">
        <div className="flex-col gap-md">
          {completedOrders.length === 0 ? (
            <div className="empty-state"><Clock size={40} style={{ opacity: .2, marginBottom: '.5rem' }}/><p>No completed orders today</p></div>
          ) : (
            completedOrders.map(order => {
              const total = parseFloat(order.final_total) || 0;
              return (
                <div key={order.id} className="order-card">
                  <div className="order-card__header">
                    <div>
                      <span className="fw-700">{order.order_number}</span>
                      {order.table_name && <span className="text-xs text-muted" style={{ marginLeft: '.4rem' }}>· {order.table_name}</span>}
                    </div>
                    <span className="fw-900" style={{ color: 'var(--success)' }}>₹{total.toFixed(0)}</span>
                  </div>
                  <div className="order-card__items">
                    {order.items?.map(i => (
                      <div key={i.id} className="order-card__item">
                        <span>{i.quantity}× {i.name_snapshot}{i.is_loyalty_eligible ? ' ⭐' : ''}</span>
                        <span>₹{(parseFloat(i.price_snapshot) * i.quantity).toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-sm">
                    <button className="btn btn--outline btn--sm flex-1" onClick={() => setReceiptOrder(order)}>
                      <Eye size={14}/> Receipt
                    </button>
                    <button className="btn btn--success btn--sm" onClick={() => sendWhatsAppBill(order)}>
                      <MessageCircle size={14}/> Send
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════
  //  MAIN RENDER
  // ════════════════════════════════════════════════════════
  return (
    <ErrorBoundary>
      <div className="app">
      {/* Toast */}
      {toast && <div className="toast"><div className="toast__inner"><Check size={15}/> {toast}</div></div>}

      {/* Page body */}
      <div className="app__body">
        {tab === 'tables' && TablesPage()}
        {tab === 'setmenu' && SetMenuPage()}
        {tab === 'menu' && MenuPage()}
        {tab === 'orders' && OrdersPage()}
        {tab === 'history' && HistoryPage()}
        {tab === 'dashboard' && <Dashboard dashStats={dashStats} expenses={expenses} addExpense={addExpense} newExpense={newExpense} setNewExpense={setNewExpense} refreshDashboard={loadAll} />}
        {tab === 'customers' && <CustomersPage />}
      </div>

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <div className="bottom-nav__inner">
          {[
            ['tables', LayoutGrid, 'Tables'],
            ['menu', UtensilsCrossed, 'Menu'],
            ['orders', List, 'Orders'],
            ['history', Clock, 'History'],
            ['dashboard', Banknote, 'Expenses'],
            ['customers', Users, 'Customers'],
          ].map(([key, Icon, label]) => (
            <button key={key} className={`nav-btn ${tab === key ? 'active' : ''}`} onClick={() => {
              setTab(key);
              if (key === 'history') loadHistory();
              if (key === 'dashboard') loadAll();
            }}>
              <span style={{ position: 'relative' }}>
                <Icon className="nav-btn__icon" size={20}/>
                {key === 'orders' && activeOrders.length > 0 && <span className="badge">{activeOrders.length}</span>}
                {key === 'menu' && cartCount > 0 && <span className="badge">{cartCount}</span>}
              </span>
              <span className="nav-btn__label">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Add Items to Existing Order Modal */}
      {addItemsOrder && (
        <div className="modal" onClick={() => setAddItemsOrder(null)}>
          <div className="modal__card" onClick={e => e.stopPropagation()} style={{ maxWidth: '36rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 className="mb-1">Add Items – {addItemsOrder.order_number}</h2>
            <p className="text-xs text-muted mb-2">{addItemsOrder.table_name ? `Table: ${addItemsOrder.table_name}` : addItemsOrder.order_type}</p>

            <div className="search-wrap mb-1">
              <Search className="search-wrap__icon" size={17}/>
              <input className="input" placeholder="Search dishes…" value={addItemsSearch} onChange={e => setAddItemsSearch(e.target.value)} />
              {addItemsSearch && <button style={{ position:'absolute', right:'.6rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-light)', cursor:'pointer' }} onClick={() => setAddItemsSearch('')}><X size={15}/></button>}
            </div>
            <button
              onClick={() => setAddItemsVegOnly(!addItemsVegOnly)}
              className={`btn btn--sm mb-1 ${addItemsVegOnly ? 'btn--success' : 'btn--outline'}`}
            >Veg Only</button>

            <div className="flex-col gap-sm mb-2" style={{ maxHeight: '14rem', overflowY: 'auto' }}>
              {menuItems
                .filter(i => {
                  if (addItemsVegOnly && i.item_type !== 'veg') return false;
                  if (addItemsSearch && !i.name.toLowerCase().includes(addItemsSearch.toLowerCase())) return false;
                  return true;
                })
                .map(item => (
                  <div key={item.id} className="menu-row" style={{ padding: '.5rem .75rem' }}>
                    <div className="menu-row__info">
                      <div className="menu-row__name">
                        <div className={`veg-dot ${item.item_type === 'veg' ? 'veg-dot--veg' : 'veg-dot--nv'}`}><div className="veg-dot__inner"/></div>
                        <h3 style={{ fontSize: '.9rem' }}>{item.name}{item.is_loyalty_eligible ? ' ⭐' : ''}</h3>
                      </div>
                      <span className="menu-row__price">₹{item.price}</span>
                    </div>
                    <button className="btn btn--outline btn--sm" onClick={() => addToAddItemsCart(item)}><Plus size={14}/> Add</button>
                  </div>
                ))}
            </div>

            {addItemsCart.length > 0 && (
              <>
                <h3 className="text-sm text-muted fw-700 mb-1">Items to add</h3>
                <div className="flex-col gap-sm mb-2">
                  {addItemsCart.map(c => (
                    <div key={c.id} className="flex items-center justify-between" style={{ padding: '.5rem .75rem', background: 'var(--bg)', borderRadius: 'var(--r-xl)' }}>
                      <div>
                        <p className="fw-700 text-sm">{c.name}</p>
                        <p className="text-xs text-muted">₹{(c.price * c.qty).toFixed(0)}</p>
                      </div>
                      <div className="qty">
                        <button className="qty__btn" onClick={() => changeAddItemsQty(c.id, -1)}><Minus size={14}/></button>
                        <span className="qty__val">{c.qty}</span>
                        <button className="qty__btn" onClick={() => changeAddItemsQty(c.id, 1)}><Plus size={14}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-sm">
              <button className="btn btn--outline flex-1" onClick={() => setAddItemsOrder(null)}>Cancel</button>
              <button className="btn btn--primary flex-1" onClick={submitAddItemsToOrder} disabled={addItemsCart.length === 0}><Check size={16}/> Add to Order</button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {BillingModal()}
      {ReceiptModal()}
      
      {/* Settings Modal */}
      {settingsModal && (
        <div className="modal" onClick={() => setSettingsModal(false)}>
          <div className="modal__card" onClick={e => e.stopPropagation()}>
            <h2 className="mb-2 flex items-center gap-sm"><Settings size={18}/> Printer Settings</h2>
            <label className="text-xs text-muted fw-700">Receipt Width</label>
            <div className="flex gap-sm mb-2">
              <button className={`btn btn--sm flex-1 ${printerWidth === 32 ? 'btn--primary' : 'btn--outline'}`}
                onClick={() => { setPrinterWidth(32); localStorage.setItem('printerWidth', '32'); showToast('Saved'); }}>
                58mm (2-inch)
              </button>
              <button className={`btn btn--sm flex-1 ${printerWidth === 48 ? 'btn--primary' : 'btn--outline'}`}
                onClick={() => { setPrinterWidth(48); localStorage.setItem('printerWidth', '48'); showToast('Saved'); }}>
                80mm (3-inch)
              </button>
            </div>
            <p className="text-xs text-muted mb-2">
              Bluetooth printing connects directly to your thermal printer. Ensure your device is paired in your OS settings first.
            </p>
            <button className="btn btn--outline btn--full" onClick={() => setSettingsModal(false)}>Close</button>
          </div>
        </div>
      )}

    </div>
    </ErrorBoundary>
  );
}
