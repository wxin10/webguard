# WebGuard

WebGuard 是一个以 Web 平台为核心、以浏览器插件为辅助入口的恶意网站检测与主动防御系统。

主产品是 Web 平台：普通用户在 Web 中提交网址、查看报告、维护个人安全策略；管理员在 Web 运营控制台处理样本、规则、名单、模型、插件版本和用户。浏览器插件只承担当前网页快速扫描、即时提醒、必要拦截和打开 Web 报告的轻量职责。

## 当前本地开发方案

- Backend: Python 3.14 + FastAPI + SQLAlchemy
- Database: 本机 MySQL
- Frontend: React + TypeScript + Vite
- Extension: Chrome/Edge Manifest V3 + TypeScript

本地开发数据库固定为：

```text
host: 127.0.0.1
port: 3306
database: webguard
username: admin
password: adminadmin
```

默认连接串：

```text
mysql+pymysql://admin:adminadmin@127.0.0.1:3306/webguard?charset=utf8mb4
```

如果本机尚未创建数据库，可执行：

```sql
CREATE DATABASE IF NOT EXISTS webguard
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

同样的 SQL 放在 `backend/scripts/init_mysql.sql`。

## 启动

### Backend

```bash
cd backend
py -3.14 -m pip install -r requirements.txt
py -3.14 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端以 Python 3.14 为目标运行环境。没有 `backend/.env` 时，默认使用本地 MySQL 配置。

### Frontend

```bash
cd frontend
npm install
npm run dev
```

默认 API 地址：`http://127.0.0.1:8000`

### Extension

```bash
cd extension
npm install
npm run build
```

在 Chrome / Edge 扩展管理页开启开发者模式，加载 `extension` 目录。插件默认 API 地址为 `http://127.0.0.1:8000`，默认 Web 平台地址为 `http://127.0.0.1:5173`。

## 产品结构

### Web 主平台

- 产品首页与登录入口。
- 普通用户工作台：网址检测、我的报告、最近报告、个人信任站点 / 阻止站点、插件同步记录、账户设置。
- 管理员运营控制台：全局统计、风险趋势、全部报告、样本与误报处理、规则管理、全局黑白名单、模型状态、插件管理、用户管理。

### 浏览器插件

- 读取当前网址风险状态。
- 快速扫描当前网页并同步到 Web 平台。
- 提供即时风险提示和恶意页面 warning 拦截。
- 一键打开 Web 平台详细报告。
- 支持当前站点加入信任列表或临时忽略。

插件不承担完整用户管理、复杂报表、运营后台或完整分析流程。

## Development-only 登录

当前前端保留 `POST /api/v1/auth/mock-login` 作为 development-only 登录入口，用于本地开发时切换 admin / user 权限视图。该接口不是正式鉴权方案，后续应替换为真实用户体系、token/session 管理和后端权限校验。

## 后续正式上线还需要补齐

- 真实用户、密码、会话、权限校验和审计日志。
- 用户个人策略与全局策略的权限边界和数据隔离。
- 误报处理工单、样本标注、模型迭代和发布流程。
- 插件发布签名、版本更新和权限最小化审查。
- 生产级 CORS、日志、监控、告警和密钥管理。
