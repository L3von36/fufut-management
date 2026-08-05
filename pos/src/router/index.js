import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

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
const StaffView = () => import('../views/StaffView.vue')
const ShiftsView = () => import('../views/ShiftsView.vue')
const TimeClockView = () => import('../views/TimeClockView.vue')
const ReportsView = () => import('../views/ReportsView.vue')
const PipelineView = () => import('../views/PipelineView.vue')
const RevenueView = () => import('../views/RevenueView.vue')

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', name: 'login', component: LoginView },
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
      { path: 'expenses', name: 'expenses', component: ExpensesView },
      { path: 'pnl', name: 'pnl', component: PnLView },
      { path: 'cashdrawer', name: 'cashdrawer', component: CashDrawerView },
      { path: 'inventory', name: 'inventory', component: InventoryView },
      { path: 'waste', name: 'waste', component: WasteView },
      { path: 'staff', name: 'staff', component: StaffView },
      { path: 'shifts', name: 'shifts', component: ShiftsView },
      { path: 'timeclock', name: 'timeclock', component: TimeClockView },
      { path: 'reports', name: 'reports', component: ReportsView },
      { path: 'pipeline', name: 'pipeline', component: PipelineView },
      { path: 'revenue', name: 'revenue', component: RevenueView }
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

// Track whether we have attempted session restoration this page load
let sessionChecked = false

router.beforeEach(async (to, from, next) => {
  const auth = useAuthStore()

  // On first navigation, try to restore session from server cookie
  if (!sessionChecked && to.meta.requiresAuth) {
    sessionChecked = true
    if (!auth.isAuthenticated) {
      const restored = await auth.checkSession()
      if (restored) return next(to.fullPath)
    }
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return next('/login')
  }
  // Permission guard
  if (to.meta.requiresAuth && to.name && to.name !== 'login') {
    const viewName = to.name
    if (!auth.hasPermission(viewName)) {
      return next({ name: auth.defaultView })
    }
  }
  next()
})

export default router
