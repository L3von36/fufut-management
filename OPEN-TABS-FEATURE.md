# Feature Prompt — Open Tabs & Send to Kitchen (Task 8)

Paste this to an agent (or work through it yourself). This is P1 feature work,
scoped separately from the bug fixes already merged. All findings below were
verified live against production on 2026-08-14.

---

## Context you need first

- **Frontend:** `fufut-management/pos` — Vue 3 + Pinia + vue-router. Deployed to
  Cloudflare Pages (`fufut-pos`) by `.github/workflows/build-pos.yml` on push to
  `master`. Built with `--base /`; vue-router base is `/pos/`.
- **API:** Cloudflare Worker repo `fufut-api`, source in its own repo
  (push to `main` deploys via `.github/workflows/deploy.yml` staging → smoke →
  production). D1 `fufut-db` + KV namespaces.
- **Order lifecycle today:** `apiPost('orders', …)` runs **only inside
  `processPayment()`** (`pos/src/views/CheckoutView.vue:607`). The kitchen never
  sees an order until the guest pays. Zero of 32 live orders have a table
  attached. This is the core defect.
- **Order store:** `pos/src/stores/order.js` — cart state, `buildOrderPayload()`
  at line 495 already emits `status: 'new'`, `orderItems` (with modifiers and
  notes), `subtotal`, `discount`, `tip`, `paymentBreakdown`.
- **Kitchen:** `pos/src/views/KitchenView.vue` consumes `GET /api/orders/items/active`
  and per-item status updates via `PUT /api/orders/:orderId/items/:itemId`
  (`src/handlers/orders.js:478`). Chef-only route.
- **Tables:** `pos/src/views/TablesView.vue` floor plan; `newOrderForTable`
  routes to `menu-view?table=N`; `MenuView` builds the cart per active table.
- **Already merged (do not redo):** `GET /api/orders/:id` now exists and returns
  the order with `order_items` attached (`orders.js:475`). Regression tests in
  `fufut-api/test/orders-single.test.js`.

Run `npm test` in `pos/` and `fufut-api/` before and after. Frontend is 261
tests, backend 438; CI gates deploy on them. Add a regression test for every fix
and confirm each new test **fails against the unfixed code** before you call it
done.

---

## Task 8 — Open tabs and fire-to-kitchen

The guest's bill must exist from the moment the order is taken, not from the
moment it is paid. A dine-in order needs: a **Send to Kitchen** action that fires
the lines to the pass immediately, an **open tab** per table the waiter can come
back to and add a round to, and **Checkout becomes settlement** of that existing
order rather than creation of a new one.

### Do

1. **Send to Kitchen**
   - Add a **Send to Kitchen** button in the POS (cart / menu view, before
     checkout). It calls `POST /orders` with `status: 'new'` and
     `payment: 'unpaid'` — same payload `buildOrderPayload()` already produces,
     minus the payment step.
   - The kitchen board (`KitchenView.vue` / `/api/orders/items/active`) must show
     these lines immediately. Verify the item-flow status transition
     (`src/lib/timing.js` `ITEM_FLOW`) already handles `new` on arrival.

2. **Open tab per table**
   - Order state machine: `new → preparing → served → unpaid → paid`.
     `payment: 'unpaid'` already appears in live data — make it the default for
     dine-in from the moment of Send to Kitchen.
   - `TablesView` must show a badge/state for tables with an open unpaid tab,
     and tapping the table must offer **New Order / Add Round** where Add Round
     resumes the existing open order instead of building a fresh cart.

3. **Add a round**
   - `PATCH /api/orders/:id/items` — append lines to an existing open order.
     Model it on `insertOrderItems` (`orders.js:90`) so new lines are inserted
     with the next `line_no`, their own category, modifiers and notes, and the
     kitchen board picks them up as `new`.
   - Waiter flow: seated table with open tab → Menu → select items → **Add to
     Order** (PATCH) instead of creating a second order.

4. **Checkout settles, not creates**
   - Move `processPayment` to take an existing `orderId` (from the open tab) and
     record the payment + tip against it (`recordSubmittedPayments`,
     `recordSubmittedTip` in `orders.js` already do this given the order id).
   - `POST /orders` from checkout should be the fallback for takeaway / no-tab
     flows only.

5. **Courses (per-line Fire)**
   - Add a `course` field per `order_items` line (e.g. starters / mains) and a
     per-course fire action on the kitchen board so the pass gets rounds
     sequentially, not everything at once.
   - Migration needed in `fufut-api/migrations/` (see `005-financials-payments-tips-audit.sql`
     for the existing pattern; order_items already carries `line_no`).

### Out of scope

- Void/refund of paid orders (already manager-only in `orders.js`).
- Delivery job creation (already handled by `createDeliveryJob`).
- Menu data corrections (Task 9 — owner decision, not code).

### Definition of done

- A waiter can take a dine-in order, hit Send to Kitchen, and the kitchen board
  shows it before any payment.
- The same table shows an open unpaid tab; the waiter can add a round (PATCH)
  and the new lines appear on the board.
- Checkout settles that order: payment + tip attach to the existing order id;
  the table flips to occupied then clears on settlement.
- All backend routes enforce the role matrix (head-waiter reads `orders`,
  writes `orders` — confirmed in `src/auth.js`).
- Every new route/test has a regression test that fails on the unfixed code.
- Kitchen per-course fire works: courses hit the pass in order.
- CI green on both repos; live verification on `pos.fufutcoffee.com` as the
  head-waiter account.
