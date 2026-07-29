import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import MenuView from '../views/MenuView.vue'
import ReviewsView from '../views/ReviewsView.vue'
import GalleryView from '../views/GalleryView.vue'
import LandingView from '../views/LandingView.vue'
import SettingsView from '../views/SettingsView.vue'
import OrdersView from '../views/OrdersView.vue'
import ReservationsView from '../views/ReservationsView.vue'
import AppLayout from '../components/AppLayout.vue'

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/app', component: AppLayout, meta: { requiresAuth: true }, children: [
    { path: '', redirect: '/app/menu' },
    { path: 'menu', name: 'menu', component: MenuView },
    { path: 'reviews', name: 'reviews', component: ReviewsView },
    { path: 'gallery', name: 'gallery', component: GalleryView },
    { path: 'landing', name: 'landing', component: LandingView },
    { path: 'orders', name: 'orders', component: OrdersView },
    { path: 'reservations', name: 'reservations', component: ReservationsView },
    { path: 'settings', name: 'settings', component: SettingsView }
  ]}
]

const router = createRouter({ history: createWebHistory('/admin/'), routes })

router.beforeEach((to, from, next) => {
  const stored = sessionStorage.getItem('admin_auth')
  if (to.meta.requiresAuth && !stored) return next('/login')
  next()
})

export default router
