# CI/CD Pipeline

```mermaid
flowchart LR
    Change[Push or pull request] --> CI[CI on GitHub ubuntu-latest]
    CI --> Filter[dorny paths-filter]
    Filter --> Matrix[Changed-service matrix]
    Matrix --> Builds[Docker build per changed service]

    Change -->|push to main only| CD[CD on self-hosted Poridhi runner]
    CD --> Checkout[Checkout repository]
    Checkout --> Compose[docker compose up -d --build]
    Compose --> Live[Updated CinemaSeat stack]
```

## Execution model

- Pull requests and pushes to `main` run CI on GitHub-hosted runners.
- CI detects changes across the six backend services, frontend, and gateway, then builds only the affected Docker images.
- Pushes to `main` also trigger CD on the Poridhi VM's self-hosted runner.
- CD deploys directly with Docker Compose; it does not require SSH connectivity or deployment secrets.
- The deployment concurrency group prevents two production deployments from running simultaneously.

After CI succeeds at least once, configure the `main` branch protection rule to require the CI `build` status before merging.
