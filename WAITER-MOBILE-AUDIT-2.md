# FU FUT COFFEE POS — Waiter Mobile Audit, Pass 2 (independent re-walk)

**Date:** 2026-08-27 (later the same day — third chronological pass, second full walk)
**Account:** yonas@fufut.coffee (Yonas Girmay, Head Waiter)
**Method:** Fresh agent-browser session, iPhone 14 emulation (390×844) on production, deployed bundle `index-yNKl3tyg.js`. Every screen, button, sheet and form the role can reach, walked end to end through the real UI — including a complete two-table service cycle (seat → order → fire → add round → settle → free) and a second settle from Open Checks. Every finding below was reproduced live, traced to source, and verified with DOM geometry / API reads before being written. Screenshots: `download/role-audits/shots/mobile-waiter/` (31 shots).

**Relationship to `WAITER-MOBILE-AUDIT.md` (passes 1–2):** that audit's fixes were **re-verified in this walk, unannounced, by simply using the app** — details in §1. This pass found **one new P1 and four smaller defects** that the first walk did not reach, because they only surface on a *second* money flow in one session (§2), plus four waiter-perspective UX notes (§3).

---

## 1. Pass-1 fixes re-verified live (all still working)

None of these were announced to this session — the walkthrough just exercised them as a waiter would:

- **W-1/W-3 (server-refusal handling + claimTable):** both Send-to-Kitchen fires in this walk were clean — one toast, zero 409 storms, no replayed refusals, table claimed exactly once.
- **W-2 (Free Up Table on the success screen):** used twice from the confirmation screen; confirm-guarded; table released both times (`available, 0 guests`).
- **W-4 (Open Orders excludes paid):** after settling both tabs, the dashboard's Open Orders tile read **0** — the paid-but-served orders no longer count.
- **Quick tender is amount-aware:** an ETB 840 bill offered **850 · 900 · 1,000 · Exact (ETB 840)** — ascending round-ups that cover the bill, no stray 10/50 notes.
- **Menu card names wrap to two lines:** "Fut breakfast Gebeta" and "Mineral Water 0.5L" render whole in the phone card.
- **Time Clock "My Recent Shifts" card:** present, newest-first, with the ACTIVE badge; the clock-in → ACTIVE row → clock-out → Completed row cycle ran live.
- **Timezone-proof open-shift duration:** on this UTC device the ACTIVE row read `0h 0m`, not `—`.
- **Zero console or page errors** on every screen of the walk — re-confirmed.

## 2. Developer perspective — new bugs found in this pass

### BUG-1 (P1) · A second check cannot be settled after any earlier payment in the same session

**The stale success screen eats the settle flow.** Reproduced live, twice, end to end:

1. Settled a check (ETB 840, cash) → confirmation screen shown → navigated away via the bottom nav (the natural move — no "New Order" tap).
2. Opened a new tab, sent it to the kitchen (ETB 70), then **Open Checks → Settle**.
3. Checkout rendered the **previous order's "Order Confirmed!" screen** — `#O961bf4a` — while the store held the *new* check correctly hydrated:

```
checkoutStep: "success"       ← stale, from the previous payment
activeOpenOrderId: "Ob5d8535" ← correct (the check being settled)
items: ["TEA x1"]             ← cart hydrated correctly
tableNum: "3"                 ← correct
```

The new check's money is invisible and the screen tells the waiter it was already settled; the check stays open. **Recovery is a trap:** tap "New Order" (resets the store, navigates to Menu View), go back to Open Checks, tap Settle again — three non-obvious steps nobody discovers mid-shift. Verified the recovery works: second attempt lands on the Review step and settles normally.

**Root cause** (`pos/src/views/CheckoutView.vue`, `stores/order.js`):
- `checkoutStep` becomes `'success'` on payment completion and is never reset on leaving the screen. The only resets are logout (`resetFull`) and MenuView's new-order path (`resetCheckout({keepOrderContext:true})`) — nothing runs on route-leave.
- `hydrateOpenTab()` (line 608 in current source) hydrates the cart but never touches `checkoutStep`, so the template's success branch keeps rendering over the hydrated tab.
- Both settle entry points share the defect: Open Checks `settle()` and the table panel's `goToCheckout()` set `activeOpenOrderId` and route — neither resets the step.

