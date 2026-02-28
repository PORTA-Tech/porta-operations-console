import { useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useFleetSlice } from '../../store/fleetSlice';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';
import { useWsConnectionStatus } from '../../hooks/useWsConnectionStatus';

type ViewMeta = {
  title: string;
  subtitle: string;
};

const viewMap: Record<string, ViewMeta> = {
  '/': {
    title: 'Fleet Overview',
    subtitle: 'Fleet health and top risks (last 1h)'
  },
  '/alerts': {
    title: 'Alerts',
    subtitle: 'Live triage queue and response actions'
  },
  '/cohorts': {
    title: 'Cohorts',
    subtitle: 'Compare cohort performance and regressions'
  },
  '/machines': {
    title: 'Machines',
    subtitle: 'Machine-level health, trust, and state drilldown'
  },
  '/experiments': {
    title: 'Experiments',
    subtitle: 'Validate hypotheses against baseline outcomes'
  },
  '/rollouts': {
    title: 'Rollouts',
    subtitle: 'Promote safely with guardrails and cooldown awareness'
  },
  '/policies': {
    title: 'Policies',
    subtitle: 'Policy library, versions, and decision coverage'
  },
  '/audit-traces': {
    title: 'Audit & Traces',
    subtitle: 'Trace replay and immutable decision evidence'
  },
  '/config': {
    title: 'Config Integrity',
    subtitle: 'Config trust, signatures, and drift visibility'
  },
  '/security-access': {
    title: 'Security And Access',
    subtitle: 'RBAC controls and sensitive access monitoring'
  },
  '/system-health': {
    title: 'System Health',
    subtitle: 'Console, API, and stream reliability signals'
  }
};

interface ViewContextBarProps {
  onOpenGlossary: () => void;
}

export function ViewContextBar({ onOpenGlossary }: ViewContextBarProps) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const lastUpdatedUtc = useFleetSlice((s) => s.lastUpdatedUtc);
  const liveConnected = useFleetSlice((s) => s.liveConnected);
  const wsStatus = useWsConnectionStatus();

  const viewMeta = useMemo<ViewMeta>(() => {
    return viewMap[location.pathname] ?? {
      title: 'Operations Console',
      subtitle: 'Live operations visibility and controls'
    };
  }, [location.pathname]);

  const compareMode = params.get('compare') ?? 'none';

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

  const toggleCompare = () => {
    updateParam('compare', compareMode === 'none' ? 'baseline-canary' : 'none', 'none');
  };

  return (
    <section className="view-context-bar">
      <div className="view-context-head">
        <div>
          <p className="view-title">{viewMeta.title}</p>
          <p className="view-subtitle">{viewMeta.subtitle}</p>
        </div>
        <div className="context-actions">
          <button type="button" onClick={copyLink}>
            {copyState === 'copied' ? 'Link Copied' : copyState === 'error' ? 'Copy Failed' : 'Copy Link'}
          </button>
          <button type="button" onClick={toggleCompare}>
            Compare: {compareMode === 'none' ? 'Off' : 'On'}
          </button>
          <button type="button" onClick={onOpenGlossary}>
            Glossary
          </button>
          <p className="freshness-pill">
            Data Stream: <strong>{liveConnected ? 'Connected' : 'Delayed'}</strong>
            {' | '}
            <span
              className={`freshness-state ${wsStatus.tone}`}
              title={wsStatus.detail}
            >
              Realtime Channel: <strong>{wsStatus.statusLabel}</strong>
            </span>
            {' | '}
            <span title={formatUtc(lastUpdatedUtc)}>
              Last update: <strong>{formatRelativeFromNow(lastUpdatedUtc)}</strong>
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
