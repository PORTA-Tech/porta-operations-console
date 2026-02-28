import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { glossaryTerms } from '../../data/glossary';
import { GlossaryDrawer } from './GlossaryDrawer';
import { ViewContextBar } from './ViewContextBar';

interface AppShellProps {
  children: ReactNode;
}

const navItems = [
  { to: '/', label: 'Fleet Overview' },
  { to: '/console', label: 'System Health' },
  { to: '/operations', label: 'Audit & Traces' },
  { to: '/rollout', label: 'Rollouts' },
  { to: '/cohorts', label: 'Cohorts' },
  { to: '/nodes', label: 'Machines' },
  { to: '/config', label: 'Config Integrity' }
];

export function AppShell({ children }: AppShellProps) {
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">PORTA Operations Console</Link>
        <span className="topbar-pill">Internal R&D Edition</span>
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