**Blast radius:** not mobile-specific — desktop hits it too — but a shared floor tablet lives in one SPA session for an entire shift, so **every settle after the session's first payment** is exposed. A full page reload self-heals (the persisted store deliberately does not save `checkoutStep`), which is why this reads as "checkout is sometimes weird" rather than a hard failure. Still unfixed in the current source as of this pass (verified post-rebase on `e642e6d`).

**Fix:** reset the step when hydrating — e.g. in `hydrateOpenTab()`, call `store.resetCheckout({ keepOrderContext: true })` before rebuilding the cart — or in `CheckoutView.onMounted`, drop a `success` step whose `activeOpenOrderId` points at a different, still-open order. Regression test: settle order A → point `activeOpenOrderId` at a fresh open order B → mount Checkout → expect the Review step, not the confirmation.

### BUG-2 (P3) · The Orders filter cannot select the status settled orders actually have

`OrdersView.vue` offers New / Preparing / Ready / Fulfilled / Cancelled — but the payment flow sets settled checks to **`served`**. Verified live: both of this walk's orders displayed `SERVED`; filtering `fulfilled` returned five older orders and **hid both of them**. A waiter looking for "the table I just closed" by status cannot find it. Fix: add `<option value="served">Served</option>` — and reconcile `served` vs `fulfilled`, which appear to be two names for the same terminal state.

### BUG-3 (P3) · Tapping an unavailable dish is a silent no-op

`MenuView.vue` — `handleItemClick` returns silently on `available === false`. No toast, no feedback. On a phone the "Unavailable" ribbon is small; three taps that do nothing read as a frozen app. One line: `toast('That dish is unavailable', 'info')`.

### BUG-4 (P3, a11y) · Unlabelled controls in the mobile-only layers

- The **floating cart bar** is a clickable `<div>` without `role="button"` — the waiter's most-used control is invisible to screen readers.
- The **modifier sheet's** quantity stepper and the **reservation modal's** Guest Name / Guests / Phone inputs expose no accessible names (the a11y tree shows bare `textbox` / `spinbutton "0"`); same for the cart sheet's `− / +`.
Low priority for a floor tablet, but these are exactly the controls a one-handed waiter with assistive tech hits first.

## 3. Waiter perspective — UX notes

### UX-1 (P2) · "Change" on the table context bar mislabels a destructive action

The table context bar reads **"Ordering for Table 3 · Change"**. A waiter taps *Change* expecting a table picker. What runs is `clearTable()`: `tableNum = ''`, `orderType = 'takeaway'`. The bar vanishes, the order is now a **takeaway**, and there is **no picker, no confirmation, and no way back** except leaving the screen and rebuilding the context from Tables. The tooltip admits the real behaviour ("Not for a table (takeaway)") — the label does not. On a phone this sits at the top of the busiest screen, one thumb-tap away: fire the order after this and the kitchen gets a ticket with no table for the food runner to deliver. Compounding inconsistency: after a payment the *same* bar happily persists a stale "Ordering for Table 3" into the next order (defensible — same party, next course), so the bar's lifetime rules are unpredictable. Rename to "Make Takeaway" (or open a real picker), and confirm before dropping a bound table.

### UX-2 (P3) · Open Checks is buried behind "More"

The bottom nav pins five priority views (`BOTTOM_PRIORITY`, AppLayout.vue) — for the head-waiter that leaves **Open Checks, Reservations and Time Clock behind More → sidebar**. Open Checks is the waiter's money screen (what's owed; settle, split, move, merge) and costs three taps from anywhere. Consider adding `open-checks` to the priority list for roles that hold it — the bar already adapts per role.

### UX-3 (P3) · Orders and Reservations stacks are correct but verbose

Both screens use the responsive `data-label` stacked-card pattern (each order = ~12 label/value lines; each booking = 8) — nothing overflows, row actions stay reachable, and nothing is squeezed off-screen. The cost is scanning: one booking occupies a tall block, so a day's sheet means real scrolling. A compact card (name, time, party, status, actions) would fit the waiter's actual question ("who's coming at 2?"). Polish, not a blocker.

