import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Layout/Panel';
import { useOperationsConsole } from '../../hooks/useOperationsConsole';
import type {
  OperationsActionItem,
  OperationsConsoleRecord,
  OperationsDataQuality,
  OperationsMachineHealth,
  OperationsRiskLabel,
  OperationsTruthLabel
} from '../../types/operationsConsole';
import { formatUtc } from '../../utils/date';

function toneBadgeClass(tone: OperationsMachineHealth): string {
  if (tone === 'critical') return 'status-badge critical';
  if (tone === 'warning') return 'status-badge warn';
  return 'status-badge ok';
}

function truthToneClass(value: OperationsTruthLabel): string {
  if (value === 'Yes') return 'status-badge ok';
  if (value === 'No') return 'status-badge critical';
  return 'status-badge warn';
}

function riskToneClass(value: OperationsRiskLabel): string {
  if (value === 'High') return 'status-badge critical';
  if (value === 'Medium') return 'status-badge warn';
  if (value === 'Low') return 'status-badge ok';
  return 'status-badge warn';
}

function qualityToneClass(value: OperationsDataQuality): string {
  if (value === 'Good') return 'status-badge ok';
  if (value === 'Partial') return 'status-badge warn';
  if (value === 'Poor') return 'status-badge critical';
  return 'status-badge warn';
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return 'Unknown';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

function machineRowMatches(record: OperationsConsoleRecord, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (query.length === 0) return true;
  return [
    record.machineId,
    record.machineName,
    record.userName,
    record.layer1.errorMessage ?? '',
    record.layer2.focusLevel,
    record.layer2.overloadRisk,
    record.layer3.learningStage
  ].some((value) => value.toLowerCase().includes(query));
}

function SectionField(props: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="operations-field">
      <span className="operations-field-label">{props.label}</span>
      <strong className={props.className}>{props.value}</strong>
    </div>
  );
}

