import { getRiskColor, getRiskText } from '../utils';

interface RiskBadgeProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClass = {
  sm: 'text-xs px-2 py-1',
  md: 'text-sm px-3 py-1.5',
  lg: 'text-base px-4 py-2',
};

export default function RiskBadge({ label = 'unknown', size = 'md' }: RiskBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold ${getRiskColor(label)} ${sizeClass[size]}`}>
      {getRiskText(label)}
    </span>
  );
}
