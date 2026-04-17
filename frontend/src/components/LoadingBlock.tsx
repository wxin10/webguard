export default function LoadingBlock({ text = '正在加载数据...' }: { text?: string }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-5 text-sm font-medium text-slate-600 shadow-sm">
        {text}
      </div>
    </div>
  );
}
