import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/Layout/AppShell';
import { FleetOverview } from './pages/Dashboard/FleetOverview';
import { CohortOverview } from './pages/Dashboard/CohortOverview';
import { RolloutControl } from './pages/RolloutCenter/RolloutControl';
import { BlastRadiusPreview } from './pages/RolloutCenter/BlastRadiusPreview';
import { DryRunSimulation } from './pages/RolloutCenter/DryRunSimulation';
import { AdapterActivationControls } from './pages/RolloutCenter/AdapterActivationControls';
import { AdapterObservabilityPanel } from './pages/RolloutCenter/AdapterObservabilityPanel';
import { AdapterPromotionPathPanel } from './pages/RolloutCenter/AdapterPromotionPathPanel';
import { RolloutVerdictPanel } from './pages/RolloutCenter/RolloutVerdictPanel';
import { NodeList } from './pages/NodeDrilldown/NodeList';
import { NodeDetails } from './pages/NodeDrilldown/NodeDetails';
import { ConfigIntegrityPage } from './pages/ConfigIntegrity/ConfigIntegrityPage';
import { ConsoleFoundationPage } from './pages/ConsoleFoundation/ConsoleFoundationPage';
import { useFleetState } from './hooks/useFleetState';
import { useNodeDrilldown } from './hooks/useNodeDrilldown';
import { useRolloutEvaluation } from './hooks/useRolloutEvaluation';
import { AlertsPage } from './pages/Alerts/AlertsPage';
import { ExperimentsPage } from './pages/Experiments/ExperimentsPage';
import { PoliciesPage } from './pages/Policies/PoliciesPage';
import { AuditTracesPage } from './pages/Audit/AuditTracesPage';
import { SecurityAccessPage } from './pages/Security/SecurityAccessPage';
import { useAuthSession } from './hooks/useAuthSession';
import { LoginPage } from './pages/Auth/LoginPage';

function DashboardPage() {
  return <FleetOverview />;
}

function RolloutPage() {
  const evaluation = useRolloutEvaluation();

  return (
    <div className="stack">
      <section className="rollout-zone">
        <h2 className="rollout-zone-title">Decision</h2>
        <RolloutVerdictPanel {...evaluation} />
      </section>
      <section className="rollout-zone">
        <h2 className="rollout-zone-title">What Will Happen</h2>
        <BlastRadiusPreview {...evaluation} />
        <DryRunSimulation {...evaluation} />
      </section>
      <section className="rollout-zone">
        <h2 className="rollout-zone-title">Controls and Observability</h2>
        <RolloutControl evaluation={evaluation.data} />
        <AdapterActivationControls />
        <AdapterPromotionPathPanel />
        <AdapterObservabilityPanel evaluation={evaluation.data} />
      </section>
    </div>
  );
}

function NodePage() {
  const nodeSnapshot = useNodeDrilldown();

  return (
    <div className="stack">
      <NodeList {...nodeSnapshot} />
      <NodeDetails {...nodeSnapshot} />
    </div>
  );
}

function ConfigPage() {
  return <ConfigIntegrityPage />;
}

function ProtectedConsoleApp(props: {
  authUser: {
    user_id: string;
    role: string;
    display_name: string;
    reauth_expires_at_utc?: string | null;
  };
  onLogout: () => Promise<void>;
  onReauth: (password: string) => Promise<boolean>;
}) {
  const { loading, error } = useFleetState();

  const handleReauth = async (): Promise<void> => {
    const password = window.prompt('Enter your password to re-authenticate for sensitive actions.');
    if (!password) return;
    const ok = await props.onReauth(password);
    if (!ok) {
      window.alert('Re-authentication failed. Verify password and retry.');
      return;
    }
    window.alert('Re-authentication refreshed.');
  };

  return (
    <AppShell authUser={props.authUser} onReauth={handleReauth} onLogout={props.onLogout}>
      {loading ? <p>Connecting to control plane...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/cohorts" element={<CohortOverview />} />
        <Route path="/machines" element={<NodePage />} />
        <Route path="/experiments" element={<ExperimentsPage />} />
        <Route path="/rollouts" element={<RolloutPage />} />
        <Route path="/policies" element={<PoliciesPage />} />
        <Route path="/audit-traces" element={<AuditTracesPage />} />
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/security-access" element={<SecurityAccessPage />} />
        <Route path="/system-health" element={<ConsoleFoundationPage />} />
        <Route path="/console" element={<Navigate to="/system-health" replace />} />
        <Route path="/operations" element={<Navigate to="/audit-traces" replace />} />
        <Route path="/nodes" element={<Navigate to="/machines" replace />} />
        <Route path="/rollout" element={<Navigate to="/rollouts" replace />} />
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
                  await auth.login(userId, password);
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
            <ProtectedConsoleApp authUser={auth.user} onLogout={auth.logout} onReauth={auth.reauth} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}
