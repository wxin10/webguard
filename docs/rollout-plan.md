# WebGuard Rollout Plan

Version: P2-J local internal-test baseline

This plan records the current convergence path. It is not a production release checklist yet.

## Current Verified Baseline

The repository is now usable as a local internal-test build.

Verified after P1-D:

- PostgreSQL local development path works.
- Alembic initial baseline exists and `alembic upgrade head` is part of startup.
- Backend `/health` returns the unified `code/message/data` envelope.
- Development mock-login returns an access token.
- Extension Options can store API URL, Web URL, Access Token, and Plugin Instance ID.
- Extension bootstrap succeeds with `Authorization`, `X-Plugin-Instance-Id`, and `X-Plugin-Version`.
- Safe URL scan returns `ALLOW`.
- Risky URL scan returns `BLOCK`.
- Scan records and reports are persisted and can be read by the Web app.
- Temporary trust and permanent trust write back to the backend.
- The next bootstrap can pull the updated strategy and the extension can apply it locally.

Verified commands:

```text
backend:   python -m pytest        -> 22 passed
frontend:  npm run lint/build      -> passed
extension: npm run build           -> passed
```

## Completed Work

### P0-A: Running Baseline

Completed:

- Database default converged to PostgreSQL.
- Backend can start against local PostgreSQL.
- Frontend lint baseline exists and passes.
- Frontend build and extension build pass.
- Core backend tests improved and pass.

### P0-A2: Alembic Baseline

Completed:

- Initial Alembic schema baseline added.
- Empty PostgreSQL database can be created through `alembic upgrade head`.
- Runtime `create_all` and `ensure_runtime_schema` remain as development compatibility guards and are isolated behind `ENABLE_RUNTIME_SCHEMA_GUARD`.

### P0-B: API Response Contract

Completed:

- Backend responses converged to `code/message/data`.
- Global exception handlers use the unified envelope.
- HTTP status codes are set for error responses.
- Frontend and extension clients use `code === 0` as the success contract.

### P0-C: Authentication Skeleton

Completed:

- JWT access-token skeleton exists.
- `mock-login` is explicitly development-only.
- `require_auth` / current-user dependency exists.
- Frontend API client sends `Authorization`.
- Extension API client can send `Authorization`, `X-Plugin-Instance-Id`, and `X-Plugin-Version`.

### P1-A: Detection Main Flow

Completed:

- Extension scan -> backend detection -> scan records/reports -> frontend read path works.
- Scan result includes `action`, `should_warn`, and `should_block`.
- Safe and risky URL paths are covered.

### P1-B: Strategy Sync and Trust Loop

Completed:

- Plugin bootstrap returns whitelist, blacklist, temporary trust, versions, and updated time.
- Extension caches policy with TTL/version fields.
- Local whitelist, blacklist, and temporary trust checks run before scanning.
- Trust actions write back and are visible in subsequent bootstrap responses.

### P1-C: Extension Connection Configuration

Completed:

- Options page stores API URL, Web URL, Access Token, and Plugin Instance ID.
- Connection test verifies health and bootstrap.
- Popup shows API address, token status, plugin instance, bootstrap status, and latest scan summary.

### P1-D: End-to-End Manual Acceptance

Completed:

- Local backend and frontend startup verified.
- Development login token flow verified.
- Extension connection configuration verified.
- Safe/risky scan verified.
- Records/reports read path verified.
- Temporary and permanent trust write-back verified.

## P2-A: Documentation and Engineering Hygiene

Goal:

- Make local startup, shutdown, acceptance, and limits reproducible.
- Reduce Windows line-ending churn.
- Keep the current internal-test build understandable for the next development phase.

Scope:

- `README.md`
- `docs/dev-setup.md`
- `docs/rollout-plan.md`
- `.gitattributes`

Acceptance:

- Docs include startup, stop, health verification, token copy, extension configuration, safe/risky scan, records/reports, and trust-policy verification.
- Docs explicitly list current development-only limits.
- `.gitattributes` defines text/binary and LF/CRLF expectations.

## Next Recommended Phase: P2-B

Recommended focus:

- Release-readiness checks that do not expand product scope.
- CI workflow definition for backend/frontend/extension checks.
- Optional small scripts for local start/stop if the team wants a repeatable command wrapper.
- Confirm whether extension should load `extension/` or `extension/dist/` for the final demo path.
- Review production-blocking items without implementing them in the P2-A documentation pass.

