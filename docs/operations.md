# WebGuard Operations Notes

WebGuard 当前检测架构为规则引擎 + DeepSeek 大模型语义研判。Web 平台是主产品入口，浏览器插件是轻量辅助执行端，FastAPI 后端是检测、策略、报告、鉴权和持久化的可信边界。插件采集页面访问与交互特征；后端规则引擎生成可解释行为风险信号；DeepSeek 在高风险信号触发时研判语义诱导、品牌冒充、支付、验证码、钱包等风险。DeepSeek 不替代规则引擎、黑白名单或外部威胁情报；未配置、未触发、超时或异常时，系统自动退回规则引擎兜底。

## Logging

Backend logs should cover:

- API request path, method, status, latency, and request id.
- Rule-engine matches and final label.
- DeepSeek status: `used`, `not_triggered`, `no_api_key`, `disabled`, `timeout`, or `error`.
- Fallback marker: `rule_engine_only`.
- User id or plugin instance id when available.

Never log plaintext passwords, full access tokens, refresh tokens, `SECRET_ENCRYPTION_KEY`, or full DeepSeek API keys.

## Monitoring

Recommended application metrics:

- API response latency and error rate.
- Scan count by label: `safe`, `suspicious`, `malicious`.
- Rule-engine fallback count.
- DeepSeek call count, timeout count, error count, and latency.
- Plugin bootstrap and scan event count.

## Database

The runtime target database is PostgreSQL, and schema evolution is handled by Alembic. SQLite is allowed only as a lightweight CI/unit-test configuration and should not be described as the formal runtime database.

## DeepSeek Configuration

Administrators configure DeepSeek / Volcano Ark from the Web AI configuration page. Runtime detection uses the database configuration first; if no database API key is saved, it falls back to these environment variables:

```text
SECRET_ENCRYPTION_KEY=<fernet-key-for-production>
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_ENABLED=auto
DEEPSEEK_TIMEOUT_SECONDS=20
```

`DEEPSEEK_API_KEY` is intentionally empty in examples because the admin configuration page is the primary setup path. Use the environment key only as a fallback.

Status endpoint:

```text
GET /api/v1/ai/status
```

Admin test endpoint:

```text
POST /api/v1/ai/test
```

Admin configuration endpoints:

```text
GET    /api/v1/ai/config
PUT    /api/v1/ai/config
DELETE /api/v1/ai/config/key
POST   /api/v1/ai/config/test
```

If no database or fallback `.env` API key is configured, `/api/v1/ai/status` reports `configured=false` and detection continues through rule-engine fallback.

## Common Issues

### Backend startup fails

Check PostgreSQL availability, `DATABASE_URL`, port `8000`, dependency installation, and whether Alembic migrations have been applied.

### Frontend cannot call backend

Check backend health, `VITE_API_BASE_URL`, CORS allowlist, and browser console network errors.

### DeepSeek unavailable

Check `/api/v1/ai/status`, confirm whether the effective configuration source is `database` or `env`, verify the configured `base_url`, `model`, API key state, and timeout settings. Detection should continue with `score_breakdown.fallback=rule_engine_only`.

### Detection result looks inaccurate

Review matched rule signals, rule weights and thresholds, DeepSeek status, and whether semantic analysis was triggered. If DeepSeek was not used, the result is based on rule-engine evidence only.
