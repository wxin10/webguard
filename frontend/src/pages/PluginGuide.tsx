import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

const assistantTasks = [
  ['提醒当前页风险', '在访问现场给出简短结论，避免用户等到事后才发现风险。'],
  ['快速扫描当前页', '把页面 URL 和关键特征同步到 WebGuard，生成可追踪报告。'],
  ['打开 Web 详细报告', '从浏览器提醒跳回平台，继续查看证据链、解释和建议。'],
  ['快速处置信任或忽略', '把临时判断带回 Web 平台策略，减少重复提醒。'],
];

export default function PluginGuide() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader
        title="浏览器助手"
        description="助手留在当前页面做提醒、快速扫描和报告跳转；完整检测、历史报告、策略管理和运营控制继续在 Web 平台完成。"
        action={<Link to="/login" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">进入 Web 平台</Link>}
      />

      <section className="rounded-lg border border-emerald-200 bg-[#ecf8f0] p-6">
        <p className="text-sm font-semibold text-emerald-800">推荐路径</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">先登录 Web 平台，再连接浏览器助手。</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          平台负责账号、报告、策略和运营闭环；助手负责浏览器现场的轻量保护。连接后，助手扫描结果会进入 Web 报告流。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/login" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">登录平台</Link>
          <Link to="/app/plugin-sync" className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">查看同步记录</Link>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">助手负责什么</h2>
          <div className="mt-4 grid gap-4">
            {assistantTasks.map(([title, text]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">本地安装方式</h2>
          <ol className="mt-4 space-y-4 text-sm leading-6 text-slate-700">
            <li>1. 在 <code className="rounded bg-slate-100 px-2 py-1">extension</code> 目录安装依赖并完成构建。</li>
            <li>2. 在 Chrome 或 Edge 扩展管理页加载构建后的浏览器助手。</li>
            <li>3. 确认 API 地址为 <code className="rounded bg-slate-100 px-2 py-1">http://127.0.0.1:8000</code>。</li>
            <li>4. 扫描当前页面后，回到 Web 平台查看完整报告和同步记录。</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
