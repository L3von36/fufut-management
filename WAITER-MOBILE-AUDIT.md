# FU FUT COFFEE POS — Waiter Mobile Audit

**Date:** 2026-08-27
**Account:** yonas@fufut.coffee (Yonas Girmay, Head Waiter)
**Method:** Signed in to production on pos.fufutcoffee.com in a phone-class
viewport (iPhone 14 emulation, 390×844, touch input), walked all 8 permitted
screens as the waiter sees them, interacted with every control on each screen
— every quick action, filter, form, sheet, stepper, toggle and button — and
ran the two money flows (send-to-kitchen and settle) end to end through the
real screens. Every finding was reproduced, then fixed, deployed and
re-verified on the same viewport.

---

## Verdict at a glance

| Area | Result |
|---|---|
| Login on mobile | ✅ 9/10 — centered card, full-width sign-in, branding intact |
| Bottom navigation (6 items + More) | ✅ all 8 screens reachable one-handed |
| Sidebar drawer (More) | ✅ 72% width, grouped items, Sign Out reachable |
| Tables floor plan | ✅ 8/10 — 2 cards/row, section + status chips scroll, Live toggle |
| Table detail bottom sheet | ✅ 10/10 — status buttons, server/guests/notes, Active Orders with id/status/total |
| Menu View + table context bar | ✅ search, category chips, modifier sheet, 44×44px cart controls |
| Cart sheet → Send to Kitchen | ✅ after fix — was silently broken, see W-1 |
| Add Round (PATCH path) | ✅ button relabels, tab updates, audit trail intact |
| Checkout hydration → payment | ✅ all 6 methods, tip %/fixed, split bill, Exact tender |
| Success screen | ✅ after fix — Free Up Table button added, see W-2 |
| Orders list | ✅ 8/10 — responsive stacked cards, search + status filter |
| Open Checks | ✅ clean empty state with summary cards |
| Dashboard (waiter branch) | ✅ 9/10 — KPI fixed, see W-4 |
| Reservations | ✅ 9/10 — form, confirm dialogs, search, status filter |
| Time Clock | ✅ clock in/out cycle works, live state card |
| Dark mode | ✅ 9/10 — consistent theme, no contrast failures |
| Speed | ✅ 79ms DOMContentLoaded, ~480ms API latency, SSE live updates |
| Console errors | ✅ zero page errors across the walk |

The waiter's day is genuinely mobile-shaped here: bottom nav, bottom sheets,
44px touch targets, one-thumb reach. What was broken was not the layout — it
was what happened when the server said no.

---

## The bug this audit found — and its fix

### W-1/W-3 (the headline): a server refusal masqueraded as offline success

**Reproduction (live, pre-fix):** seat a party from the table sheet — the
normal first act of table service — then build their order and tap
**Send to Kitchen**. The kitchen got the order… and behind the screen:

```
PUT /api/tables/T5 → 409 "Table 5 already has a party seated"
PUT /api/tables/T5 → 409          (retry — the 409 was misread as a network
PUT /api/tables/T5 → 409           error and replayed with backoff)
POST /api/orders   → 200           (the order fired anyway)
```

Three failures stacked in one tap:

1. **`claimTable` claimed a new seating over the party already sitting
   there.** The server's rule is correct — `seated_at` is the seating's
   identity, and a *different* `seated_at` means a new party. But the POS
   itself had just seated that party via the table sheet; the waiter's order
   belongs to that seating. CheckoutView already skipped the claim for
   occupied tables; MenuView did not.
2. **The api layer swallowed the refusal.** `apiPut`/`apiPost`/`apiPatch`/
   `apiDelete` caught *any* error — including a 409 with a full JSON reason —
   queued the refused write as a pending offline mutation, and answered the
   caller `{ok:true,_offline:true}`. The caller believed the claim succeeded.
   The read path had already been fixed for this exact class of bug
   (api-refusal.test.js); the write path had not.
3. **tryFetch retried the thrown HTTP error as a network error.** The
   `!r.ok` branch throws an Error; the outer catch could not tell it from a
   dead socket, so every 4xx became three identical failing requests plus
   1.5s of dead air before the error toast — and `useSync` replayed the
   queued refusal every 30s forever, because fetch does not throw on an HTTP
   status, so the retry counter in the catch block never counted it.

**Fix (commit be65c6d):**

- `api/index.js` — refusals (`e.status` set) rethrow on every write verb;
  only a dead network queues. HTTP errors carry `httpError:true` and are
  never retried; genuine network failures still are.
- `useSync.js` — a replay answered with a permanent 4xx drops the queued
  item; 5xx and network failures stay queued.
