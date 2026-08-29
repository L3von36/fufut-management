# FU FUT COFFEE POS — Head Chef Audit

**Date:** 2026-08-25
**Account:** selam@fufut.coffee (Selam Wondimu, Head Chef)
**Method:** Signed in to production, walked all 13 permitted screens, exercised
every write path the role owns (KDS line flow, inventory adjust, waste, recipe
create, menu 86, time clock), and probed the API matrix read and write with
non-destructive payloads. Server-side enforcement checked on every resource.

---

## Verdict at a glance

| Area | Result |
|---|---|
| Nav renders (13 items) | ✅ matches `ROLE_PERMISSIONS` exactly |
| Lands on Kitchen | ✅ default view correct |
| Forbidden reads (staff, tables, reservations, payments, tips, cashdrawer, timeclock, shifts, customers) | ✅ 403 on every probe |
| Forbidden writes (menu reprice, suppliers, purchases, expenses) | ✅ 403 on every probe |
| Allowed writes (orders, inventory, waste, menu-availability, recipes) | ✅ all work |
| Route guard (hard-navigate to /cashdrawer etc.) | ✅ redirected to Kitchen |
| UI hides manager-only controls (cost/margin, add/edit/delete menu, supplier & purchase writes) | ✅ verified per screen |

The head chef can run the kitchen end to end. Three real bugs were found and
fixed during the audit — all in paths only this role exercises daily.

---

## Bugs found and fixed

### 1 — Tracked waste could not be logged at all (fixed, deployed)

`POST /api/waste` read `data.qty`; the POS form has always sent `quantity`.
Every attempt to log spoilage against a stock item failed with *"Waste
quantity must be greater than zero"*. Both field names are now accepted on
both paths. *(Commit 3bbdea1.)*

### 2 — Free-text waste silently lost its fields (fixed, deployed)

Waste with no inventory link fell through to the generic resource handler,
which dropped the item name (the table had no column for it), the quantity
(`quantity` vs `qty`) and the cost. The log filled with rows that carried a
reason and a date and nothing else. Now its own handler keeps every field,
`migration 019` adds the `name`/`category` columns, `GET /api/waste` resolves
item names from the inventory join and aliases the fields every screen reads,
and a reason is required on both paths — a waste log that cannot say why
something was binned cannot be acted on. Verified live: free-text entry kept
name/qty/cost/category; tracked entry deducted Ginger 3→2.5 kg with a ledger
row and an audit trail. *(Commits 3bbdea1 + 602c59c; waste form now shows the
field-level reason error.)*

### 3 — The 86 attribution vanished on reload (fixed, deployed)

`PUT /api/menu/:id/availability` records who took a dish off and when, and the
Menu screen showed *"by Selam Wondimu · 10:08"* right after the tap — but
`categorizedToFlat` dropped `availabilityChangedBy/At` on the read path, so
the attribution disappeared the moment the screen reloaded. The flat list now
passes the fields through. Verified live across a full 86 → reload → restore
cycle. *(Commit f4b6f84.)*

---

## What was exercised live

- **KDS:** created a ticket as the chef (API), watched it hit the board,
  START → READY → Served; order flipped to `fulfilled` with `served_at`
  stamped (the whole-ticket Served fix from a506e82 working).
- **Inventory:** ±1 quick adjust (Ginger 3→4), full adjust endpoint with
  reason, movement ledger records actor and balance-after.
- **Waste:** tracked entry with stock deduction and reversal on cleanup;
  free-text entry keeping all fields; reason required client- and server-side.
- **Recipes:** created "Audit test recipe" with one ingredient line from the
  74-item inventory dropdown (saved v1, `created_by` = S2); archived after.
- **Menu:** Mark 86 and Restore with attribution surviving reload.
- **Time clock:** clocked in → out cleanly; the shift gate checks open checks;
  a 5-day-old stale active shift was found on the account and closed.
- **Purchases/Suppliers:** read-only as designed — edit/Pay/Record buttons
  hidden, `POST /api/purchases/analyse` correctly 403s for this role.

## Cleanup after the audit

6 junk waste rows deleted (incl. two pre-audit rows with no data at all),
test orders `OCHEFTEST`/`O41b216a`/`O6070286` voided with restock reversal,
stale active timeclock entry (unknown staff `S221357f`) removed, Table 1
released → **10/10 available, 0 open checks, 0 waste rows, 0 active shifts**.

---

## Known issues, accepted for now

1. **D1 read-after-write lag** — a recipe saved does not always appear in the
   list until refresh (D1 replication, not a client cache; reload shows it).
2. **Chef can DELETE inventory via API** — `write` covers DELETE on the
   resource. The UI hides the button (manager-only), and the chef owns stock,
   but the raw grant is broader than the screen implies. Policy call, recorded.
3. **No UI to archive a recipe** — the endpoint exists (`DELETE /api/recipes/:id`
   → archived), only the API can reach it.
4. **Cross-day clock-out computes hours by time-of-day**, not date span — a
   5-day-old shift closed at 2.67 h. Undercounts, never overcounts.
5. **Time Clock shows "Since 10:30"** with no date for multi-day-old shifts.

## Data setup gaps blocking honest numbers (owner tasks)

1. All **73 inventory items have `min_level` = 0** — the reorder list is
   always empty and Low Stock never fires.
2. **4 menu items have no recipe** — selling them does not reduce stock.
3. **35 of 41 recipes use estimated quantities** — cost and margin are guesses
   until the kitchen weighs them.
4. **Ingredient costs are largely unset** (e.g. Ginger `avg_cost` = 0), so
   waste cost and food cost percentages read low (dashboard shows 4%).
5. **One supplier** ("novel") and one purchase on file — purchasing data is
   skeletal.
