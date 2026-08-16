# Implementation Prompt — Open Tabs & Send to Kitchen (Task 8)

Paste this to an agent (or work through it yourself). This is P1 feature work.
All code locations below were verified live against the actual repos on
2026-08-14 and are current as of that date. Do not trust the numbers in
OPEN-TABS-FEATURE.md; trust this file, which was written from a fresh reading
of the source.

**Check first:** this feature is NOT implemented anywhere yet (verified). The
only "Send to Kitchen" button in the codebase lives in `PipelineView.vue:154`
and merely moves a *paid* order `new → preparing` — it is not the feature.

---

## Repos & deploy model

- **Frontend:** `fufut-management/pos` — Vue 3 + Pinia + vue-router, deployed to
  Cloudflare Pages (`fufut-pos`) by `.github/workflows/build-pos.yml` on push to
  `master`. Built with `--base /`; vue-router base is `/pos/`.
- **API:** `fufut-api` — Cloudflare Worker, push to `main` deploys via
  `.github/workflows/deploy.yml` (test → drift check → staging → smoke →
  production). D1 database `fufut-db`.
- **CI gates:** `npm test` in `pos/` (264 tests) and `fufut-api/` (438 tests)
  gate deploys. Add a regression test for every change and confirm each new
  test **fails against the unfixed code** before you call it done.
- **Auth is cookie-based**; API calls need `credentials: 'include'`.

---

## How the code actually works today (verified)

### Backend — `fufut-api/src/handlers/orders.js` (790 lines)

`handleOrders(pathname, method, url, request, env, auth)` is a big dispatch. It
returns `null` for unmatched routes (which the caller then treats as 404).

Key functions and routes:

- **POST `/api/orders`** (`orders.js:319`): reads body, generates id `"O"+uuid`.
  Builds `row` with all columns, filters against live schema via
  `orderColumns(env)` (PRAGMA table_info, cached per-isolate), INSERTs. Then
  calls in order:
  1. `insertOrderItems(env, id, data.orderItems||order_items||items, nowIso)`
     (`orders.js:90`) — writes one row per line into `order_items` with
     `status:'new'`, `line_no`, category, modifiers (JSON string), notes.
     **Never throws** — returns `{inserted, warning}`.
  2. `recordSubmittedPayments(env, auth, id, data)` (`orders.js:166`) — writes
     `payments` rows from `data.paymentBreakdown`. **If the array is empty it
     returns early with `{inserted:0, warning:null}`** — this is the seam the
     open-tab flow relies on: an unpaid order already creates no payment rows.
  3. `recordSubmittedTip(...)` (`orders.js:226`)
  4. `createDeliveryJob(...)` (`orders.js:270`) — only for `type==='delivery'`.
  5. `writeAudit(...)` (`orders.js:402`) — action `create`, entity `orders`.
  - Sets `payment_status: 'unpaid'` on the INSERT always (`orders.js:364`).
  - Sets `pickup_status: 'awaiting'` only for takeaway (`orders.js:363`).
- **GET `/api/orders/items/active`** (`orders.js:453`) — every line on the board
  where `o.status NOT IN ('completed','cancelled','fulfilled')`. Kitchen board
  polls this + GET /api/orders every 15s and on SSE.
- **GET `/api/orders/:id/items`** (`orders.js:465`)
- **GET `/api/orders/:id`** (`orders.js:483`) — order + `items` attached.
- **PUT `/api/orders/:orderId/items/:itemId`** (`orders.js:502`) — advance one
  line's status, then `deriveOrderStatus()` recomputes the order status.
- **PUT `/api/orders/:id`** (`orders.js:546`) — generic field update; **this
  route catches any PUT with a path starting `/`**, so a new route must be
  declared BEFORE it.
- **DELETE `/api/orders/:id`** (`orders.js:720`) — void, not delete.

Important detail — **route order matters**: `/items/active` is declared before
`/:id/items` which is before `/:id` because otherwise "items" is read as an
order id. A new `PATCH /api/orders/:id/items` route must be placed in the
dispatch BEFORE the generic `PUT /api/orders/:id` catch-all (`orders.js:546`).

### Backend — line helpers

