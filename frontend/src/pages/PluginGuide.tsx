import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

export default function PluginGuide() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader
        title="插件安装引导"
        description="浏览器插件是 WebGuard 的辅助组件，只负责当前页快速扫描、即时提醒、必要拦截和打开 Web 详细报告。"
        action={<Link to="/login" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">进入 Web 平台</Link>}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">安装步骤</h2>
          <ol className="mt-4 space-y-4 text-sm leading-6 text-slate-700">
            <li>1. 进入 <code className="rounded bg-slate-100 px-2 py-1">extension</code> 目录执行 <code className="rounded bg-slate-100 px-2 py-1">npm install</code>。</li>
            <li>2. 执行 <code className="rounded bg-slate-100 px-2 py-1">npm run build</code> 生成 dist 文件。</li>
            <li>3. 在 Chrome 或 Edge 扩展管理页开启开发者模式。</li>
            <li>4. 选择“加载已解压的扩展程序”，加载项目的 <code className="rounded bg-slate-100 px-2 py-1">extension</code> 目录。</li>
          </ol>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">默认配置</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <p>后端 API：<code className="rounded bg-slate-100 px-2 py-1">http://127.0.0.1:8000</code></p>
            <p>Web 平台：<code className="rounded bg-slate-100 px-2 py-1">http://127.0.0.1:5173</code></p>
            <p>自动检测：默认开启</p>
            <p>恶意站点拦截：默认开启</p>
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-950">使用路径</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {[
              ['访问网页', '插件读取当前页面状态'],
              ['快速扫描', '上报页面特征到后端'],
              ['即时提醒', '只展示简短风险结论'],
              ['回到 Web', '打开完整报告与策略管理'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
