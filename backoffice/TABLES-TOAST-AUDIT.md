# FU FUT Backoffice — Toast System & Tables: Bugs, Style, Responsiveness & Readability Audit

---

## PART 1 — TOAST SYSTEM (`src/composables/useToast.js`, `src/App.vue`, `src/assets/styles.css:148`)

### BUGS

| ID | Bug | File:Line | Severity |
|----|-----|-----------|----------|
| T-B1 | **Double toast container race** — `App.vue:3` renders a static `<div id="toastContainer">`, while `useToast.ensureContainer()` (`:41-49`) also tries to `getElementById` then falls back to creating one. If the static div is removed or SSR changes, the fallback creates a *second* container. The container lookup logic is safe but the **duplication risk** exists. | `useToast.js:41-49`, `App.vue:3` | Medium |
| T-B2 | **CSS injection runs on every first toast** — `ensureContainer()` injects a `<style data-toast-styles>` into `<head>` (`:51-77`). If the first toast is triggered late (e.g., after a route change), there's a **flash of unstyled toast** (FOUC). The styles should be in `styles.css` statically. | `useToast.js:51-77` | Medium |
| T-B3 | **`role="alert"` + `aria-live="polite"` conflict** — Container has `aria-live="polite"` (`:47`), each toast gets `role="alert"` (`:95`) → implicit `aria-live="assertive"`. Screen readers may **announce info/warning toasts as urgent interruptions** (WCAG 4.1.3). Should use `role="status"` for non-critical. | `useToast.js:47,95` | High (A11Y) |
| T-B4 | **No toast deduplication** — Rapid calls (e.g., validation on blur) stack identical toasts. `toasts.value` grows unbounded. | `useToast.js:8,130` | Medium |
| T-B5 | **Auto-dismiss timer not cleared on manual dismiss** — `dismissToast()` clears `_autoDismissTimer` (`:147-148`) but only if `toast.element` exists. If element was already removed by animationend handler, timer leaks. | `useToast.js:143-153` | Low |
| T-B6 | **`escapeHtml()` doesn't escape in attributes** — Used for `title` and `message` content (`:98-99`) which go into innerHTML. Safe for text nodes, but if message contains `"<img src=x onerror=alert(1)>"` it's neutralized by `textContent`. **Actually safe** — no bug here, just confirming. |
| T-B7 | **Z-index hardcoded `9999`** — In injected styles (`:55`) and `styles.css:148`. No CSS variable for toast layer. Conflicts with modal (`z-index:500`), sidebar (`z-index:100`), bottom nav (`z-index:150`). | `useToast.js:55`, `styles.css:148` | Medium |

---

### STYLE ERRORS (CSS)

| ID | Style Error | File:Line |
|----|-------------|-----------|
| T-S1 | **Two conflicting `.toast-container` definitions** — `styles.css:148` has `gap:10px`, injected style (`useToast.js:55`) has `gap:12px`. Which wins depends on load order. | `styles.css:148` vs `useToast.js:55` |
| T-S2 | **Toast type colors hardcoded in JS, not tokens** — `rgba(46,125,50,.95)` etc. (`:13-15,17-19,22-24,27-29`) don't use `--success`, `--danger`, `--info`, `--warning`. Dark mode won't adapt automatically. | `useToast.js:11-31` |
| T-S3 | **Toast icon background `rgba(255,255,255,.15)`** (`:60`) — fixed opacity white. In dark mode with dark toast bg, icon bg is barely visible. | `useToast.js:60` |
| T-S4 | **Dismiss button color `rgba(255,255,255,.7)`** (`:65`) — same dark-mode issue. | `useToast.js:65` |
| T-S5 | **No focus ring on dismiss button** — `:focus` only sets `opacity:1;color:#fff` (`:67`), no visible `:focus-visible` outline. | `useToast.js:67` |
| T-S6 | **Animation not fully reduced-motion safe** — `@media (prefers-reduced-motion: reduce)` sets `animation: none` but `transform: none !important` (`:73`) on `.toast-notification` breaks the slide-out transform that hides it. The `hidden` class still has `animation: none` → element never actually removed from DOM via animationend. | `useToast.js:73` |
| T-S7 | **Max-width `320px` / min-width `240px`** (`:56`) — on mobile `<480px` max-width becomes `calc(100vw-32px)` (`:74`) but `min-width:auto` removed — content can squish below readability. | `useToast.js:56,74` |