`normaliseLines(items)` (`fufut-api/src/lib/timing.js:152`) turns the cart into
line rows: `{ lineNo, menuItemId, name, category, qty, unitPrice, modifiers,
notes }`. Accepts a string (JSON or the flat "1xMacchiato, 2x Latte" form).
`insertOrderItems` uses it — **reuse it for the PATCH append route** so new
lines land with the next `line_no`. Note `lineNo` is the array index; for an
append you must compute the next `line_no` from the existing max, not reuse the
index (a fresh 0-based array would collide with existing line 0).

### Backend — auth (`fufut-api/src/auth.js`)

- `resourceForPath('/api/orders/...')` returns `'orders'` (`auth.js:282`).
- `ROLE_ACCESS` (`auth.js:129`): manager `read:'*', write:'*'`; head-waiter
  `read:['orders',...], write:['orders','tables','reservations','tips']`;
  head-chef/assistant-chef write `orders`; cashier writes `orders`.
- `write` covers POST, PUT, PATCH and DELETE (comment at `auth.js:119`).
  **PATCH requires no auth.js change.**
- Note: `POST /api/orders` is in the ANONYMOUS list (`auth.js:55`) for website
  online ordering. **Do not touch that.** PATCH is not anonymous, so it will
  correctly require a session.

### Backend — timing (`fufut-api/src/lib/timing.js`)

- `ITEM_FLOW = ['new','preparing','ready','served']` (`timing.js:13`).
- `deriveOrderStatus(itemStatuses)` (`timing.js:43`): roll line states into
  order state. `stampColumnFor(status)` maps state → timestamp column.

### Frontend — order store (`fufut-management/pos/src/stores/order.js`)

- Pinia store `useOrderStore`. Cart items: `{uid,_key,menuItemId,name,
  basePrice,qty,selectedModifiers,notes}`.
- `buildOrderPayload(overrides={})` (`order.js:495`) produces the full order
  body: `items` (flat string), `orderItems` (structured), `subtotal`, `total`,
  `status:'new'`, `payment`, `type`, `tableNum`, `customer`, `customerPhone`,
  `address`, `deliveryFee`, `notes`, `tip`, `tipType`, `discount`,
  `discountType`, `discountReason`, `paymentBreakdown`.
- `resetCheckout({keepOrderContext})` (`order.js:346`) clears payment state;
  `keepOrderContext` preserves type/table/customer.
- **There is no `openOrderId` field. You must add one** (ref) to track the
  order created by Send to Kitchen so Checkout can settle it.
- Watch persists to localStorage (`fufut.pos.cart.v1`) — include openOrderId in
  persist/restore if you want it to survive reload.

### Frontend — API client (`fufut-management/pos/src/api/index.js`)

- `apiGet(endpoint)`, `apiPost(endpoint, data)`, `apiPut(endpoint, data)`,
  `apiDelete(endpoint, id)` — all prepend `API` (same-origin `/api/...`).
- **There is NO `apiPatch`. Add one** mirroring `apiPut` (method `'PATCH'`,
  JSON body, credentials include, offline queue via `queueMutation`).
- `ROLE_PERMISSIONS` (`api/index.js:168`) — `'checkout'` and `'menu-view'` are
  granted to head-waiter and cashier already. The nav guard is
  `auth.hasPermission(viewName)`.

### Frontend — CheckoutView (`fufut-management/pos/src/views/CheckoutView.vue`)

- `processPayment()` at line 607: builds payload via `store.buildOrderPayload()`
  then `apiPost('orders', payload)` **always creates a new order**. This is the
  core defect. On success it marks the table occupied (`apiPut('tables/'+id,
  {status:'occupied', seated_at})`) at lines 617-629, sets
  `store.lastOrderId`, step `'success'`, toasts.
- `printReceipt()` at line 655 reads `lastPayload` and `store.lastOrderId`.

### Frontend — KitchenView (`fufut-management/pos/src/views/KitchenView.vue`)

- Consumes `apiGet('orders')` + `apiGet('orders/items/active')` on 15s timer +
  SSE (`connectSSE()` at line 399, channel `'kitchen'`, events `new_order`,
  `order_update`). Lines are per-order buttons that `advanceLine` PUT
  `orders/:orderId/items/:itemId`. Orders grouped into new/preparing/ready
  columns by `o.status`.

### Frontend — TablesView (`fufut-management/pos/src/views/TablesView.vue`)

