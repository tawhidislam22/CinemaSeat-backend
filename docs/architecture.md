# CinemaSeat Architecture

```mermaid
graph TD
    Client[Client App] --> API_Gateway[Nginx API Gateway]
    API_Gateway --> Auth[Auth Service]
    API_Gateway --> Catalog[Catalog Service]
    API_Gateway --> Bookings[Bookings Service]
    API_Gateway --> Seats[Seats Service]
    API_Gateway --> Payments[Payments Service]
    API_Gateway --> OTP[OTP Service]

    Bookings --> Seats
    Bookings --> OTP
    Bookings --> Payments

    Payments --> Webhook[Mock Gateway API]
    OTP --> Webhook

    Auth --> DB[(PostgreSQL)]
    Catalog --> DB
    Seats --> DB
    Bookings --> DB
    Payments --> DB
    OTP --> DB

    Catalog -.-> Redis[(Redis Cache/PubSub)]
    Seats -.-> Redis
```

## Rubric Mapping
- **Milestone 1 (Foundations):** Clean architecture using Node.js for microservices and Nginx as the gateway. Fully containerized with `docker-compose.yml`.
- **Milestone 2 (Atomic Hold):** Implemented in `seats-service` using a single-row atomic `UPDATE` with row-level locking.
- **Milestone 3 (Sagas/Pipelines):** The orchestrator is in `bookings-service`. Webhooks hit `payments-service`, which verifies idempotency before notifying `bookings-service`. CI/CD pipelines added in `.github`.
- **Milestone 4 (Load Testing):** K6 load test script provided in `load-tests/` to guarantee no overselling on the hot path.
