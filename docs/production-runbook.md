# WebGuard Production Runbook Draft

Version: P2-L pre-production runbook draft

This runbook describes the current near-production operating path for WebGuard. It is not a complete production deployment guide. HTTPS, reverse proxy, secret management, official extension packaging, and final extension ID allowlisting still require real environment work.

## 1. Scope

Use this runbook for:

- Local demonstration rehearsals.
- Internal pre-release validation.
- Deployment planning before a real staging or production environment exists.
- Repeatable handoff between backend, frontend, and extension operators.

Do not use this document as:

- A full cloud deployment plan.
- A full Nginx, Docker, Kubernetes, or systemd guide.
- A substitute for the production checklist in `docs/deployment-checklist.md`.

## 2. Required Inputs

Prepare these values before a pre-production run:

```text
API_BASE_URL=http://127.0.0.1:8000
WEB_APP_URL=http://127.0.0.1:5173
DATABASE_URL=postgresql://webguard:webguard@127.0.0.1:5432/webguard
WEBGUARD_SEED_USERNAME=platform-admin
WEBGUARD_SEED_PASSWORD=<local-demo-password>
WEBGUARD_SEED_ROLE=admin
WEBGUARD_SEED_EMAIL=platform-admin@example.local
```

For real staging or production, replace local URLs with HTTPS origins and use the production templates:

```text
.env.production.example
backend/.env.production.example
frontend/.env.production.example
```

## 3. Environment Preparation

Backend local development values should keep:

```text
DEBUG=true
ENABLE_DEV_AUTH=true
ENABLE_RUNTIME_SCHEMA_GUARD=true
REFRESH_TOKEN_COOKIE_SECURE=false
```

Production-like values must use:

```text
DEBUG=false
ENABLE_DEV_AUTH=false
ENABLE_RUNTIME_SCHEMA_GUARD=false
REFRESH_TOKEN_COOKIE_SECURE=true
CORS_ORIGINS=https://<web-origin>,chrome-extension://<published-extension-id>
```

Do not commit real `.env` files or secrets.

## 4. PostgreSQL and Migrations

Create the local database if needed:

```sql
CREATE USER webguard WITH PASSWORD 'webguard';
CREATE DATABASE webguard OWNER webguard;
```

Apply migrations:

```powershell
cd backend
alembic upgrade head
```

Production must use Alembic migrations. Do not rely on runtime schema guards in production.

## 5. Seed the First Formal User

Create or update the demo user:

```powershell
cd backend
$env:WEBGUARD_SEED_USERNAME = "platform-admin"
$env:WEBGUARD_SEED_PASSWORD = "<local-demo-password>"
$env:WEBGUARD_SEED_ROLE = "admin"
$env:WEBGUARD_SEED_EMAIL = "platform-admin@example.local"
python -m app.scripts.seed_dev_user
```

The seed command is idempotent and uses the same password hashing logic as formal login. It does not print plaintext passwords.

## 6. Start Backend

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health | ConvertTo-Json -Depth 5
```

Expected response envelope:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "healthy"
  }
}
```

## 7. Build and Start Frontend

Install and build:

```powershell
cd frontend
npm install
npm run build
```

For local demo development server:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

For production, serve the built assets over HTTPS behind an environment-specific static hosting or reverse-proxy setup. This runbook intentionally does not define that proxy.

## 8. Build and Load Extension

```powershell
cd extension
npm install
npm run build
```

Load unpacked:

1. Open Chrome or Edge extension management.
2. Enable developer mode.
3. Choose "Load unpacked".
4. Select the repository `extension/` directory.

For store release, follow `docs/extension-release-checklist.md`.

## 9. Formal Login

Open:

```text
http://127.0.0.1:5173/login
```

Log in with the seeded formal user. The Web app keeps access tokens in memory by default and restores sessions through the HttpOnly refresh cookie.

## 10. Plugin Binding

In extension Options:

```text
API Base URL: http://127.0.0.1:8000
Web App URL:  http://127.0.0.1:5173
```

Then:

1. Click Start binding.
2. Open the verification URL.
3. Confirm the displayed binding code in the Web app.
4. Return to Options.
5. Click Finish binding.
6. Confirm the plugin token status is bound.

Manual Access Token remains a development compatibility fallback only.

## 11. HTTP Smoke Script

Run the dry run:

```powershell
.\scripts\smoke-local.ps1 -DryRun
```

Run the smoke test:

```powershell
.\scripts\smoke-local.ps1 `
  -ApiBaseUrl http://127.0.0.1:8000 `
  -WebBaseUrl http://127.0.0.1:5173 `
  -Username platform-admin `
  -Password "<local-demo-password>"
```

The script validates health, formal login, refresh, plugin binding, plugin bootstrap, safe scan, risky scan, plugin instance listing, revoke, and revoked-token rejection. It does not print tokens or binding codes.

## 12. Troubleshooting

Stale backend process:

```powershell
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
  Select-Object LocalPort,State,OwningProcess
```

Stop stale process:

```powershell
Stop-Process -Id <PID> -Force
```

Common issues:

- `/health` has a `success` field: an old backend is running.
- Login fails: seed user is missing or password differs from `WEBGUARD_SEED_PASSWORD`.
- Refresh fails locally: login request did not preserve the cookie session.
- Plugin bootstrap returns 401: plugin token is missing or expired.
- Plugin bootstrap returns 403 after revoke: expected behavior.
- Binding confirm fails: binding code expired or copied incorrectly.
- Extension cannot call backend in production: manifest/API origin/CORS allowlist is not final.

## 13. Production Gaps

Before real production:

- Configure HTTPS frontend and HTTPS API or a trusted HTTPS reverse proxy.
- Use a real secret manager.
- Use exact production CORS origins.
- Apply final extension ID allowlist.
- Publish privacy policy and store listing materials.
- Review production logging so browser URLs are not overexposed.
