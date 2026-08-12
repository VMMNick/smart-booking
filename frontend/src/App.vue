<script setup>
import { useAuthStore } from './stores/auth';
import { RouterLink, RouterView } from 'vue-router';

const auth = useAuthStore();
</script>

<template>
  <div class="app-shell">
    <nav class="nav">
      <RouterLink to="/">Бронювання</RouterLink>
      <RouterLink v-if="auth.isAdmin" to="/admin">Адмін-панель</RouterLink>
      <span class="spacer" />
      <template v-if="auth.user">
        <span>{{ auth.user.email }}</span>
        <button @click="auth.logout">Вийти</button>
      </template>
      <RouterLink v-else to="/login">Увійти</RouterLink>
    </nav>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: system-ui, sans-serif;
}
.nav {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid #e2e2e2;
}
.nav .spacer {
  flex: 1;
}
main {
  padding: 1.5rem;
}
</style>
