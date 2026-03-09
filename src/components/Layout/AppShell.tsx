import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
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

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/system-health" className="brand">PORTA Operations Console</Link>
        <span className="topbar-pill">Internal R&amp;D Edition</span>
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
          <ViewContextBar />
          {children}
        </main>
      </div>
    </div>
  );
}
