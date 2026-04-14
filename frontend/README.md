# WebGuard Frontend

WebGuard 前端是产品主入口，不再把浏览器插件作为主流程承载方。

## 页面结构

- 公共入口：`/welcome`、`/login`、`/plugin-install`
- 普通用户：用户工作台、网址检测、我的报告、最近报告、我的安全策略、插件同步记录、账户设置
- 管理员：运营总览、全部报告、样本与误报、规则管理、全局名单、模型状态、插件管理、风险统计、用户管理

## 启动

```bash
cd frontend
npm install
npm run dev
```

默认 API 地址：

```text
http://127.0.0.1:8000
```

如需修改，编辑 `frontend/.env` 中的 `VITE_API_BASE_URL`。

## Development-only 登录

当前登录页调用 `POST /api/v1/auth/mock-login`。这是 development-only 入口，用于本地开发时切换 admin / user 权限视图；后续正式上线应替换为真实鉴权、会话管理和后端权限校验。
