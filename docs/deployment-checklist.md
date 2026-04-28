# WebGuard Deployment Checklist

Version: P2-J production configuration draft

This checklist is a deployment planning document. It is not a complete Docker, Nginx, cloud, or store-publishing guide. The current repository remains a local internal-test build until every blocking item in this document is closed.

## 1. Environment Templates

Use these templates by environment:

- Local development: `.env.example`, `backend/.env.example`, `frontend/.env.example`.
- Production draft: `.env.production.example`, `backend/.env.production.example`, `frontend/.env.production.example`.

Never reuse local secrets, local database credentials, or development auth settings in production.

## 2. Required Production Settings

Backend production settings must include:

```text
DEBUG=false
ENABLE_DEV_AUTH=false
ENABLE_RUNTIME_SCHEMA_GUARD=false
JWT_SECRET=<strong unique secret, at least 32 characters>
REFRESH_TOKEN_COOKIE_SECURE=true
CORS_ORIGINS=https://<web-origin>,chrome-extension://<published-extension-id>
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
```

Frontend production settings must include:

```text
VITE_API_BASE_URL=https://<api-origin>
VITE_ENABLE_DEV_TOKEN_STORAGE=false
```

Operational deployment metadata should be tracked outside local dev defaults:

```text
FRONTEND_ORIGIN=https://<web-origin>
WEB_APP_URL=https://<web-origin>
API_BASE_URL=https://<api-origin>
EXTENSION_ID=<published-extension-id>
EXTENSION_ORIGIN=chrome-extension://<published-extension-id>
```

## 3. HTTPS and Reverse Proxy

Production must satisfy:

- The Web frontend is served over HTTPS.
- The backend API is served over HTTPS or behind a trusted HTTPS reverse proxy.
- `REFRESH_TOKEN_COOKIE_SECURE=true` is enabled, which requires HTTPS.
- The reverse proxy forwards the intended host, scheme, and client IP headers consistently.
- No production environment uses local HTTP origins such as `http://127.0.0.1:*`.

This document intentionally does not provide a full reverse-proxy configuration. Add an environment-specific proxy guide before first deployment.

## 4. CORS and Extension Origin

Production CORS must be an exact allowlist:

- Web origin: `https://<web-origin>`.
- Published extension origin: `chrome-extension://<published-extension-id>`.
- No wildcard `*`.
- No broad temporary origins left from local testing.

After browser-store publication, update the allowlist with the final extension ID. The extension production package must use the production API origin and the plugin binding token path.

## 5. Database and Migrations

Production database requirements:

- PostgreSQL is the target database.
- Apply migrations with `alembic upgrade head` before starting application workers.
- Do not rely on `Base.metadata.create_all()` or runtime schema patching.
- Keep `ENABLE_RUNTIME_SCHEMA_GUARD=false` in production.
- Back up production data before applying schema migrations.

## 6. Auth and Token Safety

Production auth requirements:

- `mock-login` remains disabled by `DEBUG=false` and `ENABLE_DEV_AUTH=false`.
- Web access tokens stay in memory and are restored through the HttpOnly refresh cookie.
- `VITE_ENABLE_DEV_TOKEN_STORAGE=false` so `webguard_dev_user` is not created by production Web builds.
- Web refresh tokens are HttpOnly, Secure cookies and server-side hashes only.
- Plugin tokens are extension-scoped and tied to `X-Plugin-Instance-Id`.
- Manual extension token fallback is not the production path.

## 7. Extension Release Review

Before publishing the extension:

- Confirm Manifest V3 package builds from `extension/`.
- Keep extension permissions minimal and justified.
- Keep content-script matches only as broad as the detection product requires.
- Replace local backend host permissions or release settings with the production API origin if required by the browser.
- Add the published extension origin to backend `CORS_ORIGINS`.
- Complete `docs/extension-release-checklist.md`, including permission rationale, privacy disclosure, store smoke test, and production API origin review.
- Re-run the real-browser smoke test after installing the production-like extension package.

## 8. Release Verification

Run these checks before release candidate tagging:

```powershell
cd backend
python -m pytest
alembic upgrade head

cd ..\frontend
npm run lint
npm run build

cd ..\extension
npm run build

cd ..
git diff --check
```

Manual smoke test:

1. Log in with a seeded or provisioned formal user.
2. Bind the extension through the plugin challenge flow.
3. Confirm plugin bootstrap succeeds with plugin tokens.
4. Visit a safe URL and confirm allow behavior.
5. Visit a risky URL and confirm warning or block behavior.
6. Confirm scan records and reports are visible in the Web app.
7. Revoke the plugin instance and confirm later plugin requests require re-binding.

## 9. Current Production Blockers

P0 blockers:

- Real HTTPS and reverse proxy configuration is not implemented.
- Secret management and environment-specific deployment injection are not implemented.
- Production CORS and published extension origin allowlist need real deployment values.
- Production extension packaging and store ID validation are not complete.
- Extension privacy policy and store listing materials are not complete.

P1 blockers:

- Manual extension token fallback should be hidden or disabled in production UX.
- Extension production console diagnostics should avoid full browsing URLs.
- Device-management UX is still minimal.
- Rate limiting and audit hardening are not complete.

P2 blockers:

- QR-code binding UI is not implemented.
- Redis-based cache or rate-limit infrastructure is still a future target.
- Full production observability and alerting are not documented.
