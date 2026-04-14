# WebGuard Frontend

WebGuard 前端是正式 Web 主平台，不再把浏览器插件或后台页面放在主流程中心。`/` 是产品首页，登录后进入 `/app`，普通用户和管理员在同一个 Web 工作区中按角色看到不同的菜单和页面。

## 页面结构

- 公共入口：`/`、`/login`、`/plugin-install`
- 普通用户：`/app`、`/app/scan`、`/app/my-records`、`/app/my-domains`、`/app/plugin-sync`、`/app/report/latest`、`/app/account`
- 管理员：`/app/admin/records`、`/app/admin/samples`、`/app/admin/rules`、`/app/admin/domains`、`/app/admin/model`、`/app/admin/stats`、`/app/admin/plugin`、`/app/admin/users`
- 共用报告：`/app/reports/:id`

普通用户围绕检测、报告、个人策略和插件同步记录开展日常使用；管理员围绕运营态势、样本与误报、规则、名单、模型、插件和用户开展平台治理。

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

当前登录页调用 `POST /api/v1/auth/mock-login`。这是本地开发入口，用于检查 admin / user 两类工作区；后续正式上线应替换为真实鉴权、会话管理和后端权限校验。开发阶段的角色切换入口已收进账户设置页，不再作为主界面流程。
