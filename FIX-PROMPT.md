# Fix Prompt — FU FUT COFFEE POS

Paste this to an agent (or work through it yourself). It is ordered by severity;
do not reorder. Findings were verified live against production on 2026-08-08 —
see `ROLE-AUDIT.md` and `WAITER-AUDIT.md` for the evidence behind each item.

---

## Context you need first

- **Frontend:** `fufut-management/pos` — Vue 3 + Pinia + vue-router, deployed to
  Cloudflare Pages (`fufut-pos`) by `.github/workflows/build-pos.yml` on push to
  `master`. Built with `--base /`; vue-router base is `/pos/`.
- **API:** a **separate Cloudflare Worker** at
  `fufut-api.fufutcoffee.workers.dev`, proxied same-origin via
  `pos/functions/api/[[path]].js`. **Its source is in neither repo — you must
  obtain it before tasks 1, 2, 4 and 7 can be done.** If you do not have it, stop
  and say so rather than faking a frontend-only fix.
- Orders currently persist only these 12 columns: `id, items, total, payment,
  type, table_id, customer, status, created, email, tableNum, table_number`.
- Run `npm test` in `pos/` before and after. It is 121 tests and CI gates the
  deploy on it. Add a regression test for every fix, and confirm each new test
  **fails against the unfixed code** before you call it done.

---

## Task 1 — [P0] Require authentication on every API endpoint

**The entire API is public.** Verified from a clean shell, no cookies, no origin:

```bash
curl -s https://pos.fufutcoffee.com/api/staff        # 200 — full staff PII
curl -s https://fufut-api.fufutcoffee.workers.dev/api/orders   # 200 — all orders
```

Currently exposed to anyone on the internet: staff names/emails/**phone
numbers**, customer names/**phones**/emails from reservations, all 32 orders,
and full revenue.

Do:
- Reject any unauthenticated request to `/api/*` with **401** — except the
  login endpoint and any genuinely public read the website needs (if the public
  site reads the menu, expose that as a *separate*, explicitly public,
  read-only route).
- Validate the session cookie server-side on every request. Do not trust any
  client-supplied role, header or body field.
- Add tests proving an anonymous request gets 401 on each protected endpoint.

## Task 2 — [P0] Verify whether writes are open, then close them

I did **not** test writes — a write probe against a live restaurant's data is
destructive. Since reads need no auth, assume writes are open until proven
otherwise.

Do:
- In a **staging** environment (or with the owner watching), test
  `POST/PUT/DELETE` on `orders`, `menu`, `staff`, `tables` unauthenticated.
- If they succeed: treat the data as potentially tampered with. Check for
  unexpected menu prices, unknown orders, and altered staff rows.
- Enforce auth + role on all mutations. Deleting or repricing the menu must be
  manager-only.

## Task 3 — [P0] Fix the blank-screen crash for three roles

**Assistant Chef, Delivery Staff and Cleaner get a completely blank app.**
`#app` renders 88 bytes.

`pos/src/components/AppLayout.vue:192`:

```js
while (items.length < 5) items.push(null)
```

`pos/src/components/AppLayout.vue:84`:

```html
<template v-for="item in bottomItems" :key="item.view">
  <button v-if="item" ...>
```

`:key` is on the `<template>` and evaluates **before** the child's `v-if`, so
`null.view` throws `TypeError: Cannot read properties of null (reading 'view')`.
It fires for any role with **fewer than 5** nav items.

Do:
- Fix it properly — either stop padding with `null` and let CSS space the bar,
  or pad with real placeholder objects and key on a stable index. Do not just
  move the `v-if`.
- Add a test that mounts `AppLayout` as a 2-permission role (cleaner) and
  asserts it renders without error. This is the regression that matters.

## Task 4 — [P0] Per-user passwords, and stop the shared default

All seven accounts log in with **`fufut2026`**. `server_secure.py` comments that
it "should be changed on first login" — nothing enforces that. One leaked
password compromises every account, and there is no audit trail of who did what.

Do:
- Force a password change on first login.
- Hash with bcrypt/argon2 if not already; never store or return plaintext.
- Rotate all seven existing passwords as part of the rollout.
- Consider short PINs per user for fast POS login, backed by a real password for
  sensitive actions.

## Task 5 — [P1] Make the role matrix a deliberate decision

`pos/src/api/index.js` → `ROLE_PERMISSIONS`. Confirm each with the owner rather
than inheriting it:

- **Cashier** currently has `analytics`, `reports`, `revenue` — company-wide BI.
  A cashier likely needs their drawer and today's transactions only.
