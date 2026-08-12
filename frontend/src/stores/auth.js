import { defineStore } from 'pinia';
import client from '../api/client';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem('user') ?? 'null'),
  }),
  getters: {
    isAdmin: (state) => state.user?.role === 'ADMIN',
  },
  actions: {
    async login(email, password) {
      const { data } = await client.post('/auth/login', { email, password });
      this._persist(data);
    },
    async register(email, password, name) {
      const { data } = await client.post('/auth/register', { email, password, name });
      this._persist(data);
    },
    logout() {
      this.user = null;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
    },
    _persist(data) {
      this.user = data.user;
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));
    },
  },
});
