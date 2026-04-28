# WebGuard Roadmap

版本：P2-M 后续路线图

本文记录 WebGuard 从当前本地内测 / 准部署前状态走向生产可发布版本的阶段计划。

## 1. 已完成阶段

### P0 运行基线

- PostgreSQL 默认口径收敛。
- backend 可启动。
- frontend lint/build 和 extension build 可用。
- Alembic baseline 建立。
- API 响应统一为 `code/message/data`。
- JWT access-token 骨架建立。
- mock-login 冻结为开发专用。

### P1 产品闭环

- 插件扫描 -> 后端检测 -> 数据库 -> 前端查看闭环。
- 策略同步、白名单、黑名单、临时信任、永久信任闭环。
- 插件 Options 连接配置。
- 真实浏览器 smoke test。

### P2 发布前工程收口

- 正式 Web 登录。
- Web Refresh Token。
- seed 用户脚本。
- 插件正式绑定。
- 插件 token refresh。
- 插件实例 revoke。
- Web access token localStorage 生产隔离。
- 生产环境模板分层。
- extension release checklist。
- production runbook。
- demo acceptance。
- HTTP smoke 脚本。

## 2. 上线前阻塞项

### P0 必须完成

- P3-A：真实生产部署。
- P3-B：生产 HTTPS、reverse proxy、精确 CORS、正式 extension ID allowlist。
- secret manager 接入。
- 公开隐私政策发布。
- 生产 API origin 进入 release-specific extension package。
- 生产数据库备份和 migration 流程。

### P1 建议发布前完成

- P3-C：限流和审计日志。
- 生产插件 console URL 日志脱敏或关闭。
- 手动 token fallback 在生产 UI 中隐藏或明确标记。
- 管理员插件实例管理 UX 增强。
- 关键安全事件审计。

### P2 可后续增强

- 二维码绑定 UI。
- 商店截图、说明文案、支持链接。
- 更完整设备管理。
- 规则批量导入。

## 3. 后续阶段规划

### P3-A 生产部署

目标：

- 明确生产运行拓扑。
- 配置 HTTPS frontend。
- 配置 HTTPS API 或可信 reverse proxy。
- 建立真实环境变量注入流程。

交付：

- 部署文档。
- 环境配置审查。
- 生产启动和回滚说明。

### P3-B CORS 与 Extension ID allowlist

目标：

- 使用正式 Web origin。
- 使用正式 API origin。
- 使用浏览器商店发布后的 extension ID。
- 后端 CORS 精确 allowlist。

交付：

- 生产 `CORS_ORIGINS`。
- extension release package 配置。
- 真实浏览器验证记录。

### P3-C 限流和审计日志

目标：

- 对 login、refresh、binding confirm、plugin token refresh 做限流。
- 记录关键安全事件。
- 便于后续风控和排障。

交付：

- 限流策略。
- 审计事件模型。
- 管理或查询入口。

### P3-D 管理后台权限

目标：

- 从最小 role 扩展到更细的权限模型。
- 管理员能力分级。
- 用户、插件、策略、报告操作权限收口。

交付：

- 权限矩阵。
- 后端依赖和测试。
- 前端菜单和页面 guard。

### P3-E 商店发布材料

目标：

- 完成隐私政策。
- 完成权限说明。
- 完成截图、描述、支持链接。
- 完成 store package review。

交付：

- Chrome/Edge 发布资料。
- extension release checklist 全部关闭。

### P3-F 模型检测能力增强

目标：

- 增强特征提取。
- 增强规则和模型融合。
- 引入样本反馈闭环。
- 支持更可解释的风险报告。

交付：

- 新规则或模型版本。
- 样本评估报告。
- 误报/漏报反馈处理流程。

### P3-G 观测与告警

目标：

- 结构化日志。
- 关键指标。
- 错误告警。
- 插件/后端链路追踪。

交付：

- Dashboard。
- Alert rules。
- Runbook incident section。

## 4. 路线总结

下一阶段不应继续堆叠新功能，而应优先补齐生产基础设施、安全运营和发布合规。功能增强应建立在可部署、可观测、可回滚的基础上。
