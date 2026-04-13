# WebGuard Extension

WebGuard 浏览器插件用于自动检测当前网页、展示 popup 风险结果、在恶意网站时跳转 warning 页面，并联动 Web 前端报告页。

## 启动与加载

```bash
cd extension
npm install
npm run build
```

然后在 Chrome / Edge 扩展管理页开启开发者模式，加载 `extension` 目录。

## 默认配置

- 后端 API：`http://127.0.0.1:8000`
- Web 报告页：`http://127.0.0.1:5173`
- 自动检测：开启
- 自动拦截恶意网站：开启

这些配置可在插件 options 页面修改并持久化到 `chrome.storage.local`。

## 联动流程

1. 用户访问网页。
2. 插件采集 URL、标题、可见文本、按钮、输入标签、表单 action、密码框等页面特征。
3. 插件请求 `POST /api/v1/plugin/analyze-current`。
4. popup 展示风险等级、风险评分、简短解释、后端连接状态。
5. 恶意网站自动跳转到 `warning.html`。
6. popup / warning 可跳转到 Web 前端 `/reports/:id` 或 `/report/latest`。

## 常见检查点

- popup、options、warning 的 HTML 使用 `type="module"` 加载脚本。
- TypeScript 源码中的相对导入使用 `.js` 扩展名，确保编译后的 ES module 可被浏览器扩展页加载。
- `manifest.json` 指向 `dist/background.js`、`dist/content.js` 和 `dist/*/*.html`，加载插件前必须先执行 `npm run build`。
