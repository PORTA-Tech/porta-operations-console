import { useState } from 'react';

interface LoginPageProps {
  loading: boolean;
  error: string | null;
  onSubmit: (userId: string, password: string) => Promise<void>;
}

export function LoginPage({ loading, error, onSubmit }: LoginPageProps) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId.trim() || !password) {
      return;
    }
    await onSubmit(userId.trim(), password);
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
      </section>
    </div>
  );
}
