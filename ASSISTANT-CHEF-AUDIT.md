# FU FUT COFFEE POS — Assistant Chef Audit

**Date:** 2026-08-26
**Account:** tigist@fufut.coffee (Tigist Muluye, Assistant Chef)
**Method:** Signed in to production on pos.fufutcoffee.com, walked all 6
permitted screens, exercised the role's one write (orders — Add Round on an
open ticket), and probed the API matrix read and write with non-destructive
payloads. Server-side enforcement checked on every resource.

---

## Verdict at a glance

| Area | Result |
|---|---|
| Nav renders (6 items: Dashboard, Orders, Kitchen, Inventory, Recipes, Time Clock) | ✅ matches `ROLE_PERMISSIONS` exactly |
| Lands on Kitchen | ✅ default view correct, KDS renders (stations filter, new/prepping/ready counters) |
| Permitted reads (orders, inventory, recipes, units + shared menu/settings) | ✅ 200 on every probe |
| Forbidden reads (waste, expenses, suppliers, purchases, staff, tables, reservations, cashdrawer, payments, audit, reports) | ✅ 403 on every probe — every head-chef-only grant correctly withheld |
| Forbidden writes (inventory adjust, waste, menu 86, recipe create, cashdrawer) | ✅ 403 on every probe |
| Allowed write (orders) | ✅ Add Round works, bill recomputed |
| UI hides stock-management controls (Add Item / Edit / ± adjust) | ✅ `canManageStock` = manager + head-chef only |
| Route guard (hard-navigate to /waste and /cashdrawer) | ✅ redirected to Kitchen, both |
| Console errors across the walk | ✅ none |

The assistant cooks from the recipes, reads the stock, fires rounds to the
kitchen — and cannot touch a single count, recipe or price. Exactly the split
the matrix comments describe: "reads stock, does not own it; two people
adjusting the same counts is how a stock take stops reconciling."

---

## What was exercised live

- **Add Round (the role's core write):** against a live open order, PATCHed a
  second line — 1 item appended, line numbering continued from the existing
  lines, subtotal and total recomputed 5 → 10, order status preserved. The
  kitchen board keeps its sequence and the bill stays the sum of what was
  fired.
- **Kitchen Display:** renders with the station filter (All / Hot Kitchen /
  Bar & Drinks / Hot Pass Only) and the new/prepping/ready counters at 0/0/0
  on a quiet floor.
- **Inventory read:** the full stock list renders; the ± adjust buttons and
  Add Item are absent for this role (source: `canManageStock` in
  InventoryView gates them to manager and head-chef; the API 403s the write
  regardless, so even a crafted request cannot adjust).
- **Recipes read:** the list renders — cooking from them is the job; writing
  them is not (recipe create probed, 403).
- **Time Clock:** self-service `/api/timeclock/me` 200.

## The bug this audit found — and its fix

**AUTH-1 (fixed, deployed):** a signed-in assistant chef could
`POST /api/orders` through the anonymous website rule (PUBLIC matched before
the session was resolved) — a write this role *does* hold, so it silently
succeeded without ever passing the role gate. Fixed in fufut-api `8e3e0c5`
regardless: the request now goes through the matrix (and passes it, for this
role, on merit). Verified live post-deploy.

---

## Known issues, accepted for now

1. **The ADJUST column header still renders** on Inventory even though its
   cells are empty for this role. Cosmetic; the buttons themselves are gated.
2. **Same D1 read-after-write lag** the head chef sees — a newly fired round
   can take a beat to appear on the KDS. Replication, not the client.
