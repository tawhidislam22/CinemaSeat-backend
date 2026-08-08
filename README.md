# CinemaSeat (Microservices Architecture)

A highly scalable cinema ticketing platform built for the advanced software engineering hackathon.

## Architecture

This project implements a microservices architecture consisting of:
- **API Gateway (Nginx)**: Routes traffic to appropriate downstream services.
- **Auth Service**: Manages user identities.
- **Catalog Service**: Serves movies, theatres, screens, and shows.
- **Seats Service**: Owns the highly-contended `seat_status` table. Resolves contention using a single-row atomic `UPDATE` with Postgres row-level locks.
- **Bookings Service**: Acts as the saga orchestrator for the booking process.
- **OTP Service**: Integrates with the supplied hackathon gateway for isolated login and payment OTP challenges.
- **Payments Service**: Integrates with the mock gateway for charging and handles webhook callbacks idempotently.

## Setup

1. Make sure you have Docker and Docker Compose installed.
2. Clone this repository and `cd` into it.
3. Start the entire cluster (the supplied OTP/payment gateway is included):
   ```bash
   docker compose up --build -d
   ```
4. The API Gateway will be available at `http://localhost:8080`.
5. The Frontend will be available at `http://localhost:3001`.

Set `MOCK_GATEWAY_MODE=deterministic` while developing for predictable OTP delivery. Leave it blank before resilience testing so the documented delayed/lost OTP behavior is active.

## Judge Requests

Fetch a seat map:

```bash
curl http://localhost:8080/seats/SHOW_UUID
```

Hold a seat (this also requests the payment OTP through the supplied gateway):

```bash
curl -X POST http://localhost:8080/bookings/hold \
  -H "Content-Type: application/json" \
  -d '{"showId":"SHOW_UUID","seatId":"SEAT_UUID","userId":"USER_UUID","phone":"01711111111"}'
```

Verify the payment OTP and start payment through the backend-enforced flow:

```bash
curl -X POST http://localhost:8080/payments/charge \
  -H "Content-Type: application/json" \
  -d '{"bookingRef":"bk_REFERENCE","otpCode":"123456"}'
```

The browser never talks directly to the supplied OTP gateway. Backend services call `POST /otp/send {phone, ref}` and `POST /otp/verify {ref, code}`. Payment uses the booking reference; login uses a distinct `login_...` reference.

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
