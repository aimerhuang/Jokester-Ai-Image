import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { clearStoredToken, getStoredToken, setStoredToken } from '@/services/http'
import * as authService from '@/services/auth'
import type { LoginRequest, RegisterRequest, UserProfile } from '@/types/auth'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getStoredToken())
  const user = ref<UserProfile | null>(null)
  const loading = ref(false)

  const isAuthenticated = computed(() => Boolean(token.value))
  const credits = computed(() => user.value?.credits ?? 0)

  async function login(payload: LoginRequest) {
    loading.value = true
    try {
      const result = await authService.login(payload)
      token.value = result.accessToken
      setStoredToken(result.accessToken, result.refreshToken)
      await fetchCurrentUser()
    } finally {
      loading.value = false
    }
  }

  async function register(payload: RegisterRequest) {
    const result = await authService.register(payload)
    if (result?.accessToken) {
      token.value = result.accessToken
      user.value = result.user ?? null
      setStoredToken(result.accessToken, result.refreshToken)
    }
  }

  async function fetchCurrentUser() {
    if (!token.value) return
    user.value = await authService.getCurrentUser()
  }

  async function logout() {
    try {
      if (token.value) await authService.logout()
    } finally {
      token.value = null
      user.value = null
      clearStoredToken()
    }
  }

  function clearSession() {
    token.value = null
    user.value = null
    clearStoredToken()
  }

  return { token, user, loading, isAuthenticated, credits, login, register, fetchCurrentUser, logout, clearSession }
})
