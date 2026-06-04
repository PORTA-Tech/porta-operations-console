import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/Layout/AppShell';
import { useFleetState } from './hooks/useFleetState';
import { SystemHealthPage } from './pages/SystemHealth/SystemHealthPage';
import { UserActivityPage } from './pages/UserActivity/UserActivityPage';
import { TrustLevelPage } from './pages/TrustLevel/TrustLevelPage';
import { ActionsPage } from './pages/Actions/ActionsPage';
import { DigestPage } from './pages/Digest/DigestPage';
import { GrowthPage } from './pages/Growth/GrowthPage';

export default function App() {
  // Keep fleet state running for liveConnected in topbar + sidebar
  useFleetState();

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/system-health" replace />} />
        <Route path="/system-health" element={<SystemHealthPage />} />
        <Route path="/user-activity" element={<UserActivityPage />} />
        <Route path="/trust-level" element={<TrustLevelPage />} />
        <Route path="/actions" element={<ActionsPage />} />
        <Route path="/digest" element={<DigestPage />} />
        <Route path="/growth" element={<GrowthPage />} />
        <Route path="*" element={<Navigate to="/system-health" replace />} />
      </Routes>
    </AppShell>
  );
}
