# WebGuard

WebGuard 是一个“基于浏览器插件与 Web 后台联动的恶意网站检测与主动防御系统”。项目由 FastAPI 后端、React Web 管理台、Chrome/Edge 浏览器插件组成，适合比赛展示和答辩演示。

## 功能定位

- 浏览器插件自动采集当前网页特征并请求后台检测。
- 后端保留 FeatureExtractor、RuleEngine、ModelService、Detector 主流程，融合规则命中与模型概率生成风险结论。
- Web 前端提供管理员和普通用户两种演示角色。
- 恶意网站可自动跳转到插件 warning 页面，并从 popup / warning 跳转到 Web 报告页。

## 本地启动

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端地址：`http://127.0.0.1:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

前端默认 API 地址：`http://127.0.0.1:8000`

### Extension

```bash
cd extension
npm install
npm run build
```

在 Chrome / Edge 扩展管理页开启开发者模式，选择“加载已解压的扩展程序”，加载 `extension` 目录。

插件默认 API 地址：`http://127.0.0.1:8000`

## 演示角色

登录页使用 mock 登录，不需要密码。

- 管理员 admin：Dashboard、全部历史记录、规则管理、黑白名单、模型状态、插件状态、统计分析、用户管理、完整分析报告。
- 普通用户 user：首页、单网址检测、我的检测记录、最近报告、插件使用说明、简化分析报告。

顶部提供“演示模式角色切换”按钮，便于现场快速切换。

## 关键接口

- `POST /api/v1/auth/mock-login`
- `POST /api/v1/scan/url`
- `POST /api/v1/plugin/analyze-current`
- `GET /api/v1/records`
- `GET /api/v1/records/me`
- `GET /api/v1/reports/latest`
- `GET /api/v1/reports/{id}`
- `GET /api/v1/model/status`
- `GET /api/v1/stats/overview`

## Docker

```bash
docker-compose up --build
```

Docker 后端暴露 `8000`，前端暴露 `80`。
