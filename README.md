# WebGuard

WebGuard 是一个基于浏览器插件与 Web 后台联动的恶意网站检测与主动防御系统。项目由 FastAPI 后端、React Web 控制台、Chrome/Edge 浏览器插件组成。

## 当前本地开发方案

- Backend：Python 3.14 + FastAPI + SQLAlchemy
- Database：本机 MySQL
- Frontend：React + TypeScript + Vite
- Extension：Chrome Manifest V3 + TypeScript

本地开发数据库固定为：

```text
host: 127.0.0.1
port: 3306
database: webguard
username: admin
password: adminadmin
```

后端默认连接串：

```text
mysql+pymysql://admin:adminadmin@127.0.0.1:3306/webguard?charset=utf8mb4
```

如果本机尚未创建数据库，可在 MySQL 中执行：

```sql
CREATE DATABASE IF NOT EXISTS webguard
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

同样的 SQL 也放在 `backend/scripts/init_mysql.sql` 中。

## 启动

### Backend

```bash
cd backend
python --version
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端以 Python 3.14 为目标运行环境，依赖栈已升级到 FastAPI 0.135.3、Pydantic 2.12.5、SQLAlchemy 2.0.49、Alembic 1.18.4、Uvicorn 0.44.0 和 PyMySQL 1.1.2。后端会读取 `backend/.env`。没有 `.env` 时，默认使用本地 MySQL 配置。

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

在 Chrome / Edge 扩展管理页开启开发者模式，加载 `extension` 目录。插件默认 API 地址为 `http://127.0.0.1:8000`。

## 主要能力

- 插件采集当前网页 URL、标题、可见文本、按钮、输入标签、表单 action、密码框等特征。
- 后端保留 `FeatureExtractor -> RuleEngine -> ModelService -> Detector` 检测主流程。
- Web 控制台展示检测记录、规则、黑白名单、模型状态、插件状态、统计和报告详情。
- 插件 popup 支持手动扫描，warning 页面支持恶意网站拦截和报告跳转。

## Development-only 登录

当前前端保留 `POST /api/v1/auth/mock-login` 作为 development-only 登录入口，用于本地开发时切换 admin / user 权限视图。该接口不是正式鉴权方案，后续应替换为真实用户体系、token/session 管理和后端权限校验。

## 后续正式上线还需要补齐

- 真实用户、密码、会话、权限校验和审计日志。
- 数据库迁移版本化流程和生产初始化流程。
- 插件发布签名、版本更新和权限最小化审查。
- 模型训练、模型版本发布、评估集和灰度策略。
- 生产级 CORS、日志、监控、告警和密钥管理。
