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

function passwordRuleText(help: AuthAccessHelp | null): string {
  const rules = help?.password_rules;
  if (!rules) return 'Use a strong password.';
  const pieces = [`min ${rules.min_length} chars`];
  if (rules.requires_upper) pieces.push('1 uppercase');
  if (rules.requires_lower) pieces.push('1 lowercase');
  if (rules.requires_number) pieces.push('1 number');
  return pieces.join(', ');
}

function isPasswordValid(password: string, help: AuthAccessHelp | null): boolean {
  const rules = help?.password_rules;
  if (!rules) return password.length >= 8;
  if (password.length < rules.min_length) return false;
  if (rules.requires_upper && !/[A-Z]/.test(password)) return false;
  if (rules.requires_lower && !/[a-z]/.test(password)) return false;
  if (rules.requires_number && !/[0-9]/.test(password)) return false;
  return true;
}

export function LoginPage({ loading, error, onSubmit }: LoginPageProps) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showRegister, setShowRegister] = useState(false);

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

  const registerUserIdPattern = help?.user_id_rules.pattern ?? '^[a-z][a-z0-9._-]{2,31}$';
  const registerUserMin = help?.user_id_rules.min_length ?? 3;
  const registerUserMax = help?.user_id_rules.max_length ?? 32;
  const registerPasswordMin = help?.password_rules.min_length ?? 8;

  const registerUserIdValid = new RegExp(registerUserIdPattern).test(registerUserId.trim());
  const registerPasswordValid = isPasswordValid(registerPassword, help);
  const canRegister = registerUserIdValid
    && registerDisplayName.trim().length > 0
    && registerPasswordValid
    && !registerLoading;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId.trim() || !password) {
      return;
    }
    await onSubmit(userId.trim(), password);
  };

  const register = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRegister) {
      setRegisterMessage('Please fix validation errors first.');
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
        setRegisterMessage(`Account created for ${result.user.user_id}.`);
        setUserId(result.user.user_id);
        setPassword('');
        setRegisterPassword('');
        setShowRegister(false);
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
      <section className="login-card compact">
        <p className="login-brand">PORTA Operations Console</p>
        <p className="login-subtitle">Sign in to access Internal R&D controls.</p>

        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label>
            User ID
            <input
              autoComplete="username"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="your user id"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="your password"
            />
          </label>
          <button type="submit" disabled={loading || !userId.trim() || !password}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        {error ? <p className="error-line">{error}</p> : null}

        <section className="login-access-panel">
          <button type="button" className="login-toggle-link" onClick={() => setShowRegister((value) => !value)}>
            {showRegister ? 'Hide account creation' : "Don't have an account yet?"}
          </button>

          {showRegister ? (
            helpLoading ? (
              <p className="muted-line">Loading access rules...</p>
            ) : help ? (
              help.signup_enabled ? (
                <form className="login-register-form" onSubmit={(event) => void register(event)}>
                  <label>
                    New user ID
                    <input
                      value={registerUserId}
                      onChange={(event) => setRegisterUserId(event.target.value)}
                      placeholder={help.user_id_rules.example}
                      pattern={registerUserIdPattern}
                      minLength={registerUserMin}
                      maxLength={registerUserMax}
                      required
                    />
                  </label>
                  <p className="muted-line">Allowed: lowercase letters, numbers, dot, dash, underscore ({registerUserMin}-{registerUserMax} chars).</p>

                  <label>
                    Display name
                    <input
                      value={registerDisplayName}
                      onChange={(event) => setRegisterDisplayName(event.target.value)}
                      placeholder="Your display name"
                      required
                    />
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
                      minLength={registerPasswordMin}
                      required
                    />
                  </label>
                  <p className="muted-line">Password policy: {passwordRuleText(help)}.</p>

                  <button type="submit" disabled={!canRegister}>
                    {registerLoading ? 'Creating account...' : 'Create account'}
                  </button>
                </form>
              ) : (
                <p className="muted-line">Self registration is disabled. Contact your platform admin.</p>
              )
            ) : (
              <p className="muted-line">Access helper is unavailable. Contact your platform admin.</p>
            )
          ) : null}

          {registerMessage ? <p className="muted-line">{registerMessage}</p> : null}
        </section>
      </section>
    </div>
  );
}

