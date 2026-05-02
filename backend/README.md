# WebGuard Backend

FastAPI backend for WebGuard detection, policy, reports, authentication, persistence, plugin binding, and AI access status.

## Runtime

- Python 3.11+
- FastAPI
- SQLAlchemy 2.x
- Alembic
- PostgreSQL target database

Local database default:

```text
postgresql://webguard:webguard@127.0.0.1:5432/webguard
```

Run migrations before startup:

```powershell
cd backend
alembic upgrade head
```

Start:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Detection Chain

Current architecture:

```text
FeatureExtractor -> RuleEngine -> DeepSeekAnalysisService -> Detector
```

The rule engine remains the fast, explainable baseline. DeepSeek is the only AI semantic analysis provider in the main detection path.

Fusion rule:

- DeepSeek `used`: `final_score = behavior_score * 0.45 + deepseek_score * 0.55`
- DeepSeek not triggered, disabled, missing key, timeout, or error: `final_score = behavior_score`
- Label: `>=70 malicious`, `>=40 suspicious`, otherwise `safe`

## DeepSeek Configuration

Admin-managed configuration is available through the Web AI configuration page. Database configuration is preferred at runtime; these environment variables remain the fallback when no database API key is configured.

```text
SECRET_ENCRYPTION_KEY=<fernet-key-for-production>
DEEPSEEK_API_KEY=<your-api-key>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_ENABLED=auto
DEEPSEEK_TIMEOUT_SECONDS=20
```

`DEEPSEEK_ENABLED` modes:

- `auto`: enabled only when `DEEPSEEK_API_KEY` is configured.
- `true`: force a DeepSeek attempt; missing key returns `no_api_key`.
- `false`: disable DeepSeek semantic analysis.

API keys saved through the admin page are encrypted in `ai_provider_configs.encrypted_api_key`. Clients only receive `api_key_masked`.

## AI API

Status:

```text
GET /api/v1/ai/status
```

Admin test:

```text
POST /api/v1/ai/test
```

Admin configuration:

```text
GET    /api/v1/ai/config
PUT    /api/v1/ai/config
DELETE /api/v1/ai/config/key
POST   /api/v1/ai/config/test
```

Example test body:

```json
{
  "title": "登录验证",
  "visible_text": "您的账号存在异常，请立即输入验证码完成验证",
  "url": "https://example-login.test/verify",
  "has_password_input": true
}
```

If `DEEPSEEK_API_KEY` is not configured, detection does not fail. WebGuard automatically uses rule-engine-only fallback.

## Main APIs

- `POST /api/v1/scan/url`
- `POST /api/v1/scan/page`
- `POST /api/v1/plugin/analyze-current`
- `GET /api/v1/ai/status`
- `POST /api/v1/ai/test`
- `GET /api/v1/records`
- `GET /api/v1/records/me`
- `GET /api/v1/reports/latest`
- `GET /api/v1/reports/{id}`
- `GET /api/v1/stats/overview`

## Checks

```powershell
cd backend
python -m pytest
```
