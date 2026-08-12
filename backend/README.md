# backend

NestJS-бекенд для системи бронювання з динамічним ціноутворенням. Реалізовано всі 8 тижнів плану.

## Запуск (локально)

```bash
npm install
cp .env.example .env   # налаштуй DATABASE_URL, STRIPE_*, RESEND_*
npx prisma generate
npx prisma migrate dev --name init   # застосує schema.prisma + overlap_guard constraint
npm run start:dev
```

## Запуск (Docker)

З кореня репозиторію (де лежить `docker-compose.yml`, поруч з `backend/` і `frontend/`):

```bash
docker compose up --build
```

Підніме Postgres, api (`:3000`) і web (`:8080`, проксі `/api` → api).

## Тести

```bash
npm test           # unit-тести (pricing.service.spec.ts)
npm run test:e2e   # e2e, потребує запущений Postgres (DATABASE_URL)
```

`test/bookings-concurrency.e2e-spec.ts` — головний тест: 10 паралельних POST /bookings на один і той самий слот; очікується рівно 1 успіх (201) і 9 конфліктів (409).

## Що реалізовано по тижнях

1. **Users/Rooms/Bookings модулі, Prisma-схема, базова auth** — JWT, bcryptjs, `RolesGuard`.
2. **Vue + FullCalendar** — див. `../frontend`.
3. **Динамічне ціноутворення** (`src/pricing/pricing.service.ts`) — множники `time_of_day`/`day_of_week` з JSON-умов у `pricing_rules`, і demand-множник, лінійно інтерпольований від зайнятості кімнати за добу.
4. **Захист від конкурентного бронювання** (`src/bookings/bookings.service.ts`) — двошаровий:
   - `SELECT ... FOR UPDATE` на рядок `rooms` всередині `$transaction`, потім перевірка перетину інтервалів по свіжих даних, потім `INSERT`.
   - DB-level `EXCLUDE` constraint (`prisma/migrations/00000000000001_overlap_guard/migration.sql`, `btree_gist`) як запасний рівень.
5. **Stripe** (`src/payments/`) — `POST /payments/checkout-session` створює Checkout Session; `POST /payments/webhook` перевіряє підпис (`stripe-signature` + сирий body, змонтований окремо в `main.ts` саме для цього шляху) перед тим, як довіряти події.
6. **Адмін-панель** — `GET /bookings/stats/occupancy` (дані для Chart.js) + CRUD `pricing-rules` (тільки ADMIN). UI — див. `../frontend/src/views/AdminView.vue`.
7. **Email-підтвердження** (`src/email/email.service.ts`) — Resend; якщо `RESEND_API_KEY` не задано, пише в лог замість падіння (зручно для локальної розробки).
8. **Тести, Docker** — див. вище.

## Обмеження перевірки в сендбоксі, де писався код

`npm install` пройшов і `tsc --noEmit` чистий, окрім помилок, що пояснюються двома речами поза кодом:
- `npx prisma generate` не зміг завантажити engine-бінарники (мережеві обмеження сендбоксу) → типи `@prisma/client` (моделі, enum'и) недоступні там.
- Дзеркало npm-реєстру в тому сендбоксі віддавало неповні пакети (`@nestjs/passport` без частини `.d.ts`, `iterare` без частини файлів) — проблема кешу реєстру, не залежностей проєкту.

На звичайній машині (`npm install` + `npx prisma generate`) обидва обмеження зникають.
