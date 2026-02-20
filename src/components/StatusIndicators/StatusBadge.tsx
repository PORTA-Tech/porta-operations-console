interface StatusBadgeProps {
  label: string;
  tone: 'ok' | 'warn' | 'critical';
}

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return <span className={`status-badge ${tone}`}>{label}</span>;
}

