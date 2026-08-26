# FU FUT COFFEE POS — Delivery Staff Audit

**Date:** 2026-08-26
**Account:** deborah@fufut.coffee (Deborah Sahilu, Delivery Staff)
**Method:** Signed in to production on pos.fufutcoffee.com, walked all 3
permitted screens, exercised the role's own writes (payment record, tip record)
against a live target order, and probed the API matrix read and write with
non-destructive payloads. Server-side enforcement checked on every resource.

---

## Verdict at a glance

| Area | Result |
|---|---|
| Nav renders (3 items: Dashboard, Delivery, Time Clock) | ✅ matches `ROLE_PERMISSIONS` exactly |
| Lands on Delivery | ✅ default view correct |
| Permitted reads (delivery, orders, payments, tips + shared menu/units/settings) | ✅ 200 on every probe |
| Forbidden reads (tables, reservations, staff, cashdrawer, inventory, waste, recipes, expenses, suppliers, audit, reports) | ✅ 403 on every probe |
| Forbidden writes (cashdrawer, inventory, waste) | ✅ 403 on every probe |
| Allowed writes (payments, tips) | ✅ both work end to end |
| Route guard (hard-navigate to /cashdrawer) | ✅ redirected to Delivery |
| Console errors across the walk | ✅ none |

The driver can run a delivery end to end: see the queue, read the order behind
the job, record the money and the tip they took on the doorstep.

---

## What was exercised live

- **Delivery queue:** renders with order #, customer, address, driver, status
  and actions columns; status filter covers the full lifecycle
  (new → confirmed → preparing → ready → assigned → picked up → out for
  delivery → delivered / cancelled); counters for TO COLLECT / ON THE WAY /
  DELIVERED all live.
- **Payment record (the role's core write):** posted a telebirr payment of
  ETB 10 against a live order as the driver — `PMf1d4be49-7`, status
  `recorded`, `requiresVerification: true`, order flipped to `paid` /
  outstanding 0. Recording is not verifying: `/api/payments/:id/verify`
  still belongs to the cashier and the manager, so the money a driver reports
  is checked by the till when they get back. This is the designed control and
  it held.
- **Tip record:** posted a cash tip of ETB 2 against the same order
  (`TP93a5c402-a`) — a tip that comes with a delivery is the driver's to
  record.
- **Overpayment guard (probe, expected rejection):** a payment exceeding the
  order's outstanding is refused with the outstanding named — the probe that
  hit this was a payload error on our side, and the refusal is the correct
  behaviour.
- **Dashboard / Time Clock:** render clean; self-service
  `/api/timeclock/me` answers 200.

## The bug this audit found — and its fix

**AUTH-1 (fixed, deployed):** `POST /api/orders` is on the PUBLIC list so the
anonymous website can take online orders — but PUBLIC was matched *before* the
session was resolved, so a signed-in driver could create orders their role
holds no write for. Reproduced live: a delivery-staff session got a 200 and a
real order row. Fixed in fufut-api commit `8e3e0c5`: the anonymous rule now
applies only to a caller with **no** session; a session goes through the role
matrix like any other request. Verified live post-deploy: driver POST
`/api/orders` → 403 naming role and resource; waiter and manager still 200;
anonymous website ordering still 200. The same fix closes the parallel holes
on `POST /api/reservations` and `POST /api/reviews`.

---

## The live delivery run (follow-up #1 — closed 2026-08-27)

The audit's one open follow-up was that no real delivery job had ever been
walked live. That run has now been done on production, end to end, with every
step landing in the audit log under the real actor's name:

| Step | Actor | Result |
|---|---|---|
| Website-style delivery order (anonymous, the public ordering path) | anonymous guest | order O4da3388 (3× TEA + ETB 30 fee = 240) + delivery job DLdcf23b1 auto-created |
| Kitchen progress | head-chef (Selam) | order new→preparing→ready; the job mirrored both states automatically — chef marking food ready is what put the job in front of the driver |
| Impossible jump probe | delivery-staff | ready→delivered refused 409 with the allowed transitions named |
| Take job → picked up → on the way → delivered | delivery-staff (Deborah) | all four moves made **from the Delivery screen buttons**; counters (TO COLLECT / ON THE WAY / DELIVERED) tracked live; address column showed the address (issue #2 below was data, not the screen) |
| Cash on the doorstep | delivery-staff | ETB 240 payment + ETB 5 tip recorded by the driver |
| Order closure | system | delivered + paid → order completed itself |
| Round settlement | cashier (Bethel) | driver's own settle attempt → 403; cashier settled, collected 240 |
| Cleanup | manager (Amanuel) | order voided as training, payment auto-refunded 240 |

Evidence: `download/role-audits/shots/delivery-live-run-{1-ready,2-assigned,3-out-for-delivery,4-delivered}.png`
and the full audit trail in `/api/audit`. Zero console errors across the walk.

**One observation the live run surfaced:** `POST /api/orders` takes
`total`/`subtotal` (and each item's `price`) from the request body and never
re-derives them from the menu table at creation time — the header figures are
written off the wire. The POS and the website form both send correct values,
and any added round re-prices the bill server-side from the tracked lines, but
a crafted anonymous order could under-price itself on a **public** endpoint.
Not a delivery defect (the job collects what the order says); worth a
server-side price validation pass on the public ordering path.

## Known issues, accepted for now

1. ~~**No delivery job exists to walk live**~~ — closed by the live run above.
2. **Address shows "—"** on the seeded queue row — the delivery job has no
   address recorded. Data gap, not a screen defect. (The live-run job's
   address displayed correctly.)
3. **Client-trusted pricing on the public order path** — the observation
   above; recommend validating posted items/prices against the menu table
   server-side.
