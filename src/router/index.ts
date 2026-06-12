import { createRouter, createWebHistory } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import AppLayout from '@/layouts/AppLayout.vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/playground' },
    {
      path: '/',
      component: AuthLayout,
      children: [
        { path: 'login', name: 'login', component: () => import('@/views/LoginView.vue') },
        { path: 'register', name: 'register', component: () => import('@/views/RegisterView.vue') },
      ],
    },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        { path: 'playground', name: 'playground', component: () => import('@/views/PlaygroundView.vue'), meta: { titleKey: 'playground.title', subtitleKey: 'playground.subtitle' } },
        { path: 'images', name: 'images', component: () => import('@/views/ImagesView.vue'), meta: { titleKey: 'gallery.title', subtitleKey: 'gallery.subtitle' } },
        { path: 'images/:id/edit', name: 'image-edit', component: () => import('@/views/ImageEditView.vue'), meta: { titleKey: 'imageDetail.title', subtitleKey: 'imageDetail.subtitle' } },
        { path: 'credits', name: 'credits', component: () => import('@/views/CreditsView.vue'), meta: { titleKey: 'credits.title', subtitleKey: 'credits.subtitle' } },
        { path: 'pricing', name: 'pricing', component: () => import('@/views/PricingView.vue'), meta: { titleKey: 'pricing.title', subtitleKey: 'pricing.subtitle' } },
        { path: 'profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { titleKey: 'profile.title', subtitleKey: 'profile.subtitle' } },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
  if ((to.name === 'login' || to.name === 'register') && auth.isAuthenticated) return { name: 'playground' }
  return true
})

window.addEventListener('auth:expired', () => {
  const auth = useAuthStore()
  auth.clearSession()
  if (router.currentRoute.value.name !== 'login') router.push({ name: 'login' })
})

export default router
