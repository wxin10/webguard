# WebGuard

WebGuard is a malicious website detection and warning platform. The Web app is the primary product surface, the FastAPI backend owns detection and persistence, and the Manifest V3 browser extension is a lightweight companion for page scanning, warning, blocking, and opening Web reports.

This repository currently represents a local-development internal test build. It is not a production deployment package yet.

## Deliverables

- `frontend/`: React 18 + TypeScript + Vite Web platform.
- `backend/`: FastAPI + SQLAlchemy + Alembic service.
- `extension/`: Chrome/Edge Manifest V3 extension.
- `docs/`: architecture, API, rollout, and development setup notes.

## Local Baseline

Default local services:

```text
Backend API: http://127.0.0.1:8000
Frontend:    http://127.0.0.1:5173
PostgreSQL:  postgresql://webguard:webguard@127.0.0.1:5432/webguard
```

Environment templates:

- Local development: `.env.example`, `backend/.env.example`, `frontend/.env.example`.
- Production draft: `.env.production.example`, `backend/.env.production.example`, `frontend/.env.production.example`.
- Production readiness checklist: `docs/deployment-checklist.md`.
- Extension release checklist: `docs/extension-release-checklist.md`.
- Pre-production runbook: `docs/production-runbook.md`.
- Demo acceptance guide: `docs/demo-acceptance.md`.
- Project status report: `docs/project-status-report.md`.
- Technical highlights: `docs/technical-highlights.md`.
- Roadmap: `docs/roadmap.md`.

Production templates are placeholders for operators and CI/release planning. They do not contain real secrets and are not a complete deployment recipe.

Create the local PostgreSQL user and database if they do not exist:

```sql
CREATE USER webguard WITH PASSWORD 'webguard';
CREATE DATABASE webguard OWNER webguard;
```

Apply migrations before starting the backend:

```powershell
cd backend
alembic upgrade head
```

Create or update a local formal login user:

```powershell
cd backend
$env:WEBGUARD_SEED_USERNAME = "platform-admin"
$env:WEBGUARD_SEED_PASSWORD = "change-me-local"
$env:WEBGUARD_SEED_ROLE = "admin"
$env:WEBGUARD_SEED_EMAIL = "platform-admin@example.local"
python -m app.scripts.seed_dev_user
```

The seed command uses the same password hashing logic as formal login, stores no plaintext password, and is idempotent. In development auth mode it can fall back to local-only defaults, but production-like runs should always provide `WEBGUARD_SEED_PASSWORD` explicitly.

For local demo acceptance, seed these local-only accounts when needed:

```powershell
cd backend
$env:WEBGUARD_SEED_USERNAME = "admin"
$env:WEBGUARD_SEED_PASSWORD = "admin"
$env:WEBGUARD_SEED_ROLE = "admin"
$env:WEBGUARD_SEED_EMAIL = "admin@example.local"
$env:WEBGUARD_SEED_DISPLAY_NAME = "Local Admin"
python -m app.scripts.seed_dev_user

$env:WEBGUARD_SEED_USERNAME = "guest"
$env:WEBGUARD_SEED_PASSWORD = "guest"
$env:WEBGUARD_SEED_ROLE = "user"
$env:WEBGUARD_SEED_EMAIL = "guest@example.local"
$env:WEBGUARD_SEED_DISPLAY_NAME = "Local Guest"
python -m app.scripts.seed_dev_user
```

`admin` / `admin` and `guest` / `guest` are local demonstration accounts only. They are not production defaults and are not shown in the product login UI.

## Start

Backend:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Extension:

```powershell
cd extension
npm install
npm run build
```

Open Chrome or Edge extension management, enable developer mode, and load the `extension/` directory as an unpacked extension.

## Stop Old Local Processes

If `/health` or frontend behavior looks stale, confirm which process owns the ports:

```powershell
Get-NetTCPConnection -LocalPort 8000,5173 -ErrorAction SilentlyContinue |
  Select-Object LocalPort,State,OwningProcess
```

Stop stale backend/frontend processes by PID:

```powershell
Stop-Process -Id <PID> -Force
```

Confirm the backend is current code by checking `/health`. Current code returns no `success` field:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health | ConvertTo-Json -Depth 5
```

Expected shape:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "healthy"
  }
}
```

## Local End-to-End Acceptance

