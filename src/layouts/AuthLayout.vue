<template>
  <main class="auth-layout">
    <section class="auth-layout__panel">
      <header class="auth-layout__topbar">
        <AppLogo />
        <div class="auth-layout__actions">
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </header>
      <router-view />
    </section>
    <aside class="auth-layout__visual">
      <div class="visual-card page-card">
        <span>Prompt</span>
        <h2>{{ app.t('app.tagline') }}</h2>
        <p>Soft Olive AI Studio</p>
        <el-carousel class="visual-carousel" height="420px" indicator-position="outside" arrow="always">
          <el-carousel-item v-for="image in carouselImages" :key="image">
            <img class="visual-carousel__image" :src="image" alt="AI image studio preview" />
          </el-carousel-item>
        </el-carousel>
      </div>
    </aside>
  </main>
</template>

<script setup lang="ts">
import AppLogo from '@/components/common/AppLogo.vue'
import LocaleToggle from '@/components/common/LocaleToggle.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import { useAppStore } from '@/stores/app'
import slide1 from '@/assets/login-carousel/logo.jpg'
import slide2 from '@/assets/login-carousel/logo2.png'
import slide3 from '@/assets/login-carousel/logo3.png'
import slide4 from '@/assets/login-carousel/logo4.jpg'

const app = useAppStore()
const carouselImages = [slide1, slide2, slide3, slide4]
</script>

<style scoped>
.auth-layout { min-height: 100vh; display: grid; grid-template-columns: minmax(360px, 520px) 1fr; gap: 48px; padding: 48px; background: radial-gradient(circle at top right, rgba(111, 127, 63, 0.14), transparent 34%), var(--color-bg); }
.auth-layout__panel { display: flex; flex-direction: column; gap: 56px; }
.auth-layout__topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.auth-layout__actions { display: flex; align-items: center; gap: 10px; }
.auth-layout__visual { display: grid; place-items: center; }
.visual-card { width: min(560px, 100%); padding: 36px; }
.visual-card span { display: inline-flex; padding: 8px 14px; border-radius: 999px; background: var(--color-primary-soft); color: var(--color-primary-hover); font-weight: 700; }
.visual-card h2 { margin: 28px 0 10px; font-size: clamp(36px, 5vw, 64px); line-height: 1; }
.visual-card p { color: var(--color-text-muted); }
.visual-carousel { margin-top: 32px; border-radius: var(--radius-xl); overflow: hidden; }
.visual-carousel :deep(.el-carousel__container) { border-radius: var(--radius-xl); border: 1px solid var(--color-border); background: var(--color-primary-soft); }
.visual-carousel :deep(.el-carousel__indicators--outside) { margin-top: 14px; }
.visual-carousel__image { display: block; width: 100%; height: 100%; object-fit: cover; }
@media (max-width: 1200px) { .visual-carousel { height: 360px; } }
@media (max-width: 900px) { .auth-layout { grid-template-columns: 1fr; padding: 24px; } .auth-layout__visual { display: none; } }
</style>
