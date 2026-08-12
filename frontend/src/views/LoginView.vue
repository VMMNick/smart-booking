<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const email = ref('');
const password = ref('');
const error = ref('');

async function submit() {
  error.value = '';
  try {
    await auth.login(email.value, password.value);
    router.push('/');
  } catch (e) {
    error.value = e.response?.data?.message ?? 'Помилка входу';
  }
}
</script>

<template>
  <form class="form" @submit.prevent="submit">
    <h1>Вхід</h1>
    <label>Email<input v-model="email" type="email" required /></label>
    <label>Пароль<input v-model="password" type="password" required minlength="8" /></label>
    <p v-if="error" class="error">{{ error }}</p>
    <button type="submit">Увійти</button>
    <RouterLink to="/register">Немає акаунту? Зареєструватись</RouterLink>
  </form>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 320px;
}
.error {
  color: #c0392b;
}
</style>
