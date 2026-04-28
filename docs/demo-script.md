# WebGuard 10 分钟答辩演示脚本

版本：P2-M 答辩演示版

本文提供一条可复现的 10 分钟演示主线。演示目标是证明 WebGuard 已完成“Web 平台 + 后端检测 + 浏览器插件”的最小产品闭环，同时如实说明当前仍是本地内测 / 准部署前状态。

## 1. 演示准备

提前准备：

- PostgreSQL 已启动。
- `cd backend && alembic upgrade head` 已执行。
- backend 运行在 `http://127.0.0.1:8000`。
- frontend 运行在 `http://127.0.0.1:5173`。
- extension 已 `npm run build` 并在 Chrome/Edge 加载 unpacked。
- 已执行 `python -m app.scripts.seed_dev_user` 创建正式登录用户。
- 本地演示账号已创建：
  - 管理员：`admin` / `admin`
  - 普通用户：`guest` / `guest`

这些账号只用于本地演示和验收，不是生产默认账号。登录页不直接展示账号密码。

备用命令：

```powershell
.\scripts\smoke-local.ps1 -DryRun
.\scripts\smoke-local.ps1 -Username admin -Password "admin"
```

## 2. 10 分钟演示流程

### 0:00-1:00 项目定位

展示点：

- WebGuard 是恶意网站检测与预警平台。
- Web 平台是主产品面，浏览器插件是实时防护端，后端是权威检测和策略中心。
- 当前版本是本地可用内测版 / 准部署前状态，不是正式生产上线版。

### 1:00-2:00 正式登录

操作：

1. 打开 `http://127.0.0.1:5173/login`。
2. 使用本地演示用户登录，例如 `admin` / `admin` 或 `guest` / `guest`。
3. 进入 `/app` 工作区。

展示点：

- 已有正式账号密码登录。
- Refresh Token 使用 HttpOnly Cookie。
- Web access token 默认只在内存中保存。

### 2:00-3:30 插件绑定

操作：

1. 打开插件 Options。
2. 确认 API Base URL 和 Web App URL。
3. 点击 Start binding。
4. 打开 verification URL。
5. 在 Web 端确认 binding code。
6. 回到 Options 点击 Finish binding。

展示点：

- 插件不需要长期复制 Web token。
- 插件获得 plugin-scoped access/refresh token。
- token 与 `plugin_instance_id` 绑定。

### 3:30-4:30 Safe URL 放行

操作：

1. 打开 `https://example.com`。
2. 查看插件 Popup 或扫描状态。

展示点：

- safe URL 返回 `ALLOW`。
- 后端仍是最终检测权威。
- 扫描结果写入记录和报告。

### 4:30-5:30 Risky URL warning/block

操作：

1. 打开 `https://login-paypal-account-security.example-phish.com/verify/password`。
2. 展示 warning/block 行为。

展示点：

- 风险检测可触发 `WARN` 或 `BLOCK`。
- 插件 warning 页是轻量执行端。
- 风险结论和报告由后端生成。

### 5:30-6:30 记录和报告查看

操作：

1. 回到 Web 平台。
2. 打开扫描记录或报告详情。

展示点：

- 检测记录持久化。
- 报告包含风险等级、评分、摘要和命中原因。
- Web 平台承担复盘和管理入口。

### 6:30-7:30 策略闭环

操作：

1. 在 warning 页选择临时信任。
2. 或在 Web 策略页查看白名单/黑名单。
3. 重新 bootstrap 或再次访问。

展示点：

- 插件可缓存策略。
- 白名单/黑名单/临时信任本地预判。
- 策略最终仍以后端为准。

### 7:30-8:30 插件撤销

操作：

1. 在 Web 插件实例列表撤销当前插件。
2. 触发插件 bootstrap 或扫描。

展示点：

- revoked plugin instance 被后端拒绝。
- 插件需要重新绑定。
- 单插件撤销不影响 Web session。

### 8:30-9:30 工程化展示

展示：

- GitHub Actions CI。
- `python -m pytest`、`npm run lint/build`、`extension npm run build`。
- Alembic migration。
- Runbook、deployment checklist、extension release checklist、HTTP smoke 脚本。

### 9:30-10:00 风险边界和路线

说明：

- 尚未真实生产部署。
- HTTPS / reverse proxy / secret manager / official extension ID 仍待落地。
- 后续会补限流、审计、观测告警、RBAC、商店发布材料和模型增强。

## 3. 常见故障应对

- 登录失败：检查 seed 用户和密码。
- `/health` 响应含 `success`：旧 backend 进程占用 8000。
- binding confirm 打不开：检查 Options 的 Web App URL。
- token exchange 失败：检查 challenge 是否已确认或已过期。
- safe/risky 页面不触发：检查插件是否加载、auto detect 是否开启。
- WebGuard 自己页面被拦截：检查平台 host skip 逻辑和 Options URL。
- revoke 后仍可请求：检查 `X-Plugin-Instance-Id` 是否与 token claim 一致。

## 4. 答辩表述建议

推荐表述：

- “当前项目完成了本地内测版和准部署前工程基线。”
- “插件是实时执行端，Web 是主产品面，后端是可信决策中心。”
- “Web 平台已经切换到真实账号密码登录、注册、refresh/logout，正式登录和插件绑定已经建立基线。”
- “生产上线还需要 HTTPS、secret manager、正式 extension ID allowlist、隐私政策和商店材料。”

避免表述：

- “已经正式上线。”
- “已经通过浏览器商店审核。”
- “已经支持大规模真实用户。”
- “已经完成完整 RBAC 和生产运维体系。”
