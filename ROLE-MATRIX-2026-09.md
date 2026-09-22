# FU FUT COFFEE POS — Role Matrix (2026-09)

**Why this document exists:** the owner reviewed the staff builds on real
devices and redefined where the job boundaries sit (2026-09-23): the cashier
was walking a floor they don't work, table tickets were being opened by
every role that could see a table, and the kitchen had no way to see the
room it cooks for or turn a table whose party had gone. This is the
deliberate role policy the 2026-08-08 audit (ROLE-AUDIT.md §P1) asked for —
"policy choices made deliberately rather than inherited" — now written down
with the reasoning, so the next change argues with this page first.

**Sources:** live role audits in this repo (ROLE-AUDIT, CASHIER-MOBILE-AUDIT
1+2, CHEF-AUDIT, WAITER-AUDIT 1+2, CLEANER-AUDIT, DELIVERY-AUDIT),
industry role practice for restaurant POS (National Restaurant Association
job descriptions; waiter-vs-cashier POS division on ePOS/SalesPlay/Toast
guides — waiters open tables and fire orders on handhelds, cashiers own
payments and the drawer), and the owner's 2026-09-23 calls.

---

## The one-sentence version of each job

| Role | Owns | Never touches |
|---|---|---|
| **Manager** | Everything; assignments, zones, overrides, the books | — (rides along everywhere) |
| **Cashier** | The money: drawer, Z-count, settlements, verification queue | The floor: no tables tab, no seating, no ticket opening |
| **Head Waiter** | The floor: tables, tickets at tables, bill requests, the book | The money: no checkout (deliberate, see below) |
| **Head Chef** | The kitchen: board, stock counts, waste, recipes, 86s | Money, roster, prices — but DOES see the floor + free tables |
| **Assistant Chef** | Executes the pass: board lines, stock visibility | Stock counts, waste writes, money — but DOES see the floor + free tables |
| **Barista** | The drinks station: board, drink recipes, station waste | Menu-availability, inventory writes, the floor's tickets |
| **Delivery Staff** | The run: queue, door-step payment recording | The till, the floor, colleague data |
| **Cleaner** | The bin + reset tables: waste log | Stock writes, money, orders |
| **Accountant** | Reads the whole financial picture, writes expenses only | Operations, settings, payroll changes |

## The 2026-09-23 decisions (this changeset)

### 1. The cashier loses the Tables tab (drawer and web nav)

**What was wrong:** the cashier's drawer carried the floor plan. The floor
is the head-waiter's workplace; the till's involvement with a table starts
when a bill request arrives on their Dashboard and ends when the check is
settled from Open Checks. Every screen the cashier does not operate is a
screen they cannot be trained on, blamed for, or phished through.

**What stays:** the cashier keeps the server-side `tables` READ — their
Dashboard's Bill Requests card and the checkout free-table loop fetch it —
and the `tables` WRITE, because the checkout this role runs is one of the
two established "free the table" flows. Only the screen (and with it the
ability to *walk* the floor) is gone.

### 2. "New Order / Add Round" on a table = head-waiter + manager only

**What was wrong:** the detail sheet offered "New Order"/"Add Round" to
every role that could open it — the till, the kitchen, anyone. Opening a
ticket at a table is the floor's act: it seats a party's account, starts
the check and routes food. The industry default is exactly this division
(waiter fires orders at the table; cashier takes money at the till).

**Where it lives now:** `canTakeTableOrders()` in the app's `roles.dart`,
the `canTakeOrder` computed in the web `TablesView.vue`, and — because the
till no longer reaches the sheet and the kitchen's sheet is read-shaped —
in practice only the floor ever sees the button. The server's existing
grants already matched (only manager/head-waiter hold `tables` write).

### 3. The kitchen gets the floor: read + "Free Table"

**What was wrong:** the chef dashboard had no table awareness at all. When
a party left, the table stayed 'occupied' until a waiter walked it — the
kitchen board said *served* while the floor still said *seated*, and on a
busy night the floor plan ghosted.

**What the kitchen gets:** the Tables screen (drawer tab + Floor Plan
dashboard action) in a read-shaped view:
- a bill-request banner that names the asker — "Bill requested by {name} ·
  asked {time} ago" — the pass knows the party is at its end;
- a **Free Table** action that clears the party (status, timer, guests,
  server) exactly like checkout's free;
- NO New Order, NO quick-status chips, NO party edits, NO bill requests —
  the kitchen's floor view is a mirror, not a second floor station.

**The guard that makes it safe:** freeing refuses (HTTP 409) while an open
check on the table is unsettled — the kitchen can turn a table, it cannot
erase a bill. `POST /api/tables/:id/free` is its own server resource
(`table-free`, the menu-availability pattern) so chefs never hold the
generic tables write. Refusals surface verbatim in the sheet.

**Who may free:** manager, head-waiter, head-chef, assistant-chef. Never
cashier (till walks no floor), barista, cleaner, driver.

### 4. Dead dashboard tiles removed

The least-privilege pass took the HR screens off the staff nav but left
their dashboard shortcuts: Time Clock on the chef/driver/cleaner dashboards
and My Activity on the cashier bounced off the nav guard when tapped. They
are gone; the cashier's fourth tile is Reservations (the book), the chef's
is Floor Plan.

### 5. Deferred, deliberately

- **Web chef floor view:** the Vue TablesView gains the read-shaped kitchen
  mode later; the mobile app (the owner's daily device) leads. The web
  `canTakeOrder` gate is the seam it slots into.
- **Cleaner table turns:** the cleaner dashboard counts tables needing
  attention; giving cleaners their own clear-to-available flow needs a
  status handoff design (cleaning → available) — a separate decision.

## Where the grants live (single source of truth order)

1. **Server** `fufut-api/src/auth.js` ROLE_ACCESS — the enforcement layer.
2. **Web** `fufut-management/pos/src/api/index.js` ROLE_PERMISSIONS — the
   web nav mirror.
3. **App** `fufut-pos-flutter/lib/state/roles.dart` kRolePermissions + the
   action grants (canCheckout / canAdvancePrep / canTakeTableOrders /
   canFreeTable / canEditTable) — the app nav mirror, "every entry backed
   by a server grant, so a nav item can never open onto a screen whose
   first request 403s."

A role change must land in all three with tests, in that order.
