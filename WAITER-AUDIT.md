# FU FUT COFFEE POS — Waiter Experience Audit

**Date:** 2026-08-07
**Scope:** The `head-waiter` role on `pos.fufutcoffee.com` (Vue 3 + Pinia + SSE, Cloudflare Pages).
**Method:** Signed in to production as Yonas (Head Waiter), walked the real order-taking path with Playwright, then traced every symptom back to source. Every P0 below was reproduced in the live app before being written down — none are inferred from reading code alone.

> Supersedes the waiter-relevant parts of `RESEARCH-REPORT.md`, which describes a pre-Vue architecture (`biz/index.html`, `admin123`, polling kitchen) that no longer exists.

---

## 1. What the waiter role gets right

This is a genuinely capable build, not a prototype. Worth stating plainly before the criticism:

- **Correct default landing view.** `head-waiter` opens on **Tables**, not a dashboard. Right call — the floor plan is the waiter's home base.
- **Tight permission scoping.** Waiters see 6 nav items, not the manager's 19. No Kitchen/P&L/Inventory noise.
- **A real floor plan.** Sections (Patio / Main Hall / Window / VIP / Bar), per-table shape, capacity, guest count, assigned server, and a live occupancy timer.
- **SSE live updates** already wired for `table_update` / `new_order` / `order_update` — most builds at this stage are still polling.
- **Structured cart with modifiers**, dedup keys, and split-bill/tip/discount logic in the order store.
- **Dark mode** and a coherent teal/gold token system throughout.

The foundation is good. The problems below are workflow and correctness gaps, not architectural rot.

---

## 2. P0 — Verified defects (all fixed in this pass)

### 2.1 Every toast on the site rendered unstyled, covering the page

**Severity: Critical — cosmetic catastrophe on every screen, every role.**

`App.vue` renders a static `<div id="toastContainer">`. `useToast.ensureContainer()` found it and returned early — **skipping the style-injection block that lived below the early return**. Result: `document.querySelectorAll('style[data-toast-styles]').length === 0`.

With no CSS, the toast's bare SVG icon has no size constraint. Measured live on the Tables screen:

```
svgComputedWidth:  "1019px"
svgComputedHeight: "1019px"
```

A 16px checkmark rendering at **1019×1019px**, pushing the entire floor plan down the page. This fired on every login ("Welcome back, Yonas") and every save/refresh action.

**Fix:** `ensureContainer()` now creates the container only if missing, but always applies attributes and injects styles.

### 2.2 The waiter's table selection was silently discarded

**Severity: Critical — orders detach from tables.**

`TablesView.newOrderForTable()` routes to `/app/menu-view?table=N`. But:

1. `MenuView.vue` **never read `route.query.table`.**
2. `MenuView.goToCheckout()` called `resetCheckout()`, which **explicitly set `tableNum.value = ''`.**

The context was destroyed twice over. Verified live: opened `?table=1`, added an item, reached checkout — the Table field was **empty**, and no table indicator appeared anywhere on screen.

The waiter had to remember and retype the table number they had just tapped. Mistype it and the order is orphaned: `TablesView`'s per-table order counts and totals match on `table_number`, so a wrong number silently breaks the floor plan's order badges.

**Fix:** `MenuView` reads the param into `orderStore.tableNum`, `resetCheckout({ keepOrderContext: true })` preserves it through to checkout, and a persistent **"Ordering for Table N"** bar now keeps the context visible with a "Change" escape hatch.

### 2.3 A 10% tip was silently added to every bill

**Severity: Critical — billing integrity.**

`tipType` defaulted to `'percentage'` with `tipPercent = 10`, and `grandTotal` includes the tip. A 130 ETB Macchiato showed as **ETB 143** before anyone chose to tip.

Worse, the **same screen showed two different totals at once**, verified live:

| Element | Source | Displayed |
|---|---|---|
| Floating cart bar | `grandTotal` (incl. tip) | **ETB 143** |
| Cart sheet "Total" | `cartTotal` (excl. tip) | **ETB 130** |

