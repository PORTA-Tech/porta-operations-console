import { useMemo, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { useFleetSlice } from '../../store/fleetSlice';
import { formatRelativeFromNow } from '../../utils/date';
import { ViewContextBar } from './ViewContextBar';

interface AppShellProps {
  children: ReactNode;
}

const navItems = [
  { to: '/system-health', label: 'System Health' },
  { to: '/user-activity', label: 'User Activity' },
  { to: '/trust-level', label: 'Trust Level' },
  { to: '/actions', label: 'Actions' }
];

interface FleetRibbonStat {
  label: string;
  count: number;
  tone: 'ok' | 'focus' | 'warn' | 'critical' | 'neutral';
}

export function AppShell({ children }: AppShellProps) {
  const summaryFeed = useMachineSummaryFeed();
  const liveConnected = useFleetSlice((state) => state.liveConnected);
  const lastUpdatedUtc = useFleetSlice((state) => state.lastUpdatedUtc);

  const fleetStats = useMemo<FleetRibbonStat[]>(() => {
    const healthy = summaryFeed.rows.filter((row) =>
      row.agentRunning &&
      row.userSessionConnected &&
      row.activityDetected &&
      !row.dbMigrationFailed &&
      !row.lastError &&
      row.captureContext === 'UserSession'
    ).length;

    const learning = summaryFeed.rows.filter((row) => row.calibrationStage !== 'calibrated').length;
    const deepWork = summaryFeed.rows.filter((row) => row.deepWorkActive).length;
    const breakNeeded = summaryFeed.rows.filter((row) => row.breakNeeded || Boolean(row.breakPendingAction)).length;

    return [
      { label: 'Healthy', count: healthy, tone: 'ok' },
      { label: 'Learning', count: learning, tone: 'warn' },
      { label: 'Deep Work', count: deepWork, tone: 'focus' },
      { label: 'Break Needed', count: breakNeeded, tone: breakNeeded > 0 ? 'critical' : 'neutral' }
    ];
  }, [summaryFeed.rows]);

  const reportingCount = summaryFeed.rows.length;
  const syncLabel = formatRelativeFromNow(lastUpdatedUtc);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand-block">
          <Link to="/system-health" className="brand">PORTA Operations Console</Link>
          <p className="brand-subtitle">Behavioral regulation command surface for machine truth, trust, and action state.</p>
        </div>
        <div className="topbar-meta">
          <span className={`topbar-signal ${liveConnected ? 'ok' : 'warn'}`}>
            {liveConnected ? 'Control Plane Connected' : 'Control Plane Delayed'}
          </span>
          <span className="topbar-pill">Internal R&amp;D Edition</span>
        </div>
      </header>

      <section className="fleet-ribbon">
        <div className="fleet-ribbon-copy">
          <p className="fleet-ribbon-label">Fleet status</p>
          <p className="fleet-ribbon-subtitle">
            {reportingCount > 0
              ? `${reportingCount} reporting machine${reportingCount === 1 ? '' : 's'} visible to the control plane.`
              : 'Waiting for reporting machines to publish summary truth.'}
          </p>
        </div>
        <div className="fleet-ribbon-stats" aria-label="Fleet status summary">
          {fleetStats.map((stat) => (
            <div key={stat.label} className={`fleet-stat-card ${stat.tone}`}>
              <span className="fleet-stat-label">{stat.label}</span>
              <strong className="fleet-stat-value">{stat.count}</strong>
            </div>
          ))}
        </div>
        <div className="fleet-ribbon-clock">
          <span className="fleet-ribbon-clock-label">Last sync</span>
          <strong>{syncLabel}</strong>
        </div>
      </section>

      <div className="shell-main">
        <nav className="sidebar">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="content">
          <ViewContextBar />
          {children}
        </main>
      </div>
    </div>
  );
}
