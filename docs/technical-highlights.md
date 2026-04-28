# WebGuard 技术亮点

版本：P2-M 答辩材料版

本文用于整理 WebGuard 当前版本的架构、安全和工程化亮点，便于申报书、验收材料和答辩讲解。

## 1. 架构亮点

### Web 为主，插件为辅

WebGuard 没有把浏览器插件做成孤立主产品，而是采用：

- Web 平台：用户登录、报告查看、策略管理、插件绑定、记录复盘。
- 浏览器插件：实时 URL 捕获、轻量预判、warning/block 展示、用户即时操作。
- 后端 API：检测、策略、报告、鉴权、插件绑定和持久化的唯一可信边界。

这种结构让插件保持轻量，也避免把复杂业务逻辑散落到浏览器端。

### 后端权威检测 + 插件本地策略缓存

插件会缓存：

- whitelist domains。
- blacklist domains。
- temporary trusted domains。
- policy/config version。
- updated_at / syncedAt。

插件可在本地快速判断白名单、黑名单和临时信任，但风险检测和策略真相仍由后端维护。

### 统一 API 响应契约

所有产品 API 收口到：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

收益：

- 前端和插件只需要按 `code === 0` 判断成功。
- 错误响应结构稳定。
- HTTP status 与业务 code 分层清晰。

### 插件绑定闭环

插件绑定流程包括：

- 插件生成或持久化 `plugin_instance_id`。
- 后端创建短期 binding challenge。
- Web 登录用户确认 binding code。
- 插件 exchange 获取 plugin-scoped token。
- 后续请求携带 `Authorization` 和 `X-Plugin-Instance-Id`。
- Web 用户可撤销插件实例。

这比长期复制 Web token 更接近生产安全边界。

## 2. 安全亮点

### mock-login 开发态隔离

`mock-login` 保留为本地开发能力，但被配置闸门隔离：

- `DEBUG=true` 且 `ENABLE_DEV_AUTH=true` 时可用。
- 生产模式默认不可用。
- 不能作为生产主链路扩展。

### Web token 存储隔离

Web access token 默认只保存在内存中。页面刷新后通过 HttpOnly refresh cookie 调用 refresh 恢复登录态。

localStorage 镜像仅在开发兼容开关开启时写入，用于手动 token fallback。

### Refresh Token 安全基线

Web Refresh Token：

- 使用 HttpOnly Cookie。
- 服务端只存 hash。
- refresh 时轮换。
- logout 时撤销当前 session。

插件 Refresh Token：

- 只存 hash。
- 与 plugin instance 绑定。
- refresh 时轮换。
- revoke plugin instance 后失效。

### 插件 token 与实例绑定

插件 access token 包含 plugin scope 和 `plugin_instance_id`。后端会校验：

- token 中的实例 ID。
- 请求头 `X-Plugin-Instance-Id`。
- 数据库中插件实例状态。

如果插件实例被撤销，请求会被拒绝。

### 生产配置安全闸门

当 `DEBUG=false` 时，后端拒绝不安全组合：

- `ENABLE_DEV_AUTH=true`。
- placeholder 或过短 `JWT_SECRET`。
- `REFRESH_TOKEN_COOKIE_SECURE=false`。
- wildcard CORS。
- `ENABLE_RUNTIME_SCHEMA_GUARD=true`。

## 3. 工程化亮点

### PostgreSQL + Alembic baseline

项目数据库口径已收敛到 PostgreSQL，schema 演进由 Alembic 管理，不再把 runtime create_all 当生产路径。

### 三端 CI

GitHub Actions 基线覆盖：

- backend pytest。
- frontend lint/build。
- extension build。

当前本地验证基线为 backend `39 passed`，frontend lint/build 通过，extension build 通过。

### 发布前文档体系

已建立：

- `docs/deployment-checklist.md`
- `docs/extension-release-checklist.md`
- `docs/production-runbook.md`
- `docs/demo-acceptance.md`
- `scripts/smoke-local.ps1`

这让项目从“能跑”推进到“能交接、能验收、能复核”。

### HTTP smoke 脚本

`scripts/smoke-local.ps1` 可验证：

- health。
- formal login。
- refresh。
- plugin binding。
- bootstrap。
- safe/risky scan。
- plugin instance list。
- revoke。
- revoked token rejection。

脚本不会打印 token 或 binding code 全量值。

## 4. 与普通 demo 的差异

WebGuard 当前版本不是单页演示或纯前端 demo：

- 有真实后端 API。
- 有数据库持久化。
- 有 migration baseline。
- 有正式登录和 refresh。
- 有插件绑定和撤销。
- 有三端构建和测试。
- 有发布前安全边界说明。
- 有 Runbook 和 smoke 脚本。

更准确的定位是：已经完成核心产品闭环的本地内测版，正在向可部署版本收口。
