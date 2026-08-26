# FU FUT COFFEE POS — Cleaner Audit

**Date:** 2026-08-26
**Account:** asnegash@fufut.coffee (Asnegash Abebe, Cleaner)
**Method:** Signed in to production on pos.fufutcoffee.com, walked all 3
permitted screens, exercised the role's one write (waste) both through the API
and through the Waste screen's own form, and probed the API matrix read and
write with non-destructive payloads. Server-side enforcement checked on every
resource.

---

## Verdict at a glance

| Area | Result |
|---|---|
| Nav renders (3 items: Dashboard, Waste Log, Time Clock) | ✅ matches `ROLE_PERMISSIONS` exactly |
| Lands on Waste Log | ✅ default view correct |
| Permitted reads (waste, tables, inventory + shared menu/units/settings) | ✅ 200 on every probe |
| Forbidden reads (orders, payments, tips, expenses, staff, cashdrawer, reservations, recipes, suppliers, purchases, audit, reports) | ✅ 403 on every probe |
| Forbidden writes (orders, inventory, cashdrawer, staff, table status) | ✅ 403 on every probe |
| Allowed write (waste) | ✅ works via API and via the screen's own form |
| Route guard (hard-navigate to /orders) | ✅ redirected to Waste Log |
| Console errors across the walk | ✅ none |

The cleaner can log what was binned and see the floor — and nothing else.
This is the narrowest role in the system and it behaved.

---

## What was exercised live

- **Tracked waste via API:** logged 0.001 kg of Ginger with a reason — row
  `Wa6a50022` created, stock honestly deducted 3 → 2.999 kg, estimated cost
  computed. (Reversed afterwards via the manager; the ledger shows both
  sides.)
- **Free-text waste via the screen's own form:** filled item name, category
  Packaging, qty 2, reason Damaged, cost 5 → submitted → the row appeared in
  the table with every field intact. This is the path that was broken for the
  head chef before commit 3bbdea1/602c59c (fields silently lost); from the
  cleaner's account it now works too.
- **The inventory dropdown on the waste form:** all stock items render —
  Coffee beans through Cleaning cloth. This is why the cleaner holds a
  read-only `inventory` grant: waste that does not name a stock item cannot
  reduce stock, and the shelf stays overstated. Load-bearing, confirmed.
- **Tables read:** the Dashboard's tables-needing-attention count works off
  it (the matrix comment says exactly this).
- **Time Clock:** self-service `/api/timeclock/me` 200.

## The bug this audit found — and its fix

**AUTH-1 (fixed, deployed):** same as the other three audits — a signed-in
cleaner could `POST /api/orders` through the anonymous website rule (PUBLIC
matched before the session was resolved). Reproduced live with a 200 and a
real order row. Fixed in fufut-api `8e3e0c5` (anonymous writes are open only
to session-less callers); verified live: cleaner POST `/api/orders` → 403
naming role and resource. The parallel holes on `POST /api/reservations` and
`POST /api/reviews` closed by the same change.

---

## Known issues, accepted for now

1. **The cleaner's Dashboard is thin** — it renders, but most of its tiles
   are kitchen/sales metrics this role cannot read (and correctly gets 403s
   for). It shows the tables count and little else. Cosmetic, not blocking;
   if it matters, give the Dashboard a cleaner-specific layout.
2. **Waste cost reads 0** wherever it is computed from `avg_cost` — the
   known data-setup gap (ingredient costs largely unset) follows the cleaner
   exactly as it follows the chef.
