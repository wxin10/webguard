# WebGuard Demo Acceptance Guide

Version: P2-L demo acceptance baseline

This guide is the repeatable acceptance path for demos, internal testing, and release rehearsals. It combines automated HTTP smoke checks with the browser-extension manual path.

## 1. Demo Readiness Checklist

Before the demo:

- PostgreSQL is running.
- `alembic upgrade head` has completed.
- A formal seeded user exists.
- Backend `/health` returns `code/message/data`.
- Frontend dev server or static build is available.
- Extension build has completed.
- Extension is loaded unpacked in Chrome or Edge.
- Extension Options points to the demo API and Web app URLs.

## 2. Start Services

Backend:

```powershell
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Extension:

```powershell
cd extension
npm run build
```

Load the `extension/` directory as an unpacked extension.

## 3. Seed and Login

Seed user:

```powershell
cd backend
$env:WEBGUARD_SEED_USERNAME = "platform-admin"
$env:WEBGUARD_SEED_PASSWORD = "<local-demo-password>"
$env:WEBGUARD_SEED_ROLE = "admin"
python -m app.scripts.seed_dev_user
```

Login:

```text
http://127.0.0.1:5173/login
```

Expected:

- Login succeeds.
- User lands in `/app`.
- Refreshing the page keeps the session through the refresh cookie.

## 4. Automated HTTP Smoke

Dry run:

```powershell
.\scripts\smoke-local.ps1 -DryRun
```

Full HTTP smoke:

```powershell
.\scripts\smoke-local.ps1 `
  -ApiBaseUrl http://127.0.0.1:8000 `
  -WebBaseUrl http://127.0.0.1:5173 `
  -Username platform-admin `
  -Password "<local-demo-password>"
```

Expected:

- Health passes.
- Login and refresh pass.
- Plugin binding challenge, confirmation, and token exchange pass.
- Plugin bootstrap passes.
- Safe URL returns `ALLOW`.
- Risky URL returns `BLOCK` or `WARN`.
- Plugin instance list includes the smoke instance.
- Revoked plugin token is rejected.

## 4.1 DeepSeek AI Access Check

WebGuard 当前检测架构是规则引擎 + DeepSeek 大模型语义研判。Web 平台是主产品入口，浏览器插件是轻量辅助执行端，FastAPI 后端是检测、策略、报告、鉴权和持久化的可信边界。插件采集页面访问与交互特征；后端规则引擎生成可解释行为风险信号；DeepSeek 在高风险信号触发时研判语义诱导、品牌冒充、支付、验证码、钱包等风险。DeepSeek 不替代规则引擎、黑白名单和外部威胁情报；不可用时系统自动回退到规则引擎。

Primary setup path:

- Log in as an admin.
- Open the Web AI configuration page.
- Configure DeepSeek / Volcano Ark `base_url`, `model`, `timeout_seconds`, `enabled`, and API key.
- Save and test the connection.

Environment fallback only when no database API key is saved:

```text
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_ENABLED=auto
DEEPSEEK_TIMEOUT_SECONDS=20
```

Check status:

```text
GET http://127.0.0.1:8000/api/v1/ai/status
```

Admin test:

```text
POST http://127.0.0.1:8000/api/v1/ai/test
```

Expected:

- If the admin database config or fallback `.env` key is configured, status shows `provider=deepseek`, `configured=true`, source, and a masked key.
- If no effective API key is configured, status shows `configured=false` and detection still works through rule-engine fallback.
- If DeepSeek times out or returns an error, scan results continue to return normally with `score_breakdown.fallback=rule_engine_only`.

## 5. Manual Extension Binding

In extension Options:

```text
API Base URL: http://127.0.0.1:8000
Web App URL:  http://127.0.0.1:5173
```

Steps:

1. Click Start binding.
2. Confirm a challenge id and binding code are displayed.
3. Open the verification URL.
4. Confirm binding in the Web app.
5. Return to Options.
6. Click Finish binding.
7. Confirm Plugin Token shows bound/configured.

Expected:

- Options can complete binding without manual token copy.
- Popup shows plugin token configured.
- Backend plugin bootstrap succeeds.

## 6. Safe URL Acceptance

Open:

```text
https://example.com
```

Expected:

- The extension allows the page.
- Popup or latest scan state indicates safe/allow.
- Backend scan record and report can be found in the Web app.

## 7. Risky URL Acceptance

Open:

```text
https://login-paypal-account-security.example-phish.com/verify/password
```

Expected:

- The extension warns or blocks.
- Warning page opens for a block decision.
- Web records/reports show malicious or high-risk result.

## 8. Trust Policy Acceptance

From the warning page:

1. Choose temporary trust.
2. Retry the same domain during the temporary trust window.
3. Confirm the extension allows the domain locally.
4. Choose permanent trust for a test domain.
5. Re-run bootstrap or reload the extension flow.

Expected:

- Temporary trust appears in `temporary_trusted_domains`.
- Permanent trust appears in user whitelist data.
- Policy changes are visible from the Web policy/domain pages.

## 9. Plugin Revoke Acceptance

In the Web app:

1. Open plugin management or plugin instance list.
2. Revoke the bound plugin instance.
3. Trigger plugin bootstrap or scan again.

Expected:

- Backend rejects revoked plugin token.
- Extension shows disconnected or requires re-binding.
- Manual token fallback remains available only for development compatibility.

## 10. Demo Failure Triage

Use this quick map:

- Backend not responding: check port 8000 and `/health`.
- Frontend login loops: verify refresh cookie and backend auth endpoints.
- Binding page cannot open: verify Web App URL in Options.
- Token exchange fails: challenge may not be confirmed or code expired.
- Scan does not trigger: verify extension is loaded and auto detect is enabled.
- WebGuard platform pages are blocked: platform host skip logic should be checked.
- Revoke does not reject plugin: verify `X-Plugin-Instance-Id` matches token claim.

## 11. What This Demo Does Not Prove

- It does not prove production HTTPS or reverse proxy readiness.
- It does not prove store package approval.
- It does not prove official extension ID allowlisting.
- It does not prove secret-manager integration.
- It does not prove Redis, RBAC expansion, or production observability.
