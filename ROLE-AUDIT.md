# FU FUT COFFEE POS — All-Role Audit

**Date:** 2026-08-08
**Method:** Signed in to production as all 7 staff accounts, walked their navigation,
attempted to reach pages outside their role, and probed the API directly as each
role and as an anonymous client. Every finding below was reproduced live.

---

## Verdict at a glance

| Role | Nav items | App renders? | Reaches forbidden pages? | API restricted? |
|---|---|---|---|---|
| Manager | 19 | ✅ | — | ❌ **No** |
| Cashier | 11 | ✅ | ✅ blocked | ❌ **No** |
| Head Chef | 7 | ✅ | ✅ blocked | ❌ **No** |
| Head Waiter | 6 | ✅ | ✅ blocked | ❌ **No** |
| **Assistant Chef** | 4 | ❌ **BLANK** | n/a | ❌ **No** |
| **Delivery Staff** | 2 | ❌ **BLANK** | n/a | ❌ **No** |
| **Cleaner** | 2 | ❌ **BLANK** | n/a | ❌ **No** |

**Three of seven roles cannot use the application at all**, and **no role is
restricted at the API layer**.

---

## P0-1 — The entire API is public. No authentication required.

The most serious finding. From a clean shell with **no cookies, no session, and
no origin header**:

```
$ curl -s https://pos.fufutcoffee.com/api/staff
[{"id":"S8","firstName":"Tigist","lastName":"Muluye",
  "email":"tigist@fufut.coffee","phone":"+251918901234",
  "role":"Assistant Chef", ...
```

Both the POS proxy and the Worker directly (`fufut-api.fufutcoffee.workers.dev`)
return **200** unauthenticated on `staff`, `orders`, `menu`, `expenses`,
`reservations`, `tables`.

Publicly readable right now, by anyone who knows the URL:

- **Staff PII** — 10 records: full names, emails, **personal phone numbers**, roles
- **Customer PII** — reservations carry guest names, **phone numbers**, emails
- **Every order** — 32 records, customer names and emails
- **Full revenue** — ETB 16,550 of visible order totals
- **Menu and cost data** — including gross-margin inputs

The login screen is decorative for reads. The role system is a **UI convention,
not a security control**.

> **Not verified: write access.** Since reads require no auth, writes are very
> likely open too — meaning anyone could plausibly create fake orders, alter
> menu prices, or delete records. I did not test this, because a write probe
> against a live restaurant's data is destructive. **This must be verified by
> the owner**, and until it is, assume it is exploitable.

### Why the client-side guard is not a mitigation

`router/index.js` *does* correctly guard navigation — verified: a Cashier
hard-navigating to `/pos/app/pnl` is redirected to `/pos/app/cashdrawer`. But
that only governs what the Vue app draws. Anyone can open DevTools, or skip the
browser entirely with `curl`, and read everything. Authorization must be
enforced server-side, per role, on every endpoint.

## P0-2 — Every account shares the same password

All seven accounts authenticate with **`fufut2026`**. There is no forced
rotation on first login (`server_secure.py` even comments "should be changed on
first login" — nothing enforces it). One leaked password is total compromise,
and with no per-user credential there is no meaningful audit trail of who did
what.

## P0-3 — Three roles get a blank white screen

`components/AppLayout.vue`:

```js
// line 192 — pads the bottom nav to 5 slots
while (items.length < 5) items.push(null)
```

```html
<!-- line 84 — :key reads item.view on those nulls -->
<template v-for="item in bottomItems" :key="item.view">
  <button v-if="item" ...>
```

The `v-if="item"` guard is on the **child button**, but `:key="item.view"` is on
the **`<template>`**, which Vue evaluates first. So `null.view` throws:

```
TypeError: Cannot read properties of null (reading 'view')
```

This only triggers when a role has **fewer than 5** permitted nav items — which
is exactly the three lowest-privilege roles. The entire app fails to mount;
`#app` renders 88 bytes and the page is blank. Confirmed live for Assistant
Chef, Delivery Staff and Cleaner; Head Chef (7 items) renders normally.

These three staff members currently **cannot do their jobs in this app at all**.

---

## P1 — Over-broad role grants

Judged against what each role needs to do their job:

| Role | Grant | Concern |
|---|---|---|
| **Cashier** | `analytics`, `reports`, `revenue` | Company-wide business intelligence and trend reporting. A cashier needs their own drawer and today's transactions — not P&L-adjacent analytics. |
| **Head Waiter** | `checkout` | Defensible (waiters settle bills in many venues), but it means a waiter can take payment with no separate till accountability. Worth a deliberate decision. |
| **Head Chef** | `reports` | Food-cost reporting is reasonable; confirm it excludes revenue/payroll. |
| **Cleaner** | `dashboard` | The dashboard is order/revenue-shaped. A cleaner's landing view should be the waste log only. |

None of these are exploits — they are **policy choices that should be made
deliberately** rather than inherited. The API exposure above makes them moot in
practice until it is fixed.

## P1 — Waiter dashboard showed a metric it never computed

*(Fixed already — recorded here for completeness.)* The head-waiter dashboard
rendered a **Low Stock** tile and a **Low Stock Alerts** card, but
`loadDashboard()` only fetches inventory when the role holds the `inventory`
permission, which head-waiter does not. The tile was pinned to `0` and the card
always claimed "All items stocked" — asserting a fact the app never checked, to
someone with no permission to act on it.

**Check the same pattern elsewhere**: any KPI whose data source is
permission-gated will silently render zero rather than hide itself.

---

## P2 — UI/UX and responsiveness

Verified at 1024×768 (tablet) and 390×844 (phone).

- **Empty dashboards.** For Cleaner and Delivery the dashboard is near-empty by
  design. These roles should land on their working screen (waste log / delivery
  queue), not a metrics page. `ROLE_DEFAULT_VIEW` already does this — but the
  crash above means they never get there.
- **Bottom nav padding.** The `while (items.length < 5) push(null)` approach
  exists to keep the mobile bottom bar visually even. It should render empty
  spacers rather than nulls — or simply not pad.
- **Dark mode** — checked across dashboard and menu; no contrast failures.
- **Touch targets / typography / date handling** — audited and fixed separately;
  see `WAITER-AUDIT.md` §5, §5.1, §5.2.

---

## Fix order

1. **Lock down the API** — session/JWT required on every endpoint, plus
   server-side role authorization. Nothing else matters until this is done.
2. **Verify whether writes are open**, and treat as compromised if so.
3. **Fix the AppLayout null crash** — 3 roles are fully blocked, one-line fix.
4. **Per-user passwords + forced rotation**, remove the shared default.
5. **Review the role matrix** deliberately (cashier analytics, waiter checkout).
6. Audit remaining KPIs for the permission-gated-data-renders-zero pattern.
