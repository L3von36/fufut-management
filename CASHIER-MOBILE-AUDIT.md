# FU FUT COFFEE POS — Cashier Mobile Audit

**Date:** 2026-08-27 (two passes: afternoon walkthrough, evening re-walk after the fixes deployed)
**Account:** bethel@fufut.coffee (Bethel Assefa, Cashier)
**Method:** Signed in to production on pos.fufutcoffee.com in a phone-class
viewport (iPhone 14 emulation, 390×844, touch input), walked every cashier
screen and both money paths (counter quick-sale and table service settle)
through the real controls. The cashier owns the money screens — cash drawer,
Z-count, Z-report, Revenue, Reports, Analytics — so every number shown was
recomputed independently and compared against the API's own arithmetic. Every
finding below was reproduced live, fixed, deployed and re-verified on the same
viewport.

---

## Verdict at a glance

| Area | Result |
|---|---|
| Login on mobile | ✅ centered card, rotated password accepted |
| Landing (cashier branch dashboard) | ✅ KPI cards + queues after fixes, see C8/N-queue |
| Cash Drawer: open / paid-in / paid-out | ✅ modals fit 390px, reason required |
| Active Drawer expected total | ✅ after fix — was wrong by the paid-in/out amount, see C2 |
| Today's Drawers tab | ✅ after fix — listed every drawer ever, see C1 |
| Z-count → close drawer | ✅ denomination grid labelled (a11y), close stamps closed_at (N3) |
| Z-Report print + history | ✅ after fixes — history close-times were fiction, see N3 |
| Menu View → cart sheet → checkout | ✅ takeaway path clean; tip rounding fixed (C5) |
| Payment: 6 methods + tender + Exact | ✅ after fix — quick-sale only knew 3 methods |
| Orders list + quick-sale | ✅ after fixes — cart leak (C4), orphan guard (N4) |
| Open Checks: Settle + Split | ✅ after fixes — Split had never worked (N1) |
| Table service as cashier (claim → fire → settle → free) | ✅ full cycle; split-child trap fixed (follow-up) |
| Reports / Revenue / Analytics | ✅ after fixes — every screen had its own arithmetic bug (C6, C7, N2, N5, N6) |
| Time Clock | ✅ clock in/out cycle, history card |
| Reservations | ✅ create + cancel, confirm-guarded |
| Compact toggle / More drawer / dark mode | ✅ no contrast failures, drawer grouped |
| Console errors | ✅ zero page errors across both passes |

The cashier's screens are the ones the owner reads at end of day — and that
is exactly where the bugs were: not in taking money, but in **what the
screens claimed the money was**. Six of the eight pass-1 findings were
money/data-integrity bugs on reporting screens; both paths that take actual
payment were sound once the split endpoint's 500 (N1) and the orphan-check
guard (N4) were fixed.

---

## Pass 1 findings C1–C8 (afternoon walkthrough)

Six money/data-integrity bugs and two accuracy bugs. POS fixes: commit
`94e6d9e` (10 regression tests, suite 385→395). API fixes: commit `4f50b85`
(6 new tests, suite 665→671).

### C1 — "Today's Drawers" listed every drawer ever closed

The Cash Drawer screen's history tab ignored the calendar: a fresh shift
opened onto days-old counts and cash sales summed across all history. Now
filtered to drawers opened today (local device day) — list and all three
KPIs from the same filtered source.

### C2 — Active Drawer "Expected Total" ignored paid-in/paid-out

The figure the cashier counts against all shift omitted the float top-ups
and drops, so it differed from the one the server's close-time expected used
(migration-020 formula). **Live: displayed 640 while the server computed
740.** Now mirrors the migration-020 formula, and the Z-count summary shows
the paid-in/out lines so the discrepancy is visible at count time.

### C3 — voiding a paid cash order refunded the tip but left it "earned"

Voiding a paid cash order auto-refunds the whole payment, tip included — but
the order's tips rows stayed counted, so "Tips Earned" included money handed
back to the guest (**live: a voided training order's ETB 64 tip still
stood**). Tips rows now flip to `refunded` on void, and refunded tips are
excluded from the dashboard and P&L tips sums. Telebirr-only voids keep the
tip row (their refund settles outside the till). API commit `4f50b85`.

### C4 — the quick-sale never cleared the shared cart

The Orders screen's quick-sale "Process Payment" left paid items in the
shared cart (persisted to localStorage), silently carrying them into the
next order — **live: a paid Espresso joined a table's first ticket**.
`resetFull()` on success, pinned by test.

### C5 — percentage tips booked fractional birr

A 10% tip on ETB 205 booked 20.5 while every display rounded to 21 and the
quick-tender Exact button offered 226 — three different numbers for one tip.
Tips now round to whole birr at the store; OrdersView only strike-throughs
the subtotal when there is a real discount (a tip is not one).

### C6 — Analytics counted voided and cancelled tickets as revenue

**Live: ETB 24,102 displayed where ETB 515.5 was real — a 47× overstatement.**
`isRealOrder` now applied to period and prior-period; fulfillment counts
served+paid as complete; cancellation keeps its own raw denominator. Also
guards `priorPeriodOrders` against the empty date range on first paint (a
RangeError that killed the first render).

### C7 — the Revenue screen's KPIs summed ALL history

Regardless of the picked date range: **live: ETB 51,567 / 145 orders for a
14-day window whose real figures were ETB 3,500 / 8.** One `filteredOrders`
source now feeds the KPIs, the payment breakdown and the daily table.

