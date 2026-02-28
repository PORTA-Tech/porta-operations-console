import { useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useFleetSlice } from '../../store/fleetSlice';
import { formatUtc } from '../../utils/date';

type ViewMeta = {
  title: string;
  question: string;
};

const viewMap: Record<string, ViewMeta> = {
  '/': {
    title: 'Fleet Overview',
    question: 'Is the fleet healthy right now, and what should we inspect first?'
  },
  '/alerts': {
    title: 'Alerts',
    question: 'What needs immediate attention, and what should we do next?'
  },
  '/cohorts': {
    title: 'Cohorts',
    question: 'Which cohort is regressing against baseline, and by how much?'
  },
  '/machines': {
    title: 'Machines',
    question: 'Which machine needs action now, and what changed most recently?'
  },
  '/experiments': {
    title: 'Experiments',
    question: 'Did this change improve outcomes compared to baseline?'
  },
  '/rollouts': {
    title: 'Rollouts',
    question: 'Can we safely promote this change to a wider audience?'
  },
  '/policies': {
    title: 'Policies',
    question: 'Which rules are active, and are they configured correctly?'
  },
  '/audit-traces': {
    title: 'Audit & Traces',
    question: 'What decisions were made, and can we replay them with evidence?'
  },
  '/config': {
    title: 'Config Integrity',
    question: 'Are we running trusted configuration versions without drift?'
  },
  '/security-access': {
    title: 'Security And Access',
    question: 'Who can perform sensitive actions, and were unsafe attempts blocked?'
  },
  '/system-health': {
    title: 'System Health',
    question: 'Are ingestion, inference, and control loops flowing end-to-end?'
  }
};

const compareOptions = [
  { value: 'none', label: 'No compare' },
  { value: 'baseline-canary', label: 'Baseline vs canary' },
  { value: 'before-after', label: 'Before vs after' },
  { value: 'config-a-b', label: 'Config A vs Config B' }
];

interface ViewContextBarProps {
  onOpenGlossary: () => void;
}

export function ViewContextBar({ onOpenGlossary }: ViewContextBarProps) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const lastUpdatedUtc = useFleetSlice((s) => s.lastUpdatedUtc);
  const liveConnected = useFleetSlice((s) => s.liveConnected);

  const viewMeta = useMemo<ViewMeta>(() => {
    return viewMap[location.pathname] ?? {
      title: 'Operations Console',
      question: 'What is the current state, and where should we drill down next?'
    };
  }, [location.pathname]);

  const compareMode = params.get('compare') ?? 'none';
  const compareLeft = params.get('cmpA') ?? 'stable';
  const compareRight = params.get('cmpB') ?? 'experimental';

  const updateParam = (key: string, value: string, clearIf?: string) => {
    const next = new URLSearchParams(params);
    if (value === '' || (clearIf && value === clearIf)) {
      next.delete(key);
    } else {
      next.set(key, value);
    }

    setParams(next, { replace: true });
  };

  const copyLink = async () => {
    const target = `${window.location.origin}${location.pathname}${location.search}`;
    try {
      await navigator.clipboard.writeText(target);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }

    window.setTimeout(() => setCopyState('idle'), 1600);
  };

  return (
    <section className="view-context-bar">
      <div className="view-context-head">
        <div>
          <p className="view-title">{viewMeta.title}</p>
          <p className="view-question">{viewMeta.question}</p>
        </div>
        <div className="context-actions">
          <button type="button" onClick={copyLink}>
            {copyState === 'copied' ? 'Link Copied' : copyState === 'error' ? 'Copy Failed' : 'Copy Link'}
          </button>
          <button type="button" onClick={onOpenGlossary}>
            Glossary
          </button>
        </div>
      </div>

      <div className="view-context-controls">
        <label>
          Compare lens
          <select value={compareMode} onChange={(event) => updateParam('compare', event.target.value, 'none')}>
            {compareOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Left side
          <input value={compareLeft} onChange={(event) => updateParam('cmpA', event.target.value, 'stable')} />
        </label>
        <label>
          Right side
          <input value={compareRight} onChange={(event) => updateParam('cmpB', event.target.value, 'experimental')} />
        </label>
        <p className="freshness-pill">
          Data freshness: <strong>{liveConnected ? 'Live' : 'Delayed'}</strong>
          {' · '}
          Last update: <strong>{formatUtc(lastUpdatedUtc)}</strong>
        </p>
      </div>
    </section>
  );
}
