import type { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: string;
  note?: ReactNode;
}

export function MetricCard({ title, value, note }: MetricCardProps) {
  return (
    <section className="panel metric-card">
      <h3>{title}</h3>
      <p className="metric-value">{value}</p>
      {note ? <small>{note}</small> : null}
    </section>
  );
}