### C8 — the verification queue listed everything, with "Order #?"

"Pending Digital Payment Verifications" on the cashier dashboard listed
every payment — verified cash, refunds included — because the verified
filter was never applied client-side, and the order id read a field the API
never sends (`Order #?`). Root cause on the server: `GET /api/payments`
ignored `?verified=`. Both fixed (POS `94e6d9e`, API `4f50b85`); the queue
now receives recorded digital transfers only, with real order ids.

Also closed in `94e6d9e`: Z-count denomination inputs and KDS sort toggles
labelled (a11y).

---

## Pass 2 findings N1–N7 (evening re-walk after the C-fixes deployed)

The C1–C8 fixes held under re-walk; six new findings. API fixes: commit
`869eb4c` (6 new tests). POS fixes: commit `9c2a31e` (7 new tests, suite
395→402).

### N1 (the headline) — Split had never once worked

`POST /orders/:id/split` returned **500 on every attempt**: the INSERT named
`table_number` and `created_at`, columns the orders table has never had. The
Open Checks Split button had never successfully split a check in production.
Rewritten against the real schema: shares sum exactly (last share absorbs
the rounding remainder), seat count clamped to the UI's 2..10, paid/voided
checks refused with 409, and the parent retires as cancelled-with-reason so
the money is counted once — the old fulfilled parent double-counted revenue
beside its splits.

**Live verification after deploy:** a 2-way split created two child checks;
each settled independently (`42-split-child-paid.png`).

### N2 — Revenue's "Orders" KPI kept the all-history count

The C7 fix had left one binding behind: **live: 148 orders of every day
beside a today-only ETB 1066 revenue.** Now `filteredOrders`.

### N3 — Z-Report History showed opened times as close times

Drawer sessions never recorded when they were closed, so the history listed
each drawer's *opened* time under the "Closed Time" header. Migration 021
adds `cashdrawers.closed_at` (one-shot `/api/migrate/drawer-021`), the close
handler stamps it, and rows that predate tracking say "before
close-tracking" instead of lying.

**Live verification after deploy:** `44-zhistory-fixed.png`.

### N4 — a dine-in order with no table could be paid from both paths

The orphan-check source behind the Aug 24 cleanup (five table-less checks
found in production that day). Both payment paths (checkout review and the
Orders quick-sale) now refuse with a toast telling the cashier to pick a
table or switch to Takeaway.

### N5 — Reports summed tips into the food money

**Live: ETB 1066 on Reports vs ETB 1045 "excludes tips" on the Dashboard,
same day.** Reports' Revenue is now net of tips, matching the server's
NET_SALES convention everywhere. Follow-up commit `34c54ab` extended the
same netting to the Revenue screen, whose Total Revenue, payment breakdown
and daily table still summed tips (ETB 1066 there vs 1045 everywhere else)
— `41-revenue-fixed.png`.

### N6 — the cancellation rate was unbounded

Analytics divided cancels by surviving orders only: **live: "1583.3%"**
after the training voids. Now cancels over everything ticketed — cannot
exceed 100%.

### N7 — 451 KB of PDF library on every checkout open

The checkout chunk carried `pdfjs-dist` statically, downloaded for every
checkout open on a phone. Receipt verification now imports it on demand.

Also closed in `9c2a31e`: the quick-sale modal now offers the same six
payment methods as checkout (Telebirr, CBE Birr and bank transfers were
unrecordable from the counter).

---

## Follow-up fix the live verification itself caught (255c6c3)

Verifying N1's split fix live exposed an interaction with the new N4 guard:
**a split child inherits no table**, so Settle on it hydrated a tableless
dine-in tab that the guard then refused to advance — the child check became
unpayable. Settling an EXISTING check (`activeOpenOrderId` set) is now
exempt from the guard; only new orders are stopped from leaving the table
empty. Suite 404. Live check: split child settled and the table freed in
the same session.

---

## What was exercised live (both passes)

- Cash drawer full cycle: open → paid-in (reason required) → sale →
  Z-count → Z-report print → close → history (screenshots 01–16)
- Counter quick-sale: menu → cart sheet → checkout → takeaway → all 6
  payment methods → tender/Exact → success (06–12)
- Table service as cashier: claim Table 5 → fire → Settle from Open Checks
  → free the table (19–25)
- Split: 2-way split of an open check, both children settled (22–23, 42)
- Reports / Revenue / Analytics before and after fixes, recomputed against
  the API (26–30, 41, 43)
- Time Clock in/out cycle, Reservations create + cancel, compact toggle,
  More drawer, dark mode (31–38)

## Cleanup

All walkthrough orders voided as training with auto-refund; drawers closed;
Table 5 freed; test reservation cancelled. Floor verified 10/10 available,
0 unpaid open checks, 0 open drawer sessions, 0 active reservations.

## Sources

- POS fixes: `94e6d9e`, `9c2a31e`, `34c54ab`, `255c6c3` (fufut-management)
- API fixes: `4f50b85`, `869eb4c` (fufut-api)
- Tests: `pos/tests/unit/components/CashierMobileAudit.test.js` (10),
  `CashierMobileAudit2.test.js` (7), suite 385→404; `fufut-api`
  `test/cashier-audit.test.js` (6), `test/cashier-audit-2.test.js` (6)
- Evidence: `download/role-audits/shots/mobile-cashier/` (44 screenshots),
  including post-deploy re-verification 40–44
