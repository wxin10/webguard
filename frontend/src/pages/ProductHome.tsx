import { Link } from 'react-router-dom';

const heroImage = 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1800&q=80';

const values = [
  ['恶意网站检测', '输入 URL 即可生成风险判断，覆盖钓鱼、仿冒、恶意跳转和高危表单等常见威胁。'],
  ['风险报告', '沉淀检测证据、规则命中、DeepSeek 语义研判和处置建议，便于复查和追踪。'],
  ['主动防御', '把信任站点、阻止站点和运营规则统一维护，减少重复判断和人工遗漏。'],
  ['统一管理', '个人检测、报告中心、策略管理和运营控制都回到 Web 平台处理。'],
];

const workflow = [
  ['1', '从 Web 开始检测', '提交网址，得到结构化风险结论和可追踪报告。'],
  ['2', '在报告中判断处置', '查看风险等级、证据链和建议，再决定信任、忽略或阻止。'],
  ['3', '用策略持续防护', '把常用站点、风险域名和规则调整沉淀为平台策略。'],
  ['4', '让助手守住浏览器现场', '当前页提醒、快速扫描和报告跳转交给浏览器助手。'],
];

const platformCapabilities = [
  ['检测入口', '面向日常网址检测和高风险页面复查。'],
  ['报告中心', '汇总 Web 提交与浏览器助手同步结果。'],
  ['策略管理', '维护个人信任、阻止名单和运营规则。'],
  ['运营控制', '处理样本、误报、AI 接入状态、助手事件和用户管理。'],
];

const assistantActions = [
  '当前页风险提醒',
  '快速扫描并同步结果',
  '打开 Web 详细报告',
  '快速信任、忽略或阻止',
];

export default function ProductHome() {
  return (
    <div className="min-h-screen bg-[#f4f7f4] text-slate-950">
      <section
        className="relative min-h-[82vh] overflow-hidden px-4 py-6 text-white"
        style={{ backgroundImage: `linear-gradient(90deg, rgba(7, 28, 24, 0.94), rgba(13, 79, 67, 0.72), rgba(13, 79, 67, 0.22)), url(${heroImage})`, backgroundPosition: 'center', backgroundSize: 'cover' }}
      >
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500 text-lg font-bold text-white">W</div>
            <div>
              <p className="text-lg font-bold">WebGuard</p>
              <p className="text-xs text-emerald-100">Web 安全平台</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Link to="/login" className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20">进入平台</Link>
            <Link to="/plugin-install" className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300">安装浏览器助手</Link>
          </div>
        </nav>

        <div className="mx-auto mt-20 max-w-6xl pb-12 md:mt-28">
          <p className="text-sm font-semibold text-emerald-100">恶意网站检测 · 风险报告 · 主动防御</p>
          <h1 className="mt-5 max-w-4xl text-4xl font-bold leading-tight md:text-6xl">
            让每一次 Web 访问都有清晰的风险判断和后续处置。
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-emerald-50">
            WebGuard 以 Web 平台为主入口，完成检测、报告、策略和运营管理；浏览器助手留在访问现场，负责即时提醒、快速扫描和跳转详细报告。
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/login" className="rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-400">登录平台</Link>
            <Link to="/app/scan" className="rounded-lg border border-white/30 bg-white/10 px-5 py-3 font-semibold text-white backdrop-blur hover:bg-white/20">开始检测</Link>
            <Link to="/plugin-install" className="rounded-lg border border-amber-200 bg-amber-300 px-5 py-3 font-semibold text-slate-950 hover:bg-amber-200">安装助手</Link>
          </div>
        </div>
      </section>

      <main>
        <section className="mx-auto grid max-w-6xl gap-5 px-4 py-14 md:grid-cols-4">
          {values.map(([title, text]) => (
            <div key={title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="font-bold text-slate-950">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </section>

        <section className="bg-white px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold text-emerald-700">从检测到防护</p>
              <h2 className="mt-3 text-3xl font-bold text-slate-950">打开平台后，下一步很明确。</h2>
              <p className="mt-4 leading-7 text-slate-600">
                先在 Web 端提交检测和查看完整报告，再把结论沉淀为策略。浏览器助手只处理当前页面现场，让风险提醒自然回流到平台。
              </p>
            </div>
            <div className="mt-8 grid gap-4 lg:grid-cols-4">
              {workflow.map(([step, title, text]) => (
                <div key={title} className="rounded-lg border border-slate-200 bg-[#f8fbf8] p-5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">{step}</span>
                  <h3 className="mt-5 font-bold text-slate-950">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[1fr_1fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Web 平台</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-950">检测、报告、策略和运营都在这里完成。</h2>
            <p className="mt-4 leading-7 text-slate-600">
              WebGuard 的主流程围绕平台展开：个人用户处理自己的安全任务，管理员处理全局风险态势和运营闭环。
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {platformCapabilities.map(([title, text]) => (
                <div key={title} className="rounded-lg border border-slate-200 bg-white p-5">
                  <h3 className="font-semibold text-slate-950">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-[#eaf7ef] p-7">
            <p className="text-sm font-semibold text-emerald-800">浏览器助手</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-950">留在页面现场，减少打断。</h2>
            <p className="mt-4 leading-7 text-slate-700">
              助手不替代 Web 平台。它负责当前页提醒、快速扫描和打开详细报告，让用户在浏览过程中及时知道风险，再回到平台完成分析和管理。
            </p>
            <div className="mt-6 grid gap-3">
              {assistantActions.map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {item}
                </div>
              ))}
            </div>
            <Link to="/plugin-install" className="mt-7 inline-flex rounded-lg bg-slate-950 px-5 py-3 font-semibold text-white hover:bg-slate-800">
              查看安装方式
            </Link>
          </div>
        </section>

        <section className="bg-[#0b2f27] px-4 py-14 text-white">
          <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold text-emerald-200">Ready for Web Security Operations</p>
              <h2 className="mt-3 text-3xl font-bold">从一次网址检测开始，把风险留在可管理的地方。</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/login" className="rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-400">进入平台</Link>
              <Link to="/plugin-install" className="rounded-lg border border-white/30 px-5 py-3 font-semibold text-white hover:bg-white/10">安装浏览器助手</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
