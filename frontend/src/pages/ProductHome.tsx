import { Link } from 'react-router-dom';

const heroImage = 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1800&q=80';

export default function ProductHome() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <section
        className="relative min-h-[76vh] overflow-hidden bg-slate-950 px-4 py-6 text-white"
        style={{ backgroundImage: `linear-gradient(90deg, rgba(2, 6, 23, 0.9), rgba(15, 23, 42, 0.62), rgba(15, 23, 42, 0.2)), url(${heroImage})`, backgroundPosition: 'center', backgroundSize: 'cover' }}
      >
        <nav className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white">W</div>
            <div>
              <p className="text-lg font-bold">WebGuard</p>
              <p className="text-xs text-slate-300">Web 安全检测平台</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link to="/login" className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20">登录</Link>
            <Link to="/plugin-install" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">安装浏览器助手</Link>
          </div>
        </nav>

        <div className="mx-auto mt-24 max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-normal text-blue-200">Web-first Security Platform</p>
          <h1 className="mt-5 max-w-4xl text-4xl font-bold leading-tight md:text-6xl">
            以 Web 平台为主入口的恶意网站检测与主动防御系统
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
            检测、报告、个人策略和运营控制都在 Web 平台完成；浏览器插件负责当前页面的快速扫描、即时提醒和必要拦截。
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/login" className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">进入平台</Link>
            <Link to="/plugin-install" className="rounded-lg border border-white/30 bg-white/10 px-5 py-3 font-semibold text-white backdrop-blur hover:bg-white/20">插件安装指南</Link>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-12">
        <section className="grid gap-4 md:grid-cols-3">
          {[
            ['用户工作台', '提交网址检测、查看历史报告、维护个人信任站点和阻止站点。'],
            ['运营控制台', '分析平台态势、处理样本与误报、管理规则、名单、模型和用户。'],
            ['浏览器助手', '同步当前页面风险状态，一键扫描、提醒、拦截并跳转到 Web 报告。'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="font-bold text-slate-950">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold text-blue-600">Platform Workflow</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-950">主要流程回到 Web 平台</h2>
            <p className="mt-4 leading-7 text-slate-600">
              普通用户围绕“检测、看报告、管策略、看同步记录”开展日常使用；管理员围绕“态势、样本、误报、规则、名单、模型、插件版本和用户”开展安全运营。
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['可解释报告', '展示风险等级、评分、规则命中、模型概率、解释和建议。'],
              ['个人策略', '把信任站点和阻止站点放在 Web 端统一维护。'],
              ['插件同步', '浏览器侧扫描结果进入 Web 报告和同步记录。'],
              ['运营闭环', '管理员处理样本与误报后调整规则、名单和模型策略。'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-white p-5">
                <h3 className="font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
