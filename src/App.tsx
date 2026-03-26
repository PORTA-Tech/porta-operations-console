import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/Layout/AppShell';
import { useFleetState } from './hooks/useFleetState';
import { SystemHealthPage } from './pages/SystemHealth/SystemHealthPage';
import { UserActivityPage } from './pages/UserActivity/UserActivityPage';
import { TrustLevelPage } from './pages/TrustLevel/TrustLevelPage';
import { ActionsPage } from './pages/Actions/ActionsPage';
import { GrowthPage } from './pages/Growth/GrowthPage';

const DEFAULT_ROUTE = '/system-health';

export default function App() {
  const { loading, error } = useFleetState();

  return (
    <AppShell>
      {loading ? <p>Connecting to control plane...</p> : null}
      {error && error.status !== 403 ? <p className="error-line">{error.code}: {error.message}</p> : null}
      <Routes>
        <Route path="/" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/system-health" element={<SystemHealthPage />} />
        <Route path="/user-activity" element={<UserActivityPage />} />
        <Route path="/trust-level" element={<TrustLevelPage />} />
        <Route path="/actions" element={<ActionsPage />} />
        <Route path="/growth" element={<GrowthPage />} />
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
