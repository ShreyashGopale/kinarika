# Customers, Loyalty & WhatsApp Receipt Plan

## Context / Current State
- Backend: Django 6.1 + DRF on Vercel at `https://kinarika.vercel.app`, API mounted at `/api/` (`backend/core/urls.py:22` includes `pos.urls` under `api/`). All Vercel routes → `backend/core/wsgi.py` (root `vercel.json`). DB: Supabase Postgres on Vercel, SQLite locally.
- Existing models (`backend/pos/models.py`): `Customer`(phone_number, name), `LoyaltyAccount`(veg_paid_count, nonveg_paid_count, free_veg_balance, free_nonveg_balance), `LoyaltyTransaction`, `MenuItem.is_loyalty_eligible`, `Order.customer`, `OrderItem.is_free_redemption`, `WhatsAppMessage`.
- `complete_bill` (`pos/views.py:472`) already: counts loyalty-eligible thalis, earns at **10 paid → 1 free-balance**, redeems free thalis (`use_free_veg`/`use_free_nonveg`), applies discount. Gaps: does NOT accept a phone number, does NOT accept specific free-item selection, does NOT mark `OrderItem.is_free_redemption`.
- `create_menu_item` / `edit_menu_item` do NOT accept `is_loyalty_eligible`.
- `attach_whatsapp_customer` (`pos/views.py:760`) creates/links a customer and grants points if a completed order had no customer.
- WhatsApp sending is frontend-only via `window.open(wa.me/...)`. No backend sender exists.
- Frontend: `App.jsx` (all pages are plain functions called during render — no hooks allowed inside them), `Dashboard.jsx` (Expenses tab), bottom nav = Tables, Menu, Orders, History, Expenses.

## Decisions (resolved)
1. **Provider = Meta WhatsApp Business Cloud API.** Token already provided → store in env `WHATSAPP_TOKEN` (secret — never commit; rotate it since it was pasted in chat).
2. **Loyalty mechanic = keep existing 10:1 (no migration).** Display "points" = `free_*_balance × 10 + *_paid_count`. Earn +1 per loyalty-eligible paid thali; each free thali redeems 1 free-balance (= 10 points). This exactly matches "one free item per 10 loyalty points" and "decrement by 10 per free item".
3. **FREETHALI coupon = item-level free-thali selection.** Reuses existing redemption accounting; adds `free_item_ids` so staff pick WHICH loyalty-eligible dishes are free. Coupon takes precedence over the existing steppers.
4. **Free item choice = staff pick** (user: "a thali from the bill is asked to be chosen").
5. **Recipient format = 10-digit Indian numbers**; backend prepends `+91` for WhatsApp only (raw 10-digit stays stored, matching the existing loyalty lookup).
6. **Per-dish/date loyalty history is derived from OrderItems** (loyalty-eligible & `!is_free_redemption` = earned; `is_free_redemption` = redeemed). No migration.

## Callback URL (answer for Meta setup)
- **Give Meta this Callback/Webhook URL:** `https://kinarika.vercel.app/api/whatsapp/webhook/`
- **Verify token:** choose a secret string; set it as backend env `WHATSAPP_VERIFY_TOKEN` AND enter the same value in the Meta app config. Meta sends it back in the verification request; the endpoint must match it.
- **Important ordering:** the webhook endpoint does not exist yet. Meta's "Verify" will FAIL until the endpoint is deployed. Build + deploy the webhook first, then click Verify in Meta (or enter the URL now and re-verify after deploy).

## Backend changes
1. **Webhook endpoint** — `pos/urls.py`: `path('whatsapp/webhook/', views.whatsapp_webhook)`. View decorated `@csrf_exempt` (Meta POSTs have no session/CSRF token):
   - GET: if `hub.mode == 'subscribe'` and `hub.verify_token == WHATSAPP_VERIFY_TOKEN` → return `hub.challenge` as 200 `text/plain`; else 403.
   - POST: return 200 (optionally persist message-status/inbound events).
