# WebGuard Backend

FastAPI 后端负责恶意网站检测、历史记录、规则、黑白名单、模型状态、统计分析、插件联动和结构化报告接口。

## 启动

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

服务地址：`http://127.0.0.1:8000`

## 新增演示接口

- `POST /api/v1/auth/mock-login`：mock 登录，返回 username、role、display_name。
- `GET /api/v1/records/me`：普通用户“我的记录”演示接口。
- `GET /api/v1/reports/latest`：最近一次结构化分析报告。
- `GET /api/v1/reports/{id}`：报告详情，包含风险等级、风险评分、规则命中、模型概率、检测解释和处理建议。

## 检测主流程

项目保留现有检测主链路：

`FeatureExtractor -> RuleEngine -> ModelService -> Detector`

真实模型不可用时，`ModelService` 会回退到 mock 模型，保证比赛演示链路可运行。