---

### RESPONSIVENESS

| ID | Issue | Detail |
|----|-------|--------|
| T-R1 | **Container fixed `top:16px;right:16px`** — on mobile with bottom nav (`z-index:150`, `bottom:0`), toasts can sit behind bottom nav on small screens (especially landscape). No safe-area inset. | |
| T-R2 | **No stacking limit** — 10+ toasts push content down/off-screen. No max visible count or vertical stacking cap. | |
| T-R3 | **No RTL support** — `translateX(100%)` assumes LTR. | |

---

### READABILITY / UX

| ID | Issue | Detail |
|----|-------|--------|
| T-U1 | **Default 4000ms auto-dismiss** — too short for error toasts with actionable info (e.g., "Export failed: permission denied"). No "pause on hover" to extend. | |
| T-U2 | **No toast grouping** — 3 validation errors = 3 separate toasts. Should coalesce. | |
| T-U3 | **No progress indicator** — user can't gauge remaining time. | |
| T-U4 | **Title defaults to type name** (`DEFAULT_TITLES`) — "Error", "Warning" not actionable. Should encourage custom titles. | `useToast.js:33-38` |

---

## PART 2 — TABLES: BUGS (Functional / Logic)

### 2.1 Fake / Broken Filters (6 views)

| View | File:Line | Bug |
|------|-----------|-----|
| WasteView | `WasteView.vue:100` | `loadWaste()` fetches ALL waste — `dateFrom/dateTo` ignored. "Filter" button does nothing. |
| ExpensesView | `ExpensesView.vue:92-94` | `loadExpenses()` fetches ALL — date filters ignored. "Total (Filtered)" label lies. |
| ShiftsView | `ShiftsView.vue:74` | `loadShifts()` fetches ALL — `dateFrom/dateTo` ignored. |
| DeliveryView | `DeliveryView.vue:75` | `loadDelivery()` fetches ALL — status filter ignored. |
| TimeClockView | `TimeClockView.vue:54` | `loadTime()` fetches ALL — `dateFilter` only applied in `filtered` computed. |
| ReservationsView | `ReservationsView.vue:93` | `loadReservations()` fetches ALL — date/status filters client-side only. |

**Impact:** Users think they're filtering server-side; large datasets kill performance; summary cards mislabeled.

---

### 2.2 Broken Export Endpoints (2 views)

| View | File:Line | Bug |
|------|-----------|-----|
| ExpensesView | `ExpensesView.vue:121` | POSTs to `export/csv` — **endpoint never existed** (confirmed by SettingsView comments). Guaranteed 404. |
| ReportsView | `ReportsView.vue:113` | Same dead endpoint. |

---

### 2.3 Timezone / Date Bugs (6 views)

| View | File:Line | Bug |
|------|-----------|-----|
| RevenueView | `RevenueView.vue:92` | `o.created?.slice(0,10)` (UTC date) vs `dateFrom/dateTo` (local) → 00:00-03:00 local misattributed. |
| PnLView | `PnLView.vue:112,170` | Same UTC slice vs local filter. Also `o.created?.slice(0,10)` in `buildCharts`. |
| OrdersView | `OrdersView.vue:32` | `o.created.slice(11,19)` shows UTC time to kitchen. |
| PipelineView | `PipelineView.vue:33` | Same UTC time display. |
| TablesView | `TablesView.vue:99` | Same UTC time. |
| AuditLogView | `AuditLogView.vue:132-133` | Sends `T00:00:00.000Z` / `T23:59:59.999Z` for local dates → first 3h of local day excluded in UTC+3. |

---

### 2.4 Data Mutation Before API (4 views)

| View | File:Line | Bug |
|------|-----------|-----|
| TablesView | `TablesView.vue:223` | `selectedTable.value = table` — reference, not copy. Modal edits mutate source array. |
| StaffRequestsView | `StaffRequestsView.vue:304` | `form.value = blank()` wipes defaults correctly but `openNew` doesn't deep-copy row. |
| InventoryView | `InventoryView.vue:88` | `form.value = { ...item }` — shallow copy; nested objects shared. |
| WasteView | `WasteView.vue:114` | Same shallow copy issue. |