- `MenuView.claimTable` — an already-occupied table is not claimed; the
  order belongs to the party seated there (CheckoutView's existing rule).
  A genuinely refused claim (reserved table) now stops the send with the
  server's own reason.

**Re-verified live post-deploy:** same scenario — seat Table 5, order an
Espresso, Send to Kitchen → one toast ("Order #a27e sent to kitchen!"),
zero table PUTs during the send, zero 409s, cart cleared, order `O3d2a27e`
new/unpaid on the server. The poisoned queue entries from the old bundle
were dropped (unit-tested; the headless test browser throttles sync timers,
so the drop was verified via the sync engine's own suite rather than a live
tick).

### W-2: nowhere to free the table after payment

**Reproduction:** settle a dine-in tab through Go to Checkout → pay exact →
"Order Confirmed!" — and the table stays **Occupied**. The only Free Up
button lived on the pre-payment review step; from the success screen the
waiter's most common next act — free the table for the next party — had no
button at all. The audit's own test run left Table 3 occupied after a fully
paid bill until it was freed by hand through the API.

**Fix:** the success screen now shows **Free Up Table N** for settled
dine-in tabs (with the existing confirm dialog), and the button retires once
used. Re-verified live: settled Table 5's tab → "Free Up Table 5" appeared →
confirm → toast "Table 5 is now Available" → server shows
`status:available, guests:0, server:''` → button gone.

### W-4: "Open Orders" counted paid bills

The waiter dashboard's Open Orders tile counted every order that was not
`fulfilled`/`cancelled` — including served-and-**paid** bills. After the
audit's test settlement the tile read "1" with zero work left in the
restaurant, sending the waiter hunting for an order that needed nothing.
Fixed to exclude paid orders (both `payment_status` and legacy `payment`
spellings); unpaid tabs still count whatever their kitchen status — that is
money to collect. Re-verified live: tile reads 0 with paid orders on the
day.

---

## What was exercised live

- **Login → Tables** (default landing correct), hamburger, bottom nav, More
  drawer, dark-mode toggle, Live toggle, Refresh, section chips (Patio/Main
  Hall/Window/VIP/Bar), status chips (Free/Seated/Reserved/Cleaning).
- **Table detail:** all four status buttons, server/guests/notes edits,
  Save Changes (persisted and reflected in floor chips: 10 Free → 1 Seated),
  Active Orders (id, status, total), Add Round, Go to Checkout, Free Up.
- **Menu View:** table context bar ("Ordering for Table 3" + Change),
  category chips with live counts, search ("tea" → exactly 3 items), compact
  list toggle, course filters (Starters/Main/Dessert), unavailable items
  (Pizza/Shiro/Tibs render disabled), tap-to-add, hold-to-add-quantity,
  modifier sheet (Hot toggle, qty stepper, special instructions → line shows
  "[Hot] (extra honey)"), cart pill, cart sheet (per-line −/+/✕ at 44×44px,
  Clear All, subtotal arithmetic 420→490 correct).
- **Send to Kitchen** (new order), **Add to Order** (add-round PATCH path —
  button relabels, helper text changes, tab total 490→640 correct).
- **Checkout:** hydration from the open tab, order type/table/customer
  selectors, Free Up #N, per-line qty controls, order notes, Continue to
  Payment, all six payment methods, quick-tender buttons, Exact tender, tip
  (Percentage 10/15/20, Fixed, No Tip — 10% = ETB 64 on a 640 bill, total
  recomputed 640→704), Split Bill checkbox, Process Payment, confirmation
  screen (order id, amounts, Print Receipt, New Order, Free Up Table,
  Back to Dashboard).
- **Orders:** search, status filter (New → 1 row), responsive stacked cards,
  role-appropriate row actions (no actions on settled orders; Complete
  appears for `ready` — chef-act buttons correctly hidden for the waiter).
- **Open Checks:** summary cards (0 open / ETB 0 / —), empty state
  "Nothing outstanding".
- **Dashboard:** greeting, Refresh, all four quick actions (Floor Plan →
  /tables, New Order → /menu-view), waiter KPI tiles, Recent Orders card.
- **Reservations:** list, search, status filter, + New form (guests, date,
  time, table, hold window, phone — created "Mobile Audit Test" for 4 guests,
  then cancelled through the confirm dialog; both sides in history).
- **Time Clock:** Clock In (state card → "On shift / Since 08:20"), Clock
  Out (→ "Not clocked in"); the 4-minute audit shift is in the attendance
  log as Yonas's.
- **PWA/mobile chrome:** viewport meta correct, manifest loads, no
  `apple-mobile-web-app-capable` meta (harmless; the manifest covers it).

---

## Noted, not fixed

- **Quick-tender buttons are fixed denominations** (10/50/500/1000) rather
  than amount-aware (e.g. round-ups of the bill). Exact tender exists and the
  arithmetic is right; this is a speed nicety for cash-heavy service.
- **Menu card names truncate at 3-per-row** on 390px ("Mineral Water 0.5L").
  Readable, cosmetic.
- **Time Clock shows no personal history** — current state and the clock
  buttons only. A "my last shifts" list would be nice; not a defect.
- **Probe-order names from the price-validation audit** ("ATTACKER-E") are
  visible in the Orders list to staff. They are voided history; renaming
  would falsify the audit trail, so they stay.
- **Headless-browser timer throttling** masked the 30s sync tick during live
  verification (Chromium throttles intervals in hidden pages). Not an app
  issue; noted so the next auditor isn't confused by a silent sync engine in
  an automated session.

---

## Cleanup

All test data reverted: orders `Odc688a4` (704 + 64 tip, payment
auto-refunded), `Oa9fcc4e` and `O3d2a27e` voided as training; the "Mobile
Audit Test" reservation cancelled; all 10 tables back to available; the
poisoned sync-queue entries cleared from the test browser. Final state:
0 pending orders, 10/10 tables free.

---

## Sources

- Live walk: pos.fufutcoffee.com, yonas@fufut.coffee, 390×844 viewport,
  2026-08-27 (screenshots: 30 files under `download/waiter-mobile-audit/`)
- Code: `pos/src/api/index.js`, `pos/src/composables/useSync.js`,
  `pos/src/views/MenuView.vue`, `pos/src/views/CheckoutView.vue`,
  `pos/src/views/DashboardView.vue`; server contract:
  `fufut-api/src/handlers/tables.js` (newSeating / isNewSeating),
  `fufut-api/src/lib/booking.js`
- Tests: `api-refusal-writes.test.js` (14), `sync-refused-writes.test.js`
  (5), `MenuViewClaimTable.test.js` (4), `CheckoutSuccessFreeTable.test.js`
  (3), waiter block in `DashboardReporting.test.js` (3) — suite 365 passing
  across 34 files
- Fix commit: `be65c6d` (deployed as `index-Dfasbv3m.js`, CI green)
