import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { clearStoredToken, getStoredToken, setStoredToken, subscribeToTokenRefresh } from '@/services/http'
import * as authService from '@/services/auth'
import type { LoginRequest, RegisterRequest, SiteAccess, UserProfile } from '@/types/auth'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getStoredToken())
  const user = ref<UserProfile | null>(null)
  const sites = ref<SiteAccess[]>([])
  const permissions = ref<string[]>([])
  const accessTokenExpiresAt = ref('')
  const loading = ref(false)
  const profileInitialized = ref(false)

  let profilePromise: Promise<UserProfile | null> | null = null
  let sessionGeneration = 0

  const isAuthenticated = computed(() => Boolean(token.value))
  const credits = computed(() => user.value?.pointBalance ?? 0)

  async function login(payload: LoginRequest) {
    loading.value = true
    try {
      const result = await authService.login(payload)
      sessionGeneration += 1
      profilePromise = null
      token.value = result.accessToken
      user.value = result.user
      sites.value = result.sites
      permissions.value = result.permissions
      accessTokenExpiresAt.value = result.accessTokenExpiresAt
      setStoredToken(result.accessToken, result.refreshToken)
      profileInitialized.value = false
      try {
        await ensureCurrentUser()
      } catch (error) {
        clearSession()
        throw error
      }
    } finally {
      loading.value = false
    }
  }

  async function register(payload: RegisterRequest) {
    return authService.register(payload)
  }

  async function ensureCurrentUser(force = false): Promise<UserProfile | null> {
    if (!token.value) {
      profileInitialized.value = true
      user.value = null
      return null
    }
    if (!force && profileInitialized.value) return user.value
    if (profilePromise) return profilePromise

    const generation = sessionGeneration
    const requestToken = token.value
    const request = authService.getCurrentUser()
      .then((profile) => {
        if (generation !== sessionGeneration || requestToken !== token.value) return user.value
        user.value = profile
        profileInitialized.value = true
        return profile
      })
      .finally(() => {
        if (profilePromise === request) profilePromise = null
      })
    profilePromise = request

    return request
  }

  function fetchCurrentUser() {
    return ensureCurrentUser(true)
  }

  async function logout() {
    try {
      if (token.value) await authService.logout()
    } finally {
      clearSession()
    }
  }

  function clearSession() {
    sessionGeneration += 1
    token.value = null
    user.value = null
    sites.value = []
    permissions.value = []
    accessTokenExpiresAt.value = ''
    profileInitialized.value = false
    profilePromise = null
    clearStoredToken()
  }

  subscribeToTokenRefresh((result) => {
    sessionGeneration += 1
    profilePromise = null
    token.value = result.accessToken
    user.value = result.user
    sites.value = result.sites
    permissions.value = result.permissions
    accessTokenExpiresAt.value = result.accessTokenExpiresAt
    profileInitialized.value = true
  })

  return {
    token,
    user,
    sites,
    permissions,
    accessTokenExpiresAt,
    loading,
    profileInitialized,
    isAuthenticated,
    credits,
    login,
    register,
    ensureCurrentUser,
    fetchCurrentUser,
    logout,
    clearSession,
  }
})
