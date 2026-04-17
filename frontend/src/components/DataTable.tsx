import type { ReactNode } from 'react';

interface Column<T> {
  key: string;
  title: string;
  render?: (value: any, row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyText?: string;
  onRowClick?: (row: T) => void;
}

export default function DataTable<T>({
  columns,
  data,
  loading = false,
  emptyText = '暂无数据',
  onRowClick,
}: DataTableProps<T>) {
  if (loading) {
    return <div className="p-8 text-center text-slate-500">正在加载...</div>;
  }

  if (!data.length) {
    return <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">{emptyText}</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[760px] text-left">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row, index) => (
            <tr
              key={(row as Record<string, unknown>).id?.toString() ?? String(index)}
              className={onRowClick ? 'cursor-pointer transition hover:bg-blue-50/60' : undefined}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((column) => (
                <td key={column.key} className="px-5 py-4 text-sm text-slate-700">
                  {column.render
                    ? column.render((row as Record<string, unknown>)[column.key], row)
                    : String((row as Record<string, unknown>)[column.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