---

### 2.5 Revenue / KPI Calculation Bugs

| View | File:Line | Bug |
|------|-----------|-----|
| OrdersView | `OrdersView.vue:55` | `totalRevenue` sums **filtered** orders **including cancelled** — inflated. |
| TimeClockView | `TimeClockView.vue:12` | "Today's Clocks" KPI shows `entries.length` (ALL entries, not today's). |
| TimeClockView | `TimeClockView.vue:44-45` | `staffClockedIn` / `totalHoursToday` hardcode `TODAY()` ignoring `dateFilter` — KPI/Table mismatch. |
| TimeClockView | `TimeClockView.vue:47-48` | `duration.split(':')` drops seconds → 01:30:15 → 1.5h. |
| WasteView | `WasteView.vue:95` | `totalCost = qty * 20` — flat ETB 20/unit for everything (meaningless). |
| WasteView | `WasteView.vue:94,96` | `totalWaste` sums `kg + L + pcs` → incompatible units. `unit` shows first row's only. |
| AttendanceView | `AttendanceView.vue:26` | `Math.round(summary.totalHours)` — 7.5h → "8". |
| InventoryView | `InventoryView.vue:81,26` | `lowItems` excludes out-of-stock (`>0`) but badge shows "Low" at qty≤min. Out-of-stock items disappear from Low count. |

---

### 2.6 Badge Semantic Bugs (Wrong Color = Wrong Meaning)

| View | File:Line | Bug |
|------|-----------|-----|
| TablesView | `TablesView.vue:153` | `statusBadgeClass('occupied')` returns `'badge-cancelled'` — **occupied table shows red "cancelled" badge**. |
| PayrollView | `PayrollView.vue:108` | Tips badge uses `badge-pending` (yellow) — tips are informational, not "pending". |
| PayrollView | `PayrollView.vue:142` | `provisional` → `badge-cancelled` (red) — "provisional" ≠ cancelled. |
| StaffView | `StaffView.vue:34` | **All roles use `badge-pending`** (yellow) — no visual distinction between manager/cashier/accountant. |
| AttendanceView | `AttendanceView.vue:113` | `on-leave` → `badge-pending` (yellow) — same as **late**. Should be distinct (e.g., blue). |
| OrdersView | `OrdersView.vue:31` | `payment === 'cash'` → `badge-pending` (yellow); else `badge-success` (green) — cash ≠ pending. |
| DeliveryView | `DeliveryView.vue:28` | `'badge-'+d.status` — dynamic class; `in-transit` → `badge-in-transit` (exists), but any new status = unstyled. |
| ReservationsView | `ReservationsView.vue:29` | Same dynamic badge — `completed` → no `badge-completed` class defined. |
| MenuView | `MenuView.vue:55` | Category badge always `badge-pending` — no semantic meaning. |

---

### 2.7 Missing / Broken Accessibility in Tables

| View | Missing |
|------|---------|
| All tables | No `<caption>` or `aria-label` describing table purpose. |
| All action columns | `<th></th>` empty — should be `<th scope="col">Actions</th>`. |
| StaffView | Role badge `badge-pending` for all — color-only distinction. |
| TimeClockView | Staff shown by raw `staffId` not name. |
| ReservationsView | Notes `max-width:150px` truncates with no tooltip/expand. |
| DeliveryView | Address `max-width:180px` truncates with no tooltip. |
| WasteView | Category badge `badge-pending` — no category color coding. |

---

## PART 3 — TABLES: STYLE ERRORS (CSS)

### 3.1 Scoped Style Duplication (Global tokens redefined per-view)

| View | Duplicated Classes |
|------|-------------------|
| PayrollView | `.summary-row`, `.stat`, `.mini-table`, `.empty`, `.link-btn` |
| AttendanceView | `.summary-row`, `.stat` |
| PipelineView | `.table-toolbar` (40 lines orphaned table CSS at bottom) |
| StaffRequestsView | `.empty`, `.hint`, `.tab`, `.tab-badge` (tabs not tables but same pattern) |
| ShiftsView | No scoped table styles — relies entirely on global. |

**Global definitions exist in `styles.css:101-118`** — scoped copies drift.

---

### 3.2 Inline Styles Bypassing Tokens

| View | File:Line | Inline Style |
|------|-----------|--------------|
| InventoryView | `InventoryView.vue:24-25` | `style="font-weight:600;font-family:var(--font-mono)"` (ok token), `style="font-family:var(--font-mono)"` |
| InventoryView | `InventoryView.vue:26` | Badge ternary inline — hard to read. |
| WasteView | `WasteView.vue:6-7,30` | `style="width:auto"` on date inputs; `style="font-weight:600;font-family:var(--font-mono)"` |
| MenuView | `MenuView.vue:51-52` | `style="width:50px;padding:4px 8px"`; `style="width:40px;height:40px;border-radius:6px"` — **radius 6px vs token 8px**. |
| MenuView | `MenuView.vue:201` | `.menu-form-modal{width:600px}` — global modal is 540px. |
| ReservationsView | `ReservationsView.vue:30` | `style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"` |
| DeliveryView | `DeliveryView.vue:26` | `style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"` |
| OrdersView | `OrdersView.vue:28,32` | Same truncation inline styles. |
| PayrollView | `PayrollView.vue:45` | `:style="isJson(s.value) ? 'width:100%;font-family:var(--font-mono);font-size:.7rem' : 'width:120px'"` |
| StaffView | `StaffView.vue:23` | `style="font-family:var(--font-mono);font-size:.78rem"` (ok), `style="font-size:.7rem;color:var(--text-muted)"` |
| RevenueView | `RevenueView.vue:30-31` | Inline font styles. |

---

### 3.3 Hardcoded Colors in Tables (Not Using Design Tokens)

| View | File:Line | Hardcoded |
|------|-----------|-----------|
| PipelineView | `PipelineView.vue:101-105` | Lane header gradients `#2563EB`, `#D97706`, `#7C3AED`, `#059669`, `#DC2626`. |
| PnLView | `PnLView.vue:186` | Doughnut palette `['#0F7B78','#D6B36A','#18B4B7','#D97706','#2563EB','#7DCFD0','#E4CB99']`. |
| WasteView | `WasteView.vue:109` | Same hardcoded palette. |
| ReportsView | `ReportsView.vue:105` | Hardcoded chart colors. |
| RevenueView | `RevenueView.vue:121,129` | `rgba(15,123,120,.6)`, `rgba(217,119,6,.5)`, `['#0F7B78','#D6B36A']`. |
| StaffRequestsView | `StaffRequestsView.vue:376` | `var(--danger, #e74c3c)` — fallback wrong color. |

---

### 3.4 Missing `:focus-visible` / Keyboard Support

| Component | Issue |
|-----------|-------|
| All table action buttons | No `:focus-visible` styles — keyboard users can't see focus. |
| MenuView grid cards | `@click="editItem"` on `<div>` — not focusable, no `tabindex`, no keydown. |
| TablesView heatmap cells | Not keyboard accessible. |
| PipelineView order cards | Drag handles only mouse; no keyboard reorder. |

---

## PART 4 — TABLES: RESPONSIVENESS

| ID | View | Issue |
|----|------|-------|
| R1 | All | `.table-scroll { overflow-x:auto }` works but **no sticky first column** — horizontal scroll loses row context (staff name, order ID). |
| R2 | PayrollView | 12-column payslip table — no sticky "Staff" column. |
| R3 | AttendanceView | 10 columns — same. |
| R4 | PipelineView | Lanes are horizontal — on mobile, only 1-2 lanes visible; no vertical stack alternative. |
| R5 | MenuView | Grid view `minmax(180px,1fr)` — good. Table view no mobile card fallback. |
| R6 | TablesView | Heatmap grid `1fr 1fr...` — on mobile becomes single column but cell content not wrapped. |
| R7 | OrdersView | No pagination — loads ALL orders into DOM. Thousands of rows = memory/perf. |
| R8 | AuditLogView | Hardcoded `limit=200` — no pagination UI; older entries invisible. |
| R9 | All filter toolbars | `.table-toolbar` uses `flex-wrap:wrap` but date inputs + selects + buttons on mobile stack awkwardly; no collapsible "Filters" drawer. |
| R10 | TimeClockView | Summary grid 3 cards — on mobile stacks but KPI values too wide for narrow screens. |

---

## PART 5 — TABLES: READABILITY

| ID | View | Issue |
|----|------|-------|
| RD1 | TimeClockView | "Staff ID" column shows raw ID — no name lookup. Duration shows "01:30" no unit label. |
| RD2 | ReservationsView | Notes truncated at 150px — no tooltip, no expand. "Table" column shows `tableId` not table number. |
| RD3 | DeliveryView | Address truncated 180px — no tooltip. Items column unbounded — long orders stretch table. |
| RD4 | OrdersView | Items truncated 200px — same. Time shown as UTC `slice(11,19)` no timezone label. |
| RD5 | InventoryView | Cost/Unit `toFixed(0)` — ETB 12.50 → "13". Quantity accepts decimals for "pcs/boxes". |
| RD6 | WasteView | "Reason" free text — no enum for reporting. "Total Waste" shows `5.5 kg` but sums L+pcs. |
| RD7 | ExpensesView | Amount `toFixed(0)` loses decimals. `topCategory` shows label only (no amount/%). `undefined` category shows "undefined". |
| RD8 | ShiftsView | Staff ID free text — no dropdown. Role shown in table but not in form. `end` shows `-` hyphen vs em-dash elsewhere. |
| RD9 | StaffView | `roleCounts` rendered as `"manager:1 cashier:3"` in a `.num` card — unreadable. |
| RD10 | PnLView | Expense chart `expData.push(0)` — fake zero bars. Cost breakdown `% of Revenue` column can exceed 100% (no cap). |
| RD11 | PayrollView | Tips column uses `title` tooltip — fails on touch. No sticky first column in 12-col table. |
| RD12 | MenuView table | Category badge always yellow (`badge-pending`) — no visual category coding. Image column 50px fixed — thumbnails tiny. |
| RD13 | AuditLogView | `when()` uses `toLocaleString()` — no options, varies by browser, no seconds guarantee. Diff objects shown as raw JSON for complex changes. |
| RD14 | All empty states | Inconsistent text: "No items found" / "No waste logged" / "No time entries" / "No orders" / "No reservations" / "No delivery orders" / "No staff found" / "No entries for these filters" / "Loading…" — no unified pattern. |

---

## SUMMARY: TOP 10 TABLE FIXES (Priority)

| P | Fix | Files |
|---|-----|-------|
| 0 | Wire server-side filters (or drop fake filter UI) | WasteView, ExpensesView, ShiftsView, DeliveryView, TimeClockView, ReservationsView |
| 0 | Delete dead `export/csv` calls or implement real exporter | ExpensesView, ReportsView |
| 0 | Normalize timezone: store/display in local, or convert UTC→local consistently | RevenueView, PnLView, OrdersView, PipelineView, TablesView, AuditLogView |
| 0 | Fix occupied→cancelled badge (TablesView) | TablesView |
| 0 | Fix revenue including cancelled orders | OrdersView |
| 0 | Fix TimeClock KPIs ignoring filter | TimeClockView |
| 1 | Deep-copy on edit (stop mutating source) | TablesView, InventoryView, WasteView, StaffRequestsView |
| 1 | Semantic badge mapping (centralize) | All views with dynamic badges |
| 2 | Sticky first column on horizontal tables | PayrollView, AttendanceView, OrdersView, DeliveryView, etc. |
| 2 | Pagination / virtual scroll for large tables | OrdersView, AuditLogView |
| 2 | Move all inline styles → tokens; kill scoped duplicates | PayrollView, AttendanceView, PipelineView, MenuView, etc. |
| 2 | Unified empty state component + copy | All views |
| 2 | `:focus-visible` + keyboard for all interactive table elements | Global |

---

## RECOMMENDED NEXT STEPS

1. **Create `BaseTable.vue`** component encapsulating: toolbar, sticky header, sticky first column, horizontal scroll, pagination slot, empty state slot, loading skeleton, responsive collapse-to-cards on <640px.
2. **Centralize badge mapping** in a composable `useStatusBadge(status, type)` returning token-based class.
3. **Move toast CSS to `styles.css`**, remove runtime injection, fix `role="alert"`→`role="status"` for non-critical.
4. **Add date-fns / luxon** for timezone-aware formatting; create `useDateFormat` composable.
5. **Implement real CSV export** (client-side Blob) to replace dead endpoint.
6. **Audit every `form={}`** → replace with `blank()` factory per view.