import { createRouter, createWebHistory } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import AppLayout from '@/layouts/AppLayout.vue'
import { useAuthStore } from '@/stores/auth'
import { useCreditsStore } from '@/stores/credits'

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
      path: '/canvas/:canvasId',
      name: 'canvas-editor',
      component: () => import('@/views/CanvasEditorView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/recharge',
      name: 'recharge',
      component: () => import('@/views/RechargeView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        { path: 'canvas', name: 'canvas', component: () => import('@/views/CanvasListView.vue'), meta: { titleKey: 'canvas.title' } },
        { path: 'playground', name: 'playground', component: () => import('@/views/PlaygroundView.vue'), meta: { titleKey: 'playground.title', subtitleKey: 'playground.subtitle' } },
        { path: 'images', name: 'images', component: () => import('@/views/ImagesView.vue'), meta: { titleKey: 'gallery.title', subtitleKey: 'gallery.subtitle' } },
        { path: 'prompts', redirect: '/playground' },
        { path: 'images/:id/edit', name: 'image-edit', component: () => import('@/views/ImageEditView.vue'), meta: { titleKey: 'imageDetail.title', subtitleKey: 'imageDetail.subtitle' } },
        { path: 'credits', name: 'credits', component: () => import('@/views/CreditsView.vue'), meta: { titleKey: 'credits.title', subtitleKey: 'credits.subtitle' } },
        { path: 'pricing', name: 'pricing', component: () => import('@/views/PricingView.vue'), meta: { titleKey: 'pricing.title', subtitleKey: 'pricing.subtitle' } },
        { path: 'admin/redeem-codes', name: 'redeem-code-generator', component: () => import('@/views/RedeemCodeGeneratorView.vue'), meta: { titleKey: 'codeGenerator.title', subtitleKey: 'codeGenerator.subtitle', requiresSuperAdmin: true } },
        { path: 'profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { titleKey: 'profile.title', subtitleKey: 'profile.subtitle' } },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const credits = useCreditsStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    credits.activateForUser(null)
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAuth) {
    const requestToken = auth.token
    try {
      await auth.ensureCurrentUser()
      if (!auth.isAuthenticated || !auth.user) {
        credits.activateForUser(null)
        return { name: 'login', query: { redirect: to.fullPath } }
      }
      credits.activateForUser(auth.user.id, auth.user.pointBalance)
    } catch {
      if (auth.token === requestToken) auth.clearSession()
      credits.activateForUser(auth.user?.id ?? null)
      if (!auth.isAuthenticated || !auth.user) {
        return { name: 'login', query: { redirect: to.fullPath } }
      }
    }
  }
  if (!auth.isAuthenticated) credits.activateForUser(null)
  if (to.meta.requiresSuperAdmin && !auth.user?.isSuperAdmin) return { name: 'playground' }
  if ((to.name === 'login' || to.name === 'register') && auth.isAuthenticated) return { name: 'playground' }
  return true
})

window.addEventListener('auth:expired', (event) => {
  const auth = useAuthStore()
  const credits = useCreditsStore()
  const expiredToken = (event as CustomEvent<{ accessToken?: string | null }>).detail?.accessToken
  if (expiredToken && auth.token !== expiredToken) return
  auth.clearSession()
  credits.activateForUser(null)
  if (router.currentRoute.value.name !== 'login') void router.replace({ name: 'login' })
})

export default router
