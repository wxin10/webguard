# WebGuard Frontend

WebGuard 前端是比赛展示用的 Web 管理台，包含管理员和普通用户两种演示角色。

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

## 演示角色

- 管理员：admin，可访问 Dashboard、全部记录、规则管理、黑白名单、模型状态、插件状态、统计分析、用户管理、完整报告页。
- 普通用户：user，可访问首页、单网址检测、我的记录、最近报告、插件使用说明、简化报告页。

登录页使用 mock 登录，不需要真实密码。登录后身份保存在浏览器 localStorage，可在顶部使用“演示模式角色切换”快速切换。
