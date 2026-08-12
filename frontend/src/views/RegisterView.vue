<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const name = ref('');
const email = ref('');
const password = ref('');
const error = ref('');

async function submit() {
  error.value = '';
  try {
    await auth.register(email.value, password.value, name.value);
    router.push('/');
  } catch (e) {
    error.value = e.response?.data?.message ?? 'Помилка реєстрації';
  }
}
</script>

<template>
  <form class="form" @submit.prevent="submit">
    <h1>Реєстрація</h1>
    <label>Ім'я<input v-model="name" required /></label>
    <label>Email<input v-model="email" type="email" required /></label>
    <label>Пароль<input v-model="password" type="password" required minlength="8" /></label>
    <p v-if="error" class="error">{{ error }}</p>
    <button type="submit">Зареєструватись</button>
    <RouterLink to="/login">Вже є акаунт? Увійти</RouterLink>
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
