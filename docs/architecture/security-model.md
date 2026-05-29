## Security model

Med-Tracker treats medication schedules and adherence history as protected health information. The design aims to keep the smallest amount of personal data possible, encrypt it in transit, and partition it strongly per user.

### Identity

* Email plus password sign in. Passwords are hashed with Argon2 in production and SHA-256 in the demo seed only.
* Short lived JWT access tokens, 15 minute lifetime by default.
* Refresh tokens rotate on every refresh and bind to the device fingerprint.

### Authorization

* Every API route runs under a `userId` extracted from the JWT.
* Caregiver share tokens grant read only access to a subset of routes.
* The admin surface is disabled in production builds unless `ADMIN_ENABLED=true`.

### Data

* SQLite for local dev. Postgres in production, with row level security via the application layer.
* Backups encrypted at rest. Restore drills documented in `guides/deployment.md`.

### Transport

* HTTPS only in production. HSTS preload enabled.
* CORS limited to the configured `WEB_ORIGIN`.

### Disclosure

If you find a security issue please follow `SECURITY.md`.
