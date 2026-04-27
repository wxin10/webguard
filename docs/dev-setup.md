# WebGuard Development Setup

Version: P2-H local internal-test baseline

This document describes the current local workflow after P1-D. It is intentionally focused on repeatable development and acceptance, not production deployment.

## 1. Required Local Services

Recommended versions:

- Python 3.11+
- Node.js 20.x LTS
- npm 10.x
- PostgreSQL 15+ or a compatible local PostgreSQL instance
- Chrome or Edge with Manifest V3 support

Default local URLs:

```text
Backend API: http://127.0.0.1:8000
Frontend:    http://127.0.0.1:5173
Database:    postgresql://webguard:webguard@127.0.0.1:5432/webguard
```

## 2. PostgreSQL

Create the local user and database once:

```sql
CREATE USER webguard WITH PASSWORD 'webguard';
CREATE DATABASE webguard OWNER webguard;
```

The backend reads `DATABASE_URL` from `backend/.env` when present. If the file is absent, the development default resolves to:

```text
postgresql://webguard:webguard@127.0.0.1:5432/webguard
```

## 3. Alembic

Run migrations before starting the backend:

```powershell
cd backend
alembic upgrade head
```

The repository now has an initial Alembic baseline. Keep schema changes in Alembic migrations instead of relying on runtime table creation.

`Base.metadata.create_all()` and `ensure_runtime_schema()` still exist as local compatibility guards, but they are now isolated behind `ENABLE_RUNTIME_SCHEMA_GUARD`.

Runtime schema guard behavior:

- Local development: enabled by default when `DEBUG=true`, unless `ENABLE_RUNTIME_SCHEMA_GUARD=false`.
- Production-like runs: disabled by default when `DEBUG=false`.
- Unsafe combination: `DEBUG=false` with `ENABLE_RUNTIME_SCHEMA_GUARD=true` is rejected during backend settings validation.
- Production schema changes must be applied through Alembic only.

## 4. Seed a Local Formal User

Create or update the first local formal login user after migrations:

```powershell
cd backend
$env:WEBGUARD_SEED_USERNAME = "platform-admin"
$env:WEBGUARD_SEED_PASSWORD = "change-me-local"
$env:WEBGUARD_SEED_ROLE = "admin"
$env:WEBGUARD_SEED_EMAIL = "platform-admin@example.local"
$env:WEBGUARD_SEED_DISPLAY_NAME = "Platform Admin"
python -m app.scripts.seed_dev_user
```

Seed environment variables:

```text
WEBGUARD_SEED_USERNAME
WEBGUARD_SEED_PASSWORD
WEBGUARD_SEED_ROLE=admin|user
WEBGUARD_SEED_EMAIL
WEBGUARD_SEED_DISPLAY_NAME
```

The command uses the same password hashing function as `/api/v1/auth/login`. It stores only `users.password_hash`, never prints the plaintext password, and is idempotent: rerunning it updates the same user instead of creating duplicates.

When development auth is enabled, omitted values fall back to local-only defaults for convenience. Do not rely on those defaults for production-like environments; provide `WEBGUARD_SEED_PASSWORD` explicitly.

## 5. Backend

Install dependencies:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Start:

```powershell
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Validate health:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health | ConvertTo-Json -Depth 5
```

Expected current response:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "healthy"
  }
}
```

If the response contains a top-level `success` field, port `8000` is likely serving an old backend process.

## 6. Frontend

Install dependencies:

```powershell
cd frontend
npm install
```

Start:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173
http://127.0.0.1:5173/login
```

## 7. Extension

Build:

```powershell
cd extension
npm install
npm run build
```

Load in Chrome or Edge:

1. Open the browser extension management page.
2. Enable developer mode.
3. Choose "Load unpacked".
4. Select the repository `extension/` directory.

Default extension settings:

```text
API Base URL: http://127.0.0.1:8000
Web App URL:  http://127.0.0.1:5173
```

The Options page also accepts:

- Access Token
- Plugin Instance ID

## 8. Stop Stale Processes

Check local ports:

```powershell
Get-NetTCPConnection -LocalPort 8000,5173 -ErrorAction SilentlyContinue |
  Select-Object LocalPort,State,OwningProcess
```

Stop a stale process:

```powershell
Stop-Process -Id <PID> -Force
```

A stale backend can make acceptance misleading. Always re-check `/health` after restarting.

## 9. Web Login and Development Token

The Web app now supports formal username/password login for users that already exist with `users.password_hash` set. There is still no self-service registration flow in this local baseline.

Formal login endpoints:

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

`/api/v1/auth/login` returns a short-lived Access Token and sets an HttpOnly refresh cookie named `webguard_refresh_token`. `/api/v1/auth/refresh` rotates the refresh token and returns a new Access Token. The database stores only refresh-token hashes in `refresh_tokens`.

