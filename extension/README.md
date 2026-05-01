# WebGuard Extension

WebGuard 浏览器插件是 Web 平台的辅助组件，不是主产品入口。它只负责当前页面快速扫描、即时提醒、必要拦截、打开 Web 报告、加入信任列表和临时忽略当前站点。

## 启动与加载

```bash
cd extension
npm install
npm run build
```

然后在 Chrome / Edge 扩展管理页开启开发者模式，加载 `extension` 目录。

## 默认配置

- 后端 API：`http://127.0.0.1:8000`
- Web 平台：`http://127.0.0.1:5173`
- 自动检测：开启
- 自动拦截恶意网站：开启

这些配置可在 options 页面修改，并持久化到 `chrome.storage.local`。

## 职责边界

插件承担：

- 读取当前网页风险状态
- 快速扫描当前网页
- 即时风险提示
- 恶意网站 warning 拦截
- 打开 Web 平台详细报告：`/app/reports/:id` 或 `/app/report/latest`
- 当前站点加入信任列表 / 临时忽略

插件不承担：

- 完整用户管理
- 复杂分析报表
- 运营后台能力
- 全量历史报告管理
- 规则、DeepSeek AI 接入状态、用户等后台治理能力

完整检测报告、历史追踪、个人策略和管理员运营都在 Web 平台完成。
