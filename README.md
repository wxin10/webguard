# WebGuard 恶意网站检测与安全预警系统

WebGuard 是面向网页访问场景的恶意网站检测与安全预警系统。系统以 Web 管理平台为主体，以浏览器插件为辅助执行端，通过后端风险检测服务完成网页风险识别、检测记录留存、风险报告生成、黑白名单管理和管理员审核。

系统面向日常网页访问、校园网络安全教学实践、钓鱼网站识别实验和中小型组织的网页访问安全防护场景。用户可以在网站平台中发起风险查询、查看检测记录和报告，浏览器插件可以在用户访问网页时实时采集页面特征并联动后端进行风险判断。

## 核心能力

- URL 风险查询：支持用户在 Web 平台输入网址并获取风险等级、风险分数和处置建议。
- 实时检测预警：浏览器插件在访问网页时联动后端检测，可对可疑或恶意页面进行提醒或拦截。
- 规则检测：后端基于 URL、域名、页面文本、表单、按钮、跨域提交等特征执行规则引擎判断。
- DeepSeek 语义分析：在高风险特征触发时调用 DeepSeek 对页面语义、诱导话术、品牌仿冒和凭证窃取意图进行分析。
- 黑白名单管理：支持管理员维护全局黑白名单，用户维护个人信任、阻止和临时信任策略。
- 检测记录与报告：保存检测记录、风险命中规则、页面特征摘要、AI 分析结果和处置动作。
- 管理员审核：支持管理员查看样本、审核反馈、管理规则、域名、用户、插件实例和 AI 配置。
- 浏览器插件绑定：支持插件实例绑定、策略同步、插件事件上报和实例撤销。

## 技术栈

- 后端：FastAPI、SQLAlchemy、Alembic、Pydantic、PostgreSQL
- 前端：React、TypeScript、Vite、React Router、Axios、Tailwind CSS
- 浏览器插件：Chrome/Edge Manifest V3、TypeScript、Service Worker、content script、chrome.storage.local
- AI 分析：DeepSeek 语义风险分析，可通过管理员后台配置
- 测试与集成：pytest、ESLint、TypeScript build、GitHub Actions

## 目录结构

```text
backend/      FastAPI 后端服务，负责检测、鉴权、策略、报告和持久化
frontend/     React Web 平台，负责用户与管理员操作界面
extension/    Manifest V3 浏览器插件，负责网页访问侧实时检测与预警
docs/         参赛作品说明、架构、功能、接口、运行、测试和维护文档
scripts/      本地检查与辅助脚本
```

## 作品文档

- [01-项目说明](docs/01-项目说明.md)
- [02-系统架构说明](docs/02-系统架构说明.md)
- [03-功能模块说明](docs/03-功能模块说明.md)
- [04-技术实现说明](docs/04-技术实现说明.md)
- [05-接口说明](docs/05-接口说明.md)
- [06-安装与运行说明](docs/06-安装与运行说明.md)
- [07-测试说明](docs/07-测试说明.md)
- [08-技术亮点与创新点](docs/08-技术亮点与创新点.md)
- [09-系统维护说明](docs/09-系统维护说明.md)

## 快速运行

### 1. 后端

```powershell
cd backend
python -m pip install -r requirements.txt
$env:DATABASE_URL = "postgresql://webguard:webguard@127.0.0.1:5432/webguard"
alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

健康检查：

```text
http://127.0.0.1:8000/health
```

### 2. 前端

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

访问地址：

```text
http://127.0.0.1:5173
```

### 3. 浏览器插件

```powershell
cd extension
npm install
npm run build
```

在 Chrome 或 Edge 中打开扩展管理页，启用开发者模式，加载 `extension/` 目录。插件设置页中填写后端地址 `http://127.0.0.1:8000` 和 Web 平台地址 `http://127.0.0.1:5173`。

## 局域网与服务器部署

系统支持本地运行、局域网 IP 访问和服务器部署。局域网访问时，后端可使用 `--host 0.0.0.0` 启动，前端可通过 `VITE_API_BASE_URL` 指向局域网后端地址，同时在后端环境变量 `CORS_ORIGINS` 中加入前端访问地址。服务器部署时，应配置 PostgreSQL、HTTPS、反向代理、强密钥、精确跨域白名单和正式插件访问地址。

详细步骤见 [06-安装与运行说明](docs/06-安装与运行说明.md)。

## 测试

```powershell
cd backend
python -m pytest

cd ../frontend
npm run lint
npm run build

cd ../extension
npm run build
```

详细测试说明见 [07-测试说明](docs/07-测试说明.md)。
