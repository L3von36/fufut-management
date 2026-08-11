# FU FUT Backoffice — UI/UX Analysis & Findings Report

**Scope:** `fufut-management/backoffice/` (Vue 3 + Vite SPA)
**Date:** Aug 2026
**Reviewer:** Automated code-level audit (no live runtime testing)

---

## 1. Executive Summary

The backoffice is a **well-architected, internally consistent** restaurant management suite covering 22 business modules (Finance, Sales, Stock, HR, Operations, System). It uses a **custom design system** built on CSS custom properties — no UI framework dependency — giving full control over theming.

**Overall grade: B+** — Strong foundation, polished interactions, and good accessibility intent. Gaps are in **responsive coverage beyond 768px breakpoints, empty/error/skeleton state coverage, print support, and i18n**.

---

## 2. Strengths

### 2.1 Design System & Tokens (`src/assets/styles.css`)
- ✅ **Complete token layer**: color scales (teal/green/gold/neutral), semantic aliases (`--primary`, `--surface`, `--text-body`), motion (`--ease`, `--duration-*`), shadow scale, radius scale, layout vars (`--sidebar-w`, `--topbar-h`).
- ✅ **Full dark mode** via `[data-theme="dark"]` — implemented by remapping semantic aliases, not hard-coded per-component. Approach is correct, though compressed onto a single line (hard to maintain).
- ✅ Typography scale uses a coffee-house identity: `Cormorant Garamond` (display), `Inter` (body), `Fira Code` (mono numerics), `Great Vibes` (script). Numercial displays using monospace (`kpi-value`, `summary-card .num`) is a deliberate, effective choice for data alignment.
- ✅ Consistent component patterns: `.card`, `.kpi-card`, `.chart-card`, `.table-wrap`, `.badge`, `.modal`, `.form-group`. Reuse is high.

### 2.2 Interaction Feedback
- ✅ **Stateful buttons** (`BaseButton.vue` + `useButtonState`): proper loading → success → error transitions with `aria-busy`, `aria-disabled`, `aria-label`. Spinner, checkmark, and error icon all toggle correctly.
- ✅ **Toast system** (`useToast.js`): 4 types, queued, auto-dismiss, manual dismiss, slide animations, `role="alert"`, and crucially **respects `prefers-reduced-motion`** (rare and commendable).
- ✅ **Global confirm dialog** injected in `App.vue` — prevents `confirm()` browser dialogs, keeps UX on-brand.
- ✅ **Animated number counters** on dashboard KPIs (`useAnimatedNumber`) — gives the "alive" feeling backoffices usually lack.
- ✅ Hover/active micro-interactions: `:active{transform:scale(.97)}` on buttons, KPI lift on hover, table row highlight.

### 2.3 Navigation & IA
- ✅ Nav grouped into 6 logical sections (Overview, Finance, Sales, Operations, Stock, HR, System) with clear icons.
- ✅ **Role-based filtering** — sidebar only shows items the current user can access (`auth.hasPermission`), preventing dead-link frustration.
- ✅ **Three navigation patterns** for three screens: desktop sidebar (collapsible to 60px rail), mobile slide-out drawer with overlay, and bottom-tab bar (top 5 items + More). This is exactly right for cross-device backoffice use.
- ✅ `aria-current="page"` on active nav item, `role="button"` + `tabindex="0"` + `@keydown.enter` on nav items — keyboard accessible.
- ✅ Lazy-loaded routes (per-view `() => import(...)`) — keeps initial bundle lean.

### 2.4 Auth Flow
- ✅ Session restoration on first navigation (`sessionChecked` guard) — avoids flashing login page for already-authenticated users.
- ✅ Permission redirect to `auth.defaultView` — no 403 dead-ends, role-aware landing page.
- ✅ Login view has split brand/form layout, dedicated sticky spin/✓/! states, autofocus on email, branded fallback logo via `@error` handler.

### 2.5 Real-time & Resilience
- ✅ SSE composable (`useSSE.js`) with exponential-ish backoff reconnection (`MAX_RECONNECT_DELAY`, `INITIAL_RECONNECT_DELAY`), `intentionalClose` flag to distinguish clean shutdown from drops.
- ✅ Online/offline awareness baked into the API layer (`isOnline`, `onOnlineChange`).

