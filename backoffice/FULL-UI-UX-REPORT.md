# FU FUT Backoffice — Full UI/UX & Bug Audit (Page-by-Page)

**Scope:** `fufut-management/backoffice/src/` — all 22 views + layout + shared components + composables + core CSS
**Date:** Aug 2026
**Method:** Full source read of every file, one page at a time. No live runtime testing.

---

## How to read this report

Each section is one file. Findings are tagged:

- **[BUG]** — functional defect: dead endpoint, fake filter, broken logic, data corruption risk
- **[UX]** — usability issue
- **[STYLE]** — visual/CSS inconsistency or dead CSS
- **[A11Y]** — accessibility (WCAG) gap

Files are ordered largest→smallest as audited. Repeated cross-cutting themes are collected at the end in §"Cross-cutting" so I don't repeat them 22×.

---

## 1. `src/components/AppLayout.vue` (shared shell)

- **[BUG]** Theme toggle not persisted. `toggleTheme()` (`:105-108`) sets the `data-theme` attribute but never writes `localStorage`; a hard reload reverts to light. Also `isDark` is read once from `documentElement` on mount (`:103`) so the attribute is never re-applied early.
- **[BUG]** Bottom nav `bottomItems` always pads to 5 slots with `null` (`:150-154`); template guards with `v-if="item"` but `flex:1` still applies to real items → lopsided bar for users with <5 permitted views.
- **[UX]** `today` (`:161`) computed once, not reactive — date goes stale across midnight.
- **[STYLE]** Collapse-toggle icon (`:11-13`) is two mismatched `<polyline>`s (a chevron + an unrelated bar) — looks like a broken/corrupted glyph.
- **[A11Y]** `menu-toggle` hamburger (`:44`) has no `aria-label`; `<aside>`/`<nav>` have no `aria-label`; section headers are divs, not headings/landmarks. `v-html` for static icons (`:30,110-130`) is fragile and ~120 lines pollute the component.

## 2. `src/views/StaffRequestsView.vue`

- **[BUG]** Approve button (`:48,76,106`) lets a user approve their own request — the comment says the rule is "stated where the buttons are" but nothing disables/hides approve for the requester. Server rejects; client gives a confusing error toast.
- **[BUG]** Leave form has no `endDate >= startDate` validation; `From: today, To: yesterday` produces a negative `days` count.
- **[BUG]** Adjustments amount sign is type-driven (good) but the form still accepts `amount=0` — `if (!f.amount)` (`:318`) treats `0` as missing and blocks a legit £0.00 entry.
- **[STYLE]** Tab badge fallbacks `var(--danger, #e74c3c)` (`:376`) — dead fallback, and `#e74c3c` ≠ the real `--danger #D32F2F`.
- **[UX]** Reject is `btn-ghost` (looks unimportant) next to primary Approve — no danger styling on a consequential action.
- **[A11Y]** Status filter `<select>` (`:6`) unlabeled; tabs are plain buttons without `role="tablist"/tab/aria-selected`; both modals missing `role="dialog"`; `<th>` no `scope="col"`; empty `<th></th>` action headers.

## 3. `src/views/PayrollView.vue`

