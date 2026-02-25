import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

interface AppShellProps {
  children: ReactNode;
}

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/console', label: 'Console Foundations' },
  { to: '/operations', label: 'Console Operations' },
  { to: '/rollout', label: 'Rollout Center' },
  { to: '/cohorts', label: 'Cohorts' },
  { to: '/nodes', label: 'Nodes' },
  { to: '/config', label: 'Config Integrity' }
];

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">PORTA Fleet Console</Link>
        <span className="topbar-pill">8B Operations Surface</span>
      </header>
      <div className="shell-main">
        <nav className="sidebar">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

