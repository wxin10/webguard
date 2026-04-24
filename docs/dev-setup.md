# WebGuard 开发环境与启动说明

**版本**：V1.0  
**目标读者**：开发者、Codex、联调人员、测试人员  
**文档目标**：让人和自动代理都能明确知道当前仓库如何启动、如何检查、如何识别配置漂移。

---

# 1. 仓库结构

```text
.
├─ frontend/
├─ backend/
├─ extension/
├─ docs/
├─ docker-compose.yml
├─ .env.example
└─ AGENTS.md
```

---

# 2. 环境基线

## 2.1 推荐版本

### 通用
- Git 最新稳定版
- Node.js 20.x LTS
- npm 10.x
- Python 3.11+ 或团队约定版本
- Docker / Docker Compose（若使用容器启动）

### 浏览器
- Chrome 最新稳定版 或 Edge 最新稳定版
- 需支持 Manifest V3

## 2.2 版本管理建议

建议使用：
- `.nvmrc` 管理 Node 版本
- `pyenv` 或 `uv`/虚拟环境管理 Python 版本

如果当前仓库没有这些文件，后续可以补，但不要在未确认团队策略时随意引入多个并存方案。

---

# 3. 当前配置口径说明

当前仓库已经将默认数据库口径收敛到 PostgreSQL：

- 根 `.env.example`、`backend/.env.example` 与 `docker-compose.yml` 默认都使用 PostgreSQL
- 本地直跑与容器启动都应优先按 PostgreSQL 配置执行

## 本文采取的策略

- **容器启动口径**：以 `docker-compose.yml` 为准，默认 PostgreSQL
- **本地直跑口径**：以 `backend/.env` 或后端配置默认值为准，默认 PostgreSQL

在 Codex 执行任务时，如果任务涉及数据库配置，不应继续扩大该漂移。

---

# 4. 后端开发环境

# 4.1 安装依赖

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows PowerShell：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

# 4.2 当前依赖（仓库已存在）

已观察到主要依赖：
- fastapi
- uvicorn
- sqlalchemy
- alembic
- pydantic
- pydantic-settings
- python-dotenv
- psycopg

## 推荐补充（若进入更完整生产化阶段）
- pytest
- httpx
- redis client
- passlib / argon2
- asyncpg（若后续引入异步 PostgreSQL 驱动）

---

# 4.3 配置文件

## 当前已存在
- `backend/.env.example`
- 根目录 `.env.example`

## 建议
- 后端最终应以 `backend/.env` 为主
- 根目录 `.env.example` 用于全栈联调提示

### 关键变量示例（目标口径）

```env
APP_NAME=WebGuard
APP_VERSION=1.0.0
DEBUG=true

DATABASE_URL=postgresql://webguard:webguard@127.0.0.1:5432/webguard
REDIS_URL=redis://127.0.0.1:6379/0

BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
LOG_LEVEL=INFO
CORS_ORIGINS=http://127.0.0.1:5173,chrome-extension://__EXTENSION_ID__

MODEL_DIR=./models
MODEL_NAME=text_classifier
JWT_SECRET=replace_me
JWT_ACCESS_TOKEN_EXPIRES_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRES_DAYS=7
```

---

# 4.4 数据库准备

## 路线 A：用 Docker Compose（推荐）

在仓库根目录：

```bash
docker compose up -d db
```

当前 `docker-compose.yml` 中数据库服务为 PostgreSQL 15。

## 路线 B：本地直连已初始化的 PostgreSQL

如果你不使用 Docker Compose，也可以直接连接本机 PostgreSQL：

```env
DATABASE_URL=postgresql://webguard:webguard@127.0.0.1:5432/webguard
```

默认开发配置就是这一路径。

---

# 4.5 数据库迁移

当前仓库已有 Alembic。

```bash
cd backend
alembic upgrade head
```

当前分支还没有提交 `alembic/versions/` 下的版本脚本，因此 `alembic upgrade head` 目前主要用于验证迁移链路和数据库连通性；本地开发阶段的基础表会在后端启动时由应用启动逻辑补齐。

如果需要创建新迁移：

```bash
alembic revision --autogenerate -m "describe_change"
alembic upgrade head
```

