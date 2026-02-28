import type { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: string;
  note?: ReactNode;
  tooltip?: {
    meaning: string;
    whyItMatters: string;
    goodLooksLike: string;
  };
}

export function MetricCard({ title, value, note, tooltip }: MetricCardProps) {
  const tooltipText = tooltip
    ? `What it means: ${tooltip.meaning}\nWhy it matters: ${tooltip.whyItMatters}\nWhat good looks like: ${tooltip.goodLooksLike}`
    : undefined;

  return (
    <section className="panel metric-card">
      <div className="metric-title-row">
        <h3>{title}</h3>
        {tooltip ? (
          <button type="button" className="metric-tip" title={tooltipText} aria-label={`Explain ${title}`}>
            i
          </button>
        ) : null}
      </div>
      <p className="metric-value">{value}</p>
      {note ? <small>{note}</small> : null}
    </section>
  );
}

