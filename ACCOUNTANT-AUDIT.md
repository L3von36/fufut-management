# FU FUT COFFEE POS — Accountant Audit

**Date:** 2026-08-26
**Account:** novel@fufut.coffee (Novel Wolde, Accountant)
**Method:** Signed in to production on pos.fufutcoffee.com, walked all 10
permitted screens, exercised the role's one write (an expense), read every
financial resource the matrix grants, and probed the forbidden reads and
writes with non-destructive payloads. Server-side enforcement checked on
every resource.

---

## Verdict at a glance

| Area | Result |
|---|---|
| Nav renders (10 items: Dashboard, Orders, Expenses, P&L, Revenue, Suppliers, Purchases, Time Clock, Reports, Analytics) | ✅ matches `ROLE_PERMISSIONS` exactly |
| Lands on Reports | ✅ default view correct |
| Permitted reads — 18 resources (reports, orders, payments, tips, expenses, purchases, suppliers, staff, attendance, overtime, leave, adjustments, payroll, inventory, cashdrawer, shifts, audit, timeclock) | ✅ 200 on every probe |
| Forbidden reads (tables, reservations, waste, recipes, delivery, customers) | ✅ 403 on every probe |
| Forbidden writes (orders, staff, settings, cashdrawer, payroll/run, inventory) | ✅ 403 on every probe |
| Allowed write (expenses) | ✅ created, then removed |
| Staff PII redaction | ✅ phone/email/password_hash stripped; payroll fields kept — the accountant reconciles payroll, so salaries stay and contact details go |
| Route guard (hard-navigate to /cashdrawer and /kitchen) | ✅ redirected to Reports, both |
| Console errors across the walk | ✅ none |

The accountant reads the whole financial picture and changes almost none of
it. The one write — recording a bill that arrived — works, and everything
that would let them edit the numbers they reconcile is refused.

---

## What was exercised live

- **The read sweep:** every one of the 18 granted resources answered 200 —
  including the HR block (attendance, overtime, leave, adjustments, payroll)
  and the audit log, which no non-manager role except this one can reach.
- **The one write:** created an expense (category audit-test, ETB 1, cash,
  dated today) → row `E0971970` appeared in /api/expenses; deleted it as
  manager afterwards. Expenses is deliberately theirs: recording a bill that
  arrived is bookkeeping.
- **Manager-only walls held:** staff writes, `PUT /api/settings` (tax bands),
  `POST /api/payroll/run`, and reset-password all 403 for this role. An
  accountant who could run payroll or set the tax bands would not be
  reconciling anything.
- **P&L screen:** renders real numbers — Revenue (30d) ETB 47,215; Expenses
  (30d) picked up the ETB 1 test expense the moment it existed (and the
  screen's data source is the same one the write hit).
- **Staff listing redaction:** 12 rows, keys verified — no `phone`, no
  `email`, no `password_hash`; `base_salary`, `bank_account`, `tin`,
  `pension_id` present. Exactly the split the role needs.
- **Time Clock:** full list read (the matrix grants it); self-service
  `/api/timeclock/me` 200.

## The bug this audit found — and its fix

**AUTH-1 (fixed, deployed):** a signed-in accountant could `POST /api/orders`
through the anonymous website rule — PUBLIC (the online-ordering entry) was
matched before the session was resolved, so the role matrix never ran.
Reproduced live: order `O5daaa19` created by an accountant session with a
200. Fixed in fufut-api `8e3e0c5`: the anonymous writes (`/api/orders`,
`/api/reservations`, `/api/reviews`) are open only to callers with **no**
session; a session goes through the role matrix. Verified live post-deploy:
accountant POST `/api/orders` → 403 naming role and resource. All four
audits this day found the same hole from their own angle; this session's
order rows were voided with reason `training`.

---

## Known issues, accepted for now

1. **Backoffice vs POS:** the accountant's reach was audited on the POS. The
   backoffice has its own role map (`backoffice/src/api/index.js`) with no
   accountant entry — an accountant signing in there gets the login but a
   near-empty nav. Decide deliberately whether accountants live in the POS
   (current answer: yes) before granting anything on the other app.
2. **Reports revenue still includes voided orders** on some metrics — the
   cashier-audit fix (5d0ea1a) covered POS Dashboard/Reports; B+ Finding 7
   (backoffice Dashboard Today Revenue summing verified payments of voided
   orders) remains open and was deliberately left out of the 1–6 fix batch.
   It lands squarely in this role's lap — worth fixing before the accountant
   is asked to reconcile anything against it.
3. **Purchases/suppliers data is skeletal** (one supplier, one purchase) —
   the accountant's P&L reads low for reasons of data, not code. Same owner
   task list the chef audit recorded.