## Known Development Limits

These are intentional current limits, not bugs in the local internal-test build:

- `mock-login` is development-only.
- Web access tokens are kept in memory by default; localStorage mirroring is gated by `VITE_ENABLE_DEV_TOKEN_STORAGE=true` for development fallback only.
- Web Refresh Token and plugin refresh tokens are implemented.
- Minimal formal plugin binding is implemented; QR-code pairing is not implemented.
- Plugin Instance ID can be generated by the extension, while manual entry remains available for local compatibility.
- RBAC is minimal and not production-grade.
- Redis is not connected.
- Production deployment configuration is not complete.
- Production CORS, HTTPS, secrets management, and extension publishing are not complete.

## Guardrails for Future Work

- Do not expand mock login into production-facing logic.
- Do not rename API paths during stabilization tasks.
- Do not change database schema without Alembic migration.
- Do not bypass the `code/message/data` envelope.
- Keep runtime schema guards disabled for production-like runs; Alembic is the production schema path.
- Keep extension behavior thin and backend-authoritative.
- Treat local `.env.example` values as development defaults only. Production-like runs must disable development auth and runtime schema guards, use a strong JWT secret, enable Secure refresh cookies, and use exact CORS origins.
- Keep manual extension token fallback documented as development compatibility and keep Web token localStorage mirroring disabled by default.

## P2-G Security Gate

Before a deployable release, the following must be closed:

- HTTPS/reverse proxy and production CORS allowlist.
- Secret management for `JWT_SECRET` and database credentials.
- Production extension ID and extension-origin allowlist.
- Clear decision on whether manual extension token fallback is hidden or disabled outside development.
- Browser-level/manual smoke validation should confirm production-like frontend builds do not create `webguard_dev_user`.

## P2-H Release Hardening One

Completed:

- `Base.metadata.create_all()` and `ensure_runtime_schema()` no longer run unconditionally on startup.
- `ENABLE_RUNTIME_SCHEMA_GUARD` controls the local compatibility guard.
- When the setting is omitted, the guard follows `DEBUG`: enabled for local development, disabled for production-like runs.
- `DEBUG=false` with `ENABLE_RUNTIME_SCHEMA_GUARD=true` is rejected by settings validation.
- `.env.example` and `backend/.env.example` document the guard and production-safe values.

Next:

- P2-I should verify Web access-token memory storage, refresh-cookie recovery, logout cleanup, and development-only `VITE_ENABLE_DEV_TOKEN_STORAGE` behavior.

## P2-I Web Access Token Storage Isolation

Completed:

- Web access tokens are stored in frontend memory by default.
- The `webguard_dev_user` localStorage mirror is disabled unless `VITE_ENABLE_DEV_TOKEN_STORAGE=true`.
- Formal login and refresh update memory auth state and only mirror to localStorage in development compatibility mode.
- Page reloads recover the Web session through `/api/v1/auth/refresh` and the HttpOnly refresh cookie.
- Logout clears memory state and removes the compatibility localStorage key.

## P2-J Production Configuration Draft

Completed:

- Local and production environment templates are separated.
- Production draft templates exist for root, backend, and frontend environment values.
- `docs/deployment-checklist.md` records HTTPS, reverse proxy, CORS, Secure cookie, extension origin, migration, token, and release verification requirements.
- README and local setup docs now point operators away from local `.env.example` values for production planning.

Remaining:

- Real HTTPS/reverse-proxy configuration is still not implemented.
- Secret management and environment-specific deployment injection are still not implemented.
- Production extension package, store ID, and final extension-origin allowlist are still release blockers.

## P2-K Extension Manifest and Store Review

Completed:

- Manifest V3, permission list, host permissions, service worker, Options, Popup, icons, and warning-page resources were reviewed.
- No `<all_urls>` host permission is present.
- `storage`, `tabs`, and `notifications` permissions are documented with release rationale.
- Broad HTTP/HTTPS content-script matches are documented as required for the current real-time scan product scope.
- `docs/extension-release-checklist.md` records permission, privacy, data collection, store smoke test, production API origin, and manual token fallback requirements.

Remaining:

- Production extension ID and store-issued origin are not available yet.
- Production API origin is not wired into a release-specific extension package.
- Public privacy policy and store listing materials are still blockers.