Auto-applying gratuity without an explicit choice is a serious integrity problem anywhere, and tipping norms in Ethiopia make a silent 10% especially wrong.

**Fix:** `tipType` now defaults to `'none'` (the tip UI already has a "No Tip" tab and is collapsed by default, so this is the intended off-state). The floating cart now shows `cartTotal`, matching the sheet.

### 2.4 Order notes — including allergies — were thrown away

**Severity: Critical — food safety adjacent.**

The checkout has an order-notes field placeheld *"Order notes (e.g. no onions on everything)…"*, bound to `store.notes`. But `buildOrderPayload()` had **no `notes` key**. Everything typed there was silently dropped before the API call. A waiter entering *"no dairy — allergy"* got a confirmation and the kitchen never saw it.

Additionally, `notes` was never cleared by `resetFull()`, so a note would have leaked into the *next* order once transmitted.

**Fix (frontend only — see caveat):** `notes` is serialized into the payload (omitted when blank), and cleared with order context.

> ⚠️ **This is not yet end-to-end.** The API stores a fixed 12-column row
> (`id, items, total, payment, type, table_id, customer, status, created,
> email, tableNum, table_number`). It has **no `notes` column**, so the field
> is now sent but still dropped server-side. Confirmed against all 32 live
> orders: none carry `notes`, and POS-created orders show `orderItems` is
> discarded too. Closing this needs a backend change — see §3.1.

### 2.5 Offline support was completely dead

**Severity: High — this is a tablet POS on restaurant wifi.**

Console on every load:

```
Service worker registration failed … unsupported MIME type ('text/html')
```

Root cause: the app is **built with `--base /`** (assets at `/assets/…`) but **vue-router's base is `/pos/`**. `main.js` registered `/pos/sw.js` — which is not a file, so the SPA fallback returned `index.html`, and the browser rejected HTML as a script. The `vite-plugin-pwa` dependency and a hand-written `sw.js` both exist; neither ever ran.

Two further latent faults in `sw.js` itself:
- It precached `/pos/assets/logo.webp` and `/pos/favicon.svg` — both SPA-fallback paths that would have cached **HTML in place of images**.
- It used **cache-first for navigations**, which pins staff to an old app shell after each deploy; that shell then requests asset hashes that no longer exist → blank screen until the cache is manually cleared.

**Fix:** register `/sw.js`; corrected precache paths to real root URLs; per-asset `cache.add` so one 404 can't abort install (`addAll` is atomic); navigations now network-first with a cached-shell offline fallback; cache bumped to `v3` to evict poisoned entries.

### 2.6 Broken PWA manifest icons

`manifest.json` pointed all PNG icons at `/pos/assets/logo.png` — wrong prefix, wrong directory, and **that file does not exist anywhere in the repo** (the real assets are `logo.webp` / `logo.jpg`). Install prompts and the home-screen icon were broken.

**Fix:** icons now point at files that exist, at their **verified** dimensions (`apple-touch-icon.png` 180×180, `favicon-128x128.png` 128×128, plus scalable `favicon.svg`), and `scope` was added.

---

## 3. The structural gap: a waiter cannot send an order to the kitchen

**This is the most important finding, and it is not yet fixed — it needs your decision.**

`apiPost('orders', …)` appears in exactly one place in the waiter's path: **inside `processPayment()`**. There is no "Send to Kitchen" / "Fire" action anywhere.

The order does not exist until the guest has paid. So the kitchen cannot start cooking until payment clears.

That is a **quick-service / counter-service** model (order → pay → make), and it's coherent for a takeaway coffee bar. But this product is clearly also built for full-service dining — it has tables with sections and shapes, seat/guest counts, occupancy timers, a Head Waiter role, and reservations. For that side of the business the flow is backwards.

Industry-standard table service is: **open tab → fire to kitchen → serve → add rounds → settle at the end.** Lightspeed requires assigning a table *or* opening a tab before an order can exist; Toast exposes explicit *Fire course* controls so a server can hold starters and release mains on command.