### UX-4 (P3) · The reservation modal needs internal scrolling on shorter phones

New Reservation is 776px tall and fits an iPhone 14 exactly, but its content scrollHeight (822px) exceeds the panel — on anything shorter (iPhone SE class, ~667px) the Create row starts below the fold and the waiter must discover the modal scrolls. It scrolls fine; this is a comfort note, with BUG-4's missing field labels making the cramped form harder to verify.

## 4. Suspected during the walk, verified as fine (so nobody re-chases them)

- **"Toasts don't fire on Send to Kitchen / Add Round"** — false alarm from querying `.toast` instead of `.toast-notification`. Toasts fire and render full-width above the bottom nav; verified live on Refresh, clock-in/out and reservation-create.
- **"Modifier sheet's Add-to-Cart is clipped behind the bottom nav"** (VLM screenshot-review claim) — false: the sheet overlay (z-index 400) covers the nav (z-index 150); `elementFromPoint` on the button's bottom edge returns the button itself. Same for the cart sheet hint (z 300).
- **"Section / category chip rows cut off at the right edge"** — horizontal scrollers (432px and 900px of content in 390px); standard swipe pattern, no lockup.
- **"Time Clock didn't clock out"** — the panel lagged the toast by about a second; the shift completed correctly (`10:58 → 10:58, Completed`).

## 5. Test-data cleanup

