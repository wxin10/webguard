# WebGuard Backend

Runtime target: Python 3.14.

FastAPI 后端负责恶意网站检测、历史记录、规则、黑白名单、模型状态、统计分析、插件联动和结构化报告接口。

## 本地数据库

本地开发默认使用 MySQL，不再使用 SQLite 作为正式默认方案。

```text
DATABASE_URL=mysql+pymysql://admin:adminadmin@127.0.0.1:3306/webguard?charset=utf8mb4
```

如需创建数据库：

```bash
mysql -u admin -padminadmin -h 127.0.0.1 -P 3306 < scripts/init_mysql.sql
```

也可以手动执行：

```sql
CREATE DATABASE IF NOT EXISTS webguard
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

## 启动

```bash
cd backend
python --version
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The current local dependency stack is FastAPI 0.135.3, Pydantic 2.12.5, pydantic-core 2.41.5, pydantic-settings 2.13.1, SQLAlchemy 2.0.49, Alembic 1.18.4, Uvicorn 0.44.0, python-dotenv 1.2.2, and PyMySQL 1.1.2.

## 配置

`backend/.env.example` 提供本地 MySQL 示例。复制为 `backend/.env` 后可按需调整。也可以不创建 `.env`，代码默认会组装同一条本地 MySQL 连接串。

## 认证接口

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

WebGuard 认证只走真实账号密码登录、真实注册、refresh/logout。旧的开发登录入口已移除。

## 主要接口

- `POST /api/v1/scan/url`
- `POST /api/v1/plugin/analyze-current`
- `GET /api/v1/records`
- `GET /api/v1/records/me`
- `GET /api/v1/reports/latest`
- `GET /api/v1/reports/{id}`
- `GET /api/v1/model/status`
- `GET /api/v1/stats/overview`

## 检测主流程

项目保留现有检测主链路：

`FeatureExtractor -> RuleEngine -> ModelService -> Detector`

真实模型依赖不可用时，`ModelService` 会回退到 fallback 模型，保证本地开发链路可运行。
