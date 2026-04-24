# WebGuard API Contract

**版本**：V1.0  
**适用对象**：backend、frontend、extension、Codex、测试脚本  
**文档目标**：定义 WebGuard 对外及三端协作的核心接口规范，降低“各写各的”概率。

---

# 1. 总则

## 1.1 适用范围

本文件适用于：

- Web 前端调用后端 API
- 浏览器插件调用后端 API
- 后端各模块设计响应结构时
- 后续联调与测试脚本编写时

## 1.2 核心原则

- HTTP 状态码要正确使用。
- JSON 响应体必须统一。
- 请求头、错误码、时间格式、分页结构要统一。
- 同一个业务概念不能在不同接口里使用不同命名。

---

# 2. 通用响应结构

所有业务接口都必须返回如下 JSON 包装结构：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

## 字段说明

### `code`
业务状态码。
- `0` 表示成功
- 非 `0` 表示失败

### `message`
对本次处理结果的简短描述。
要求：
- 可读
- 稳定
- 不夹杂技术栈内部细节

### `data`
业务数据体。
要求：
- 成功时返回对象或结构化数据
- 失败时可为 `null`
- 禁止无语义的混乱字段堆砌

---

# 3. HTTP 状态码约定

## 3.1 成功
- `200 OK`：读取、普通处理成功
- `201 Created`：资源创建成功
- `204 No Content`：删除成功且无需 body（如仍统一 body，则优先用 200）

## 3.2 客户端问题
- `400 Bad Request`：请求格式有误
- `401 Unauthorized`：未认证
- `403 Forbidden`：已认证但无权限
- `404 Not Found`：资源不存在
- `409 Conflict`：资源冲突
- `422 Unprocessable Entity`：参数通过基础格式检查，但业务处理失败
- `429 Too Many Requests`：限流触发

## 3.3 服务端问题
- `500 Internal Server Error`
- `502 Bad Gateway`
- `503 Service Unavailable`

---

# 4. 业务错误码约定

| code | 含义 | 说明 |
|---|---|---|
| 0 | success | 成功 |
| 40001 | invalid_request | 请求结构不合法 |
| 40002 | invalid_parameter | 参数校验失败 |
| 40101 | auth_required | 未认证或令牌无效 |
| 40102 | token_expired | 访问令牌过期 |
| 40301 | permission_denied | 无权访问该资源 |
| 40401 | resource_not_found | 目标资源不存在 |
| 40901 | resource_conflict | 创建或更新时出现冲突 |
| 42201 | business_validation_failed | 业务校验失败 |
| 42901 | rate_limited | 请求过于频繁 |
| 50001 | internal_error | 服务内部错误 |
| 50301 | upstream_unavailable | 上游依赖不可用 |

---

# 5. 通用请求规范

## 5.1 请求头

### Web 常规请求头
```http
Authorization: Bearer <access_token>
Content-Type: application/json
X-Request-Id: <uuid>
```

### 插件常规请求头
```http
Authorization: Bearer <access_token>
Content-Type: application/json
X-Request-Id: <uuid>
X-Plugin-Instance-Id: <plugin_instance_id>
X-Plugin-Version: 1.0.0
```

## 5.2 命名规范

- JSON 字段统一使用 `snake_case`
- 数据库与后端 schema 可保持一致
- 前端若需要 camelCase，只能在前端适配层转换，不能把后端接口命名搞乱

## 5.3 时间规范

所有时间字段统一：
- ISO 8601
- UTC
- 示例：`2026-04-23T10:15:20Z`

## 5.4 分页规范