- `loadOrders()` (line 560) fetches all orders, filters out completed/cancelled/
  fulfilled. `tableOrderCounts`/`tableOrderTotals` computeds (lines 466-490)
  map active orders to table tiles by `table_number||tableNum`.
- `openDetail(t)` (line 591) loads `orders?table_number=N` filtered to active.
- `newOrderForTable()` (line 653) pushes `/app/menu-view?table=N`.
  **It just builds a fresh cart — it does not resume an open order.**
- Table tiles show `t.status`, occupancy, spend (`tableOrderTotals`), and an
  "Add Round"/"New Order" button (`:254`) that calls `newOrderForTable`.

### Frontend — MenuView (`fufut-management/pos/src/views/MenuView.vue`)

- Cart UI + "Proceed to Checkout" (`goToCheckout()` line 277) which calls
  `store.resetCheckout({keepOrderContext:true})` then pushes `/app/checkout`.
- Reads `route.query.table` to set `store.tableNum`/orderType `'dine-in'`.
- **This is where the Send to Kitchen button belongs** (floating cart area) and
  where "Add to Order vs New Order" routing must branch on whether an open
  order already exists for the table.

### SSE (`fufut-api/src/handlers/sse.js`)

- `sse.js:28` publishes `new_order` with `{orders: rows}`. The kitchen board's
  `new_order` handler just calls `loadOrders()`, so new unpaid orders will
  appear on the board automatically if they carry `status:'new'` — verify.

---

## What to build

### 1. Send to Kitchen (frontend)

- Add a **Send to Kitchen** button in MenuView's floating cart area (before
  checkout). It calls `apiPost('orders', store.buildOrderPayload())` — the
  payload already has `status:'new'`, and `recordSubmittedPayments` no-ops when
  `paymentBreakdown` is empty (verify it is empty when nothing was paid; if the
  cart default `buildPaymentBreakdown()` still emits a cash entry, pass
  `paymentBreakdown: []` via overrides).
- On success: store the returned `res.id` as the open order id, clear the cart
  (or keep table context), toast "Sent to kitchen", and confirm the kitchen
  board shows it immediately (GET /api/orders/items/active includes it because
  status is 'new' and not in the exclusion list).
- Head-waiter and cashier both have `write: orders`, so no auth change.

### 2. Open tab per table

- Order store: add `openOrderId` ref (+ persistence). Set it on Send to
  Kitchen.
- `TablesView`: show a badge/tint on tiles that have an open unpaid order
  (`o.status` in new/preparing/ready **and** `o.payment_status==='unpaid'`).
  Add to `tableOrderCounts`/`tableOrderTotals` already covers the spend. The
  detail panel "Add Round"/"New Order" button should route to menu-view with
  the existing order id, not just a fresh cart.
- State machine already exists implicitly: orders table carries `status` and
  `payment_status` separately. The DoD "new → preparing → served → unpaid →
  paid" is not a single column; map it as `order.status` (kitchen flow) +
  `order.payment_status` (settlement flow). Do not merge them.

### 3. Add a round — `PATCH /api/orders/:id/items` (backend + frontend)

Backend route (declare BEFORE the generic PUT at `orders.js:546`):
- Match `m === 'PATCH' && /^\/[^/]+\/items$/.test(sub)` (mirror the GET
  `/:id/items` at `orders.js:465`, and note the PUT `/:orderId/items/:itemId`
  uses a different regex — your PATCH is `/:id/items` exactly, 3 segments).
- Reject if order not found, or `voided_at` set (mirror PUT guard `orders.js:560`),
  or `payment_status` is paid (you cannot add to a settled order).
- Append lines via `insertOrderItems`, but compute the next `line_no` from
  `SELECT MAX(line_no) FROM order_items WHERE order_id = ?` and offset the
  normalised line's `lineNo` by it. Then update the order's `subtotal`/`total`
  (add the appended amount) and `updated_at`.
- Audit: `writeAudit` action `'update'`, entity `'orders'`, before/after with
  the appended lines or the totals.
- Return the new lines + new totals. Verify the kitchen board picks them up as
  `new` (their status is 'new' on insert).
- Frontend: `apiPatch('orders/'+orderId+'/items', {...})` — the payload can be
  the same `orderItems`/`items`/`subtotal`/`total` shape `buildOrderPayload`
  produces but with only the new round's lines. Branch in MenuView:
  if an open order exists for the table, button reads **Add to Order** and
  PATCHes; otherwise it is **Send to Kitchen** and POSTs a new order.

