import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/Layout/AppShell';
import { FleetOverview } from './pages/Dashboard/FleetOverview';
import { CohortOverview } from './pages/Dashboard/CohortOverview';
import { RolloutControl } from './pages/RolloutCenter/RolloutControl';
import { BlastRadiusPreview } from './pages/RolloutCenter/BlastRadiusPreview';
import { DryRunSimulation } from './pages/RolloutCenter/DryRunSimulation';
import { NodeList } from './pages/NodeDrilldown/NodeList';
import { NodeDetails } from './pages/NodeDrilldown/NodeDetails';
import { ConfigAuditTable } from './pages/ConfigIntegrity/ConfigAuditTable';
import { ConfigDiffViewer } from './pages/ConfigIntegrity/ConfigDiffViewer';
import { useFleetState } from './hooks/useFleetState';

function DashboardPage() {
  return (
    <div className="stack">
      <FleetOverview />
      <CohortOverview />
    </div>
  );
}

function RolloutPage() {
  return (
    <div className="stack">
      <RolloutControl />
      <BlastRadiusPreview />
      <DryRunSimulation />
    </div>
  );
}

function NodePage() {
  return (
    <div className="stack">
      <NodeList />
      <NodeDetails />
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
      {error ? <p className="error-line">{error}</p> : null}
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/rollout" element={<RolloutPage />} />
        <Route path="/cohorts" element={<CohortOverview />} />
        <Route path="/nodes" element={<NodePage />} />
        <Route path="/config" element={<ConfigPage />} />
      </Routes>
    </AppShell>
  );
}

