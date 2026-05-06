# WebGuard

WebGuard is a malicious website detection and warning platform. The Web app is the primary product surface, the Manifest V3 browser extension is a lightweight companion execution client, and the FastAPI backend is the trusted boundary for detection, policy, reports, authentication, and persistence.

This repository currently represents a local-development internal test build. It is not a production deployment package yet.

## Deliverables

- `frontend/`: React 18 + TypeScript + Vite Web platform.
- `backend/`: FastAPI + SQLAlchemy + Alembic service.
- `extension/`: Chrome/Edge Manifest V3 extension.
- `docs/`: architecture, API, development, deployment, and operations notes.

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

## External Threat Intelligence Blocklists

WebGuard can import external malicious website blocklists into the existing backend `DomainBlacklist` table. This first version reuses `DomainBlacklist` instead of introducing a separate threat-intel schema.

Imported records use this shape:

```text
domain=<malicious domain>
source=threat_intel:<source_key>
risk_type=scam|malware|malicious_url|cryptomining|hacked_malware|...
reason=命中外部恶意网站规则库：<source name>；风险类型：<risk_type>
status=active
```

The browser extension does not maintain large rule libraries. The backend owns synchronization, parsing, storage, lookup, and final risk decisions.

Blocklists are not downloaded on FastAPI startup. Synchronization is explicit:

```powershell
cd backend
python -m app.scripts.sync_threat_intel --limit-per-source 500
```

Full import:

```powershell
cd backend
python -m app.scripts.sync_threat_intel
```

Dry run:

```powershell
cd backend
python -m app.scripts.sync_threat_intel --dry-run
```

Run a dry run before production import to check source availability without writing to the database. External sources can fail because of network routing, TLS/certificate issues, regional access restrictions, rate limits, or upstream request policies. A single source failure is non-blocking: WebGuard continues synchronizing the other enabled sources and reports the failed source in the command output.

Supported sources:

- MalwareDomainList
- Scam Blocklist by DurableNapkin
- Spam404
- The Big List of Hacked Malware Web Sites
- URLHaus / Online Malicious URL Blocklist
- NoCoin Filter List
- AdGuard DNS filter

## Detection Architecture

WebGuard currently uses rule engine + DeepSeek large-model semantic risk analysis as the main detection architecture. The browser extension collects page access and interaction features, the backend rule engine produces explainable behavior risk signals, and DeepSeek is used for semantic judgment of risky persuasion, brand impersonation, payment, verification-code, wallet, and attack-intent patterns.

DeepSeek does not replace blacklists, whitelists, external blocklists, or the local behavior-rule engine. The rule engine remains the fast, explainable baseline and the fallback path.

The backend calls DeepSeek only when behavior rules expose meaningful risk signals, such as password inputs, unknown cross-domain forms, brand impersonation, credential-theft combinations, payment urgency, wallet secret phrases, or suspicious redirect combinations. Clearly low-risk pages and deterministic domain-list decisions skip AI analysis.

Administrators should configure DeepSeek / Volcano Ark from the Web AI configuration page. Runtime detection uses the database configuration first. The local `.env` values are fallback only when no database API key is saved.

Local `.env` fallback configuration:

```powershell
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_ENABLED=auto
DEEPSEEK_TIMEOUT_SECONDS=20
```

`DEEPSEEK_API_KEY` is intentionally empty in examples because the admin AI configuration page is the primary setup path. `DEEPSEEK_ENABLED=auto` enables AI only when an effective database or fallback `.env` key is present. `true` forces the backend to try DeepSeek and returns `no_api_key` when no effective key exists. `false` disables semantic analysis. If the key is absent, DeepSeek is disabled, the request times out, or DeepSeek returns an invalid response, scanning still succeeds and falls back to rule-engine-only detection.

Check AI status after startup:

```text
GET http://127.0.0.1:8000/api/v1/ai/status
```

Admin-only connection test:

```text
POST http://127.0.0.1:8000/api/v1/ai/test
```

DeepSeek is called only when behavior rules expose meaningful risk signals, such as password inputs, unknown cross-domain forms, brand impersonation, credential-theft combinations, payment urgency, wallet secret phrases, or suspicious redirect combinations. When DeepSeek returns `used`, the final score is `behavior_score * 0.45 + deepseek_score * 0.55`. Otherwise the final score is the rule-engine behavior score.

The backend sends only structured page features to DeepSeek. It does not send full webpage source, cookies, localStorage, complete HTML, or full form contents. URL secrets, emails, phone numbers, card/ID-like values, JWT-like strings, and long random tokens are redacted before the request, and visible text is truncated.

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

- backend: `python -m pytest` with SQLite only as a lightweight CI/unit-test configuration; PostgreSQL remains the runtime target database
- frontend: `npm run lint` and `npm run build`
- extension: `npm run build`

The CI workflow does not require secrets or a PostgreSQL service.

## Development-Only Limits

- WebGuard authentication uses real username/password login, registration, refresh, and logout flows.
- Legacy development login shortcuts have been removed.
- Formal Web login exists for registered or pre-created users with password hashes.
- `python -m app.scripts.seed_dev_user` is the supported local way to create the first formal login user.
- Web Refresh Token is stored as an HttpOnly cookie and only the server-side hash is persisted.
- Minimal plugin binding exists and issues plugin-specific access/refresh tokens.
- Manual extension token entry remains available only as a development-compatible fallback.
- QR-code binding UI and full plugin device management are not implemented yet.
- Production configuration drafts, deployment checklist, and runbook exist, but the repository is not a real production deployment package yet.
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