function ActionsTable(props: {
  actions: OperationsActionItem[];
}) {
  if (props.actions.length === 0) {
    return <p className="muted-line">No meaningful actions reported for this machine yet.</p>;
  }

  return (
    <div className="table-scroll-wrap">
      <table className="simple-table">
        <thead>
          <tr>
            <th>Machine</th>
            <th>User</th>
            <th>Action</th>
            <th>Type</th>
            <th>Result</th>
            <th>Time</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {props.actions.map((action) => (
            <tr key={action.id}>
              <td>{action.machine}</td>
              <td>{action.user}</td>
              <td>{action.actionName}</td>
              <td>{action.actionType}</td>
              <td>{action.result}</td>
              <td>{formatUtc(action.timeUtc ?? undefined)}</td>
              <td>{action.error ?? 'None'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyLayerState(props: {
  title: string;
  message: string;
}) {
  return (
    <Panel title={props.title}>
      <p className="muted-line">{props.message}</p>
    </Panel>
  );
}

export function OperationsConsolePage() {
  const { records, loading, error } = useOperationsConsole();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const selectedMachineId = params.get('machine') ?? '';

  useEffect(() => {
    setSearch(params.get('search') ?? '');
  }, [params]);

  const filteredRecords = useMemo(
    () => records.filter((record) => machineRowMatches(record, search)),
    [records, search]
  );

  const selectedRecord = useMemo(() => {
    if (filteredRecords.length === 0) return null;
    return filteredRecords.find((record) => record.machineId === selectedMachineId) ?? filteredRecords[0];
  }, [filteredRecords, selectedMachineId]);

  useEffect(() => {
    const next = new URLSearchParams(params);

    if (!selectedRecord) {
      if (!next.has('machine')) return;
      next.delete('machine');
      setParams(next, { replace: true });
      return;
    }

    if (selectedMachineId === selectedRecord.machineId) return;
    next.set('machine', selectedRecord.machineId);
    setParams(next, { replace: true });
  }, [params, selectedMachineId, selectedRecord, setParams]);

  const updateParam = (key: string, value: string, clearValue = '') => {
    const next = new URLSearchParams(params);
    if (value === clearValue) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  return (
    <div className="stack">
      <div className="operations-list-toolbar">
        <label>
          Search
          <input
            value={search}
            onChange={(event) => {
              const nextValue = event.target.value;
              setSearch(nextValue);
              updateParam('search', nextValue);
            }}
            placeholder="Machine, user, issue, state..."
          />
        </label>
        {filteredRecords.length > 0 ? (
          <label>
            Machine
            <select
              value={selectedRecord?.machineId ?? ''}
              onChange={(event) => updateParam('machine', event.target.value)}
            >
              {filteredRecords.map((record) => (
                <option key={record.machineId} value={record.machineId}>
                  {record.layer1.machineName} | {record.layer1.userName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {loading ? <p className="muted-line">Loading live operations truth...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {!loading && filteredRecords.length === 0 ? (
        <p className="muted-line">No current machines match this filter.</p>
      ) : null}

      {selectedRecord ? (
        <>
          <Panel title="Layer 1 | System Health">
            <div className="operations-layer-grid">
              <SectionField label="Machine name" value={selectedRecord.layer1.machineName} />
              <SectionField label="User name" value={selectedRecord.layer1.userName} />
              <SectionField label="Last seen time" value={formatUtc(selectedRecord.layer1.lastSeenAtUtc ?? undefined)} />
              <SectionField label="Agent running" value={selectedRecord.layer1.agentRunning} className={truthToneClass(selectedRecord.layer1.agentRunning)} />
              <SectionField label="User session connected" value={selectedRecord.layer1.userSessionConnected} className={truthToneClass(selectedRecord.layer1.userSessionConnected)} />
              <SectionField label="Activity detected" value={selectedRecord.layer1.activityDetected} className={truthToneClass(selectedRecord.layer1.activityDetected)} />
              <SectionField label="Last activity time" value={formatUtc(selectedRecord.layer1.lastActivityAtUtc ?? undefined)} />
              <SectionField label="Error message" value={selectedRecord.layer1.errorMessage ?? 'None'} />
            </div>
            <div className="operations-summary-bar">
              <span className={toneBadgeClass(selectedRecord.healthTone)}>
                {selectedRecord.healthTone === 'critical' ? 'Layer 1 critical' : selectedRecord.healthTone === 'warning' ? 'Layer 1 warning' : 'Layer 1 healthy'}
              </span>
            </div>
            {selectedRecord.reliabilityBlocked ? (
              <div className="operations-warning-banner">
                System Health is unhealthy for this machine. Treat User Activity, Trust Level, and Actions as unreliable until Layer 1 recovers.
              </div>
            ) : null}
          </Panel>

          <div className={selectedRecord.reliabilityBlocked ? 'operations-dimmed stack' : 'stack'}>
            <Panel title="Layer 2 | User Activity">
              <div className="operations-layer-grid compact">
                <SectionField label="Focus level" value={selectedRecord.layer2.focusLevel} className={riskToneClass(selectedRecord.layer2.focusLevel)} />
                <SectionField
                  label="Deep work"
                  value={selectedRecord.layer2.deepWork}
                  className={selectedRecord.layer2.deepWork === 'Active' ? 'status-badge ok' : 'status-badge warn'}
                />
                <SectionField label="Overload risk" value={selectedRecord.layer2.overloadRisk} className={riskToneClass(selectedRecord.layer2.overloadRisk)} />
                <SectionField label="Focus duration" value={formatDuration(selectedRecord.layer2.focusDurationSec)} />
                <SectionField label="Break needed" value={selectedRecord.layer2.breakNeeded} className={truthToneClass(selectedRecord.layer2.breakNeeded)} />
              </div>
            </Panel>

            <Panel title="Layer 3 | Trust Level">
              <div className="operations-layer-grid compact">
                <SectionField
                  label="Learning stage"
                  value={selectedRecord.layer3.learningStage}
                  className={selectedRecord.layer3.learningStage === 'Ready' ? 'status-badge ok' : 'status-badge warn'}
                />
                <SectionField label="Confidence" value={selectedRecord.layer3.confidence} className={riskToneClass(selectedRecord.layer3.confidence)} />
                <SectionField label="Data quality" value={selectedRecord.layer3.dataQuality} className={qualityToneClass(selectedRecord.layer3.dataQuality)} />
              </div>
            </Panel>

            <Panel title="Layer 4 | Actions">
              <ActionsTable actions={selectedRecord.actions} />
            </Panel>
          </div>
        </>
      ) : (
        <>
          <EmptyLayerState title="Layer 1 | System Health" message="No current machine snapshot is available." />
          <EmptyLayerState title="Layer 2 | User Activity" message="Unavailable until System Health is reporting." />
          <EmptyLayerState title="Layer 3 | Trust Level" message="Unavailable until System Health is reporting." />
          <EmptyLayerState title="Layer 4 | Actions" message="No meaningful actions reported." />
        </>
      )}
    </div>
  );
}
