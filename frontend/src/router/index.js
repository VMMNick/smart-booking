import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import BookingCalendarView from '../views/BookingCalendarView.vue';
import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';
import AdminView from '../views/AdminView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'calendar', component: BookingCalendarView, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/register', name: 'register', component: RegisterView },
    { path: '/admin', name: 'admin', component: AdminView, meta: { requiresAuth: true, requiresAdmin: true } },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.user) {
    return { name: 'login' };
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'calendar' };
  }
  return true;
});

export default router;
