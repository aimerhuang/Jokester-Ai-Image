import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { getMessage } from '@/locales'
import type { Locale, Theme } from '@/types/app'

const defaultLocale = (import.meta.env.VITE_DEFAULT_LOCALE || 'zh-CN') as Locale
const defaultTheme = (import.meta.env.VITE_DEFAULT_THEME || 'light') as Theme

export const useAppStore = defineStore('app', () => {
  const locale = ref<Locale>((localStorage.getItem('locale') as Locale) || defaultLocale)
  const theme = ref<Theme>((localStorage.getItem('theme') as Theme) || defaultTheme)

  const isDark = computed(() => theme.value === 'dark')

  function setLocale(nextLocale: Locale) {
    locale.value = nextLocale
  }

  function toggleLocale() {
    locale.value = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
  }

  function setTheme(nextTheme: Theme) {
    theme.value = nextTheme
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  function t(path: string) {
    return getMessage(locale.value, path)
  }

  watch(
    theme,
    (value) => {
      localStorage.setItem('theme', value)
      document.documentElement.classList.toggle('dark', value === 'dark')
    },
    { immediate: true },
  )

  watch(locale, (value) => {
    localStorage.setItem('locale', value)
    document.documentElement.lang = value
  }, { immediate: true })

  return { locale, theme, isDark, setLocale, toggleLocale, setTheme, toggleTheme, t }
})
