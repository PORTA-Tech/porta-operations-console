import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function Panel({ title, subtitle, children }: PanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>{title}</h3>
        {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
