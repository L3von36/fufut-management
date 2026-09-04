import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { createAuthGuard } from './guard'

// Lazy load views
const LoginView = () => import('../views/LoginView.vue')
const DashboardView = () => import('../views/DashboardView.vue')
const OrdersView = () => import('../views/OrdersView.vue')
const MenuMgmtView = () => import('../views/MenuMgmtView.vue')
const MenuView = () => import('../views/MenuView.vue')
const TablesView = () => import('../views/TablesView.vue')
const ReservationsView = () => import('../views/ReservationsView.vue')
const DeliveryView = () => import('../views/DeliveryView.vue')
const KitchenView = () => import('../views/KitchenView.vue')
const ExpensesView = () => import('../views/ExpensesView.vue')
const PnLView = () => import('../views/PnLView.vue')
const CashDrawerView = () => import('../views/CashDrawerView.vue')
const InventoryView = () => import('../views/InventoryView.vue')
const WasteView = () => import('../views/WasteView.vue')
// Staff records are managed in the backoffice, which owns the HR cluster
// (Staff, Shifts, Time Clock, Audit Log). The POS duplicated that screen, and a
// shared floor tablet that stays signed in all service is the worst of the three
// places to be editing colleague accounts. Time Clock still reads the staff list
// for who is on shift; only the editing screen is gone.
const ShiftsView = () => import('../views/ShiftsView.vue')
const TimeClockView = () => import('../views/TimeClockView.vue')
const ReportsView = () => import('../views/ReportsView.vue')
const PipelineView = () => import('../views/PipelineView.vue')
const RevenueView = () => import('../views/RevenueView.vue')
const AnalyticsView = () => import('../views/AnalyticsView.vue')
const CheckoutView = () => import('../views/CheckoutView.vue')
// Money owed, in one place. The floor plan badge was the only view of it, and
// it dropped a tab the moment the food was marked served.
const OpenChecksView = () => import('../views/OpenChecksView.vue')
// Stock intelligence. These consume the recipe/ledger engine: without them the
// engine is inert, because nothing can enter a BOM and a sale therefore
// consumes nothing.
const RecipesView = () => import('../views/RecipesView.vue')
const SuppliersView = () => import('../views/SuppliersView.vue')
const PurchasesView = () => import('../views/PurchasesView.vue')
const StockControlView = () => import('../views/StockControlView.vue')
// The manager's view of the SLA rules engine — what it watches, what it found,
// and who acknowledged what. The banner announces; this screen explains.
const AlertsDashboardView = () => import('../views/AlertsDashboardView.vue')

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', name: 'login', component: LoginView },
  // Outside /app on purpose: it must render without the sidebar, because every
  // destination behind it is being refused by the server until the password is
  // changed.
  {
    path: '/change-password',
    name: 'change-password',
    component: () => import('../views/ChangePasswordView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/app',
    component: () => import('../components/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: { name: 'dashboard' } },
      { path: 'dashboard', name: 'dashboard', component: DashboardView },
      { path: 'orders', name: 'orders', component: OrdersView },
      { path: 'menu-mgmt', name: 'menu-mgmt', component: MenuMgmtView },
      { path: 'menu-view', name: 'menu-view', component: MenuView },
      { path: 'tables', name: 'tables', component: TablesView },
      { path: 'reservations', name: 'reservations', component: ReservationsView },
      { path: 'delivery', name: 'delivery', component: DeliveryView },
      { path: 'kitchen', name: 'kitchen', component: KitchenView },
      // Drinks station: the same board component, pinned to the bar filter by
      // route name (KitchenView reads route.name === 'barista').
      { path: 'barista', name: 'barista', component: KitchenView },
      { path: 'expenses', name: 'expenses', component: ExpensesView },
      { path: 'pnl', name: 'pnl', component: PnLView },
      { path: 'cashdrawer', name: 'cashdrawer', component: CashDrawerView },
      { path: 'inventory', name: 'inventory', component: InventoryView },
      { path: 'waste', name: 'waste', component: WasteView },
      { path: 'shifts', name: 'shifts', component: ShiftsView },
      { path: 'timeclock', name: 'timeclock', component: TimeClockView },
      { path: 'reports', name: 'reports', component: ReportsView },
      { path: 'pipeline', name: 'pipeline', component: PipelineView },
      { path: 'revenue', name: 'revenue', component: RevenueView },
      { path: 'analytics', name: 'analytics', component: AnalyticsView },
      { path: 'checkout', name: 'checkout', component: CheckoutView },
      { path: 'open-checks', name: 'open-checks', component: OpenChecksView },
      { path: 'recipes', name: 'recipes', component: RecipesView },
      { path: 'suppliers', name: 'suppliers', component: SuppliersView },
      { path: 'purchases', name: 'purchases', component: PurchasesView },
      { path: 'stock-control', name: 'stock-control', component: StockControlView },
      { path: 'customers', name: 'customers', component: () => import('../views/CustomersView.vue') },
      { path: 'audit', name: 'audit', component: () => import('../views/AuditLogView.vue') },
      // Per-role "My Activity" — every signed-in role sees this in their
      // sidebar. Reads /api/audit?actor_id=<me> and rolls the slice up into
      // role-specific KPIs (dishes sent, deliveries completed, payments verified,
      // expenses booked, etc.) plus a filterable activity log. The audit trail
      // is the source of truth: an actor_id-tagged slice of it is "what I did".
      { path: 'my-activity', name: 'my-activity', component: () => import('../views/MyPerformanceView.vue') },
      // My Payslips — the self-service half of payroll. The server route
      // (/api/payroll/me) answers the session holder's own lines only; there
      // is no staffId parameter to pass. Granted to every role, so the tab
      // renders wherever the person signs in.
      { path: 'my-pay', name: 'my-pay', component: () => import('../views/MyPayslipsView.vue') },
      { path: 'alerts', name: 'alerts', component: AlertsDashboardView }
    ]
  }
]

const router = createRouter({
  history: createWebHistory('/pos/'),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

router.beforeEach(createAuthGuard(useAuthStore))

export default router
