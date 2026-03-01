import { useEffect, useState, type ReactNode } from 'react';
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
    avatar_url?: string | null;
  } | null;
  onLogout?: () => void | Promise<void>;
  onUpdateProfile?: (input: { display_name?: string; avatar_url?: string | null }) => Promise<boolean>;
  onChangePassword?: (currentPassword: string, newPassword: string) => Promise<boolean>;
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

function initialsFromName(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'U';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function AppShell({
  children,
  authUser,
  onLogout,
  onUpdateProfile,
  onChangePassword
}: AppShellProps) {
  const location = useLocation();
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const glossaryTerms = getGlossaryTerms(location.pathname);

  const [displayName, setDisplayName] = useState(authUser?.display_name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordEditorOpen, setPasswordEditorOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(authUser?.display_name ?? '');
  }, [authUser?.display_name]);

  const saveProfile = async (): Promise<void> => {
    if (!onUpdateProfile) return;
    setBusy(true);
    setAccountMessage(null);
    try {
      const ok = await onUpdateProfile({
        display_name: displayName.trim()
      });
      setAccountMessage(ok ? 'Profile updated.' : 'Profile update failed.');
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (): Promise<void> => {
    if (!onChangePassword || !currentPassword || !newPassword || !confirmNewPassword) return;
    if (newPassword !== confirmNewPassword) {
      setAccountMessage('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    setAccountMessage(null);
    try {
      const ok = await onChangePassword(currentPassword, newPassword);
      setAccountMessage(ok ? 'Password updated.' : 'Password update failed.');
      if (ok) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setPasswordEditorOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">PORTA Operations Console</Link>
        <span className="topbar-pill">Internal R&D Edition</span>
        {authUser ? (
          <div className="topbar-auth">
            <button type="button" className="account-trigger" onClick={() => setAccountOpen((value) => !value)}>
              {authUser.avatar_url ? (
                <img src={authUser.avatar_url} alt={authUser.display_name} className="account-avatar" />
              ) : (
                <span className="account-avatar initials">{initialsFromName(authUser.display_name)}</span>
              )}
              <span>{authUser.display_name}</span>
            </button>
            {accountOpen ? (
              <section className="account-menu">
                <h4>Account</h4>
                <p className="muted-line">{authUser.display_name} · {authUser.role}</p>
                <p className="muted-line">Email: {authUser.user_id}</p>

                <div className="account-section">
                  <h5>Profile</h5>
                  <label>
                    Display name
                    <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                  </label>
                  <button type="button" onClick={() => void saveProfile()} disabled={busy || !displayName.trim()}>Save profile</button>
                </div>

                <div className="account-section">
                  <h5>Security</h5>
                  {!passwordEditorOpen ? (
                    <button type="button" onClick={() => setPasswordEditorOpen(true)} disabled={busy}>
                      Change password
                    </button>
                  ) : (
                    <>
                      <label>
                        Current password
                        <div className="account-password-row">
                          <input type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                          <button type="button" onClick={() => setShowCurrentPassword((v) => !v)}>{showCurrentPassword ? 'Hide' : 'Show'}</button>
                        </div>
                      </label>
                      <label>
                        New password
                        <div className="account-password-row">
                          <input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 8 chars, uppercase, lowercase, number" />
                          <button type="button" onClick={() => setShowNewPassword((v) => !v)}>{showNewPassword ? 'Hide' : 'Show'}</button>
                        </div>
                      </label>
                      <label>
                        Confirm new password
                        <div className="account-password-row">
                          <input type={showConfirmPassword ? 'text' : 'password'} value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} />
                          <button type="button" onClick={() => setShowConfirmPassword((v) => !v)}>{showConfirmPassword ? 'Hide' : 'Show'}</button>
                        </div>
                      </label>
                      <div className="button-row">
                        <button type="button" onClick={() => void savePassword()} disabled={busy || !currentPassword || !newPassword || !confirmNewPassword}>
                          Update password
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordEditorOpen(false);
                            setCurrentPassword('');
                            setNewPassword('');
                            setConfirmNewPassword('');
                          }}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <button type="button" onClick={onLogout} className="danger" disabled={busy || !onLogout}>Log out</button>
                {accountMessage ? <p className="muted-line">{accountMessage}</p> : null}
              </section>
            ) : null}
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
