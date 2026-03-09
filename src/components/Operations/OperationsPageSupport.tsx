import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../Layout/Panel';
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

export function healthToneClass(value: OperationsMachineHealth): string {
  if (value === 'critical') return 'status-badge critical';
  if (value === 'warning') return 'status-badge warn';
  return 'status-badge ok';
}

export function healthToneLabel(value: OperationsMachineHealth): string {
  if (value === 'critical') return 'Unhealthy';
  if (value === 'warning') return 'Degraded';
  return 'Healthy';
}

export function truthToneClass(value: OperationsTruthLabel): string {
  if (value === 'Yes') return 'status-badge ok';
  if (value === 'No') return 'status-badge critical';
  return 'status-badge warn';
}

export function riskToneClass(value: OperationsRiskLabel): string {
  if (value === 'High') return 'status-badge critical';
  if (value === 'Medium') return 'status-badge warn';
  if (value === 'Low') return 'status-badge ok';
  return 'status-badge warn';
}

export function qualityToneClass(value: OperationsDataQuality): string {
  if (value === 'Good') return 'status-badge ok';
  if (value === 'Partial') return 'status-badge warn';
  if (value === 'Poor') return 'status-badge critical';
  return 'status-badge warn';
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return 'Unknown';
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

export function StatusField(props: {
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

export function ActionsTable(props: {
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

export function OperationsPageLayout(props: {
  pageTitle: string;
  emptyMessage: string;
  dimWhenUnhealthy?: boolean;
  children: (record: OperationsConsoleRecord) => ReactNode;
}) {
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

  const content = selectedRecord ? props.children(selectedRecord) : (
    <Panel title={props.pageTitle}>
      <p className="muted-line">{props.emptyMessage}</p>
    </Panel>
  );

  return (
    <div className="stack">
      <div className="operations-list-toolbar operations-filter-row">
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
          <div className="operations-summary-bar operations-page-context">
            <span><strong>Machine</strong> {selectedRecord.layer1.machineName}</span>
            <span><strong>User</strong> {selectedRecord.layer1.userName}</span>
            <span><strong>Last seen</strong> {formatUtc(selectedRecord.layer1.lastSeenAtUtc ?? undefined)}</span>
            <span className={healthToneClass(selectedRecord.healthTone)}>
              {healthToneLabel(selectedRecord.healthTone)}
            </span>
          </div>
          {selectedRecord.reliabilityBlocked && props.dimWhenUnhealthy ? (
            <div className="operations-warning-banner">
              System Health is not healthy for this machine. Treat this page as provisional until capture recovers.
            </div>
          ) : null}
          <div className={selectedRecord.reliabilityBlocked && props.dimWhenUnhealthy ? 'operations-dimmed stack' : 'stack'}>
            {content}
          </div>
        </>
      ) : (
        content
      )}
    </div>
  );
}