1. Start PostgreSQL, run `alembic upgrade head`, then start backend and frontend.
2. Open `http://127.0.0.1:5173/login`.
3. Log in through the Web page. For local acceptance you may use the seeded formal user, such as `admin` / `admin` or `guest` / `guest`.
4. Open extension Options and set:
   - API Base URL: `http://127.0.0.1:8000`
   - Web App URL: `http://127.0.0.1:5173`
   - Access Token: optional, only when using the development-compatible manual token path with `VITE_ENABLE_DEV_TOKEN_STORAGE=true`
   - Plugin Instance ID: for example `local-dev-plugin`, or let the extension generate one
5. For the formal plugin path, click Start binding in Options, open the Web verification URL, confirm the binding code as the logged-in Web user, then return to Options and finish binding to store plugin tokens.
6. Click the connection test button. It must pass backend health and plugin bootstrap.
7. Visit `https://example.com`; it should be allowed.
8. Visit `https://login-paypal-account-security.example-phish.com/verify/password`; it should warn or block.
9. In the Web app, open records or reports to confirm the scan was persisted.
10. On the warning page, choose temporary trust or permanent trust.
11. Re-run bootstrap or reload the extension flow; the trusted domain should appear in policy and take effect locally.

HTTP smoke helper:

```powershell
.\scripts\smoke-local.ps1 -DryRun
.\scripts\smoke-local.ps1 -Username platform-admin -Password "<local-demo-password>"
```

The smoke helper checks the backend/plugin HTTP path only. It does not automate Chrome or Edge extension UI.

## Checks

Backend:

```powershell
cd backend
python -m pytest
```

Frontend:

```powershell
cd frontend
npm run lint
npm run build
```

Extension:

```powershell
cd extension
npm run build
```

Current verified baseline after P2-E:

```text
backend pytest: 39 passed
frontend lint/build: passed
extension build: passed
```

## CI

GitHub Actions runs the same baseline checks on `push` and `pull_request`:

- backend: `python -m pytest` with SQLite test configuration
- frontend: `npm run lint` and `npm run build`
- extension: `npm run build`

The CI workflow does not require secrets or a PostgreSQL service.

## Development-Only Limits

- `POST /api/v1/auth/mock-login` is development-only.
- Formal Web login exists for pre-created users with password hashes.
- `python -m app.scripts.seed_dev_user` is the supported local way to create the first formal login user.
- Web Refresh Token is stored as an HttpOnly cookie and only the server-side hash is persisted.
- Minimal plugin binding exists and issues plugin-specific access/refresh tokens.
- Manual extension token entry remains available only as a development-compatible fallback.
- QR-code binding UI and full plugin device management are not implemented yet.
- There is no production deployment configuration yet.
- The extension can generate and persist `Plugin Instance ID`, but production device-management UX is still minimal.
- Do not treat this local setup as a production authentication or authorization model.

## Production Safety Notes

The committed defaults are for local internal testing. Before any staging or production deployment, start from the production template files and set `DEBUG=false`, `ENABLE_DEV_AUTH=false`, `ENABLE_RUNTIME_SCHEMA_GUARD=false`, a strong unique `JWT_SECRET`, `REFRESH_TOKEN_COOKIE_SECURE=true`, production PostgreSQL `DATABASE_URL`, exact `CORS_ORIGINS`, and the final published extension origin. The backend refuses to start with unsafe production settings such as development auth, placeholder JWT secrets, insecure refresh cookies, wildcard CORS, or runtime schema guards while `DEBUG=false`.

Runtime schema guard behavior:

- Local development: enabled by default when `DEBUG=true`, unless `ENABLE_RUNTIME_SCHEMA_GUARD=false`.
- Production-like runs: disabled by default when `DEBUG=false`; explicitly enabling it with `DEBUG=false` is rejected.
- Production schema changes must be applied through Alembic, for example `cd backend && alembic upgrade head`.

Known release blockers before production:

- HTTPS, reverse proxy, and production CORS allowlist are not finalized.
- Secrets management and environment-specific deployment injection are not finalized.
- Production extension ID/origin allowlist and release packaging are not finalized.
- Extension store privacy materials and production permission review remain tracked in `docs/extension-release-checklist.md`.
- Manual extension token fallback remains only for development compatibility.
- Production Web access tokens are kept in memory. The `webguard_dev_user` localStorage mirror is disabled by default and only available when `VITE_ENABLE_DEV_TOKEN_STORAGE=true` for local manual-token fallback.
