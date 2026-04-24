# WebGuard Rollout Plan

Version: P2-A local internal-test baseline

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
- Runtime `create_all` and `ensure_runtime_schema` remain as compatibility guards.

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
- Access Token is manually copied from Web localStorage to extension Options.
- Refresh Token is not implemented.
- Formal plugin binding and QR-code pairing are not implemented.
- Plugin Instance ID is manually entered.
- RBAC is minimal and not production-grade.
- Redis is not connected.
- Production deployment configuration is not complete.
- Production CORS, HTTPS, secrets management, and extension publishing are not complete.

## Guardrails for Future Work

- Do not expand mock login into production-facing logic.
- Do not rename API paths during stabilization tasks.
- Do not change database schema without Alembic migration.
- Do not bypass the `code/message/data` envelope.
- Do not delete runtime schema guards until startup and migrations are proven safe without them.
- Keep extension behavior thin and backend-authoritative.

