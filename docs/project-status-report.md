# WebGuard 项目状态报告

版本：P2-M 本地内测 / 准部署前状态

本文用于申报、验收、路演和答辩前的项目完成度盘点。内容只描述当前仓库已经实现并验证过的能力，不把本地内测版描述为正式生产上线版。

## 1. 当前状态摘要

WebGuard 当前已经达到“本地可用内测版 / 准部署前状态”：

- Web 平台、FastAPI 后端、Manifest V3 浏览器插件三端已形成闭环。
- 本地 PostgreSQL、Alembic baseline、正式登录、Refresh Token、插件绑定、策略同步、报告记录、CI、Runbook 和 smoke 脚本均已建立。
- 真实浏览器插件 smoke test 已验证核心路径可用。
- 项目尚未完成真实生产部署、正式 extension ID allowlist、secret manager、公开隐私政策、生产反向代理和商店发布材料。

## 2. 完成度判断

当前版本适合：

- 本地答辩演示。
- 内测环境验证。
- 准生产部署前评审。
- 后续生产部署和安全硬化的基础版本。

当前版本不适合直接宣称：

- 已生产上线。
- 已完成浏览器商店发布。
- 已具备大规模真实用户运营能力。
- 已完成企业级 RBAC、限流、审计、观测告警和 secret manager 接入。

## 3. 三端模块完成情况

### Web 平台

已完成：

- 正式账号密码登录。
- Refresh Token 通过 HttpOnly Cookie 恢复登录态。
- Web access token 默认内存存储。
- 记录、报告、策略、插件实例相关页面和 service 基线。
- 插件绑定确认页。

仍有限制：

- 注册、找回密码、完整账号体系未实现。
- RBAC 仍是最小角色模型。
- 插件设备管理 UI 仍是最小版。

### 后端 API

已完成：

- FastAPI + SQLAlchemy + Alembic + PostgreSQL 目标口径。
- API 响应统一为 `code/message/data`。
- 核心检测、报告持久化、记录查询。
- 正式 Web 登录、Refresh Token 轮换、logout、`/me`。
- 插件 binding challenge、确认、token exchange、plugin refresh、revoke、unbind。
- 插件 bootstrap、策略同步、临时信任、永久信任。
- 生产启动安全 guardrails。

仍有限制：

- 限流、完整审计日志、生产观测告警未完整实现。
- Redis 仍是目标能力，尚未接入。
- 生产部署配置仍是草案。

### 浏览器插件

已完成：

- Manifest V3。
- background service worker 编排扫描。
- Options 配置 API/Web URL、插件实例、绑定流程。
- Popup 展示保护状态、token 状态、bootstrap 状态、最近检测摘要。
- Warning 页支持提示、阻断、临时信任、永久信任。
- 插件专用 token 与 `plugin_instance_id` 绑定。
- revoked 插件实例再次请求会被拒绝。

仍有限制：

- 尚未发布到浏览器商店。
- 正式 extension ID / origin allowlist 尚未落地。
- 手动 token fallback 仍保留为开发兼容路径，生产隐藏或弱化待做。
- 生产构建中的完整 URL console 诊断仍需脱敏或关闭。

## 4. 已验证能力

当前可演示能力：

- 正式账号登录。
- 插件绑定。
- safe URL 放行。
- risky URL warning/block。
- 扫描记录和报告查看。
- 白名单、黑名单、临时信任、永久信任策略闭环。
- 插件实例撤销。
- revoked plugin token 失效。
- CI 三端检查。
- 本地 HTTP smoke 脚本验证后端和插件绑定主链路。

## 5. 验收结果

当前基线验证命令：

```text
backend:   python -m pytest        -> 39 passed
frontend:  npm run lint/build      -> passed
extension: npm run build           -> passed
git:       git diff --check        -> passed
```

辅助材料已建立：

- `docs/deployment-checklist.md`
- `docs/extension-release-checklist.md`
- `docs/production-runbook.md`
- `docs/demo-acceptance.md`
- `scripts/smoke-local.ps1`

## 6. 风险边界

P0 生产阻塞项：

- HTTPS / reverse proxy 未真实落地。
- secret manager 未真实接入。
- 正式 extension ID / origin allowlist 未落地。
- 公开隐私政策未发布。
- 生产 API origin 尚未进入 release-specific extension package。

P1 发布前应处理：

- 手动 token fallback 生产隐藏或明确标记。
- 生产插件 console URL 诊断脱敏。
- 限流、审计日志、设备管理 UI、权限模型继续增强。

P2 后续增强：

- 二维码绑定 UI。
- Redis 缓存和限流。
- 模型检测能力增强。
- 观测和告警。

## 7. 结论

WebGuard 已经不是单点 demo，而是具备三端闭环、鉴权基线、插件绑定、策略同步、风险报告和工程化验证的本地内测版。下一阶段重点应从“功能闭环”转向“真实生产环境、发布合规、安全审计和运维保障”。
