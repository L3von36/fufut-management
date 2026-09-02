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
// My Performance / My Activity: every signed-in role's own audit slice as
// role-aware KPIs (dishes sent, deliveries completed, payments verified…)
// with today/week/month/year/custom range tabs and inline filters. The view
// reads /api/audit?actor_id=<me> which the API now allows self-scoped.
const MyPerformanceView = () => import('../views/MyPerformanceView.vue')
const EmployeeActivityView = () => import('../views/EmployeeActivityView.vue')
const EmployeeHistoryView = () => import('../views/EmployeeHistoryView.vue')
const TasksView = () => import('../views/TasksView.vue')
const DailyReportView = () => import('../views/DailyReportView.vue')
const LiveFeedView = () => import('../views/LiveFeedView.vue')
const ZReportView = () => import('../views/ZReportView.vue')
const SettingsView = () => import('../views/SettingsView.vue')
// Role Access: the manager's permission-granter. Grants another role an extra
// screen (v1: a category-scoped Inventory — bar stock for the barista, food
// stock for the kitchen) backed by GET/PUT /api/role-scopes, manager-only.
const RoleAccessView = () => import('../views/RoleAccessView.vue')
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
      { path: 'my-activity', name: 'my-activity', component: MyPerformanceView },
      { path: 'employee-activity', name: 'employee-activity', component: EmployeeActivityView },
      { path: 'employee/:id', name: 'employee-history', component: EmployeeHistoryView, props: true },
      { path: 'tasks', name: 'tasks', component: TasksView },
      { path: 'employee/:id/report', name: 'daily-report', component: DailyReportView, props: true },
      { path: 'live-feed', name: 'live-feed', component: LiveFeedView },
      { path: 'z-report', name: 'z-report', component: ZReportView },
      { path: 'z-report/:id', name: 'z-report-detail', component: ZReportView, props: true },
      { path: 'settings', name: 'settings', component: SettingsView },
      { path: 'role-access', name: 'role-access', component: RoleAccessView },
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
