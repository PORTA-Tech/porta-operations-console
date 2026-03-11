import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useFleetSlice } from '../../store/fleetSlice';
import { useWsConnectionStatus } from '../../hooks/useWsConnectionStatus';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  '/system-health': {
    title: 'System Health',
    subtitle: 'Is PORTA running and collecting activity correctly?'
  },
  '/user-activity': {
    title: 'User Activity',
    subtitle: 'What does PORTA think the user is doing right now?'
  },
  '/trust-level': {
    title: 'Trust Level',
    subtitle: 'Can PORTA be trusted for this user yet?'
  },
  '/actions': {
    title: 'Actions',
    subtitle: 'What did PORTA decide, apply, or fail to change?'
  }
};

export function ViewContextBar() {
  const location = useLocation();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const lastUpdatedUtc = useFleetSlice((state) => state.lastUpdatedUtc);
  const liveConnected = useFleetSlice((state) => state.liveConnected);
  const wsStatus = useWsConnectionStatus();
  const meta = pageMeta[location.pathname] ?? pageMeta['/system-health'] ?? {
    title: 'System Health',
    subtitle: 'Runtime, session, and activity ingest truth'
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
        <div className="view-context-copy">
          <p className="view-title">Operational view</p>
          <h1 className="view-heading">{meta.title}</h1>
          <p className="view-subtitle">{meta.subtitle}</p>
        </div>
        <div className="context-actions">
          <button type="button" className="context-action-button" onClick={copyLink}>
            {copyState === 'copied' ? 'Link Copied' : copyState === 'error' ? 'Copy Failed' : 'Copy Link'}
          </button>
        </div>
      </div>

      <div className="context-status-strip">
        <div className="context-status-card">
          <span className="context-status-label">Control plane</span>
          <strong className={`context-status-value ${liveConnected ? 'ok' : 'warn'}`}>
            {liveConnected ? 'Connected' : 'Delayed'}
          </strong>
        </div>
        <div className="context-status-card" title={wsStatus.detail}>
          <span className="context-status-label">Realtime channel</span>
          <strong className={`context-status-value ${wsStatus.tone}`}>
            {wsStatus.statusLabel}
          </strong>
        </div>
        <div className="context-status-card" title={formatUtc(lastUpdatedUtc)}>
          <span className="context-status-label">Last update</span>
          <strong className="context-status-value neutral">
            {formatRelativeFromNow(lastUpdatedUtc)}
          </strong>
        </div>
      </div>
    </section>
  );
}