---

## 3. Findings (Gaps & Opportunities)

### 3.1 Critical / UX Bugs

| # | Finding | Location | Impact |
|---|---------|---------|--------|
| C1 | **Bottom nav fixed at 5 + More regardless of role.** `bottomItems` slices top 5 of the *user's* allowed items — but if a waiter has only 3 allowed views, two `null` slots render empty buttons. Pushed `null`s are rendered guardedly (`v-if="item"`) so buttons are hidden, but the flex layout will then stretch the remaining items unevenly. | `AppLayout.vue:150-154` | Junior staff get a lopsided bottom bar. |
| C2 | **Theme toggle is not persisted.** `isDark` reads from `data-theme` on mount but `toggleTheme` only sets the attribute — never writes to `localStorage`. A refresh (or navigation) loses the user's chosen theme. The attribute persists within a single SPA session only because the same `documentElement` is reused; a hard reload reverts to light. | `AppLayout.vue:103-108` | Users repeatedly re-toggle theme. |
| C3 | **`aria-label` on logo `<img>` is empty (`alt=""`).** The logo is decorative with adjacent text "FU FUT Back Office", so `alt=""` is technically correct — but the topbar has no `<h1>` and the sidebar brand text is hidden in collapsed mode, leaving screen readers with no page-level landmark name. | `AppLayout.vue:5` | Mild accessibility gap for collapsed-sidebar users. |
| C4 | **Toast container duplicated.** `App.vue` renders `<div id="toastContainer">`, and `useToast.ensureContainer()` also `getElementById` then falls back to creating one. Logic is safe, but the toast CSS lives in *two* places: `styles.css` (`.toast-container`) defines outer positioning, and `useToast.js` injects a second `<style data-toast-styles>` block with the *same selector but different rules* (gap:12 vs none, etc.). Specificity/order may cause inconsistent spacing. | `styles.css:148`, `useToast.js:54-75` | Drift between the two definitions. |
| C5 | **Inline SVG nav icons via `v-html`.** `icons[...]` are static strings so XSS risk is near-zero, but `v-html` is semantically wrong for inert SVG and confuses linters. Also each icon is its own inline `<svg>` — no sprite, so file size and DOM nodes scale linearly with nav length. | `AppLayout.vue:30, 110-130` | Maintainability; many DOM nodes. |

### 3.2 Responsive / Mobile

| # | Finding | Impact |
|---|---------|--------|
| R1 | Only **one** breakpoint at `768px`. No intermediate (1024px tablet landscape, 1280px small laptop, 1536px wide) fluid tuning. KPI grid jumps from 4 cols → 2 cols with nothing in between. | Mid-size tablets look stretched. |
| R2 | `content-wrap` padding is `24px 28px 40px` desktop, `16px` mobile — no `min()`/`clamp()` fluid scaling. | Tables and forms feel cramped or wide by default. |
| R3 | No `100vh` iOS Safari workaround (the `100vh` on `.main` and `.pos-login` will underflow on iOS due to dynamic toolbars). | Content cut off behind bottom-nav on iPhone. |
| R4 | Login split panel collapses to column only at `600px` — between 600 and 768 the form panel is squashed (60% of a narrow width). | Awkward tablet-login layout. |
| R5 | `table-scroll` wraps wide tables with horizontal scroll, but no sticky first column. Wide tables (Orders, Audit Log) push the action column off-screen on mobile. | Users scroll past data to reach the delete button. |
| R6 | Bottom-nav uses `env(safe-area-inset-bottom)` (good) but `.main`/`.content-wrap` do not account for it on iOS — content can be hidden behind the bottom-nav since `padding-bottom:80px` is fixed. | Last list items hidden on iPhone notch devices. |

### 3.3 Accessibility (WCAG)

