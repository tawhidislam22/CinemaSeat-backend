# CinemaSeat (Microservices Architecture)

A highly scalable cinema ticketing platform built for the advanced software engineering hackathon.

## Architecture

This project implements a microservices architecture consisting of:
- **API Gateway (Nginx)**: Routes traffic to appropriate downstream services.
- **Auth Service**: Manages user identities.
- **Catalog Service**: Serves movies, theatres, screens, and shows.
- **Seats Service**: Owns the highly-contended `seat_status` table. Resolves contention using a single-row atomic `UPDATE` with Postgres row-level locks.
- **Bookings Service**: Acts as the saga orchestrator for the booking process.
- **OTP Service**: Integrates with the mock gateway for SMS verification.
- **Payments Service**: Integrates with the mock gateway for charging and handles webhook callbacks idempotently.

## Setup

1. Make sure you have Docker and Docker Compose installed.
2. Clone this repository and `cd` into it.
3. Start the entire cluster:
   ```bash
   docker compose up --build -d
   ```
4. The API Gateway will be available at `http://localhost:8080`.
5. The Frontend will be available at `http://localhost:3001`.

## Documentation
- [DECISIONS.md](DECISIONS.md) - Design decisions and architectural trade-offs.
- [docs/architecture.md](docs/architecture.md) - Architecture diagrams and rubric mappings.
- [docs/pipeline-diagram.md](docs/pipeline-diagram.md) - CI/CD pipeline overview.

## Load Testing
The `load-tests/` directory contains `k6` scripts to verify the system's resilience under heavy concurrency.
To run the oversell scenario (100 concurrent requests trying to book the exact same seat):
```bash
k6 run load-tests/scenario-a-oversell.js
```
