# Flash-Sale Commerce Platform — Project Context

> **Purpose of this file:** This is the single source of truth for the project's intent, decisions, and
> roadmap. If you are an AI assistant starting a fresh conversation, read this file top to bottom before
> proposing anything. It is written to be self-contained — no prior conversation is needed.
>
> **Status:** Design phase. **No code has been written yet.**
> **Last updated:** 2026-08-06

---

## 1. The Goal (read this first)

This is a **portfolio + freelance-reusable** full-stack project. It has three goals, in priority order:

1. **Master Redis.** This is the primary goal. Not "use Redis" — *master* it. Every major Redis data
   structure, caching pattern, failure mode, and operational concern should appear in this project with a
   legitimate reason to exist.
2. **Produce an SDE-3 level resume asset.** The resume story is **comparative and measured**:
   > *"Cut product-detail p99 latency 380ms → 14ms (−96%) and DB QPS 4,200 → 310 (−92%) via a two-tier
   > Caffeine + Redis cache with stampede protection."*
3. **Be reusable for freelance client work.** A working multi-tenant storefront + admin panel + booking
   engine is directly sellable to small businesses.

### The critical constraint that flows from goal #2

**Every significant feature is built twice** — once with no caching, once with caching — toggled by a Spring
profile or feature flag. The no-cache path is not dead code; it is the **control group** that generates the
benchmark numbers. **Never delete it.** Deleting the baseline destroys the entire resume story.

---

## 2. What "Flash-Sale Commerce" Means

A flash sale is when a **small quantity** of something goes on sale at an **exact announced time**, and a
**huge crowd** arrives simultaneously.

Real-world equivalents: Nike SNKRS sneaker drops, Amazon/Flipkart Lightning Deals, IRCTC Tatkal booking,
BookMyShow opening tickets for a blockbuster, Xiaomi's classic 5-second phone sellouts.

The defining property: **demand massively exceeds supply, compressed into a few seconds.**

### The project is two halves

**Half 1 — A normal online store.**
Browse, search, filter, product detail, cart, checkout, payment, order history, order tracking, admin panel
for products/stock/orders.

*Why it exists:* it is what makes the project sellable to freelance clients, and it is the read-heavy
caching playground where the latency benchmarks come from.

**Half 2 — The drop engine.**
An admin creates a **Drop**: *"iPhone 17 Pro — 500 units — live at 12:00:00 PM — max 1 per customer."*
At 12:00:00, tens of thousands of users hit "Buy" within the same second.

*Why it exists:* it forces every hard Redis concept to have an honest justification.

### The problems that single second creates

| Problem | What breaks without Redis | Redis answer |
|---|---|---|
| 50,000 requests hit the DB in 1 second | Connection pool exhausts, everything times out | Stock counter lives in Redis; DB never sees the stampede |
| Two users buy the 500th unit simultaneously | **Oversell** — 502 units sold of 500. Real money problem. | Lua script does check-and-decrement atomically |
| One user scripts 200 requests | Bots take all stock | Sorted-set sliding-window rate limiter |
| User double-clicks "Buy" | Charged twice | `SET NX` idempotency key |
| 50,000 users all want "how many left?" | 50,000 DB reads/sec for one integer | Pub/Sub pushes the count to every browser |
| User reserves stock, never pays | Stock locked forever | Key TTL + keyspace notification auto-releases |

**This is the point of the domain choice.** In an interview you never say *"I used a bitmap because I wanted
to learn bitmaps."* You say *"I used a bitmap to enforce one-purchase-per-user across 2 million users in
250KB of memory."*

### The drop timeline, concretely

```
11:59:00  Users land on the drop page. Waiting room opens.
          Redis SORTED SET assigns queue position by join time.
          Frontend shows "You are #12,847 in line."

11:59:30  Cache warming — product data pre-loaded into Redis so the
          first real request doesn't hit a cold cache.

12:00:00  BUY opens. 50,000 requests arrive.
          Each runs ONE Lua script that atomically:
            1. checks the rate limiter
            2. checks "has this user already bought?" (bitmap)
            3. decrements stock if > 0
            4. records the buyer
          Winners get a 10-minute hold. Losers get "Sold out" in ~3ms.

12:00:01  Pub/Sub broadcasts "0 remaining" to every connected browser.
          Redis Stream carries the 500 winning orders to a consumer group
          that writes them to Postgres calmly, at its own pace.

12:10:00  Keyspace notification fires for anyone who didn't pay.
          Their hold expires; stock returns to the pool.
```

