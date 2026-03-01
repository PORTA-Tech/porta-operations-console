import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { getGlossaryTerms } from '../../data/glossary';
import { GlossaryDrawer } from './GlossaryDrawer';
import { ViewContextBar } from './ViewContextBar';

interface AppShellProps {
  children: ReactNode;
  authUser?: {
    user_id: string;
    role: string;
    display_name: string;
    reauth_expires_at_utc?: string | null;
  } | null;
  onReauth?: () => void | Promise<void>;
  onLogout?: () => void | Promise<void>;
}

const navItems = [
  { to: '/', label: 'Fleet Overview' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/cohorts', label: 'Cohorts' },
  { to: '/machines', label: 'Machines' },
  { to: '/experiments', label: 'Experiments' },
  { to: '/rollouts', label: 'Rollouts' },
  { to: '/policies', label: 'Policies' },
  { to: '/audit-traces', label: 'Audit & Traces' },
  { to: '/config', label: 'Config Integrity' },
  { to: '/security-access', label: 'Security & Access' },
  { to: '/system-health', label: 'System Health' }
];

export function AppShell({ children, authUser, onReauth, onLogout }: AppShellProps) {
  const location = useLocation();
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const glossaryTerms = getGlossaryTerms(location.pathname);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">PORTA Operations Console</Link>
        <span className="topbar-pill">Internal R&D Edition</span>
        {authUser ? (
          <div className="topbar-auth">
            <span className="topbar-pill">{authUser.display_name} ({authUser.role})</span>
            <button type="button" onClick={onReauth} disabled={!onReauth}>Re-auth</button>
            <button type="button" onClick={onLogout} disabled={!onLogout}>Logout</button>
          </div>
        ) : null}
      </header>
      <div className="shell-main">
        <nav className="sidebar">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="content">
          <ViewContextBar onOpenGlossary={() => setGlossaryOpen(true)} />
          {children}
        </main>
      </div>
      <GlossaryDrawer open={glossaryOpen} terms={glossaryTerms} onClose={() => setGlossaryOpen(false)} />
    </div>
  );
}

