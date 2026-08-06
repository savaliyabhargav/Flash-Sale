# Database LLD — Flash-Sale Commerce Platform

> Low-level design for the PostgreSQL schema (tables, columns, keys, relationships, indexes).
> See `PROJECT_CONTEXT.md` for the product requirements this schema must support.
>
> Being designed incrementally, one entity/relationship at a time. Last updated: 2026-08-06.

---

## Global conventions

- **Primary keys: UUID** on every table (generated via `gen_random_uuid()` or app-side), not
  auto-increment integers — chosen to avoid guessable/enumerable IDs (e.g. `/api/orders/1047`) and
  because the project already needs client-generatable IDs for idempotency keys.
- Every table gets standard audit columns: `created_at`, `updated_at` (TIMESTAMP).
- Short-lived tokens (email verification, password reset, etc.) are **not** modeled as Postgres columns —
  they belong in Redis with a TTL, since Postgres holds durable truth and Redis holds ephemeral state.
- Data isolation for the marketplace model uses `seller_id` scoping (see `PROJECT_CONTEXT.md` §3) —
  not a `tenant_id`.

---

## Entities

### `buyers`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `full_name` | VARCHAR | |
| `email` | VARCHAR, **UNIQUE** | Login identifier |
| `password_hash` | VARCHAR | One-way hash (bcrypt/argon2) — never the raw password |
| `phone_number` | VARCHAR, nullable | |
| `email_verified` | BOOLEAN, default `false` | |
| `is_active` | BOOLEAN, default `true` | Soft-disable instead of deleting |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

Addresses and saved payment methods are deliberately **not** columns here — a buyer can have multiple of
each (one-to-many), so they'll be their own tables (`addresses`, etc.) with a `buyer_id` foreign key,
designed separately.

### `sellers`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `business_name` | VARCHAR | Shown to buyers on product pages ("Sold by X") |
| `owner_full_name` | VARCHAR, nullable | The actual person behind the seller account |
| `email` | VARCHAR, **UNIQUE** | Login identifier |
| `password_hash` | VARCHAR | Same hashing rule as `buyers` |
| `phone_number` | VARCHAR, nullable | |
| `email_verified` | BOOLEAN, default `false` | |
| `is_active` | BOOLEAN, default `true` | Soft-disable instead of deleting |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

Payout/bank details are **out of scope for now** — no column, no stub, no separate table. Add only if a
real payment/payout flow is built later.

