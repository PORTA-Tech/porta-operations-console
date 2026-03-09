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
import { formatRelativeFromNow, formatUtc } from '../../utils/date';

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

function ActionTable(props: {
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

export function OperationsConsolePage() {
  const { records, loading, error, lastRefreshUtc, streamConnected } = useOperationsConsole();
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

  const selectedRecord = useMemo(
    () => filteredRecords.find((record) => record.machineId === selectedMachineId)
      ?? records.find((record) => record.machineId === selectedMachineId)
      ?? filteredRecords[0]
      ?? records[0]
      ?? null,
    [filteredRecords, records, selectedMachineId]
  );

  useEffect(() => {
    if (!selectedRecord) return;
    if (selectedMachineId === selectedRecord.machineId) return;
    const next = new URLSearchParams(params);
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
      <Panel title="Operations Console">
        {loading ? <p className="muted-line">Loading live operations truth...</p> : null}
        {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
        <p className="muted-line">
          This screen uses only current node snapshots, audit traces, alerts, and the live websocket stream available in this repo.
          Fields that are not exposed by the current backend contracts remain `Unknown`.
        </p>
        <div className="operations-summary-bar">
          <span><strong>Machines</strong> {records.length}</span>
          <span><strong>Realtime</strong> {streamConnected ? 'Connected' : 'Unavailable'}</span>
          <span><strong>Last refresh</strong> {formatRelativeFromNow(lastRefreshUtc)} ({formatUtc(lastRefreshUtc)})</span>
        </div>
      </Panel>

      <div className="operations-shell">
        <Panel title="Machines">
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
          </div>

          {filteredRecords.length === 0 ? (
            <p className="muted-line">No current machines match this filter.</p>
          ) : (
            <div className="operations-machine-list">
              {filteredRecords.map((record) => {
                const selected = selectedRecord?.machineId === record.machineId;
                return (
                  <button
                    type="button"
                    key={record.machineId}
                    className={selected ? 'operations-machine-card selected' : 'operations-machine-card'}
                    onClick={() => updateParam('machine', record.machineId)}
                  >
                    <div className="operations-machine-card-head">
                      <strong>{record.machineName}</strong>
                      <span className={toneBadgeClass(record.healthTone)}>
                        {record.healthTone === 'critical' ? 'Critical' : record.healthTone === 'warning' ? 'Warning' : 'Healthy'}
                      </span>
                    </div>
                    <p className="muted-line">{record.userName}</p>
                    <p className="operations-machine-meta">
                      Last seen {formatRelativeFromNow(record.layer1.lastSeenAtUtc ?? undefined)} | Actions {record.actions.length}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="stack">
          {selectedRecord ? (
            <>
              <Panel title={`${selectedRecord.machineName} | ${selectedRecord.userName}`}>
                <div className="operations-summary-bar">
                  <span><strong>Machine ID</strong> {selectedRecord.machineId}</span>
                  <span><strong>Snapshot</strong> {selectedRecord.sources.snapshot ? 'Yes' : 'No'}</span>
                  <span><strong>Realtime state</strong> {selectedRecord.sources.stream ? 'Fresh' : 'Unavailable'}</span>
                  <span><strong>Traces</strong> {selectedRecord.sources.traces}</span>
                  <span><strong>Alerts</strong> {selectedRecord.sources.alerts}</span>
                </div>
                {selectedRecord.reliabilityBlocked ? (
                  <div className="operations-warning-banner">
                    System Health is unhealthy for this machine. Treat User Activity, Trust Level, and Actions as unreliable until Layer 1 recovers.
                  </div>
                ) : null}
              </Panel>

              <Panel title="Layer 1 | System Health">
                <div className="operations-layer-grid">
                  <SectionField label="Machine name" value={selectedRecord.layer1.machineName} />
                  <SectionField label="User name" value={selectedRecord.layer1.userName} />
                  <SectionField
                    label="Last seen time"
                    value={`${formatUtc(selectedRecord.layer1.lastSeenAtUtc ?? undefined)} (${formatRelativeFromNow(selectedRecord.layer1.lastSeenAtUtc ?? undefined)})`}
                  />
                  <SectionField label="Agent running" value={selectedRecord.layer1.agentRunning} className={truthToneClass(selectedRecord.layer1.agentRunning)} />
                  <SectionField label="User session connected" value={selectedRecord.layer1.userSessionConnected} className={truthToneClass(selectedRecord.layer1.userSessionConnected)} />
                  <SectionField label="Activity detected" value={selectedRecord.layer1.activityDetected} className={truthToneClass(selectedRecord.layer1.activityDetected)} />
                  <SectionField
                    label="Last activity time"
                    value={`${formatUtc(selectedRecord.layer1.lastActivityAtUtc ?? undefined)} (${formatRelativeFromNow(selectedRecord.layer1.lastActivityAtUtc ?? undefined)})`}
                  />
                  <SectionField label="Error message" value={selectedRecord.layer1.errorMessage ?? 'None'} />
                </div>
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
                  <ActionTable actions={selectedRecord.actions} />
                </Panel>
              </div>
            </>
          ) : (
            <Panel title="Operations Details">
              <p className="muted-line">No current machine snapshot is available.</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