Postgres is barely involved during the spike. **That is the architecture story.**

---

## 3. Roles & Marketplace Model

**This is a shared marketplace, not a multi-tenant SaaS.** One catalog, many sellers, all buyers see all
sellers' products together (like Amazon/Flipkart) — not isolated per-client storefronts. This was a
deliberate simplification for a first build: `2026-08-06`.

### Buyer

- Sign up / log in, own profile, addresses, saved payment methods
- Browse all sellers' products in one shared catalog: homepage, category browse, search + filter
- Product detail page shows which seller is selling it
- Cart can hold items from multiple sellers; checkout splits into one sub-order per seller
- Order history / tracking per sub-order, cancel/return per sub-order, review product + seller
- Flash-sale: view drops, join waiting room, buy at drop time, live stock counter

### Seller

- Separate signup/login from buyers
- **No admin approval required to start selling** — a seller can register and immediately list
  products. (Deliberately simplified; revisit only if abuse/moderation becomes a real concern.)
- Add/edit/delete their own products and variants/stock only — never another seller's
- Bulk CSV product upload
- View and manage only their own sub-orders (update status, refund)
- Create flash-sale Drops on their own products
- Seller dashboard: their sales, their orders, low-stock alerts, their buyers' basic info

### Platform Admin

- **No database entity for now.** Admin login is a small set of hardcoded credentials checked in code
  (not stored in Postgres, not a `User`/`Admin` table). If the hardcoded credentials match, the backend
  returns the requested data via the normal APIs.
- This is intentionally a throwaway auth mechanism to unblock building admin-facing views early. Replace
  with a real `PLATFORM_ADMIN` role + DB-backed account **only when there's an actual reason to** (e.g.
  once moderation/approval features are added) — don't upgrade it preemptively.
- Scope for now: read access across sellers/products/orders for oversight; moderation/suspend actions can
  wait.

### Auth summary

- Two real login flows: **Buyer** and **Seller** (separate roles, separate dashboards)
- Admin is the hardcoded-credential exception above, not a third real auth flow yet
- JWT + refresh token in Redis with a revocation list, per §8 (Freelance Reusability Requirements)
- Every product/order is scoped by `seller_id` — this is the key-design/data-isolation pattern that
  replaces the earlier "tenant_id per client store" idea

---

## 4. Locked Decisions

These were decided deliberately. Do not re-litigate them without a strong new reason.

| Decision | Choice | Rationale |
|---|---|---|
| **Domain** | Flash-Sale Commerce Platform | Broadest legitimate Redis surface + most freelance-reusable |
| **Backend** | Spring Boot | User's target stack |
| **Database** | PostgreSQL — the source of truth | Redis is a cache/coordination layer, never the system of record |
| **Cache/coordination** | **Redis Stack** (core + RediSearch, RedisJSON, RedisBloom, RedisTimeSeries) | Maximum surface area to master |
| **Frontend** | Full React / Next.js — storefront **and** admin panel | Needed for honest "full stack" claim and freelance sale; also makes real-time features demoable |
| **Cloud** | AWS | User's target |
| **Message broker** | **None. Kafka/RabbitMQ/SQS explicitly excluded.** | Redis Streams is the substitute *on purpose* — the goal is Redis depth |
| **Target level** | SDE-3 | Drives the emphasis on failure modes, operations, and measurement |

### Rejected alternatives (recorded so they aren't re-proposed)

- **Hyperlocal delivery marketplace** — good GEO/tracking story, more moving parts, less reusable.
- **Event/ticket booking** — seat-level locking is excellent but the domain is narrow and less sellable.

---

## 5. Infrastructure Consequence: Redis Stack vs AWS

