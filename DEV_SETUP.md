# Development Environment

Everything runs in Docker. You do not need Java, Node, or Postgres installed on your machine —
only Docker Desktop.

---

## Start it

```bash
docker compose up -d
```

First run takes a few minutes (downloading Maven and npm dependencies). Later runs take seconds.

Then open:

| What | URL | Login |
|---|---|---|
| Storefront (frontend) | http://localhost:3000 | — |
| Backend API | http://localhost:8080/api/ping | — |
| Backend health | http://localhost:8080/actuator/health | — |
| pgAdmin (database GUI) | http://localhost:5050 | no login required |

The storefront page is a wiring check. All three rows should be green:

```
Frontend   running
Backend    up
Database   connected: PostgreSQL 17.10
```

If any row is red, the corresponding container is not running — see Troubleshooting below.

---

## What the four containers are

| Container | What it is | Why it exists |
|---|---|---|
| `flashsale-postgres` | PostgreSQL 17 | The source of truth for all data. Every order, product, and user lives here permanently. |
| `flashsale-pgadmin` | pgAdmin 4 | A web GUI to browse tables and run SQL, so you can see what the app actually wrote. |
| `flashsale-backend` | Spring Boot 4.0.7 on Java 21 | The API. Talks to Postgres, serves JSON to the frontend. |
| `flashsale-frontend` | Next.js 16 / React 19 | The website the user sees. Calls the backend over HTTP. |

They share a private Docker network called `flashsale`. Inside that network, containers reach each
other by **service name** — the backend connects to `postgres:5432`, not `localhost:5432`. This is
the single most common source of confusion: inside a container, `localhost` means *that container*,
not your PC.

Your browser is the exception. It runs on your PC, not in the network, so it uses
`localhost:8080` to reach the backend. That is why `NEXT_PUBLIC_API_BASE_URL` points at localhost.

---

## Using pgAdmin

Open http://localhost:5050. The server **Flash-Sale (local)** is already registered — no setup needed.

1. Expand `Flash-Sale (local)`. It will ask for a password: `flashsale` (tick "Save password").
2. Navigate to `Databases → flashsale → Schemas → public → Tables`.
3. It is empty right now. That is correct — we have not designed the database schema yet.

To run SQL: right-click the `flashsale` database → **Query Tool**.

---

## Everyday commands

```bash
docker compose up -d           # start everything in the background
docker compose down            # stop everything (data is kept)
docker compose ps              # what is running right now
docker compose logs -f backend # watch backend logs live (Ctrl+C to stop watching)
docker compose restart backend # restart just the backend
```

### After you change code

| You changed | Do this |
|---|---|
| Frontend files (`frontend/src/**`) | Nothing — the page reloads by itself. |
| Backend Java files | `docker compose restart backend` |
| `backend/pom.xml` (added a dependency) | `docker compose up -d --build backend` |
| `frontend/package.json` | `docker compose up -d --build frontend` |
| `.env` | `docker compose up -d --force-recreate` |

Backend changes need a restart because the container runs compiled Java, and nothing recompiles it
automatically when you edit a file on your host. A restart takes about 20 seconds.

### Wiping the database

```bash
docker compose down -v     # -v also deletes the volumes = ALL database data
docker compose up -d
```

Use this when the schema changes and you want a clean slate.

---

## Project layout

```
Flash-Sale/
├─ docker-compose.yml      # defines all four containers
├─ .env                    # ports and local dev passwords
├─ backend/                # Spring Boot API
│  ├─ pom.xml              # Java dependencies
│  ├─ Dockerfile.dev
│  └─ src/main/
│     ├─ java/com/flashsale/backend/
│     │  ├─ BackendApplication.java   # entry point
│     │  ├─ config/WebCorsConfig.java # lets the frontend call the backend
│     │  └─ web/PingController.java   # temporary wiring-check endpoint
│     └─ resources/application.yml    # app configuration
├─ frontend/               # Next.js site
│  ├─ package.json
│  ├─ Dockerfile.dev
│  └─ src/app/
│     ├─ layout.tsx
│     └─ page.tsx          # the wiring-check page
└─ infra/pgadmin/servers.json   # pre-registers the DB connection in pgAdmin
```

---

## Troubleshooting

**"port is already allocated"**
Something else on your PC is using that port. Change the number in `.env`
(e.g. `BACKEND_PORT=8081`) and run `docker compose up -d --force-recreate`.

**Backend row is red on the storefront page**
The backend takes ~20–30 seconds to boot. Wait, then refresh. Still red?
`docker compose logs backend --tail 50`

**Database row says "unreachable"**
`docker compose ps` — check `flashsale-postgres` says `healthy`. If not:
`docker compose logs postgres`

**Everything is broken and you want to start over**
```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

---

## A note on `.env`

This file is committed to git on purpose, so the project runs immediately after cloning. The
passwords in it are throwaway values that never leave your machine.

Real secrets — payment API keys, production database passwords — must **never** go in this file.
Those belong in `.env.local`, which is gitignored.

---

## Not set up yet

Deliberately absent for now, added in later phases:

- **Redis** — arrives in Phase 1, once the no-cache baseline exists to measure against.
- **Database migrations (Flyway)** — arrives with the domain model. `ddl-auto` is set to `none`
  so Hibernate never invents tables behind your back.
- **Production Dockerfiles** — the current ones are dev-only (they run Maven and the Next dev
  server, which is slow and insecure for real deployment).
