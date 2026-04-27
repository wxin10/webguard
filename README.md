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
3. Log in through the Web page. For local acceptance you may use the development mock-login option, or a formal test user that already has `users.password_hash` set.
4. Open extension Options and set:
   - API Base URL: `http://127.0.0.1:8000`
   - Web App URL: `http://127.0.0.1:5173`
   - Access Token: value from `webguard_dev_user.access_token`
   - Plugin Instance ID: for example `local-dev-plugin`
5. Click the connection test button. It must pass backend health and plugin bootstrap.
6. Visit `https://example.com`; it should be allowed.
7. Visit `https://login-paypal-account-security.example-phish.com/verify/password`; it should warn or block.
8. In the Web app, open records or reports to confirm the scan was persisted.
9. On the warning page, choose temporary trust or permanent trust.
10. Re-run bootstrap or reload the extension flow; the trusted domain should appear in policy and take effect locally.

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

Current verified baseline after P2-D:

```text
backend pytest: 29 passed
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
- Web Refresh Token is stored as an HttpOnly cookie and only the server-side hash is persisted.
- The extension token is copied manually from Web localStorage.
- There is no production plugin binding flow yet.
- There is no production deployment configuration yet.
- The extension `Plugin Instance ID` is a manual placeholder.
- Do not treat this local setup as a production authentication or authorization model.
