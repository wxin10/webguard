import type { ReactNode } from 'react';

interface StatusNoticeProps {
  tone?: 'error' | 'success' | 'info';
  children: ReactNode;
}

const toneClass = {
  error: 'border-red-200 bg-red-50 text-red-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
};

export default function StatusNotice({ tone = 'info', children }: StatusNoticeProps) {
  return (
    <div className={`mb-5 rounded-lg border px-4 py-3 text-sm font-medium ${toneClass[tone]}`}>
      {children}
    </div>
  );
}
