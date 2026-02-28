import type { GlossaryTerm } from '../../data/glossary';

interface GlossaryDrawerProps {
  open: boolean;
  terms: GlossaryTerm[];
  onClose: () => void;
}

export function GlossaryDrawer({ open, terms, onClose }: GlossaryDrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <aside className="glossary-drawer" role="dialog" aria-modal="true" aria-label="Metric glossary">
      <div className="glossary-header">
        <h3>Glossary</h3>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="muted-line">
        Engineering terms are mapped to plain language here. Each entry includes meaning, impact, and expected healthy range.
      </p>
      <div className="glossary-list">
        {terms.map((item) => (
          <section key={item.term} className="glossary-item">
            <h4>{item.plainLabel}</h4>
            <p className="muted-line">Term: {item.term}</p>
            <p><strong>What it means:</strong> {item.meaning}</p>
            <p><strong>Why it matters:</strong> {item.whyItMatters}</p>
            <p><strong>What good looks like:</strong> {item.goodLooksLike}</p>
          </section>
        ))}
      </div>
    </aside>
  );
}

