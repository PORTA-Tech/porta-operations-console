export interface SummaryBandItem {
  label: string;
  value: string;
  meta?: string;
  tone?: 'ok' | 'focus' | 'warn' | 'critical' | 'neutral';
}

interface SummaryBandProps {
  title: string;
  subtitle: string;
  items: SummaryBandItem[];
}

export function SummaryBand({ title, subtitle, items }: SummaryBandProps) {
  return (
    <section className="summary-band" aria-label={title}>
      <div className="summary-band-copy">
        <p className="summary-band-title">{title}</p>
        <p className="summary-band-subtitle">{subtitle}</p>
      </div>
      <div className="summary-band-grid">
        {items.map((item) => (
          <article key={item.label} className={`summary-card ${item.tone ?? 'neutral'}`}>
            <span className="summary-card-label">{item.label}</span>
            <strong className="summary-card-value">{item.value}</strong>
            {item.meta ? <span className="summary-card-meta">{item.meta}</span> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
