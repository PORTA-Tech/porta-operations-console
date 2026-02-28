import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

interface PanelProps {
  title: string;
  children: ReactNode;
}

export function Panel({ title, children }: PanelProps) {
  const [params] = useSearchParams();
  const compareMode = params.get('compare') ?? 'none';
  const compareLeft = params.get('cmpA') ?? 'stable';
  const compareRight = params.get('cmpB') ?? 'experimental';

  return (
    <section className="panel">
      <div className="panel-heading-row">
        <h3>{title}</h3>
        <span className="muted-line">
          Compare: {compareMode === 'none' ? 'Off' : `${compareLeft} vs ${compareRight}`}
        </span>
      </div>
      {children}
    </section>
  );
}

