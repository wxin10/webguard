import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { modelApi } from '../services/api';
import { ModelStatus, ModelVersion } from '../types';
import { formatDate } from '../utils';

export default function Model() {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([modelApi.getModelStatus(), modelApi.getModelVersions()])
      .then(([statusData, versionData]) => {
        setStatus(statusData);
        setVersions(versionData.versions || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;
  const modelType = displayModelValue(status?.model_type, '基础检测模型');
  const currentVersion = displayModelValue(status?.active_model?.version, '未标记版本');
  const activeModelName = displayModelValue(status?.active_model?.name, '基础检测模型');

  return (
    <div>
      <PageHeader title="模型状态" description="展示当前检测模型类型、版本、目录与元数据，便于管理员了解检测能力运行情况。" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="模型类型" value={modelType} tone="blue" />
        <StatCard title="模型数量" value={status?.model_count || 0} tone="slate" />
        <StatCard title="当前版本" value={currentVersion} tone="green" />
        <StatCard title="运行状态" value="Healthy" tone="green" />
      </div>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">当前模型详情</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Info label="模型名称" value={activeModelName} />
          <Info label="模型目录" value={displayModelValue(status?.loaded_model_dir || status?.active_model?.path, '未配置模型目录')} />
          <Info label="元数据" value={JSON.stringify(status?.metadata || {}, null, 2)} />
          <Info label="说明" value="Detector 会融合规则评分与模型概率，生成最终风险等级和建议。" />
        </div>
      </section>
      <section className="mt-6">
        <DataTable
          data={versions}
          columns={[
            { key: 'name', title: '模型名称' },
            { key: 'version', title: '版本' },
            { key: 'path', title: '路径', render: (value) => <span className="block max-w-md truncate">{value}</span> },
            { key: 'accuracy', title: 'Accuracy', render: (value) => value?.toFixed?.(4) || '-' },
            { key: 'f1_score', title: 'F1', render: (value) => value?.toFixed?.(4) || '-' },
            { key: 'is_active', title: '状态', render: (value) => (value ? '当前启用' : '备用') },
            { key: 'created_at', title: '创建时间', render: (value) => formatDate(value) },
          ]}
        />
      </section>
    </div>
  );
}

function displayModelValue(value: string | undefined, emptyText: string) {
  if (!value) return emptyText;
  return value.toLowerCase().includes('fallback') ? emptyText : value;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 whitespace-pre-wrap break-all text-sm text-slate-800">{value}</p>
    </div>
  );
}
