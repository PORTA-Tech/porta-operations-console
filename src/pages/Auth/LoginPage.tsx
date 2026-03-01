import { useEffect, useMemo, useState } from 'react';
import { getAuthAccessHelp, registerAuthUser, type AuthAccessHelp, type AuthSessionUser } from '../../api/auth';
import { toApiError } from '../../api/client';

interface LoginPageProps {
  loading: boolean;
  error: string | null;
  onSubmit: (userId: string, password: string) => Promise<void>;
}

const signupRoles: Array<{ value: AuthSessionUser['role']; label: string }> = [
  { value: 'developer', label: 'developer' },
  { value: 'viewer', label: 'viewer' },
  { value: 'auditor', label: 'auditor' },
  { value: 'operator', label: 'operator' },
  { value: 'admin', label: 'admin' }
];

export function LoginPage({ loading, error, onSubmit }: LoginPageProps) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');

  const [help, setHelp] = useState<AuthAccessHelp | null>(null);
  const [helpLoading, setHelpLoading] = useState(true);

  const [registerUserId, setRegisterUserId] = useState('');
  const [registerDisplayName, setRegisterDisplayName] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerRole, setRegisterRole] = useState<AuthSessionUser['role']>('developer');
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const next = await getAuthAccessHelp();
      if (!mounted) return;
      setHelp(next);
      setHelpLoading(false);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!help?.admin_signup_enabled && registerRole === 'admin') {
      setRegisterRole('developer');
    }
  }, [help?.admin_signup_enabled, registerRole]);

  const visibleSignupRoles = useMemo(() => {
    return signupRoles.filter((row) => row.value !== 'admin' || help?.admin_signup_enabled);
  }, [help?.admin_signup_enabled]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId.trim() || !password) {
      return;
    }
    await onSubmit(userId.trim(), password);
  };

  const register = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!registerUserId.trim() || !registerDisplayName.trim() || registerPassword.length < 6) {
      setRegisterMessage('Enter user id, display name, and a password with at least 6 characters.');
      return;
    }
    setRegisterLoading(true);
    setRegisterMessage(null);
    try {
      const result = await registerAuthUser({
        user_id: registerUserId.trim(),
        display_name: registerDisplayName.trim(),
        role: registerRole,
        password: registerPassword
      });
      if (result.ok) {
        setRegisterMessage(`Account created for ${result.user.user_id}. You can sign in now.`);
        setUserId(result.user.user_id);
        setPassword(registerPassword);
        setRegisterPassword('');
      }
    } catch (err) {
      const parsed = toApiError(err);
      setRegisterMessage(`${parsed.code}: ${parsed.message}`);
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-card">
        <p className="login-brand">PORTA Operations Console</p>
        <p className="login-subtitle">Sign in to access Internal R&D controls.</p>

        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label>
            User ID
            <input
              autoComplete="username"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="admin"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
            />
          </label>
          <button type="submit" disabled={loading || !userId.trim() || !password}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        {error ? <p className="error-line">{error}</p> : null}

        <section className="login-access-panel">
          <h4>Need access?</h4>
          {helpLoading ? <p className="muted-line">Loading access hints...</p> : null}

          {help ? (
            <>
              <p className="muted-line">
                Available accounts: {help.users.length > 0 ? help.users.map((row) => `${row.user_id} (${row.role})`).join(', ') : 'none'}
              </p>

              {help.default_credentials.length > 0 ? (
                <details>
                  <summary>Show bootstrap credentials</summary>
                  <ul className="login-credential-list">
                    {help.default_credentials.map((row) => (
                      <li key={row.user_id}>
                        <strong>{row.user_id}</strong> / <code>{row.password}</code>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {help.signup_enabled ? (
                <form className="login-register-form" onSubmit={(event) => void register(event)}>
                  <label>
                    New user ID
                    <input value={registerUserId} onChange={(event) => setRegisterUserId(event.target.value)} placeholder="my-user" />
                  </label>
                  <label>
                    Display name
                    <input value={registerDisplayName} onChange={(event) => setRegisterDisplayName(event.target.value)} placeholder="My Name" />
                  </label>
                  <label>
                    Role
                    <select value={registerRole} onChange={(event) => setRegisterRole(event.target.value as AuthSessionUser['role'])}>
                      {visibleSignupRoles.map((row) => (
                        <option key={row.value} value={row.value}>{row.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                      placeholder="At least 6 characters"
                    />
                  </label>
                  <button type="submit" disabled={registerLoading}>
                    {registerLoading ? 'Creating account...' : 'Create account'}
                  </button>
                </form>
              ) : (
                <p className="muted-line">Self registration is disabled. Contact your platform admin.</p>
              )}
            </>
          ) : (
            <p className="muted-line">Access helper is unavailable. Contact your platform admin.</p>
          )}

          {registerMessage ? <p className="muted-line">{registerMessage}</p> : null}
        </section>
      </section>
    </div>
  );
}
