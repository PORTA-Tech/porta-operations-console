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
  onCreateSignupCode?: (ttlMinutes?: number) => Promise<{ ok: boolean; code: string; expires_at_utc: string } | null>;
  onCreatePasswordResetCode?: (userId: string, ttlMinutes?: number) => Promise<{ ok: boolean; user_id: string; code: string; expires_at_utc: string } | null>;
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

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function AppShell({
  children,
  authUser,
  onLogout,
  onUpdateProfile,
  onChangePassword,
  onCreateSignupCode,
  onCreatePasswordResetCode
}: AppShellProps) {
  const location = useLocation();
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const glossaryTerms = getGlossaryTerms(location.pathname);

  const [displayName, setDisplayName] = useState(authUser?.display_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(authUser?.avatar_url ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  const [resetTargetUser, setResetTargetUser] = useState('');
  const [generatedSignupCode, setGeneratedSignupCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [generatedResetCode, setGeneratedResetCode] = useState<{ userId: string; code: string; expiresAt: string } | null>(null);

  useEffect(() => {
    setDisplayName(authUser?.display_name ?? '');
    setAvatarUrl(authUser?.avatar_url ?? '');
  }, [authUser?.display_name, authUser?.avatar_url]);

  const saveProfile = async (): Promise<void> => {
    if (!onUpdateProfile) return;
    setBusy(true);
    setAccountMessage(null);
    try {
      const ok = await onUpdateProfile({
        display_name: displayName.trim(),
        avatar_url: avatarUrl.trim().length > 0 ? avatarUrl.trim() : null
      });
      setAccountMessage(ok ? 'Profile updated.' : 'Profile update failed.');
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (): Promise<void> => {
    if (!onChangePassword || !currentPassword || !newPassword) return;
    setBusy(true);
    setAccountMessage(null);
    try {
      const ok = await onChangePassword(currentPassword, newPassword);
      setAccountMessage(ok ? 'Password updated.' : 'Password update failed.');
      if (ok) {
        setCurrentPassword('');
        setNewPassword('');
      }
    } finally {
      setBusy(false);
    }
  };

  const createSignupCode = async (): Promise<void> => {
    if (!onCreateSignupCode) return;
    setBusy(true);
    setAccountMessage(null);
    try {
      const result = await onCreateSignupCode(30);
      if (result) {
        setGeneratedSignupCode({ code: result.code, expiresAt: result.expires_at_utc });
        setAccountMessage('Signup code generated.');
      } else {
        setAccountMessage('Signup code generation failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const createResetCode = async (): Promise<void> => {
    if (!onCreatePasswordResetCode || !resetTargetUser.trim()) return;
    setBusy(true);
    setAccountMessage(null);
    try {
      const result = await onCreatePasswordResetCode(resetTargetUser.trim(), 30);
      if (result) {
        setGeneratedResetCode({ userId: result.user_id, code: result.code, expiresAt: result.expires_at_utc });
        setAccountMessage(`Password reset code generated for ${result.user_id}.`);
      } else {
        setAccountMessage('Password reset code generation failed.');
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
                <p className="muted-line">@{authUser.user_id} · {authUser.role}</p>

                <div className="account-section">
                  <h5>Profile</h5>
                  <label>
                    Display name
                    <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                  </label>
                  <label>
                    Profile picture URL
                    <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." />
                  </label>
                  <button type="button" onClick={() => void saveProfile()} disabled={busy || !displayName.trim()}>Save profile</button>
                </div>

                <div className="account-section">
                  <h5>Security</h5>
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
                      <input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="min 8 + upper/lower/number" />
                      <button type="button" onClick={() => setShowNewPassword((v) => !v)}>{showNewPassword ? 'Hide' : 'Show'}</button>
                    </div>
                  </label>
                  <button type="button" onClick={() => void savePassword()} disabled={busy || !currentPassword || !newPassword}>Update password</button>
                </div>

                {authUser.role === 'admin' ? (
                  <div className="account-section">
                    <h5>Admin Access Codes</h5>
                    <button type="button" onClick={() => void createSignupCode()} disabled={busy}>Generate account creation code</button>
                    {generatedSignupCode ? (
                      <p className="muted-line">
                        Code: <strong>{generatedSignupCode.code}</strong> (expires {new Date(generatedSignupCode.expiresAt).toLocaleString()})
                        {' '}
                        <button type="button" onClick={() => void copyText(generatedSignupCode.code)}>Copy</button>
                      </p>
                    ) : null}

                    <label>
                      User ID for password reset
                      <input value={resetTargetUser} onChange={(event) => setResetTargetUser(event.target.value)} placeholder="name@company.com" />
                    </label>
                    <button type="button" onClick={() => void createResetCode()} disabled={busy || !resetTargetUser.trim()}>Generate password reset code</button>
                    {generatedResetCode ? (
                      <p className="muted-line">
                        {generatedResetCode.userId}: <strong>{generatedResetCode.code}</strong> (expires {new Date(generatedResetCode.expiresAt).toLocaleString()})
                        {' '}
                        <button type="button" onClick={() => void copyText(generatedResetCode.code)}>Copy</button>
                      </p>
                    ) : null}
                  </div>
                ) : null}

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
