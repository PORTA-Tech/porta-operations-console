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
import { NodeList } from './pages/NodeDrilldown/NodeList';
import { NodeDetails } from './pages/NodeDrilldown/NodeDetails';
import { ConfigAuditTable } from './pages/ConfigIntegrity/ConfigAuditTable';
import { ConfigDiffViewer } from './pages/ConfigIntegrity/ConfigDiffViewer';
import { ConsoleFoundationPage } from './pages/ConsoleFoundation/ConsoleFoundationPage';
import { useFleetState } from './hooks/useFleetState';
import { useNodeDrilldown } from './hooks/useNodeDrilldown';
import { useRolloutDryRun } from './hooks/useRolloutDryRun';
import { AlertsPage } from './pages/Alerts/AlertsPage';
import { ExperimentsPage } from './pages/Experiments/ExperimentsPage';
import { PoliciesPage } from './pages/Policies/PoliciesPage';
import { AuditTracesPage } from './pages/Audit/AuditTracesPage';
import { SecurityAccessPage } from './pages/Security/SecurityAccessPage';

function DashboardPage() {
  return (
    <div className="stack">
      <FleetOverview />
      <CohortOverview />
    </div>
  );
}

function RolloutPage() {
  const dryRun = useRolloutDryRun();

  return (
    <div className="stack">
      <RolloutControl />
      <AdapterActivationControls />
      <AdapterPromotionPathPanel />
      <AdapterObservabilityPanel />
      <BlastRadiusPreview {...dryRun} />
      <DryRunSimulation {...dryRun} />
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
  return (
    <div className="stack">
      <ConfigAuditTable />
      <ConfigDiffViewer />
    </div>
  );
}

export default function App() {
  const { loading, error } = useFleetState();

  return (
    <AppShell>
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
      </Routes>
    </AppShell>
  );
}


