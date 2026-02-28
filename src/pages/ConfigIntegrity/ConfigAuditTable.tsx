import { useEffect, useMemo, useState } from 'react';
import { useAuditLedgerView } from '../../hooks/useAuditLedgerView';
import { Panel } from '../../components/Layout/Panel';
import { formatUtc } from '../../utils/date';
import { useSearchParams } from 'react-router-dom';

export function ConfigAuditTable() {
  const { rows, loading, error } = useAuditLedgerView();
  const [params, setParams] = useSearchParams();
  const [actorFilter, setActorFilter] = useState(params.get('actor') ?? 'all');
  const [actionFilter, setActionFilter] = useState(params.get('action') ?? 'all');
  const [fromDate, setFromDate] = useState(params.get('from') ?? '');
  const [toDate, setToDate] = useState(params.get('to') ?? '');

  useEffect(() => {
    setActorFilter(params.get('actor') ?? 'all');
    setActionFilter(params.get('action') ?? 'all');
    setFromDate(params.get('from') ?? '');
    setToDate(params.get('to') ?? '');
  }, [params]);

  const updateParam = (key: string, value: string, clearValue?: string) => {
    const next = new URLSearchParams(params);
    if (value === '' || (clearValue && value === clearValue)) {
      next.delete(key);
    } else {
      next.set(key, value);
    }

    setParams(next, { replace: true });
  };

  const actorOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.actor))).sort(), [rows]);
  const actionOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.action))).sort(), [rows]);

  const filteredRows = useMemo(() => {
    const fromTs = fromDate ? Date.parse(`${fromDate}T00:00:00`) : NaN;
    const toTs = toDate ? Date.parse(`${toDate}T23:59:59`) : NaN;

    return rows.filter((row) => {
      if (actorFilter !== 'all' && row.actor !== actorFilter) return false;
      if (actionFilter !== 'all' && row.action !== actionFilter) return false;

      const at = Date.parse(row.timestamp);
      if (Number.isFinite(fromTs) && at < fromTs) return false;
      if (Number.isFinite(toTs) && at > toTs) return false;

      return true;
    });
  }, [rows, actorFilter, actionFilter, fromDate, toDate]);

  return (
    <Panel title="Config audit history">
      {loading ? <p>Loading...</p> : null}
      {error ? <p>{error.code}: {error.message}</p> : null}
      <div className="table-controls">
        <select
          value={actorFilter}
          onChange={(event) => {
            setActorFilter(event.target.value);
            updateParam('actor', event.target.value, 'all');
          }}
          aria-label="Filter by actor"
        >
          <option value="all">All actors</option>
          {actorOptions.map((actor) => (
            <option key={actor} value={actor}>
              {actor}
            </option>
          ))}
        </select>

        <select
          value={actionFilter}
          onChange={(event) => {
            setActionFilter(event.target.value);
            updateParam('action', event.target.value, 'all');
          }}
          aria-label="Filter by action"
        >
          <option value="all">All actions</option>
          {actionOptions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>

        <label>
          From
          <input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value);
              updateParam('from', event.target.value);
            }}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value);
              updateParam('to', event.target.value);
            }}
          />
        </label>
      </div>
      {!loading && !error ? (
        <table className="simple-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Actor</th>
              <th>Timestamp</th>
              <th>Cohort</th>
              <th>Previous state</th>
              <th>Resulting state</th>
              <th>Correlation ID</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.correlation_id}>
                <td>{row.action}</td>
                <td>{row.actor}</td>
                <td>{formatUtc(row.timestamp)}</td>
                <td>{row.cohort}</td>
                <td>{row.previous_state}</td>
                <td>{row.resulting_state}</td>
                <td>{row.correlation_id}</td>
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted-line">No audit rows match current filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
    </Panel>
  );
}


