# Four-Role Audit Summary — Delivery, Cleaner, Assistant Chef, Accountant

**Date:** 2026-08-26
**Scope:** the four roles no previous audit had touched, closing the coverage
gap after waiter (Task 2), cashier (Task 4) and head chef (Task 5). Both
deliverables the owner asked for are in here: the quick smoke (every role
signed in, every screen walked, every allowed write hit once, every forbidden
read/write probed for 403) and the full per-role audits
(DELIVERY-AUDIT.md, CLEANER-AUDIT.md, ASSISTANT-CHEF-AUDIT.md,
ACCOUNTANT-AUDIT.md, same format as CHEF-AUDIT.md).

---

## The scoreboard

| | delivery-staff (Deborah) | cleaner (Asnegash) | assistant-chef (Tigist) | accountant (Novel) |
|---|---|---|---|---|
| Nav matches ROLE_PERMISSIONS | ✅ 3 items | ✅ 3 items | ✅ 6 items | ✅ 10 items |
| Default view | ✅ Delivery | ✅ Waste Log | ✅ Kitchen | ✅ Reports |
| Every screen renders | ✅ | ✅ | ✅ | ✅ (P&L shows live ETB) |
| Every permitted read 200 | ✅ 4 + shared | ✅ 3 + shared | ✅ 4 + shared | ✅ 18 + shared |
| Every forbidden read 403 | ✅ 11 probes | ✅ 12 probes | ✅ 11 probes | ✅ 6 probes |
| Every forbidden write 403 | ✅ | ✅ | ✅ | ✅ 6 incl. payroll/run |
| Allowed write exercised | ✅ payment + tip | ✅ waste (API + form) | ✅ Add Round | ✅ expense |
| Route guard bounces | ✅ → delivery | ✅ → waste | ✅ → kitchen ×2 | ✅ → reports ×2 |
| Console errors | ✅ none | ✅ none | ✅ none | ✅ none |
| Screenshots | delivery-01..03 | cleaner-01..04 | asstchef-01..06 | accountant-01..10 |

Probe log: `download/role-audits/smoke-matrix.txt` — **101 PASS / 6 FAIL** on
first run; 3 of the 6 were payload errors in the probes themselves (fixed and
re-run clean: payment needed the order's `total`, Add Round wanted
`{items:[…]}`, waste wanted a real inventory id). The other 3 were the same
real bug from three different sessions — see below.

## The one real bug — found by all four audits, fixed and deployed

**AUTH-1: a signed-in session was treated as anonymous on the website's
public writes.** `POST /api/orders` sits on the PUBLIC list so
fufutcoffee.com can take online orders — but PUBLIC was matched *before* the
session was resolved, so the role matrix never ran for a signed-in caller.
Reproduced live three times: cleaner, accountant and delivery-staff sessions
each created a real order with a 200. `POST /api/reservations` and
`POST /api/reviews` had the same hole.

**Fix (fufut-api `8e3e0c5`, deployed):** the anonymous writes are open only
to a caller with **no** session; a session goes through the role matrix like
any other request. `/api/auth/login` stays exempt (it establishes the
session). 8 regression tests added; full suite **665 passing**.

**Verified live post-deploy:**
- cleaner / accountant / delivery-staff `POST /api/orders` → **403** with role
  and resource named in the error
- waiter (the POS fire path) → **200**, items inserted — no regression
- manager → **200** on orders and reservations
- anonymous (the website) → **200** — online ordering unbroken
- every verification row created during testing voided with reason
  `training`; tables reset; 10/10 available

## What each role's audit actually proved

- **Delivery staff** can record a telebirr payment against a live order
  (`requiresVerification: true` — the till still checks it) and record the
  tip that came with it. Recording is not verifying; the designed control
  held.
- **Cleaner** logged waste both ways: tracked (stock honestly deducted
  3 → 2.999 kg Ginger, reversed after) and free-text through the screen's own
  form — the path that was broken before the chef-audit fix, working from the
  narrowest account in the system. The inventory read grant is load-bearing:
  without it the waste form's stock dropdown is empty and the shelf stays
  overstated.
- **Assistant chef** added a round to an open ticket (line numbering
  continued, bill recomputed 5 → 10) and could not touch a count, a recipe or
  a price — every head-chef-only grant correctly withheld, and the Inventory
  screen hides its ± adjust buttons for this role.
- **Accountant** read all 18 granted resources including the HR block and the
  audit log, saw staff phone/email/password_hash stripped while payroll
  fields stayed, created and we removed one expense, and hit the manager-only
  walls (settings, payroll/run, staff writes) exactly as designed.

## Role coverage is now complete

All 8 roles in the matrix have now been audited on production:

| Role | Audit |
|---|---|
| manager | Task 4 — cleanup, voids, drawer review, walls verified from the other side |
| head-waiter | Task 2 — WAITER-AUDIT (checkout settle bug fixed) |
| cashier | Task 4 — till, Z-count, cash-sale bug fixed |
| head-chef | Task 5 — CHEF-AUDIT (3 bugs fixed) |
| delivery-staff | this audit |
| cleaner | this audit |
| assistant-chef | this audit |
| accountant | this audit |

## Follow-ups worth doing

1. ~~**B+ Finding 7**~~ **FIXED 2026-08-26** (`aa4f837` + CI `17ffe69`):
   `isRealOrder` now gates all four backoffice money screens (Dashboard,
   P&L, Revenue, Reports). Live-verified: 36 voided orders (ETB 6,055)
   excluded; real ETB 60 order counted; P&L matched independent math.
   Root-cause bonus found while shipping it: backoffice CI deploys had
   silently gone to a Pages *preview* since ~Aug 22 (production branch is
   `master`, not `main`); CI now reads the branch from the Cloudflare API.
2. ~~**One live delivery run**~~ **DONE 2026-08-27** — a real job walked end
   to end on production: anonymous website order → kitchen sync (chef) →
   driver took the job, collected cash + tip and delivered (all status moves
   from the Delivery screen) → cashier settled the round (driver refused 403)
   → manager voided the training order with auto-refund. Full trail in
   DELIVERY-AUDIT.md. The run surfaced one new observation: posted order
   totals/prices are client-trusted on the public ordering path (see
   DELIVERY-AUDIT.md follow-up #3).
3. **Decide where the accountant lives** — POS (today's answer) or
   backoffice (whose role map has no accountant entry).
4. **Cleaner's Dashboard is thin** — renders, but most tiles are metrics the
   role cannot read. Cosmetic.
5. **Passwords rotated 2026-08-26** — the 8 audited accounts no longer share
   `selam@336`; unique server-generated credentials are on an owner-only
   sheet (`download/credentials/`, never committed). P0-1 on the soft-launch
   checklist is closed. Handout slips added 2026-08-27: a printable cut sheet
   (`staff-signin-slips-2026-08-27.pdf`) plus one private txt slip per person
   (`download/credentials/slips/`), so each person receives only their own
   line.
