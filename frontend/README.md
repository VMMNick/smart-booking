# frontend

Vue 3 + Vite фронтенд для системи бронювання.

## Запуск

```bash
npm install
cp .env.example .env   # VITE_API_URL, за замовчуванням проксі /api -> localhost:3000
npm run dev
```

## Що є

- **Auth** (`src/views/LoginView.vue`, `RegisterView.vue`, `src/stores/auth.js`) — JWT в localStorage, підставляється в кожен запит через axios-інтерцептор.
- **Календар бронювань** (`src/views/BookingCalendarView.vue`) — FullCalendar (`timeGridWeek`), перетягування по вільному часу створює бронювання (`POST /bookings`), потім одразу редірект на Stripe Checkout (`POST /payments/checkout-session`). Клік по існуючому бронюванню — скасування.
- **Адмін-панель** (`src/views/AdminView.vue`) — графік завантаженості кімнати за 14 днів (Chart.js, дані з `GET /bookings/stats/occupancy`) і CRUD правил ціноутворення (`/pricing-rules`). Доступна лише користувачам з `role: ADMIN` (перевірка в `src/router/index.js`).

## Docker

Див. `../docker-compose.yml` — збирається через `Dockerfile` (Vite build → статика в nginx), `nginx.conf` проксіює `/api/*` на контейнер `api`.