| # | Finding | Impact |
|---|---------|--------|
| A1 | No `:focus-visible` styles defined anywhere — relies on browser default outlines, which are often removed by resets or invisible on the teal surfaces. **Needs explicit focus indicator** for keyboard users. | WCAG 2.4.7 focus-visible violation. |
| A2 | Color contrast check needed: `--text-muted` (`#8C897F`) on `--neutral-25` (`#FAFAF8`) ≈ **3.0:1** — fails WCAG AA for normal text (needs 4.5:1). Used pervasively for labels and subtitles. | Hard to read for low-vision users. |
| A3 | `.nav-item` uses `role="button"` + `tabindex="0"` — correct, but a `<button>` or `<a>` would be more semantic and remove the need for manual `@keydown.enter`. | Extra ARIA; inconsistent with native semantics first. |
| A4 | Toasts use `role="alert"` (polite would be better for non-critical info) — they also use `aria-live="polite"` on the container, conflicting with per-toast `role="alert"` which is implicit `aria-live="assertive"`. | Screen readers may interrupt users for info toasts. |
| A5 | Dashboard emoji used as text in card headers (`🔥 Top Selling`, `🕐 Peak Hours`, `📋 Active Orders`, `🗄️ Tables Overview`). No `aria-hidden` and no text alternative. | Screen readers announce emojis literally. |
| A6 | Modal `@click.self` closes on overlay click — but the modal itself has no Escape-to-close handler, no focus trap, and no `role="dialog"` / `aria-modal="true"` / `aria-labelledby`. | Keyboard users can tab out of modal into hidden content behind it. |
| A7 | Form fields use `<label for>` consistently (good) but `LoginView` wraps icon + label text in the label, making the SVG part of the label — announce as nothing, but worth verifying. | Minor. |

### 3.4 Empty / Loading / Error States

| # | Finding | Impact |
|---|---------|--------|
| E1 | Dashboard has empty states for `topItems` ("No sales data yet") and `tables` ("Loading tables..."), but uses **plain text** with inline styles — inconsistent with the broader component library. No illustration, no CTA. | Looks unfinished vs. the polished KPI cards. |
| E2 | No **skeleton screens** anywhere. Loading is typically either blank or "Loading..." text. For a backoffice with SSE-driven data, skeletons would dramatically reduce perceived jank. | Users see content "pop" in. |
| E3 | **No global 404 / forbidden route.** Unmatched paths fall through to the router's default; `requiresAuth` rejects unauthorized users by redirecting to `defaultView`, but a wrong URL just redirects them silently — no "page not found" feedback. | Confusing if a user mistypes. |
| E4 | No **offline state UI**. `isOnline` and `onOnlineChange` are wired into the app but I see no banner or indicator shown when offline. For a restaurant backoffice where staff may be on flaky wifi, this is a real gap. | Staff don't know whether data is fresh. |
| E5 | Confirm modal in `App.vue` is generic and fine, but **destructive actions have no undo** (e.g. delete staff, void waste). A toast-based "Undo" pattern would be safer than a pre-confirm. | Hard to recover from accidental deletes. |

### 3.5 Consistency / Implementation

| # | Finding | Impact |
|---|---------|--------|
| K1 | Only **two** reusable components exist (`AppLayout`, `BaseButton`) in `components/` — every view rebuilds its own tables, modals, search toolbars, badges. Reuse is happening via CSS classes, not components. | Tons of duplication; divergent behavior over time. Needs a `BaseModal`, `BaseTable`, `BaseInput`, `BaseBadge`, `EmptyState`, `PageHeader`. |
| K2 | Inline styles in templates are common (`App.vue:7` `style="width:380px"`, `DashboardView.vue:14` `style="display:grid..."`). Bypasses the design system and breaks dark mode inheritances in some cases. | Hard to theme; violates separation. |
| K3 | Dark mode block in `styles.css:39` is a single ~2000-char line — unreadable, hard to edit, hard to diff. | Maintenance hazard. |
| K4 | SVG icons are defined as template-string maps inside `AppLayout.vue` (130+ lines of inline SVG). Should be extracted to `assets/icons.js` or a Vue component per icon. | `AppLayout` is bloated; icons not tree-shakeable. |
| K5 | Toast styling injected via `document.head.appendChild(style)` at runtime — works but creates FOUC risk and is untestable. Move to `styles.css`. | Minor. |
| K6 | No CSS variable used for `z-index` scale — raw values (500, 100, 9999, 150) scattered across modal/sidebar/toast/bottom-nav. | Easy to create stacking bugs. |
| K7 | Hard-coded currency "ETB" in dashboard strings. With `manifest.json`, fonts, and tagline all in English but currency in Ethiopian Birr — fine for current scope, but no abstraction layer means i18n will be painful. | Future-proofing. |

