import PageHeader from '../components/PageHeader';

export default function PluginGuide() {
  return (
    <div>
      <PageHeader title="插件使用说明" description="普通用户用于安装、配置和理解 WebGuard 浏览器插件防护流程。" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">安装步骤</h2>
          <ol className="mt-4 space-y-4 text-sm text-slate-700">
            <li>1. 进入 <code className="rounded bg-slate-100 px-2 py-1">extension</code> 目录执行 <code className="rounded bg-slate-100 px-2 py-1">npm install</code>。</li>
            <li>2. 执行 <code className="rounded bg-slate-100 px-2 py-1">npm run build</code> 生成 dist 文件。</li>
            <li>3. 在 Chrome 或 Edge 扩展管理页开启开发者模式。</li>
            <li>4. 选择“加载已解压的扩展程序”，加载项目的 <code className="rounded bg-slate-100 px-2 py-1">extension</code> 目录。</li>
          </ol>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">默认配置</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <p>后端 API: <code className="rounded bg-slate-100 px-2 py-1">http://127.0.0.1:8000</code></p>
            <p>Web 报告页: <code className="rounded bg-slate-100 px-2 py-1">http://127.0.0.1:5173/reports/:id</code></p>
            <p>自动检测: 默认开启</p>
            <p>恶意站点拦截: 默认开启</p>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-950">使用路径</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {['访问网页', '插件采集页面特征', '后台返回风险报告', '恶意网站跳转警告页'].map((item) => (
              <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">{item}</div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
