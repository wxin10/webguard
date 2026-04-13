# WebGuard Frontend

WebGuard 前端是 Web 控制台，包含 admin / user 两类权限视图。

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

## 本地开发登录

当前登录页调用 `POST /api/v1/auth/mock-login`。这是 development-only 入口，用于本地开发时切换 admin / user 权限视图；后续正式上线应替换为真实鉴权。

- admin：Dashboard、全部记录、规则管理、黑白名单、模型状态、插件状态、统计分析、用户管理、报告页。
- user：首页、单网址检测、我的记录、最近报告、插件使用说明、报告页。