### 3.6 Performance

| # | Finding | Impact |
|---|---------|--------|
| P1 | ✅ Lazy view imports — good.
| P2 | ✅ Chart.js loaded on-demand inside `DashboardView` (`_loadChart`).
| P3 | ⚠️ All fonts (`Cormorant Garamond`, `Inter`, `Fira Code`, `Great Vibes`) appear referenced — verify they're `preconnect`ed and subset. The script font especially may be unused in backoffice. | Slow first paint if fonts aren't subset. |
| P4 | ⚠️ Each toast creates a `<style>` tag once and an `<svg>` per toast via string concat — fine at low volume, buttens of toasts could thrash. Acceptable. |
| P5 | ❓ Check whether `prefers-reduced-motion` is honored app-wide — only the toast system handles it. Transitions on cards, sidebar, kpi counters are not gated. | Vestibular sensitivity. |

---

## 4. Recommendations (Prioritized)

**P0 — Must fix**
1. Persist theme to `localStorage` and apply before mount (C2).
2. Add `:focus-visible` outline using `--primary` token — single rule in `styles.css` (A1).
3. Bump `--text-muted` contrast or darken to `--neutral-600` for body-text usage; reserve `--neutral-500` for non-text decoration (A2).
4. Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, Escape handler, and focus-trap to confirm modal (A6).

**P1 — Should fix**
5. Extract reusable `BaseModal`, `BaseTable`, `BaseInput`, `BaseBadge`, `EmptyState` — collapse 22 view-specific duplicates into primitives (K1).
6. Add skeleton states for tables and KPIs (E2).
7. Add an offline banner (`AppLayout` topbar) using existing `isOnline` infra (E4).
8. Add intermediate breakpoints at 1024px / 1280px / 1536px and convert paddings to `clamp()` (R1, R2).
9. Persist bottom-nav item count to actual allowed count, not padded-to-5 with `null`s — use `repeat(auto-fit, minmax(...))` instead (C1).
10. Add iOS-safe `100dvh` units and `safe-area-inset` accounting on `.main` (R3, R6).

**P2 — Nice to have**
11. Extract icons out of `AppLayout.vue` into `assets/icons.js` and load via `<component :is>` (C5, K4).
12. Linearize dark-mode CSS for readability (K3).
13. Move toast runtime CSS into `styles.css` (K4).
14. Replace `role="button"` nav items with real `<router-link>` elements styled as buttons (A3).
15. Add an `Undo` affordance for destructive toasts (E5).
16. Add `aria-hidden="true"` to decorative emojis in card headers (A5).

---

## 5. Component / File Reference

| Concern | Location |
|--------|----------|
| App shell & nav | `src/components/AppLayout.vue` |
| Global confirm dialog | `src/App.vue:5-15` |
| Design tokens | `src/assets/styles.css:1-39` |
| Dark mode vars | `src/assets/styles.css:39` |
| Reusable button | `src/components/BaseButton.vue` |
| Toast notifications | `src/composables/useToast.js` |
| Real-time events | `src/composables/useSSE.js` |
| Button state machine | `src/composables/useButtonState.js` |
| Route definitions & guards | `src/router/index.js:30-91` |
| Navigation items | `src/api/index.js:124-146` |
| Login screen | `src/views/LoginView.vue` |
| Dashboard (representative view) | `src/views/DashboardView.vue` |

---

## 6. Conclusion

The backoffice's **plumbing is excellent** — typed tokens, theming, RBAC, real-time SSE, stateful buttons, accessible toasts. The architecture supports growth. Where it falls short is in **state coverage** (skeletons, offline, 404), **component reuse** (still mostly class-based, not component-based), and **responsive/accessibility edge cases** that are typical of fast-moving internal tools.

Treat P0 items as a single sprint; P1 as the next quarter; P2 as debt to burn down during any larger feature work. After P0, this app comfortably reaches a **production-A grade**.