列表接口使用：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total": 125,
      "total_pages": 7
    }
  }
}
```

禁止：
- 顶层直接返回数组
- 每个接口分页字段乱命名

---

# 6. 核心接口一：URL 风险检测

## 6.1 接口说明

用于插件或 Web 发起 URL 风险检测。
当前仓库中相关能力可能分散在 `/api/v1/scan/url`、插件分析接口等路径中。后续统一收敛时，应优先向本契约靠拢。

## 6.2 Method
`POST`

## 6.3 Path
`/api/v1/security/scan`

> 兼容说明：如果当前仓库暂时仍使用 `/api/v1/scan/url`，允许阶段性兼容；但新文档、新客户端调用与新代码应以统一路径为目标。

## 6.4 Request Headers

```http
Authorization: Bearer <access_token>
Content-Type: application/json
X-Request-Id: 6d8e3c0f-bb55-4c8a-8c42-1ad6f5d3a1e2
X-Plugin-Instance-Id: plugin_123456
X-Plugin-Version: 1.0.0
```

## 6.5 Request Body

```json
{
  "url": "https://example-risk-site.com/login",
  "page_title": "Secure Bank Login",
  "referrer": "https://search.example.com",
  "client_timestamp": "2026-04-23T10:15:20Z",
  "context": {
    "tab_id": 123,
    "top_level_domain": "example-risk-site.com"
  }
}
```

## 6.6 字段约束

- `url`：必填，完整 URL，必须经过严格格式校验
- `page_title`：可选，最大 256 字符
- `referrer`：可选
- `client_timestamp`：可选，建议传入
- `context`：可选，供未来扩展

## 6.7 成功响应

```json
{
  "code": 0,
  "message": "scan completed",
  "data": {
    "scan_id": "scan_9f8d2c3e",
    "report_id": "rpt_a7b92ef1",
    "url": "https://example-risk-site.com/login",
    "domain": "example-risk-site.com",
    "risk_level": "MALICIOUS",
    "risk_score": 92,
    "action": "BLOCK",
    "should_warn": true,
    "should_block": true,
    "reason_summary": [
      "domain matches phishing heuristics",
      "suspicious login form detected"
    ],
    "user_message": "检测到该网站存在较高风险，已为你拦截访问。",
    "expires_in_seconds": 300,
    "created_at": "2026-04-23T10:15:21Z"
  }
}
```

## 6.8 失败示例：参数错误

```json
{
  "code": 40002,
  "message": "invalid url format",
  "data": null
}
```

## 6.9 失败示例：未认证

```json
{
  "code": 40101,
  "message": "authentication required",
  "data": null
}
```

---

# 7. 核心接口二：创建用户域名信任规则

## 7.1 接口说明

用户从 Web 或插件 warning 页面把某个域名加入个人信任列表。

## 7.2 Method
`POST`

## 7.3 Path
`/api/v1/user/domain-trust-rules`

> 兼容说明：当前仓库可能已有 `user_strategy`、`whitelist`、`my domains` 等接口形态。后续应收敛为更清晰的统一领域模型。

## 7.4 Request Headers

```http
Authorization: Bearer <access_token>
Content-Type: application/json
X-Request-Id: a8f7dd65-57a1-4375-b69b-6bd31f702efe
```

## 7.5 Request Body

```json
{
  "domain": "example-risk-site.com",
  "trust_type": "PERMANENT",
  "source": "plugin_warning_page",
  "reason": "user confirmed this domain is trusted"
}
```

## 7.6 字段约束

- `domain`：必填，必须是域名，不允许传完整 URL
- `trust_type`：枚举：`TEMPORARY` / `PERMANENT`
- `source`：操作来源，用于审计
- `reason`：可选，最长 256

## 7.7 成功响应

```json
{
  "code": 0,
  "message": "domain trust rule created",
  "data": {
    "rule_id": "rule_12ac90de",
    "domain": "example-risk-site.com",
    "trust_type": "PERMANENT",
    "status": "ACTIVE",
    "created_at": "2026-04-23T10:18:00Z"
  }
}
```

## 7.8 冲突响应

```json
{
  "code": 40901,
  "message": "domain rule already exists",
  "data": null
}
```

---

# 8. 核心接口三：获取报告详情

## 8.1 Method
`GET`

## 8.2 Path
`/api/v1/reports/{report_id}`

## 8.3 Request Headers

```http
Authorization: Bearer <access_token>
X-Request-Id: 66b963dd-070d-4b7d-9f65-b8f5bb81a142
```

## 8.4 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "report_id": "rpt_a7b92ef1",
    "scan_id": "scan_9f8d2c3e",
    "url": "https://example-risk-site.com/login",
    "domain": "example-risk-site.com",
    "risk_level": "MALICIOUS",
    "risk_score": 92,
    "summary": "该站点疑似仿冒登录站点，建议立即停止访问。",
    "rule_hits": [
      {
        "rule_key": "suspicious_domain_pattern",
        "severity": "high",
        "message": "域名特征命中钓鱼规则"
      }
    ],
    "model_result": {
      "model_name": "text_classifier",
      "version": "v1",
      "label": "phishing",
      "confidence": 0.94
    },
    "user_policy_state": {
      "is_whitelisted": false,
      "is_blacklisted": false,
      "is_temporarily_trusted": false
    },
    "created_at": "2026-04-23T10:15:21Z"
  }
}
```

---

# 9. 核心接口四：插件 Bootstrap / 配置拉取

## 9.1 说明

插件启动时需要拉取一份轻量配置快照，避免散乱接口多次拼装。

## 9.2 Method
`GET`

## 9.3 Path
`/api/v1/plugin/bootstrap`

## 9.4 响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "plugin_instance_id": "plugin_123456",
    "user": {
      "user_id": "usr_001",
      "role": "user"
    },
    "settings": {
      "auto_scan_enabled": true,
      "auto_block_malicious": true,
      "warn_on_suspicious": true,
      "cache_ttl_seconds": 300
    },
    "policy_snapshot": {
      "trusted_domains": ["example.com"],
      "blocked_domains": ["known-malicious.com"]
    },
    "web_entry": {
      "report_latest_url": "http://127.0.0.1:5173/app/report/latest"
    },
    "config_version": "2026-04-23T10:20:00Z"
  }
}
```

---

# 10. 统一错误响应策略

后端必须保证错误输出结构稳定。

## 示例：403

```json
{
  "code": 40301,
  "message": "permission denied",
  "data": null
}
```

## 示例：500

```json
{
  "code": 50001,
  "message": "internal server error",
  "data": null
}
```

注意：
- 不返回 Python 栈追踪
- 不把内部 SQL 或异常细节泄露给客户端

---

# 11. 兼容策略

由于当前仓库已有现成 API 路径，统一 API 契约时允许存在短期兼容层，但必须遵守：

1. 新客户端代码优先调用新契约路径；
2. 旧路径需要有明确下线计划；
3. 兼容层不能无限扩张；
4. 文档必须标记哪些路径是目标路径，哪些是兼容路径。

---

# 12. 测试与联调要求

## 前端
- 所有调用必须经过统一 API service 层
- 严格匹配 `code/message/data`

## 插件
- 请求头必须包含插件实例标识与版本号
- 对 401、429、500 做明确处理

## 后端
- 参数校验测试
- 权限校验测试
- 核心链路集成测试
- 响应结构测试

这份 API Contract 是三端协同的基础文档。