- **Head Waiter** has `checkout` — means a waiter takes payment with no separate
  till accountability. Defensible, but decide it on purpose.
- **Cleaner** lands on `dashboard`, which is order/revenue-shaped. Their landing
  view should be the waste log.

Whatever is agreed, it must be enforced **server-side** (Task 1), not just in
the router.

## Task 6 — [P1] Audit KPIs that depend on permission-gated data

`DashboardView.loadDashboard()` only fetches a resource if the role holds its
permission. Any KPI reading that resource then renders **0** rather than hiding
itself.

This already shipped as a bug: the waiter's **Low Stock** tile was structurally
always `0`, and the "Low Stock Alerts" card always claimed "All items stocked" —
asserting a fact the app never checked. *(Fixed for head-waiter; the pattern may
exist elsewhere.)*

Do:
- Sweep every role branch in `buildKpis()`. A tile whose data the role cannot
  fetch must not render at all.
- Same for the `showRecentOrders` / `showLowStock` card flags.
- Note the waiter branch also built KPIs inside an unhandled promise — check the
  other async branches (`delivery-staff`) for the same missing `.catch`.

## Task 7 — [P1] Persist the order fields the UI already collects

`buildOrderPayload()` sends `orderItems`, `notes`, `subtotal`, `tip`, `tipType`,
`discount`, `discountType`, `discountReason`, `paymentBreakdown`. **The backend
stores none of them.**

Consequences today: order notes (including allergies) are silently dropped;
line-level modifiers are lost; and the tip/discount/split-bill features compute
values, show them to the guest and fold them into `total` while storing no
breakdown — **tips cannot be reported on and discount reasons are unauditable**.

Do: add the columns, then verify end-to-end that a note typed at checkout
reaches the kitchen view.

## Task 8 — [P1] Open tabs and fire-to-kitchen

Currently `apiPost('orders', …)` runs **only inside `processPayment()`**, so the
kitchen cannot see an order until the guest has paid — unworkable for dine-in.
Zero of 32 live orders have a table attached.

Do (needs the Worker repo):
- `POST /orders` with `status:'new'` behind a **Send to Kitchen** button,
  separate from payment.
- Open tab per table: `new → preparing → served → unpaid → paid`
  (`payment:'unpaid'` already appears in live data).
- `GET /orders/:id` (currently **404**) and `PATCH /orders/:id/items` so a waiter
  can add a round to a seated table.
- Move Checkout to *settle* an existing order rather than create one.
- Add a `course` field per line + per-course Fire, so starters and mains don't
  hit the pass together.

## Task 9 — [P2] Menu data corrections (owner decision, not code)

- **`Fut breakfast Gebeta` and `FASTING FIRFIR` are priced ETB 0** — orderable
  for free. Urgent.
- *Espresso* at ETB 350 vs Macchiato 130 / Flat White 150 — likely a typo for 150.
- Two different items both named *Fut Special Gebeta* (1400 and 900) —
  indistinguishable to a waiter mid-service.
- Nonsense serving tags: "Mineral Water 1L — *Hot or cold*", "Sparkling water —
  *Warm or Clod*".
- Typos: "Tridintional", "ALARRBIATA", "CHIKEA", "miced", "fllings", "Mall
  pieces", "personation", "pinapple", "Ginjer", "Mineral Water **I**L".
- Inconsistent casing: `HOT DRINKS` / `SALAD BOWL` / `ETHIOPIAN DISH` vs
  `Drinks` / `Breakfast`.
- `MenuView.categoryIcons` is keyed for categories that no longer exist, so
  `HOT DRINKS`, `SALAD BOWL` and `ETHIOPIAN DISH` all fall back to the same
  generic 🍽️.

## Task 10 — [P2] Remaining polish

- Delete the stale `RESEARCH-REPORT.md` — it documents a pre-Vue architecture
  (`biz/index.html`, `admin123`, polling kitchen) that no longer exists and will
  mislead the next reader.
- `pos/index.html`, `index.html.built`, `index.html.source`, `pos-index-built.html`
  and a committed `pos/assets/` build output all coexist. Pick one source of
  truth; the workflow committing built assets back to `master` causes rebase
  churn on every push.
- Rotate the Cloudflare and GitHub tokens that were shared in chat.

---

## Definition of done

- `curl` with no cookies returns **401** on every protected endpoint.
- All 7 roles load the app and reach their default view without console errors.
- No role can read data outside its permissions **via the API**, not just the UI.
- No account still uses `fufut2026`.
- A note typed at checkout is visible on the kitchen ticket.
- `npm test` green, with a new failing-before/passing-after test per fix.
