# CI/CD Pipeline

```mermaid
graph LR
    Push[Developer Pushes Code] --> CI[GitHub Actions: CI]
    CI --> Test[Run Tests on Microservices]
    Test --> Build[Build Docker Images]
    Build --> CD[GitHub Actions: CD]
    CD --> Deploy[Deploy via Docker Compose]
```
