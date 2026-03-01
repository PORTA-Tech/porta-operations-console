import { useEffect, useMemo, useState } from 'react';
import {
  getAuthAccessHelp,
  registerAuthUser,
  resetForgottenPassword,
  type AuthAccessHelp,
  type AuthSessionUser
} from '../../api/auth';
import { authClient } from '../../api/authClient';
import { toApiError } from '../../api/client';

interface LoginPageProps {
  loading: boolean;
  error: string | null;
  onSubmit: (userId: string, password: string) => Promise<boolean>;
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
  const remembered = authClient.getRememberedUserId();
  const [userId, setUserId] = useState(remembered);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUserId, setRememberUserId] = useState(remembered.length > 0);
  const [showRegister, setShowRegister] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const [help, setHelp] = useState<AuthAccessHelp | null>(null);
  const [helpLoading, setHelpLoading] = useState(true);

  const [registerUserId, setRegisterUserId] = useState('');
  const [registerDisplayName, setRegisterDisplayName] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerSignupCode, setRegisterSignupCode] = useState('');
  const [registerRole, setRegisterRole] = useState<AuthSessionUser['role']>('developer');
  const [registerLoading, setRegisterLoading] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);

  const [forgotUserId, setForgotUserId] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotPassword, setForgotPassword] = useState('');
  const [forgotPasswordConfirm, setForgotPasswordConfirm] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

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

  const registerUserIdPattern = help?.user_id_rules.pattern ?? '^[a-zA-Z0-9][a-zA-Z0-9._@-]{2,63}$';
  const registerUserMin = help?.user_id_rules.min_length ?? 3;
  const registerUserMax = help?.user_id_rules.max_length ?? 128;
  const registerPasswordMin = help?.password_rules.min_length ?? 8;
  const signupCodeLength = help?.signup_code_length ?? 6;
  const signupCodeRequired = Boolean(help?.signup_code_required);

  const registerUserIdValid = new RegExp(registerUserIdPattern).test(registerUserId.trim());
  const registerPasswordValid = isPasswordValid(registerPassword, help);
  const signupCodeValid = !signupCodeRequired
    || new RegExp(`^\\d{${signupCodeLength}}$`).test(registerSignupCode.trim());
  const canRegister = registerUserIdValid
    && registerDisplayName.trim().length > 0
    && signupCodeValid
    && registerPasswordValid
    && !registerLoading;
  const canResetForgotPassword = forgotUserId.trim().length > 0
    && /^\d{6}$/.test(forgotCode.trim())
    && forgotPassword.length > 0
    && forgotPassword === forgotPasswordConfirm
    && isPasswordValid(forgotPassword, help)
    && !forgotLoading;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId.trim() || !password) {
      return;
    }
    const ok = await onSubmit(userId.trim(), password);
    if (ok) {
      authClient.setRememberedUserId(rememberUserId ? userId.trim() : '');
    }
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
        password: registerPassword,
        signup_code: registerSignupCode.trim()
      });
      if (result.ok) {
        setRegisterMessage(`Account created for ${result.user.user_id}.`);
        setUserId(result.user.user_id);
        setPassword('');
        setRegisterPassword('');
        setRegisterSignupCode('');
        setShowRegister(false);
      }
    } catch (err) {
      const parsed = toApiError(err);
      setRegisterMessage(`${parsed.code}: ${parsed.message}`);
    } finally {
      setRegisterLoading(false);
    }
  };

  const resetForgot = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canResetForgotPassword) {
      setForgotMessage('Please complete all fields and password rules.');
      return;
    }
    setForgotLoading(true);
    setForgotMessage(null);
    try {
      const result = await resetForgottenPassword({
        user_id: forgotUserId.trim(),
        reset_code: forgotCode.trim(),
        new_password: forgotPassword
      });
      if (result.ok) {
        setForgotMessage(`Password updated for ${forgotUserId.trim()}. You can sign in now.`);
        setPassword('');
        setUserId(forgotUserId.trim());
        setForgotCode('');
        setForgotPassword('');
        setForgotPasswordConfirm('');
      }
    } catch (err) {
      const parsed = toApiError(err);
      setForgotMessage(`${parsed.code}: ${parsed.message}`);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-card compact">
        <p className="login-brand">PORTA Operations Console</p>
        <p className="login-subtitle">Sign in to access Internal R&D controls.</p>

        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label>
            Email
            <input
              autoComplete="username"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="name@company.com"
            />
          </label>
          <label>
            Password
            <div className="login-password-row">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="your password"
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
          <label className="login-checkbox">
            <input
              type="checkbox"
              checked={rememberUserId}
              onChange={(event) => setRememberUserId(event.target.checked)}
            />
            Remember this user ID on this device
          </label>
          <button type="submit" disabled={loading || !userId.trim() || !password}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        {error ? <p className="error-line">{error}</p> : null}

        <button type="button" className="login-toggle-link" onClick={() => setShowForgot((value) => !value)}>
          {showForgot ? 'Hide password reset' : 'Forgot password?'}
        </button>
        {showForgot ? (
          <form className="login-register-form" onSubmit={(event) => void resetForgot(event)}>
            <p className="muted-line">Ask an admin for a 6-digit password reset code, then set a new password.</p>
            <label>
              Email
              <input
                value={forgotUserId}
                onChange={(event) => setForgotUserId(event.target.value)}
                placeholder="name@company.com"
                required
              />
            </label>
            <label>
              Reset code
              <input
                value={forgotCode}
                onChange={(event) => setForgotCode(event.target.value)}
                inputMode="numeric"
                pattern="\\d{6}"
                placeholder="6-digit code"
                required
              />
            </label>
            <label>
              New password
              <div className="login-password-row">
                <input
                  type={showForgotPassword ? 'text' : 'password'}
                  value={forgotPassword}
                  onChange={(event) => setForgotPassword(event.target.value)}
                  minLength={registerPasswordMin}
                  required
                />
                <button type="button" onClick={() => setShowForgotPassword((value) => !value)}>
                  {showForgotPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <label>
              Confirm new password
              <input
                type={showForgotPassword ? 'text' : 'password'}
                value={forgotPasswordConfirm}
                onChange={(event) => setForgotPasswordConfirm(event.target.value)}
                minLength={registerPasswordMin}
                required
              />
            </label>
            <p className="muted-line">Password policy: {passwordRuleText(help)}.</p>
            <button type="submit" disabled={!canResetForgotPassword}>
              {forgotLoading ? 'Updating password...' : 'Reset password'}
            </button>
            {forgotMessage ? <p className="muted-line">{forgotMessage}</p> : null}
          </form>
        ) : null}

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
                    Email
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
                  <p className="muted-line">Use a valid email address ({registerUserMin}-{registerUserMax} chars).</p>

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

                  {signupCodeRequired ? (
                    <>
                      <label>
                        Admin access code
                        <input
                          value={registerSignupCode}
                          onChange={(event) => setRegisterSignupCode(event.target.value)}
                          inputMode="numeric"
                          pattern={`\\d{${signupCodeLength}}`}
                          placeholder={`${signupCodeLength}-digit code`}
                          required
                        />
                      </label>
                      <p className="muted-line">Account creation requires an admin-issued {signupCodeLength}-digit code.</p>
                    </>
                  ) : null}

                  <label>
                    Password
                    <div className="login-password-row">
                      <input
                        type={showRegisterPassword ? 'text' : 'password'}
                        value={registerPassword}
                        onChange={(event) => setRegisterPassword(event.target.value)}
                        minLength={registerPasswordMin}
                        required
                      />
                      <button type="button" onClick={() => setShowRegisterPassword((value) => !value)}>
                        {showRegisterPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
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