- **[BUG]** Warning/success `alert-banner` classes (`:20-25`) are **used but never defined** — no scoped style, not in global CSS. The banners render as unstyled plain `<p>` text. **CSS bug.**
- **[BUG]** `periodStart/periodEnd` computed once at setup (`:171-173)`, go stale; no `end >= start` validation before "Run Payroll".
- **[BUG]** JSON validation only runs when the *current* saved value is JSON (`:212` `isJson(s.value)`), not when the user *types* JSON into a text field.
- **[UX]** Two unlabeled date inputs (`:6-7`) — no From/To clues. Date-driven print emoji `🖨` (`:78,112`) is OS-dependent. 12-column payslip table has no sticky first column.
- **[A11Y]** Rate-setting inputs inside table cells have no labels (`:45`); alert banners have no `role="alert"`.

## 4. `src/views/PipelineView.vue`

- **[BUG]** `loadOrders` filters OUT `fulfilled` and `cancelled` (`:169`) but `stages` (`:100-106`) declares both lanes → **two dead lanes that can never be populated**.
- **[BUG]** `o.timer` mutated directly inside interval (`:151`); when an order leaves `preparing`, the stale timer value persists on the card.
- **[BUG]** `updateStatus` mutates `selectedOrder.value.status` optimistically with no rollback on failure (`:196-200`).
- **[UX]** HTML5 drag/drop has no touch fallback and no keyboard alternative; order cards aren't focusable/`tabindex`-less (`:27`). Cancel is allowed from any status incl. after "Ready" with no confirm. `⏱` pulse animation (`:229-230`) is infinite and not gated by `prefers-reduced-motion`.
- **[STYLE]** Lane header colors hardcoded hex (`:101-105`) bypass tokens. `.table-toolbar` redefined in scoped style duplicating the global. ~40 lines of orphaned `.table-modal`/`.heatmap` CSS (`:258-294`) never used in this template.
- **[A11Y]** Modal missing `role="dialog"`; `●/○` live badge characters unlabeled.

## 5. `src/views/TablesView.vue`

- **[BUG]** `tableDuration` reactivity "hack" — 30s interval reassigns `selectedTable.value = {...}` (`:204`) — breaks object identity for `currentOrder`/`tableReservation` computeds.
- **[BUG]** `statusBadgeClass` maps `occupied → 'cancelled'` (`:153`) — an occupied table wears the **red "cancelled" badge**.
- **[BUG]** KPI summary omits `cleaning` status (`:141-148`); total ≠ sum of visible counts.
- **[BUG]** `selectedTable.value = table` (`:223`) is a reference, not a copy — modal edits mutate the source array before API succeeds.
- **[UX]** No sort/search on heatmap; cells not keyboard accessible; "Change Status" buttons render raw lowercase status names (`available`/`occupied`), inconsistent with the capitalized legend.
- **[STYLE]** `#FDE68A` hardcoded border (`:275`) instead of a token.

## 6. `src/views/DashboardView.vue`

- **[BUG]** `setInterval(loadDashboard, 30000)` (`:160`) with async `loadDashboard` — overlapping requests if one takes >30s; no guard.
- **[BUG]** `buildTopItems` regex parses `"Latte x2"` at the END (`DashboardView.vue:206`), while `PnLView.vue:128-134` parses `"2x Latte"` at the START — **same `o.items` field, two incompatible parsers, COG/ranking silently wrong.**
- **[BUG]** Peak-hours chart uses browser-local `getHours()` (`:230`) — timezone skew. `navigateToTable` (`:137-139`) ignores WHICH table was clicked and just routes to the tables index.
- **[BUG]** `isToday` (`:156`) `.slice` on possibly-non-date `d`.
- **[UX]** `dash-table-status` sliced to 4 chars (`:66`) → "avai/occu/rese/clea" gibberish. Silent `catch(e){console.error}` (`:195`) — no error state. Empty states are inline plain text, inconsistent.
- **[STYLE]** Emoji in card titles (`🔥 🕐 📋 🗄️`); `:style` inline grids; `.dash-table-cell.status-*` duplicates TablesView.

## 7. `src/views/MenuView.vue`

- **[BUG]** `editItem` (`:158-162`) doesn't spread `...item` — extra server fields silently dropped on save → data loss.
- **[BUG]** `toggleAvailable` (`:181`) PUTs the whole item (`{...item, available}`) — heavy, and wipes server-side-only fields on overwrite.
- **[BUG]** Category `<select>` hardcoded (`:81-83`); an existing item whose category isn't in the list silently defaults the select to "Coffee" on edit → category corruption on save.
- **[BUG]** **Image paths are `/assets/menu-…jpg`** (`:124-129`) — absolute, ignores `BASE_URL='/backoffice/'` used by `AppLayout.vue:96` (`base + 'assets/logo.webp'`). **Broken images unless assets are mirrored at server root.**
- **[BUG]** `+ Add Item` sets `form={}` (`:14`) wiping declared defaults; `modifiersStr` not reset.
- **[UX]** "Pick Image" is **random** (`:152-154`) — no file upload or picker. No bulk actions. Grid `opacity:.6` on unavailable cards with hover `opacity:.8` falsely implies actionability.
- **[STYLE]** `border-radius:6px` inline (`:52`) vs `--radius-sm:8px`; modal 600px vs global 540px.

## 8. `src/views/SettingsView.vue`

- **[BUG]** `onOnlineChange` subscription (`:107`) never unsubscribed (returned `unsub` ignored) — leak on navigation away.
- **[BUG]** `checkServer` uses raw `fetch('/api/auth/me')` (`:111`) bypassing the API wrapper/error handling; 401 is mislabeled "Connected".
- **[BUG]** Accountant-pack CSV deliberately concatenates `## section` headers and `# notes` into one `.csv` file (`:166-175`) — **spreadsheets can't open this as data**. Comment claims it opens fine; it doesn't.
- **[BUG]** Profile "Full Name" is two unlabeled inputs under ONE `<label>` (`:10`) — placeholder-only naming; reads wrongly to SR.
- **[UX]** Two-column grid `1fr 1fr` (`:7`) has no small-screen collapse. Version `1.0.0` hardcoded (`:34`). `packFrom/packTo` unlabeled semantics.

## 9. `src/views/LoginView.vue`

- **[BUG]** Raw server error shown to user (`:94`). 800ms `setTimeout` before navigation (`:92`) — tab close race.
- **[UX]** No "forgot password"; no "show password" toggle; password has no minlength hint; error doesn't clear on re-type.
- **[STYLE]** Class prefix `pos-login` leaked from the POS module.
- **[A11Y]** Label SVG icons inside `<label>` are read by SR; `autofocus` (`:27`) is spec-discouraged; error SVG not `aria-hidden`; password field lacks `autocomplete` hints.

## 10. `src/views/AttendanceView.vue`

- **[BUG]** `from` flashes today then jumps to today-6 on mount (`:105,118-120`).
- **[BUG]** `grace` falls back to hardcoded 10 if the settings fetch fails (`:134`) while the UI text says "{{ grace }}-minute grace" as absolute fact.
- **[BUG]** `on-leave` status maps to `badge-pending` (`:113`), visually identical to **late** — misclassified semantics.
- **[UX]** Scheduled `"09:00–?"` when end missing; `not set` dev text; no status legend. 5 summary stats borrow `.stat` from PayrollView.
- **[A11Y]** Filter/date inputs unlabeled; modal missing `role="dialog"`.

## 11. `src/views/PnLView.vue`

- **[BUG]** COG regex `o.items.split(/,(?=\s*\d+x\s)/)` (`:128`) expects `"2x Latte"` — incompatible with Dashboard's parser (see Dashboard B1). **Two liars, one truth.**
- **[BUG]** Expenses dataset hardcoded `expData.push(0)` (`:171`) with comment "simplified" — the "Revenue vs Expenses" chart is **fake**: an expense line that is always zero.
- **[BUG]** `catch(e){console.error}` (`:152`) — silent failure; KPIs show 0 on error.
- **[STYLE]** Doughnut palette hardcoded 7 colors (`:186`) cycled for more categories; `margin-bottom:24px` inline duplicates global `.chart-grid`.

## 12. `src/views/WasteView.vue`

- **[BUG]** **Date filter is fake** — `loadWaste` (`:100`) calls `apiGet('waste')` with no range; Filter button does nothing.
- **[BUG]** `totalCost = quantity * 20` (`:95`) — flat magical ETB 20 per unit for every category/unit. Meaningless metric presented as "Estimated Cost".
- **[BUG]** `totalWaste` sums `kg + L + pcs` (`:94`) — incompatible units summed into "5.5 kg". `unit` shown is just the first row's (`:96`).
- **[UX]** Single half-width chart card in a `1fr 1fr` grid (`:19-21`) leaves an empty half; "Reason" is free text instead of a select.

## 13. `src/views/AuditLogView.vue`

- **[BUG]** Date filter sends **UTC** `T00:00:00.000Z` / `T23:59:59.999Z` (`:132-133`) from a local `<input type="date">` — in UTC+3 the local day's first 3 hours are excluded. Timezone bug.
- **[BUG]** `limit=200` hardcoded (`:134`), no pagination — old entries silently invisible.
- **[UX]** No actor filter, no CSV export, no drill-down from `entity_id`, diff objects rendered as raw JSON (`:120`), no expand/collapse.
- **[STYLE]** `.pagination` (`:67`) used but never defined in scoped/global CSS — unstyled.

## 14. `src/views/ExpensesView.vue`

- **[BUG]** **_Broke export endpoint** — `exportCSV` POSTs `export/csv` (`:121`), the exact endpoint SettingsView's comment (`SettingsView.vue:128-132`) confirms *never existed*. This is stale code — an export that always fails.
- **[BUG]** Date filter is fake (`loadExpenses:92-94` fetches all). "Total (Filtered)" label is a lie.
- **[BUG]** `topCategory` with missing category key → `c[undefined]` accumulation, garbled label (`:84-88`).
- **[UX]** Amount shows rounded-to-0 (`:27`); paidBy free-text no staff dropdown; no receipt attachment.
- **[STYLE]** `ETB 12345` without thousand separators in summary card.

## 15. `src/views/InventoryView.vue`

- **[BUG]** `lowItems` excludes out-of-stock (`:81` `> 0`) → "Low: 3, Out: 2" perplexes users (5 items need reorder shown as 3).
- **[BUG]** Badge logic (`:26`) uses one rule (`qty<=min`), summary uses another — an item with `minLevel` unset shows OK even at qty 0, while `lowItems` shows it low (or differently). Divergent.
- **[UX]** No stock-adjustment workflow (delivery/increment with audit trail), no quantity-step by unit (accepts "0.5 boxes"), no supplier field, no CSV import. qty display loses decimals.
- **[A11Y]** Modal missing `role="dialog"`; status badge is color-only.

## 16. `src/views/ReservationsView.vue`

- **[BUG]** Filter re-fetches ALL reservations every click (`:93`) — server filter unused.
- **[BUG]** "Filter" button doesn't server-filter; status dropdown (`:53`) lets staff create "completed" reservations that never occurred (no state machine).
- **[UX]** No past/upcoming split; no guest phone/email field; `tableId` free-text not a real table picker; `form={}` on Add wipes default `guests: 2, time: 19:00` (`:11`).
- **[STYLE]** Notes `max-width:150px` with no tooltip.

## 17. `src/views/ReportsView.vue`

- **[BUG]** Two "Export CSV" buttons (`:6,26`) doing identical work; toolbar copy ignores the table dropdown making first click always export `orders`.
- **[BUG]** `exportReceipt` (`:121-122`) `window.open()` + `document.write()` — blocked by popup blockers, no fallback, no `document.close()`.
- **[BUG]** `exportCSV` again POSTs the broken `export/csv` endpoint (`:113`).
- **[UX]** KPIs are all-time (`:69-71`) while charts are last-30-days — mismatched semantics on one screen. `<label>or</label>` (`:27`) used as pure separator.
- **[STYLE]** KPI/Status chart hardcoded palettes (`:94-95,105`).

## 18. `src/views/RevenueView.vue`

- **[BUG]** `expenses` fetched (`:80`) though the KPIs never use it — wasted I/O. `o.payment` assumed `'cash'` else card (`:71,97-98`).
- **[BUG]** Daily `o.created.slice(0,10)` vs local `dateFrom/dateTo` (`:93`) — UTC date vs local filter, off-by-one-day at 00:00-03:00 local.
- **[UX]** No date presets; `Card/Mobile` single bucket hides payment mix.
- **[STYLE]** Hardcoded chart colors; unlabeled date inputs.

## 19. `src/views/StaffView.vue`

- **[BUG]** `roleCounts` joins count map into a single string `"manager:1 cashier:3"` (`:83`) rendered in a numeric `.num` card — unreadable.
- **[BUG]** `editStaff` omits `active` from form (`:90`) → **no way to deactivate a staff member from the UI** (feature gap vs MenuView's toggle).
- **[BUG]** `form.role` list omits roles that exist in permissions (`accountant`, etc.) (`:48`); selecting a missing role on edit → default `cashier` silently.
- **[UX]** Reset PW has no confirm; every role wears the same yellow badge → 0 role differentiation.
- **[A11Y]** Modal missing `role="dialog"`.

## 20. `src/views/ShiftsView.vue`

- **[BUG]** Date filter fake (`loadShifts:74` fetches all).
- **[BUG]** `staffId` free-text (`:36`) — no staff dropdown; no conflict detection for overlapping shifts; no `end` validation.
- **[BUG]** No role on shift form (`:34-41`) even though the table shows a role column — feature gap.
- **[STYLE]** `'-'` hyphen vs `—` em-dash inconsistency (`:20`).

## 21. `src/views/DeliveryView.vue`

- **[BUG]** Status filter fake (`loadDelivery:75` fetches all). `driverId` free-text — no verification the driver exists/available.
- **[UX]** Action button labeled "Status" (`:30`) is ambiguous; modal titled "Update Delivery Status" also edits driver. No ETA/GPS/confirmation stamps. Address truncated 180px with no tooltip.
- **[A11Y]** Modal missing `role="dialog"`; filter select unlabeled.

## 22. `src/views/OrdersView.vue`

- **[BUG]** `loadOrders` fetches ALL orders with no pagination (`:59`) — thousands of `<tr>`s in the DOM.
- **[BUG]** `totalRevenue` sums **filtered** orders including **cancelled** (`:55`) — inflated revenue.
- **[BUG]** "Refresh" button is `@click="loadOrders"` — no actual filter re-apply; time shown as UTC `slice(11,19)`.
- **[UX]** No row drill-down to order detail; search only by ID (not table/customer/item); payment badge colors `cash → pending (yellow)` are semantically wrong.

## 23. `src/views/TimeClockView.vue`

- **[BUG]** Date filter fake (`loadTime:54`). **KPI #1 "Today's Clocks" shows `entries.length` = ALL-time count** (`:12`), not today's.
- **[BUG]** `staffClockedIn`/`totalHoursToday` hardcode "today" (`:44-45`) while table respects the filter → inconsistent screen.
- **[BUG]** `duration.split(':')` (`:47-48`) silently drops seconds; staff shown by raw ID, not name.
- **[UX]** No clock-in/out action in this view; manager can't edit forgotten clock-outs.

## 24. `src/components/BaseButton.vue` + composables

- **[BUG]** **`<base-button>` inside a `<form>` defaults to `type="submit"`** — template never sets `type`. Clicking it anywhere inside a form triggers submit (double-action risk).
- **[BUG]** `useConfirm.js` uses *module-level* shared refs + a single `resolveRef` (`:3-15`) — back-to-back `showConfirm()` calls swap the resolver and orphan the first promise. Fragile global singleton.
- **[BUG]** `useSSE.on()` cleanup is never called by Pipeline/Tables (`:138/195`) — listeners accumulate when components don't unmount cleanly.
- **[BUG]** `useButtonState` success state leaves `isBusy()` false (only `loading` is busy, `:20`) → **button re-clickable during the 2000ms success animation** → double-submit window.
- **[UX]** `getLabel` verb map (`:81-94`) misses verbs used in the app (`Add`, `Refresh`, `Filter`, `Reset PW` → "Reset PWing..." fallback).

## 25. `src/composables/useToast.js` (toast system)

- ✅ **Good:** 4 types, queued, auto-dismiss + manual dismiss, slide animations, `role="alert"`, and respects `prefers-reduced-motion` — rare and commendable.
- **[STYLE]** Duplicate container/CSS. `App.vue` renders `<div id="toastContainer">` and `ensureContainer()` also looks it up then falls back to creating one — safe, but the toast CSS lives in *two* places: `styles.css` (`.toast-container` outer pos, `styles.css:148`) and a runtime-injected `<style data-toast-styles>` block (`useToast.js:54-75`) with the *same selector but different rules* (gap:12 vs none). Specificity/order drift → inconsistent spacing.
- **[A11Y]** Per-toast `role="alert"` (implicit `aria-live="assertive"`) on the same element whose container is `aria-live="polite"` → screen readers may announce info toasts as urgent. Use `role="status"`/polite for non-critical.
- **[UX]** No destructive-action undo. A toast-based "Undo" affordance (e.g. delete staff, void waste) would fill `App.vue`'s generic confirm gap.
- **[STYLE]** Z-index scale is raw strings (500, 100, 9999, 150) scattered across modal/sidebar/toast/bottom-nav — no CSS variable scale; stacking-bug prone.
- **[PERF]** Each showing builds a `<style>` + `<svg>` via string concat — fine at low volume, but a burst of toasts could thrash the DOM.
- **[A11Y]** `prefers-reduced-motion` is honored *only* by the toast system — transitions on cards/sidebar/KPI counters are not gated app-wide (vestibular risk).

---

## Cross-cutting (appears in ≥5 files)

### C1 — Fake filters (WORST PATTERN)
`WasteView`, `ExpensesView`, `ShiftsView`, `DeliveryView`, `TimeClockView`, `ReservationsView` all render a date/status filter control but `loadX()` fetches the **full collection with no query params**. The "Filter" button appears to do something and does nothing. This five-six-fold repeated pattern is the single biggest UX deception in the app.

### C2 — Dead `export/csv` endpoint
`ExpensesView:121` and `ReportsView:113` POST to `export/csv`, which `SettingsView.vue:128-132` documents as "an endpoint that has never existed". SettingsView itself was rewritten to avoid it. These two spots were missed. **Any click on Export in Expenses or Reports is guaranteed to fail.**

### C3 — Off-by-one timezone: UTC `slice(0,10)` vs local dates
`Detail: Dashboard(peak hours)`, `RevenueView`, `PnLView`, `OrdersView`, `AuditLogView`, `PipelineView` all compare `o.created.slice(0,10)` or `getHours()` in *browser-local* context against date values the user entered as local. Server timestamps are UTC. In UTC+3, the 00:00–03:00 window is misattributed. **All date/day aggregations are unreliable by up to 3 hours.**

### C4 — No error/loading/skeleton states
`PnLView`, `ReportsView`, `RevenueView`, `DashboardView` all `catch(e){console.error}` → user sees zeros / blank canvas, no toast, no skeleton, no retry. `WasteView`/`StaffView` silent too.

### C5 — `form={}` wipe pattern
`MenuView:14`, `WasteView:9`, `ExpensesView:9`, `InventoryView:7`, `ReservationsView:11`, `StaffView:7`, `ShiftsView:9` all open the modal with `form={}`, discarding the component's declared defaults (category, guests, time, etc.). Every one of these should call a `blank()` factory instead.

### C6 — Modal ARIA pattern broken everywhere
Every `/app` modal (`:118,204` StaffRequest, `:47` Tables, `:55` Pipeline, `:70` Menu, `:40` Settings, `:73` Attendance, `:40` Expenses, `:36` Inventory, `:40` Reservations, `:40` Staff, `:31` Shifts, `:39` Delivery, global `App.vue:6`) is missing `role="dialog"` / `aria-modal="true"` / `aria-labelledby`, Escape-close, and focus trap. One shared `BaseModal.vue` would fix all 13 instances + add the patterns.

### C7 — Date inputs unlabeled
`PayrollView`, `PnLView`, `WasteView`, `ExpensesView`, `RevenueView`, `AttendanceView`, `ShiftsView`, `AuditLogView`, `TimeClockView`, `ReservationsView`, `SettingsView` — ~15 unlabeled `<input type="date">` instances with no `<label>`/`aria-label`.

### C8 — Hardcoded chart palettes
`PnLView:186`, `WasteView:109`, `ReportsView:105`, `RevenueView:129` — raw hex arrays cycled for >n categories; no token linkage, no dark-mode adaptation for charts.

### C9 — `ETB` hardcoded in ~14 files
No currency abstraction. `PayrollView`, `PnLView`, `RevenueView`, `StaffRequestsView`, `DashboardView`, `MenuView`, `InventoryView`, `ExpensesView`, `WasteView`, `OrdersView`, `DeliveryView`, `SettingsView`.

### C10 — `.empty`, `.stat`, `.summary-row`, `.table-toolbar` redefined per-view in scoped styles
`PayrollView`, `AttendanceView`, `PipelineView`, `TablesView`, `StaffRequestsView` each redefine global utilities scoped locally. Drift over time.

### C11 — Terminal-time UTC in tables
`orders.created.slice(11,19)` shown raw (UTC) in `OrdersView:32`, `PipelineView:33`, `TablesView:99` — kitchen sees times 3 hours off.

### C12 — Existing dark-mode blind spots
KPI hover border `--teal-200` in dark = near-black; inline hardcoded colors in tables/heatmaps/charts don't respond to themes.

---

## Priority summary

**P0 — creates wrong data or a guaranteed dead action**
1. C1 Fake filters (6 files) — wire query params server-side or drop the controls.
2. C2 Dead `export/csv` (ExpensesView, ReportsView) — delete buttons or point at working exporter.
3. C3 Timezone misattribution (6 files) — store/localize dates consistently (use local dates or server-relative offsets).
4. MenuView image paths `/assets/menu-*` ignore `BASE_URL` → broken images.
5. OrdersView revenue counting cancelled orders.
6. PnLChart expenses hardcoded 0 — a chart that lies.
7. AuditLog/B1 UTC filter — 3-hour blind spot.

**P1 — lying or broken UI semantics**
8. PayrollView `.alert-banner` undefined → unstyled critical warnings.
9. TablesView occupied→cancelled badge.
10. WasteView `totalCost= qty*20` fake metric + summed incompatible units.
11. TimeClock KPI #1 counts all-time as "today".
12. `BaseButton` defaults to submit → double-submit inside forms.
13. `useConfirm` module-level singleton race.
14. SettingsView accountant CSV "bundle" un-parseable.

**P2 — polish**
15. C6 BaseModal with focus trap/aria.
16. C5 blank() factories instead of `form={}`.
17. C4 skeletons + error toasts everywhere.
18. C7 date-input labels.
19. C9 currency/locale abstraction.
20. Theme persistence (`localStorage`) + `:focus-visible` + `prefers-reduced-motion` global gate.
21. `BaseButton` `type` prop + busy-during-success fix.

**Count:** 22 files audited, ~90 distinct findings across [BUG]/[UX]/[STYLE]/[A11Y], with 12 cross-cutting themes recurring in 5+ files.

---

## Suggested next step

If you want, I can now **fix** these one at a time (e.g., start with P0/C1 fake filters, then C2 dead exports). Say the word and pick a file.