**AWS ElastiCache does NOT support Redis Stack modules** (RediSearch, RedisJSON, RedisBloom, TimeSeries).
This is a hard constraint that shapes the deployment plan.

| Option | Verdict |
|---|---|
| **Self-host Redis Stack on EC2** | **Chosen.** Cheap, and forces hands-on replication / Sentinel / persistence configuration — exactly the intended learning. Stronger resume line than clicking ElastiCache. |
| Redis Cloud (free/fixed tier) | Acceptable fallback. All modules, generous free tier, zero ops learning. |
| AWS MemoryDB | Rejected — expensive, partial module support. |

**Second consequence:** RediSearch takes over a chunk of work that would normally be Postgres's — product
search, faceted filtering (brand / price / size), autocomplete. This creates an additional benchmark:
*Postgres `ILIKE`/FTS p99 vs RediSearch p99* on a million rows (typically a 20–50× gap).

---

## 6. The Redis Surface Map

What must appear in the project, and where it lives.

### Tier 1 — Caching patterns (the resume headline)

| Pattern | Where it lives |
|---|---|
| Cache-aside + TTL | Product detail, category listing |
| Multi-level cache (Caffeine L1 → Redis L2 → Postgres) | Hot product pages; demonstrates awareness of network-hop cost |
| Write-through / write-behind | Inventory counters, view counts batched to Postgres |
| **Cache stampede** protection | Mutex lock + probabilistic early expiration on hot keys |
| **Cache penetration** guard | RedisBloom filter for non-existent SKU lookups |
| **Cache avalanche** guard | TTL jitter so 10k keys don't expire in the same second |
| **Hot-key** problem | Local replica of top-N keys + key sharding |
| Invalidation strategy | Delayed double-delete on product update; consistency trade-off documented |

### Tier 2 — Data structures with a real job

| Structure | Use case |
|---|---|
| String / Hash | Object cache; session store (Spring Session) |
| List | Recently viewed products, per-user browse history |
| Set | Product tags; unique-user-per-drop enforcement |
| **Sorted Set** | Waiting-room queue by join timestamp; trending products with score decay; sliding-window rate limiter |
| **Bitmap** | Daily active users; "did user X claim drop Y" — 1 bit per user |
| **HyperLogLog** | Unique product views at ~12KB per million uniques |
| **GEO** | Nearby store pickup / delivery radius |
| **Streams + consumer groups** | Order event pipeline with ACK, retry, DLQ — the Kafka substitute |
| **Pub/Sub** | Live stock ticker to the browser over SSE/WebSocket |
| **Keyspace notifications** | Cart-abandonment emails; unpaid-order auto-cancel after 15 min |
| RedisJSON + RediSearch | Product documents, full-text search, faceted filtering, autocomplete |
| RedisTimeSeries | Application/business metrics |

### Tier 3 — The SDE-3 signals

- **Lua scripting** — atomic "check limit + decrement stock + record buyer" in one round trip. Must be able
  to explain *why* Lua beats `WATCH`/`MULTI` here.
- **Distributed locks (Redisson)** — and a written position on **why Redlock is controversial**
  (Kleppmann vs antirez). Interviewers reward this.
- **Idempotency keys** — `SET NX` so double-submits don't double-charge.
- **Pipelining & batching** — measure round trips saved.
- **Persistence & topology** — RDB vs AOF; replication; Sentinel vs Cluster; hash slots; why `MGET` breaks
  across slots; hash tags `{user:123}`.
- **Eviction tuning** — `allkeys-lru` vs `volatile-ttl`; memory analysis via `MEMORY USAGE`,
  `redis-cli --bigkeys`.
- **Graceful degradation** — chaos test: kill Redis, the app must fall back to Postgres behind a
  Resilience4j circuit breaker instead of dying. *This single detail reads as senior.*

---

## 7. The Benchmark Plan (the actual resume asset)

Don't just build it — **prove it**. Planned from day one, not retrofitted.

1. **Dual implementations.** Every feature has a `no-cache` and a `cached` profile.
2. **Realistic data volume.** ~1M products, ~5M orders, ~20M order lines. **Small data hides all caching
   benefit** — under-seeding is the most common way this kind of project produces unimpressive numbers.
