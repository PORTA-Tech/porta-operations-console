import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/Layout/AppShell';
import { useFleetState } from './hooks/useFleetState';
import { useAuthSession } from './hooks/useAuthSession';
import { LoginPage } from './pages/Auth/LoginPage';
import { OperationsConsolePage } from './pages/Operations/OperationsConsolePage';

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
        <Route path="/" element={<OperationsConsolePage />} />
        <Route path="/operations" element={<Navigate to="/" replace />} />
        <Route path="/alerts" element={<Navigate to="/" replace />} />
        <Route path="/cohorts" element={<Navigate to="/" replace />} />
        <Route path="/machines" element={<Navigate to="/" replace />} />
        <Route path="/experiments" element={<Navigate to="/" replace />} />
        <Route path="/rollouts" element={<Navigate to="/" replace />} />
        <Route path="/policies" element={<Navigate to="/" replace />} />
        <Route path="/audit-traces" element={<Navigate to="/" replace />} />
        <Route path="/config" element={<Navigate to="/" replace />} />
        <Route path="/security-access" element={<Navigate to="/" replace />} />
        <Route path="/system-health" element={<Navigate to="/" replace />} />
        <Route path="/console" element={<Navigate to="/" replace />} />
        <Route path="/nodes" element={<Navigate to="/" replace />} />
        <Route path="/rollout" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
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
            <Navigate to="/" replace />
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