### 4. Checkout settles, not creates

- `processPayment` (`CheckoutView.vue:607`): if `store.openOrderId` is set,
  send the payment to the existing order instead of `POST /orders`.
  Options:
  - **Preferred:** reuse the existing PUT `orders/:id` (order.js:546) which
    already accepts `payment`, `tip`, `paymentBreakdown`-adjacent fields —
    check whether it handles `paymentBreakdown`. It does NOT (it handles
    `payment`, `tip`, `subtotal`, `discount`, `tip_type`, `payment_status`
    etc. but not `paymentBreakdown`). Either extend PUT to record payments
    from `paymentBreakdown`, or add the recording call to PUT.
  - The cleanest: after the PUT, call the same `recordSubmittedPayments` logic.
    Since `refreshPaymentStatus` runs on PUT when total/tip/discount change, a
    payment recorded against the order will flip `payment_status` to paid.
- After settling, clear `openOrderId`, mark the table settled/cleared
  (the existing occupied-marking logic at `CheckoutView.vue:617` flips it the
  other way — for a dine-in settlement the table should be cleared on pay, not
  marked occupied).
- Fallback: no `openOrderId` → keep current `POST /orders` path (takeaway /
  walk-up).

### 5. Courses (per-line fire) — optional/if quota allows

- Migration `fufut-api/migrations/012-courses.sql` (follow the
  `005-financials-payments-tips-audit.sql` pattern; additive only):
  `ALTER TABLE order_items ADD COLUMN course TEXT DEFAULT 'main';`
- `normaliseLines` passes through `course`; `insertOrderItems` writes it.
- Kitchen board: group lines by course, add per-course fire (advance all lines
  of a course together). Keep this scoped and small.

---

## DoD

- [ ] Waiter takes a dine-in order → Send to Kitchen → board shows it before any
      payment (verified live as head-waiter on `pos.fufutcoffee.com`).
- [ ] Same table shows an open unpaid tab; waiter adds a round (PATCH) and the
      new lines appear on the board as new.
- [ ] Checkout settles that order: payment + tip attach to the existing order
      id; `payment_status` flips to paid; table clears on settlement.
- [ ] `POST /orders` from checkout remains only for takeaway / no-tab flows.
- [ ] All routes enforce the role matrix (PATCH on orders requires a session;
      head-waiter and cashier may write orders; no anonymous PATCH).
- [ ] Every new route/change has a regression test that **fails on the unfixed
      code**. Backend: use the `makeEnv`/`makeRequest` seam in
      `fufut-api/test/orders-single.test.js` (mock `DB.prepare().bind().all()`).
      Frontend: follow `pos/tests/unit/components/MenuView.test.js` and
      `pos/tests/unit/order-store.test.js`.
- [ ] `npm test` green in `pos/` (264) and `fufut-api/` (438). CI gates deploy.

## Live verification checklist (use manager + head-waiter accounts)

1. Log in as head-waiter (see auth test creds in the repos / session cookies).
2. Open Tables → tap a table → New Order → menu → add items → **Send to
   Kitchen**.
3. Open Kitchen in another tab (chef or manager) → order appears under New.
4. Back on the table → Add Round → add items → send → new lines appear on the
   board.
5. Go to Checkout for that table → settle (cash) → payment records against the
   existing order id, `payment_status=paid`, table cleared.
6. Check `GET /api/audit?entity=orders` shows create + the append/settle updates.

## Notes / gotchas

- The POST `/api/orders` anonymous grant is for the public website; never
  remove it and never add PATCH to the anonymous list.
- `insertOrderItems` never throws; its `warning` field is how failures surface.
- `orderColumns(env)` caches per-isolate; tests must call
  `resetOrderColumns()` if they assert on schema filtering.
- The generic PUT catch-all (`orders.js:546`) will swallow any PATCH only if
  you forget to declare your PATCH route before it — and actually it only
  matches `m === 'PUT'`, so a PATCH hitting it returns `null` → 404. Order
  still matters for readability; put the PATCH next to GET `/:id/items`.
- Do not hardcode credentials in the prompt or repo; use session cookies
  (`curl -b /tmp/mgr-cookies.txt`) for live API checks.