2. **WhatsApp sender** — new `pos/whatsapp.py`: `send_whatsapp(to_raw_10digit, text)` → normalize to E.164 (`+91`+number), POST `https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_ID}/messages` with header `Authorization: Bearer {WHATSAPP_TOKEN}`, body `{"messaging_product":"whatsapp","to":<e164>,"type":"text","text":{"body":<text>}}`. Create a `WhatsAppMessage` row (SENT/FAILED). Fail gracefully (log + mark FAILED) if env vars are unset so the app still works without credentials.
3. **`complete_bill`** — accept `phone_number` (get_or_create `Customer`, link to order, get_or_create `LoyaltyAccount`); accept `free_item_ids` (mark those `OrderItem.is_free_redemption=True`, zero their price in the free-thali adjustment; derive `use_free_veg`/`use_free_nonveg` from the selected items; coupon overrides steppers). Keep existing earn/redeem accounting. Also mark stepper-redeemed items `is_free_redemption=True` so history is accurate. After save, if a phone is present → build receipt text (including a "Veg Loyalty Points: X · Non-Veg Loyalty Points: Y" line) → `send_whatsapp`. Return order + loyalty + whatsapp status.
4. **`create_menu_item` / `edit_menu_item`** — accept `is_loyalty_eligible` (bool).
5. **New endpoint** `GET /api/customers/<str:phone>/` → `{ phone_number, name, loyalty:{veg_points, nonveg_points, free_veg_balance, free_nonveg_balance, veg_paid_count, nonveg_paid_count}, orders:[{id, order_number, order_type, table_name, final_total, discount_amount, payment:{method}, completed_at, items:[{name_snapshot, price_snapshot, quantity, item_type, is_loyalty_eligible, is_free_redemption}]}], loyalty_history:[{type, dish, date, quantity, action:'earned'|'redeemed', points}] }` — all derived server-side.
6. **Extend `OrderItemSerializer`** with read-only `item_type` and `is_loyalty_eligible` (from `menu_item`) so order/bill views can show ⭐ and types.
7. **New endpoint** `POST /api/orders/<int:pk>/send_whatsapp/` — attaches/creates customer from a provided phone (grants points if completed & previously unattached, reusing `attach_whatsapp_customer` logic) then sends the receipt via the sender. Used by History/Receipt "Send via WhatsApp".

## Frontend changes
1. **New "Customers" bottom-nav tab** (beside Expenses). Search bar ONLY — no data until searched. On complete 10-digit input → `GET /api/customers/<phone>/`. Render customer name/phone, a "Check Loyalty Points" button, and horizontal-scrolling order cards (order number, date, items, total, payment method).
2. **Loyalty points popup** (from "Check Loyalty Points"): table with veg section first, then non-veg; columns dish / date / points; veg/non-veg filter and earned/redeemed filter; beside each type header show the current points count.
3. **BillingModal (Orders → Bill)**: add optional customer-phone input + a FREETHALI coupon field. On coupon apply → list loyalty-eligible items with a "make free" toggle (⭐ items); selected items become free. Show ⭐ next to loyalty-eligible items. Complete → `completeBill` sends `phone_number`, `free_item_ids`, `discount_percentage`, `payment_method`.
4. **SetMenu page**: ⭐ next to loyalty-eligible items; add an "Loyalty program" toggle in Add Dish / Edit Dish modals (`is_loyalty_eligible`).
5. **Menu / Orders / Receipt views**: ⭐ next to loyalty-eligible items.
6. **Receipt / History WhatsApp send**: if the order has a customer → pre-fill the number; else prompt for a number → call `send_whatsapp` endpoint (attaches customer + grants points + sends). Receipt message includes current veg/non-veg points. Customer tab updates on next search.
7. Auto-send is backend-driven on bill completion (no frontend `wa.me` open when a number is present at billing).

## Config / env vars (set on the Vercel backend project)
- `WHATSAPP_TOKEN` = Meta access token (secret; rotate after this session).
- `WHATSAPP_PHONE_ID` = numeric WhatsApp Phone Number ID (Meta dashboard → WhatsApp Manager / Business settings).
- `WHATSAPP_VERIFY_TOKEN` = secret string you choose; must equal the token entered in the Meta app config.

## Risks
- **Meta messaging policy:** free-form text is only allowed within 24h of the customer's last interaction; otherwise a pre-approved template is required. First-time numbers may be rejected → recommend creating a UTILITY template for receipts, or accept FAILED sends until the customer opts in.
- **Secret exposure:** the token was pasted in chat — rotate it; store all three env vars only on the Vercel backend.
- **Ordering:** deploy the webhook endpoint before clicking "Verify" in Meta.

## Validation
- Local: `python manage.py migrate`; `runserver`; hit `GET /api/whatsapp/webhook/?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y` → returns `Y`. Complete a bill with a phone → customer + loyalty created, `WhatsAppMessage` row created. Apply FREETHALI → selected item price zeroed, `free_*_balance` decremented by 1 per free thali.
- `vite build` the frontend to confirm it compiles.
- On Vercel: set env vars, deploy, verify webhook in Meta, then test end-to-end (order → bill with number → receipt arrives in WhatsApp; customer tab shows the order + points).

## Open questions / assumptions
- Verify token & Phone Number ID: you provide them at deploy (env vars).
- FREETHALI frees 1 thali per selected loyalty-eligible line item (10 points each); confirm whether a multi-quantity line should free only 1 unit or the whole line.
- A billing-time phone number overrides the order's existing customer.
