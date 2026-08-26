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

## Known issues, accepted for now

1. **No delivery job exists to walk live** — the queue holds one cancelled
   historical job only, so the driver-side status transitions (picked up →
   out for delivery → delivered) were verified against the API contract and
   the screen's action column, not driven through a real run. Worth one live
   run when a real delivery order exists.
2. **Address shows "—"** on the seeded queue row — the delivery job has no
   address recorded. Data gap, not a screen defect.
