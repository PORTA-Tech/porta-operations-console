import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { useMachineActionFeed } from '../../hooks/useMachineActionFeed';
import { useFleetSlice } from '../../store/fleetSlice';
import { relativeTime } from '../../utils/console';

interface AppShellProps {
  children: ReactNode;
}

const sectionMeta: Record<string, { title: string; sub: string }> = {
  '/system-health': { title: 'System Health', sub: 'Is Porta running and collecting activity correctly?' },
  '/user-activity': { title: 'User Activity', sub: 'What is Ari tracking right now across the fleet?' },
  '/trust-level':   { title: 'Baseline & Calibration', sub: 'How calibrated is each Ari agent?' },
  '/actions':       { title: 'Actions', sub: 'What did Ari decide, suggest, or apply?' },
  '/digest':        { title: 'Nightly Digest', sub: 'Did the 23:30 digest fire for each machine last night?' },
  '/growth':        { title: 'Growth', sub: 'Registrations, activation, retention, and cohort analysis.' },
};

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const [clock, setClock] = useState('');
  const summaryFeed = useMachineSummaryFeed();
  const actionsFeed = useMachineActionFeed(200);
  const liveConnected = useFleetSlice((state) => state.liveConnected);
  const lastUpdatedUtc = useFleetSlice((state) => state.lastUpdatedUtc);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour12: false }));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const machineCount = summaryFeed.rows.length;
  const activeCount = summaryFeed.rows.filter((r) => r.activityDetected).length;
  const actionCount = actionsFeed.rows.length;
  const actionBadge = actionCount >= 200 ? '200+' : String(actionCount) || '0';

  const meta = sectionMeta[location.pathname] ?? { title: 'System Health', sub: 'Is Porta running and collecting activity correctly?' };

  return (
    <div className="layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-text">por<span>ta</span></div>
          <div className="sidebar-badge">Operations Console</div>
        </div>

        <div className="sidebar-section-label">Monitor</div>
        <NavLink to="/system-health" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
            <path d="M7 10l3 3 2-4 3 3 2-2"/>
          </svg>
          System Health
          {machineCount > 0 && <span className="nav-badge">{machineCount}</span>}
        </NavLink>
        <NavLink to="/user-activity" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="8" r="4"/>
            <path d="M6 20v-2a6 6 0 0 1 12 0v2"/>
          </svg>
          User Activity
          {activeCount > 0 && <span className="nav-badge">{activeCount}</span>}
        </NavLink>
        <NavLink to="/trust-level" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          Baseline & Calibration
        </NavLink>

        <div className="sidebar-section-label">Events</div>
        <NavLink to="/actions" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          Actions
          <span className="nav-badge">{actionBadge}</span>
        </NavLink>
        <NavLink to="/digest" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          Nightly Digest
        </NavLink>

        <div className="sidebar-section-label">Analytics</div>
        <NavLink to="/growth" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
          </svg>
          Growth
        </NavLink>

        {/* FLEET FOOTER */}
        <div className="sidebar-fleet">
          <div className="fleet-row">
            <span className="fleet-label">
              <span className="fleet-dot" />
              Control Plane
            </span>
            <span className="fleet-val" style={{ color: liveConnected ? 'var(--green)' : 'var(--amber)' }}>
              {liveConnected ? 'Connected' : 'Delayed'}
            </span>
          </div>
          <div className="fleet-row">
            <span className="fleet-label">Machines</span>
            <span className="fleet-val">{machineCount}</span>
          </div>
          <div className="fleet-row">
            <span className="fleet-label">Active now</span>
            <span className="fleet-val" style={{ color: 'var(--accent)' }}>{activeCount}</span>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '8px', fontFamily: 'var(--font-m)' }}>
            Last sync: {relativeTime(lastUpdatedUtc)}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main">
        {/* TOPBAR */}
        <div className="topbar">
          <div>
            <div className="topbar-title">{meta.title}</div>
            <div className="topbar-sub">{meta.sub}</div>
          </div>
          <div className="topbar-right">
            <div className="status-pill">
              <span className={`dot ${liveConnected ? 'dot-green' : 'dot-amber'}`} />
              {liveConnected ? 'Control plane connected' : 'Control plane delayed'}
            </div>
            <div className="status-pill">
              <span className="dot dot-amber" />
              Realtime disabled
            </div>
            <div className="topbar-time">{clock}</div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="content">
          {children}
        </div>
      </main>
    </div>
  );
}
