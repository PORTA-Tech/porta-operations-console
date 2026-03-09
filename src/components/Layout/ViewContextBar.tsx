import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useFleetSlice } from '../../store/fleetSlice';
import { useWsConnectionStatus } from '../../hooks/useWsConnectionStatus';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';

export function ViewContextBar() {
  const location = useLocation();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const lastUpdatedUtc = useFleetSlice((state) => state.lastUpdatedUtc);
  const liveConnected = useFleetSlice((state) => state.liveConnected);
  const wsStatus = useWsConnectionStatus();

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
          <p className="view-title">Operations Console</p>
          <p className="view-subtitle">System Health, User Activity, Trust Level, and Actions</p>
        </div>
        <div className="context-actions">
          <button type="button" onClick={copyLink}>
            {copyState === 'copied' ? 'Link Copied' : copyState === 'error' ? 'Copy Failed' : 'Copy Link'}
          </button>
          <p className="freshness-pill">
            Data Stream: <strong>{liveConnected ? 'Connected' : 'Delayed'}</strong>
            {' | '}
            <span className={`freshness-state ${wsStatus.tone}`} title={wsStatus.detail}>
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
