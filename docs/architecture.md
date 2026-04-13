# WebGuard Architecture

WebGuard 是基于浏览器插件与 Web 后台联动的恶意网站检测与主动防御系统。

## 架构分层

```text
Browser Extension
  -> collect page features
  -> POST /api/v1/plugin/analyze-current

FastAPI Backend
  -> FeatureExtractor
  -> RuleEngine
  -> ModelService
  -> Detector fusion decision
  -> ScanRecord + structured report

React Frontend
  -> admin security console
  -> user protection console
  -> /reports/:id report detail
```

## 角色

- admin：安全运营人员，访问 Dashboard、全部记录、规则、黑白名单、模型、插件、统计、用户管理。
- user：被保护用户，访问首页、单网址检测、我的记录、最近报告、插件使用说明。

## 启动口径

后端：

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

前端和插件默认后端地址：

```text
http://127.0.0.1:8000
```

## 检测闭环

1. 插件采集当前网页 URL、标题、可见文本、按钮、输入标签、表单 action、密码框等特征。
2. 后端 Detector 调用 FeatureExtractor、RuleEngine、ModelService。
3. 后端融合规则评分和模型概率，生成风险等级、风险评分、检测解释和处理建议。
4. 插件 popup 展示简短结果。
5. 恶意网站跳转 warning 页面。
6. popup / warning 跳转 Web 前端报告详情页。
