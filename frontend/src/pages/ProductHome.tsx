import { Link } from 'react-router-dom';

export default function ProductHome() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <main className="mx-auto max-w-6xl">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white">W</div>
            <div>
              <p className="text-lg font-bold text-slate-950">WebGuard</p>
              <p className="text-xs text-slate-500">Web 安全检测平台</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link to="/login" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">登录平台</Link>
            <Link to="/plugin-install" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">插件安装</Link>
          </div>
        </nav>

        <section className="mt-14 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase text-blue-600">Web-first Security Platform</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight text-slate-950 md:text-5xl">
              以 Web 平台为核心的恶意网站检测与主动防御系统
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              用户在 Web 平台提交检测、查看报告、管理安全策略；管理员在 Web 运营控制台处理样本、规则、名单和模型。浏览器插件只作为轻量辅助入口，负责当前网页提醒、快速扫描和必要拦截。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">进入 Web 平台</Link>
              <Link to="/plugin-install" className="rounded-lg border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50">查看插件安装引导</Link>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">产品分工</h2>
            <div className="mt-5 space-y-4">
              <RoleBlock title="Web 主平台" text="检测入口、报告中心、个人策略、插件同步记录、账户设置。" />
              <RoleBlock title="运营控制台" text="全局统计、样本误报处理、规则管理、黑白名单、模型状态、插件版本和用户管理。" />
              <RoleBlock title="浏览器插件" text="即时提醒、当前页快速扫描、风险警告、报告跳转、信任与临时忽略。" />
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            ['可解释检测报告', '风险等级、评分、规则命中、模型概率和处理建议在 Web 中完整呈现。'],
            ['个人安全策略', '用户维护信任站点与阻止站点，插件只做轻量入口。'],
            ['运营闭环', '管理员基于样本、误报和趋势调整规则与模型策略。'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-bold text-slate-950">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

function RoleBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