Concrete consequences today:
- Guests must pay before food is cooked — unworkable for dine-in.
- No way to add a second round of drinks to a seated table's existing bill.
- No coursing: everything fires at once, so starters and mains hit the pass together.
- `TablesView` shows "Active Orders" per table and a `tableOrderCounts` badge — features that can only populate from **paid** orders, so they under-report reality.
- The waiter has no Kitchen permission (correct — they don't need the KDS screen), but they also have no way to *reach* the kitchen at all.

### 3.1 Blocker: the API schema cannot express any of this today

Probed the live API as the waiter role. `GET /api/orders` returns exactly 12
columns:

```
id, items, total, payment, type, table_id, customer, status, created,
email, tableNum, table_number
```

Everything else `buildOrderPayload()` sends — **`orderItems`, `notes`,
`subtotal`, `tip`, `tipType`, `discount`, `discountType`, `discountReason`,
`paymentBreakdown`** — is silently discarded. The entire "Phase 2" tip /
discount / split-bill feature set computes values, shows them to the guest and
folds them into `total`, but the breakdown is never stored. **You cannot report
on tips, and a discount reason is unauditable.**

Two further facts from the probe:

- **Zero of 32 orders have any table set** (`tableNum`, `table_number` and
  `table_id` all null across the board). That is the real-world footprint of
  §2.2 — every order ever placed is detached from its table. This should begin
  resolving now that the table fix is deployed, assuming the backend persists
  the `tableNum` it is sent.
- `GET /api/orders/:id` returns **404** — there is no single-order endpoint,
  so there is nothing to append items to. `?table_number=` filtering *does*
  work.

**The API Worker (`fufut-api.fufutcoffee.workers.dev`) source is in neither
`fufut-management` nor `fufut-coffee`.** Open tabs, coursing and order notes
all require schema and endpoint changes there, so this work cannot start until
that repo is available.

Backend changes required:

| Need | Change |
|---|---|
| Order notes reach kitchen | Add `notes` column |
| Line-level modifiers survive | Persist `orderItems` (JSON) |
| Tip/discount reporting | Add `subtotal`, `tip`, `discount`, `discount_reason` |
| Append to an open tab | `GET /orders/:id` + `PATCH /orders/:id/items` |
| Coursing | Add `course` per line, `fired_at` timestamp |
| Tab lifecycle | Constrain `status`; `payment: 'unpaid'` already appears in live data |

**Recommended shape** once the backend is reachable (roughly 1–2 days):

1. Add `POST /orders` with `status: 'new'` behind a **"Send to Kitchen"** button in the cart, separate from payment.
2. Introduce an **open tab per table**: `status` lifecycle `new → preparing → served → unpaid → paid`.
3. Let `TablesView` → occupied table → **"Add to Order"** append items to the open tab.
4. Move Checkout to *settle an existing order* rather than *create one*.
5. Add a **course** field per line (`starter` / `main` / `drink`) with a per-course Fire action.

This is the single change that would move the app from "coffee counter till" to "restaurant POS."

---

## 4. Menu data integrity (visible to guests, needs an owner decision)

Pulled from live production data — these are content problems, not code:

| Issue | Detail |
|---|---|
| **Zero prices** | *Fut breakfast Gebeta* and *FASTING FIRFIR* are both **ETB 0** — orderable for free |
| **Suspect pricing** | *Espresso* at **ETB 350** vs *Macchiato* 130 / *Flat White* 150. Likely a typo for 150 |
| **Duplicate names** | Two distinct items both named *Fut Special Gebeta* (1400 and 900) — indistinguishable to a waiter |
| **Nonsense temp tags** | "Mineral Water 1L — *Hot or cold*", "Sparkling water — *Warm or Clod*" |
| **Typos** | "Tridintional", "Clod", "ALARRBIATA", "CHIKEA", "miced", "fllings", "Mall pieces", "personation", "pinapple", "Ginjer", "Mineral Water **I**L" |
| **Inconsistent casing** | `HOT DRINKS` / `SALAD BOWL` / `ETHIOPIAN DISH` shout, while `Drinks` / `Breakfast` don't |

Also a code-level nit: `MenuView.categoryIcons` is keyed for categories that no longer exist (`'Hot Drink / ትኩስ መጠጦች'`, `'Coffee'`). Live categories `HOT DRINKS`, `SALAD BOWL`, and `ETHIOPIAN DISH` all miss and fall back to the generic 🍽️ — which is why three different tabs share one icon.

**The two ETB 0 items are the urgent ones.** They should be corrected in the menu before the next service.

---

## 5. Touch ergonomics

Established guidance is a **44×44px minimum** tap target (Apple 44, Google 48) with ~5mm spacing. The most-tapped controls in the app fall short:

| Control | Size | Verdict |
|---|---|---|
| `.qty-btn` (MenuView) | **30×30** | Under minimum |
| `.qty-btn` (CheckoutView) | **32×32** | Under minimum — *and inconsistent with MenuView* |
| `.cart-remove` | **28×28** | Well under; sits directly beside `−`/`+` |
| `.menu-add-btn` (mobile) | **34×34** | Under minimum |

These are quantity steppers used dozens of times per shift, on a tablet, by someone standing and holding it one-handed. A 28px destructive "remove" button adjacent to a 30px decrement button is a mis-tap waiting to happen — and a mis-tap here silently changes the guest's bill.

**Recommendation:** raise all cart controls to ≥44px, standardise the two `.qty-btn` definitions into one shared class, and separate `remove` from the `−`/`+` pair.

---

## 6. Test coverage gap

The suite was **107 tests, all passing** — and caught none of the above. Notably, `composables.test.js` already constructed a pre-existing `#toastContainer` (the exact bug condition in 2.1) but only asserted the element existed, never that styles were injected. There was **no order-store test file at all**, despite that store holding all the money logic.

Added this pass (**119 passing**, +12):
- `tests/unit/order-store.test.js` (new, 9 tests) — tip defaults to zero, `grandTotal === cartTotal` on a fresh cart, table context survives `keepOrderContext`, notes reach the payload, notes don't leak between orders.
- 3 tests in `composables.test.js` — styles inject when a container pre-exists, icon CSS is constrained, container gets `aria-live`.

Each was confirmed to **fail against the original code** (verified via `git stash`), so they are true regression tests rather than tautologies.

---

## 7. Priority

| P | Item | Status |
|---|---|---|
| **P0** | Toast styles never injected | ✅ Fixed |
| **P0** | Table context discarded | ✅ Fixed |
| **P0** | Silent 10% tip / conflicting totals | ✅ Fixed |
| **P0** | Order notes discarded | ⚠️ Frontend fixed; **needs backend column** |
| **P0** | Tip/discount/modifiers not persisted | ⏳ Blocked on backend |
| **P0** | ETB 0 menu items | ⏳ Needs owner |
| **P1** | Send to Kitchen / open tabs | ⛔ Blocked — API Worker repo not available |
| **P1** | Service worker + manifest | ✅ Fixed |
| **P1** | Touch targets ≥44px | ⏳ Proposed |
| **P2** | Menu typos, duplicate names, casing | ⏳ Needs owner |
| **P2** | Category icon key mismatch | ⏳ Proposed |
| **P2** | Coursing / seat assignment | ⏳ Roadmap |

---

## Sources

- [Adding orders in Table Service mode — Lightspeed Restaurant (K-Series)](https://k-series-support.lightspeedhq.com/hc/en-us/articles/360051089273-Adding-orders-in-Table-Service-mode)
- [Manage Course Firing Options — Toast POS](https://support.toasttab.com/en/article/Course-Firing-Options)
- [Manage Orders With Toast POS](https://support.toasttab.com/en/article/New-POS-Experience-Ordering-Screens)
- [What Table-Service Restaurants Should Look for in a POS System](https://www.applegazette.com/resources/what-table-service-restaurants-should-look-for-in-a-pos-system)
- [Touchscreen POS speed & accuracy guide — FAVORPOS](https://www.favorpos.com/guides/touchscreen-pos-speed-accuracy-improvement.html)
- [MotorEase: Automated Detection of Motor Impairment Accessibility Issues in Mobile App UIs](https://arxiv.org/pdf/2403.13690)
