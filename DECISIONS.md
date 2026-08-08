# Architectural Decisions (Microservices)

## 1. Gateway Routing
**Chosen:** Nginx as a reverse proxy API Gateway.
**Why:** It is lightweight, standard, and perfectly maps incoming HTTP prefixes (e.g., `/auth/`, `/seats/`) to the internal Docker network hostnames of each respective microservice container. 

## 2. Distributed Transactions (Sagas)
**Chosen:** The `bookings-service` acts as an orchestrator.
**Why:** In a microservices architecture, locking a seat in `seats-service` and processing a payment in `payments-service` are separate transactions. The `bookings-service` coordinates these API calls. If a payment fails (indicated by a webhook callback from the gateway), `payments-service` records the failure and notifies `bookings-service`, which in turn instructs `seats-service` to release the held seat.

## 3. Webhook Idempotency
**Chosen:** A dedicated `processed_events` table in the database mapping `event_id` to a `payment_id`.
**Why:** The mock gateway is documented to deliver duplicate callbacks 8% of the time. We rely on the database's unique constraint (`PRIMARY KEY`) on `event_id` to reject a second concurrent thread at the database level instantly, returning a 200 to the gateway without double-processing the payment.

## 4. Raw SQL vs ORM for Critical Path
**Chosen:** Raw `pg` SQL via `node-postgres` in the `seats-service`.
**Why:** The problem specifically mandates a single-row atomic `UPDATE` constraint on `seat_status` to resolve contention without distributed locks. By using raw `pg` queries with `BEGIN/COMMIT` blocks, we have absolute certainty that Postgres' row-level locks behave exactly as required under extreme load.
