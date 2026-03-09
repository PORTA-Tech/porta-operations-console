import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/Layout/AppShell';
import { useFleetState } from './hooks/useFleetState';
import { useAuthSession } from './hooks/useAuthSession';
import { LoginPage } from './pages/Auth/LoginPage';
import { SystemHealthPage } from './pages/SystemHealth/SystemHealthPage';
import { UserActivityPage } from './pages/UserActivity/UserActivityPage';
import { TrustLevelPage } from './pages/TrustLevel/TrustLevelPage';
import { ActionsPage } from './pages/Actions/ActionsPage';

const DEFAULT_ROUTE = '/system-health';

function ProtectedConsoleApp(props: {
  authUser: {
    user_id: string;
    role: string;
    display_name: string;
    avatar_url?: string | null;
  };
  onLogout: () => Promise<void>;
  onUpdateProfile: (input: { display_name?: string; avatar_url?: string | null }) => Promise<boolean>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}) {
  const { loading, error } = useFleetState();

  return (
    <AppShell
      authUser={props.authUser}
      onLogout={props.onLogout}
      onUpdateProfile={props.onUpdateProfile}
      onChangePassword={props.onChangePassword}
    >
      {loading ? <p>Connecting to control plane...</p> : null}
      {error && error.status !== 403 ? <p className="error-line">{error.code}: {error.message}</p> : null}
      <Routes>
        <Route path="/" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/system-health" element={<SystemHealthPage />} />
        <Route path="/user-activity" element={<UserActivityPage />} />
        <Route path="/trust-level" element={<TrustLevelPage />} />
        <Route path="/actions" element={<ActionsPage />} />
        <Route path="/operations" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/alerts" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/cohorts" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/machines" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/experiments" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/rollouts" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/policies" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/audit-traces" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/config" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/security-access" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/console" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/nodes" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/rollout" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/login" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  const auth = useAuthSession();
  const [loginInFlight, setLoginInFlight] = useState(false);

  if (!auth.ready) {
    return (
      <div className="login-page">
        <section className="login-card">
          <p className="login-brand">PORTA Operations Console</p>
          <p className="login-subtitle">Restoring session...</p>
        </section>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          auth.authenticated ? (
            <Navigate to={DEFAULT_ROUTE} replace />
          ) : (
            <LoginPage
              loading={loginInFlight}
              error={auth.error}
              onSubmit={async (userId, password) => {
                setLoginInFlight(true);
                try {
                  return await auth.login(userId, password);
                } finally {
                  setLoginInFlight(false);
                }
              }}
            />
          )
        }
      />
      <Route
        path="*"
        element={
          auth.authenticated && auth.user ? (
            <ProtectedConsoleApp
              authUser={auth.user}
              onLogout={auth.logout}
              onUpdateProfile={auth.updateProfile}
              onChangePassword={auth.changePassword}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}
