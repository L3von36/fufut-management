import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { createAuthGuard } from './guard'

const DashboardView = () => import('../views/DashboardView.vue')
const LoginView = () => import('../views/LoginView.vue')
const PnLView = () => import('../views/PnLView.vue')
const ExpensesView = () => import('../views/ExpensesView.vue')
const RevenueView = () => import('../views/RevenueView.vue')
const ReportsView = () => import('../views/ReportsView.vue')
const InventoryView = () => import('../views/InventoryView.vue')
const WasteView = () => import('../views/WasteView.vue')
const MenuView = () => import('../views/MenuView.vue')
const StaffView = () => import('../views/StaffView.vue')
const ShiftsView = () => import('../views/ShiftsView.vue')
const TimeClockView = () => import('../views/TimeClockView.vue')
const ReservationsView = () => import('../views/ReservationsView.vue')
const DeliveryView = () => import('../views/DeliveryView.vue')
const OrdersView = () => import('../views/OrdersView.vue')
const AuditLogView = () => import('../views/AuditLogView.vue')
const SettingsView = () => import('../views/SettingsView.vue')
const PipelineView = () => import('../views/PipelineView.vue')
const TablesView = () => import('../views/TablesView.vue')
// The HR cluster the backoffice owns. Time Clock records the stamps;
// Attendance judges them, Staff Requests approves what people claim, and
// Payroll turns both into pay.
const AttendanceView = () => import('../views/AttendanceView.vue')
const StaffRequestsView = () => import('../views/StaffRequestsView.vue')
const PayrollView = () => import('../views/PayrollView.vue')

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
      { path: 'pnl', name: 'pnl', component: PnLView },
      { path: 'expenses', name: 'expenses', component: ExpensesView },
      { path: 'revenue', name: 'revenue', component: RevenueView },
      { path: 'reports', name: 'reports', component: ReportsView },
      { path: 'inventory', name: 'inventory', component: InventoryView },
      { path: 'waste', name: 'waste', component: WasteView },
      { path: 'menu', name: 'menu', component: MenuView },
      { path: 'staff', name: 'staff', component: StaffView },
      { path: 'shifts', name: 'shifts', component: ShiftsView },
      { path: 'timeclock', name: 'timeclock', component: TimeClockView },
      { path: 'reservations', name: 'reservations', component: ReservationsView },
      { path: 'delivery', name: 'delivery', component: DeliveryView },
      { path: 'orders', name: 'orders', component: OrdersView },
      { path: 'attendance', name: 'attendance', component: AttendanceView },
      { path: 'staff-requests', name: 'staff-requests', component: StaffRequestsView },
      { path: 'payroll', name: 'payroll', component: PayrollView },
      { path: 'audit', name: 'audit', component: AuditLogView },
      { path: 'settings', name: 'settings', component: SettingsView },
      { path: 'pipeline', name: 'pipeline', component: PipelineView },
      { path: 'tables', name: 'tables', component: TablesView }
    ]
  }
]

const router = createRouter({
  history: createWebHistory('/backoffice/'),
  routes
})

router.beforeEach(createAuthGuard(useAuthStore))

export default router