Both walkthrough orders voided as the manager with auto-refund, ID-targeted only (per the lesson recorded in pass 1's incident):

```
O961bf4a  voided  restocked 14 units  auto-refunded ETB 840  (PM85d90126-c)
Ob5d8535  voided  restocked 2 units   auto-refunded ETB 70   (PM34df1956-b)
```

Table 3 released. The "Mobile Walkthrough" reservation remains as a **cancelled** row, alongside pass 1's "Mobile Audit Test". Floor ends the walk at 10/10 tables available, 0 open checks. Cleanup script: `scripts/mobile-waiter-cleanup.sh`.

## 6. Priority order for fixes

1. **BUG-1** — stale success screen blocks the second settle (one guard in `hydrateOpenTab` + regression test)
2. **UX-1** — rename/confirm the "Change" table-context action
3. **BUG-2** — add "Served" to the Orders status filter
4. **BUG-3** — toast on unavailable-dish tap
5. **UX-2** — Open Checks into the bottom-nav priority list for roles that hold it
6. **BUG-4 / UX-3 / UX-4** — a11y labels, compact cards, modal fit — polish backlog

---

## 7. Fixes closed — same day (commit 736a663, deployed as index-CQGokeB9.js)

Items 1–5 of the priority order above are fixed, deployed and re-verified live
through the same screens that found them. 9 new tests; suite 385 passing across
38 files. The polish backlog (item 6) remains open.

- **BUG-1 (P1) — the stale success screen.** The fix went one step wider than
  the audit's suggestion and drops a `success` step on **every** Checkout
  mount, not just when hydrating: the receipt payload (`lastPayload`) lives in
  the component instance, so a remounted success screen is *always* stale —
  its Print Receipt would print an empty payload even when the order id looked
  right. One guard in `onMounted` (`if (store.checkoutStep === 'success')
  store.checkoutStep = 'cart'`) covers all three entry paths — Open Checks →
  Settle, a table's Go to Checkout, and walking in from the cart.
  **Re-verified live, the exact repro:** settled check A (ETB 70, Table 3) →
  navigated away via the bottom nav (no New Order tap) → fired a second round
  (Espresso, ETB 150) → Open Checks → Settle → landed on the **Review step**
  with the new check's money, zero trace of order A's confirmation → paid it
  in the same session. Success screen then showed the *second* order's id.
- **UX-1 — "Change" renamed and confirm-guarded.** The button now says
  **Make Takeaway**, and when the ticket has lines a confirm dialog spells
  out the consequence ("Table 3 comes off this order… the kitchen ticket will
  show no table"); an empty ticket still unbinds instantly, so the harmless
  case keeps no friction. **Verified live:** tapped it with an Espresso on
  the ticket → dialog appeared, table stayed bound → "Keep Table 3" dismissed
  it without changes.
- **BUG-2 — Served is filterable.** The Orders select now offers
  `Served` (between Ready and Fulfilled; filtering is client-side against
  `o.status`, so the option was all that was missing). **Verified live:**
  filtering Served returned exactly this walk's two settled checks.
- **BUG-3 — unavailable taps speak.** Tapping an unavailable card now toasts
  "<Dish> is unavailable right now" (info level) instead of silently doing
  nothing. **Verified live:** tapped Pizza → toast appeared, cart untouched.
- **UX-2 — Open Checks pinned in the bottom bar.** `BOTTOM_PRIORITY` is now
  `tables, orders, open-checks, menu-view, checkout, dashboard`; the bar caps
  at five, so **Dashboard** — the one information-only view of the six —
  moves behind the hamburger drawer, still one tap away, while the waiter's
  money screen is one thumb-tap from anywhere. Roles that don't hold
  open-checks see no change. **Verified live:** the bar reads
  Tables · Orders · Open Checks · Menu View · Checkout · More.
- **Zero console or page errors** across the entire verification walk.

Test data reverted as before: `O0257f9a` (70) and `Ob274cee` (150) voided as
manager with auto-refund (refund rows PMbd4039b8, PM72c8c7ca), Table 3 freed,
floor back to 10/10 available, 0 open checks. Screenshots of every
verification step: `download/role-audits/shots/mobile-waiter-fixes/` (11
shots). Cleanup script: `scripts/mobile-waiter-fixes-cleanup.sh`.

Regression tests added: `CheckoutStaleSuccess.test.js` (3 — hydrate lands on
review, paid-check bail also drops the stale screen, fresh entry untouched),
`MenuViewTakeawayToast.test.js` (4 — unavailable toast, label rename,
confirm-when-ticketed, instant-when-empty), AppLayout bottom-nav pinning (2),
OrdersView filter contents updated (1).

---

## 8. The polish backlog (item 6) — closed in source; deploy pending CI restoration

BUG-4, UX-3 and UX-4 are implemented and pinned by
`tests/unit/components/WaiterPolish.test.js` (9 new; suite 404 → 413),
commits `762147f` + `ae9f1be` on master. A production build was made and
inspected locally: the compact-card CSS and the a11y attributes are all in
the built chunks. **Not yet live**: every GitHub Actions run on the account
now fails within ~3 seconds with zero steps executed (push, re-run and
manual dispatch alike, three runs in a row) — the account's included Actions
minutes are exhausted, so no job can start and nothing can deploy through
CI. The account owner needs to raise the Actions spending limit (GitHub →
Settings → Billing) and then re-run the failed run for `ae9f1be`; the
commit is deploy-ready the moment a runner can pick it up. Live mobile
re-verification on pos.fufutcoffee.com follows after that.

- **BUG-4 (a11y).** The floating cart bar — the waiter's most-tapped
  control — is now a real button: `role="button"`, `tabindex="0"`, a spoken
  label naming the item count and total ("Open cart, 3 items, ETB 240"),
  `aria-expanded`, and Enter/Space activation. The cart sheet's − / + / ✕
  speak the dish they act on, with the quantity announced via
  `aria-live`. The modifier sheet's Quantity stepper is named, grouped
  under its label, and announces its value. The New Reservation form's
  seven labels are programmatically linked to their inputs (`for`/`id`) —
  the a11y tree showed bare `textbox` / `spinbutton "0"` before.
- **UX-3 (compact cards).** Orders and Reservations no longer stack every
  cell as a label:value line on phones (~12 lines a ticket, 8 a booking).
  Both tables carry compact-card hooks (`ov-compact` / `rv-compact`) that
  re-lay the same DOM on a 12-column grid into 4–5 scannable lines: id or
  guest + status badge; an items or date·time·guests·table·phone line; a
  money line; muted extras; actions. DOM untouched — desktop unchanged,
  and the table-behaviour tests still pass as-is.
- **UX-4 (modal fit).** The New Reservation sheet pinned nothing: it
  scrolled as one block, so on an SE-class phone the Create button started
  below the fold. The sheet now keeps its title and its actions fixed and
  scrolls only the form body (`.rv-modal-body`), so Create is always on
  screen no matter the phone's height.
