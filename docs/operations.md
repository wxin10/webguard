# WebGuard Operations Notes

WebGuard 当前检测架构为规则引擎 + DeepSeek 大模型语义研判。规则引擎负责快速、可解释的基础风险识别；DeepSeek 负责在高风险条件触发时分析页面语义、诱导话术和潜在攻击意图。未配置 DeepSeek、DeepSeek 未触发、超时或异常时，系统自动退回规则引擎兜底。

## Logging

Backend logs should cover:

- API request path, method, status, latency, and request id.
- Rule-engine matches and final label.
- DeepSeek status: `used`, `not_triggered`, `no_api_key`, `disabled`, `timeout`, or `error`.
- Fallback marker: `rule_engine_only`.
- User id or plugin instance id when available.

Never log plaintext passwords, full access tokens, refresh tokens, or `DEEPSEEK_API_KEY`.

## Monitoring

Recommended application metrics:

- API response latency and error rate.
- Scan count by label: `safe`, `suspicious`, `malicious`.
- Rule-engine fallback count.
- DeepSeek call count, timeout count, error count, and latency.
- Plugin bootstrap and scan event count.

## DeepSeek Configuration

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_ENABLED=auto
DEEPSEEK_TIMEOUT_SECONDS=20
```

Status endpoint:

```text
GET /api/v1/ai/status
```

Admin test endpoint:

```text
POST /api/v1/ai/test
```

If `DEEPSEEK_API_KEY` is missing, `/api/v1/ai/status` reports `configured=false` and detection continues through rule-engine fallback.

## Common Issues

### Backend startup fails

Check PostgreSQL availability, `DATABASE_URL`, port `8000`, and dependency installation.

### Frontend cannot call backend

Check backend health, `VITE_API_BASE_URL`, CORS allowlist, and browser console network errors.

### DeepSeek unavailable

Check `/api/v1/ai/status`, confirm `DEEPSEEK_API_KEY` is configured, verify network access to `DEEPSEEK_BASE_URL`, and review timeout settings. Detection should continue with `score_breakdown.fallback=rule_engine_only`.

### Detection result looks inaccurate

Review matched rule signals, rule weights and thresholds, DeepSeek status, and whether semantic analysis was triggered. If DeepSeek was not used, the result is based on rule-engine evidence only.