## 规则
- 禁止只改模型不出迁移
- 禁止手工改生产结构却不落迁移文件
- 迁移必须可回放、可审查

---

# 4.6 启动后端

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

启动后默认服务地址：

```text
http://127.0.0.1:8000
```

如存在 OpenAPI 文档：

```text
http://127.0.0.1:8000/docs
```

---

# 4.7 后端验证命令

```bash
cd backend
pytest
```

若当前分支测试未全量通过，需要明确记录：
- 哪些测试失败
- 是环境问题还是实现问题
- 哪些失败是已知历史问题

禁止在没有执行证据的情况下声称“后端已验证通过”。

---

# 5. 前端开发环境

# 5.1 安装依赖

```bash
cd frontend
npm install
```

# 5.2 环境变量

当前仓库已有：
- `frontend/.env`

建议保留/新增示例文件：
- `frontend/.env.example`

### 关键变量

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

如后续引入更多变量，统一以 `VITE_` 前缀命名。

---

# 5.3 启动前端

```bash
cd frontend
npm run dev
```

默认地址：

```text
http://127.0.0.1:5173
```

---

# 5.4 前端检查命令

```bash
cd frontend
npm run lint
npm run build
```

## 注意
当前某些环境下，前端构建可能因为：
- node_modules 状态异常
- 平台权限问题
- 可选依赖缺失
而失败。

如果出现这类情况，不要绕过问题直接改业务代码，应先处理构建环境可复现性。

---

# 6. 插件开发环境

# 6.1 安装依赖

```bash
cd extension
npm install
```

# 6.2 构建

```bash
npm run build
```

构建后会在 `extension/dist/` 生成产物。

# 6.3 浏览器加载

1. 打开 Chrome/Edge 扩展管理页
2. 开启开发者模式
3. 选择“加载已解压的扩展程序”
4. 选择 `extension/` 目录（按当前 README 约定）

> 若将来切换为只加载 `dist/`，必须同步更新 README 和本文件。

---

# 6.4 插件默认配置

当前 README 中默认配置为：
- Backend API：`http://127.0.0.1:8000`
- Web 平台：`http://127.0.0.1:5173`

插件 options 页的配置存储于 `chrome.storage.local`。

---

# 6.5 插件调试建议

检查以下点：
- `manifest.json` host_permissions 是否包含后端域名
- background/service worker 是否正常启动
- popup、options、warning 页面资源是否正确复制到 dist
- 后端返回 401/500 时插件是否能安全降级

---

# 7. Docker Compose 启动路径

在仓库根目录：

```bash
docker compose up --build
```

当前 compose 包含：
- backend
- frontend
- db（PostgreSQL）

## 注意点
- compose 当前已收敛到本地开发白名单 CORS；如果后续前端域名或扩展 ID 变化，需要同步更新。
- 前端环境变量里 `VITE_API_BASE_URL=http://127.0.0.1:8000`，若容器网络或域名策略调整，需同步更新。

---

# 8. 联调顺序建议

建议按以下顺序联调：

1. 启动数据库
2. 启动后端
3. 验证后端健康和核心接口
4. 启动前端并验证登录/工作区页面
5. 构建并加载插件
6. 用真实页面测试扫描-告警-报告跳转链路

---

# 9. 本地联调最小检查清单

## 后端
- [ ] 服务可启动
- [ ] 数据库可连通
- [ ] 迁移已应用
- [ ] 扫描接口可返回结构化结果
- [ ] 报告详情接口可返回结构化结果

## 前端
- [ ] 首页正常渲染
- [ ] 登录流程可进入工作区
- [ ] 记录/报告页可加载
- [ ] API 异常时页面不会白屏

## 插件
- [ ] popup 可打开
- [ ] options 可保存配置
- [ ] warning 页可路由打开
- [ ] 插件可调用后端检测接口
- [ ] 可跳转 Web 报告页

---

# 10. Codex 在本仓库执行任务时的环境处理规则

1. 先看 `AGENTS.md`
2. 再看本文件
3. 确认当前任务使用的是哪条数据库口径
4. 不得在不说明的前提下混用 MySQL 和 PostgreSQL 语义
5. 若构建/测试失败，必须写明阻塞点
6. 不得把“环境未准备好”伪装成“代码已完成”

这份文档的目标是让启动、检查、联调都具备一致口径。