3. **Load testing** with k6 or Gatling; ramp to several thousand RPS.
4. **Observability**: Micrometer → Prometheus → Grafana. Track p50/p95/p99 latency, throughput, cache hit
   ratio, DB connection pool saturation, Redis memory.
5. **Deliverable**: a committed `BENCHMARKS.md` with graphs, linked from the README.

### Target resume bullets (to be replaced with real measured numbers)

- *"Cut product-detail p99 latency 380ms → 14ms (−96%) and DB QPS 4,200 → 310 (−92%) via a two-tier
  Caffeine + Redis cache."*
- *"Sustained 8,000 RPS on a 500-unit flash sale with zero oversell using Lua-atomic inventory decrement;
  the naive DB row-locking implementation oversold 37 units at 1,200 RPS."*
- *"Reduced unique-visitor tracking memory 1.2GB → 14MB using HyperLogLog with 0.81% error."*

The **oversell** comparison is the strongest of the three — it is a *correctness* win, not merely a speed
win.

---

## 8. Freelance Reusability Requirements

Design these in from the start rather than retrofitting:

- **Seller-scoped data from day one** — `seller_id` namespaced into every cache key. (Also a genuinely
  good Redis key-design lesson; see §3 for why this replaced the earlier per-client-tenant idea.)
- Auth: JWT + refresh tokens in Redis, with a revocation list (buyer + seller; platform admin is a
  hardcoded-credential exception for now, see §3)
- Seller dashboard: product / inventory / order management (per seller, not global)
- Payment integration (Razorpay or Stripe, test mode)
- White-labelable frontend theme

---

## 9. Roadmap

| Phase | Focus |
|---|---|
| **0** | Domain model, Postgres schema, seed-data generator, baseline API **with no cache**, first load test |
| **1** | Cache-aside, Spring Cache abstraction, custom `RedisCacheManager`, serialization choices |
| **2** | Sessions, rate limiting, idempotency, Bloom filter, stampede / avalanche fixes |
| **3** | Flash-sale engine: Lua, distributed locks, waiting room, oversell test |
| **4** | Streams pipeline, Pub/Sub live updates, keyspace-notification jobs |
| **5** | Cluster / Sentinel, chaos test, Redis-down fallback, memory tuning |
| **6** | AWS: EC2-hosted Redis Stack, RDS, ALB, CloudWatch, Terraform, CI/CD |
| **7** | Benchmark writeup, architecture docs, README that sells the project |

---

## 10. Honest Caveats (know these before an interview asks)

- **Redis Streams is not a Kafka replacement at real scale** — no log compaction, weaker durability
  guarantees, memory-bound retention. It is the right call *for this project's learning goal*, but the
  limits must be stated openly rather than discovered under questioning.
- **Redlock is contested.** Have a position, not just an implementation.
- **Redis is not the source of truth.** Postgres is. Any design that drifts from this is wrong.

---

## 11. Immediate Next Steps

Still design work — **no code yet**.

1. **Domain model** — products, variants, inventory, drops, carts, orders, tenants. This comes first because
   cache keys are derived from it, and bad key design is the most common reason Redis projects collapse
   around phase 4.
2. **Cache key naming convention + TTL policy table** — one document, written *before* any caching code.
   This artifact is a large part of what separates senior from mid-level work.
3. **Benchmark harness plan** — what is measured, at what load, against what seed volume.

## 12. Open Questions

- Project name (working title: "Flash-Sale Commerce Platform")
- Payment provider: Razorpay vs Stripe
- Auth: roll your own JWT vs Spring Authorization Server vs Keycloak (for buyer/seller; admin stays
  hardcoded per §3 until there's a reason to change it)
- Deployment shape: plain EC2 vs ECS vs EKS (EKS adds Kubernetes learning but also scope)
- Whether GEO / nearby-store-pickup makes the first cut or is deferred
- Exact mechanics of splitting one checkout into per-seller sub-orders (data model + payment split) —
  defer detailed design to the domain-model step