Relevant local environment variables:

```text
JWT_ACCESS_TOKEN_EXPIRES_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRES_DAYS=14
REFRESH_TOKEN_COOKIE_NAME=webguard_refresh_token
REFRESH_TOKEN_COOKIE_SECURE=false
```

Development mock-login remains available only when `DEBUG=true` and `ENABLE_DEV_AUTH=true`.

Manual token flow:

1. Open `http://127.0.0.1:5173/login`.
2. Log in with the seeded formal test user, or use the development mock-login option.
3. Open browser DevTools.
4. Read localStorage key `webguard_dev_user`.
5. Copy `access_token` into the extension Options page.

Equivalent API call:

```powershell
$login = Invoke-RestMethod `
  -Uri http://127.0.0.1:8000/api/v1/auth/mock-login `
  -Method Post `
  -ContentType 'application/json' `
  -Body '{"username":"platform-user","role":"user"}'

$login.data.access_token
```

`mock-login` is development-only and must not be treated as production authentication.

## 10. End-to-End Acceptance

Use these values in extension Options:

```text
API Base URL:       http://127.0.0.1:8000
Web App URL:        http://127.0.0.1:5173
Access Token:       <webguard_dev_user.access_token>
Plugin Instance ID: local-dev-plugin
```

Click "Test connection". It must validate both backend health and plugin bootstrap.

Safe URL:

```text
https://example.com
```

Expected result:

```text
label=safe
action=ALLOW
should_block=false
```

Risky URL:

```text
https://login-paypal-account-security.example-phish.com/verify/password
```

Expected result:

```text
label=malicious
action=BLOCK
should_block=true
```

Then check the Web app:

- Records page: `/app/my-records`
- Report details: `/app/reports/<report_id>`

Trust-policy acceptance:

1. From the warning page or popup, choose temporary trust for the risky domain.
2. Re-run bootstrap or reload the extension flow.
3. The domain should appear in `temporary_trusted_domains`.
4. Scanning that domain again should be allowed while the temporary trust is active.
5. Choose permanent trust for a test domain.
6. Re-run bootstrap.
7. The domain should appear in `whitelist_domains.user`.

Plugin binding acceptance:

1. Open extension Options.
2. Confirm API Base URL is `http://127.0.0.1:8000` and Web App URL is `http://127.0.0.1:5173`.
3. Click Start binding.
4. Open the displayed verification URL while logged in to the Web app.
5. Enter the displayed binding code and confirm binding.
6. Return to extension Options and click Finish binding.
7. The extension should store plugin-specific access and refresh tokens and use them for later backend requests.

## 11. Verification Commands

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

## 12. GitHub Actions CI

The repository has a baseline CI workflow at `.github/workflows/ci.yml`.

It runs on `push` and `pull_request`:

- backend: installs Python dependencies and runs `python -m pytest` with SQLite test configuration.
- frontend: installs npm dependencies, then runs `npm run lint` and `npm run build`.
- extension: installs npm dependencies, then runs `npm run build`.

The current CI baseline does not require secrets and does not start PostgreSQL.

## 13. Current Development Limits

- Development mock-login is still present and only valid in development mode.
- Formal Web login requires seeded or otherwise pre-created users; registration and password reset are not implemented.
- Manual Access Token entry remains available in extension Options as a development-compatible fallback.
- Web Refresh Token exists for the Web app; plugin refresh tokens exist for bound extension instances.
- Minimal formal plugin binding is implemented through challenge, Web confirmation, token exchange, refresh, revoke, and unbind endpoints.
- Plugin Instance ID can be generated and persisted by the extension, but full device-management UI is not implemented.
- RBAC is still minimal.
- Production deployment, HTTPS, production CORS, secrets management, and release packaging are not complete.

## 14. Production Safety Gate

This document describes local development, not production deployment. For staging or production, use a separate environment file and set at least:

```text
DEBUG=false
ENABLE_DEV_AUTH=false
ENABLE_RUNTIME_SCHEMA_GUARD=false
JWT_SECRET=<strong unique secret, at least 32 characters>
REFRESH_TOKEN_COOKIE_SECURE=true
CORS_ORIGINS=https://<web-origin>,chrome-extension://<published-extension-id>
```

The backend fails fast when `DEBUG=false` is combined with development auth, runtime schema guards, placeholder/short JWT secrets, insecure refresh cookies, or wildcard CORS origins. This guard is intentional so local defaults cannot silently become production defaults.

Do not publish with manual extension token fallback as the primary user path. It remains available only to keep development and emergency local debugging workflows usable.

P2-I should address the remaining Web access token localStorage compatibility path by moving the production Web client toward memory-only access tokens plus HttpOnly refresh cookies.
