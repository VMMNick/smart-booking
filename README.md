# smart-booking

Бронювання кімнат з динамічним ціноутворенням. Vue 3 + NestJS + PostgreSQL/Prisma.

```
smart-booking/
├── backend/          NestJS API (auth, rooms, pricing, bookings, stripe, email)
├── frontend/          Vue 3 + FullCalendar SPA
└── docker-compose.yml підіймає db + backend + frontend разом
```

## Швидкий старт

### Docker (весь стек одразу)

```bash
docker compose up --build
```

- web: http://localhost:8080
- api: http://localhost:3000
- postgres: localhost:5432

### Локально (без Docker)

```bash
cd backend
npm install
cp .env.example .env   # підстав DATABASE_URL під свій Postgres
npx prisma generate
npx prisma migrate dev --name init
npm run start:dev
```

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Детальніше по кожній частині — `backend/README.md` і `frontend/README.md`.
