import { useMemo, useState } from 'react';
import { useAuditLedgerView } from '../../hooks/useAuditLedgerView';
import { Panel } from '../../components/Layout/Panel';
import { formatUtc } from '../../utils/date';

export function ConfigAuditTable() {
  const { rows, loading, error } = useAuditLedgerView();
  const [actorFilter, setActorFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

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
    <Panel title="Audit Ledger View (Immutable)">
      {loading ? <p>Loading...</p> : null}
      {error ? <p>{error.code}: {error.message}</p> : null}
      <div className="table-controls">
        <select value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} aria-label="Filter by actor">
          <option value="all">All actors</option>
          {actorOptions.map((actor) => (
            <option key={actor} value={actor}>
              {actor}
            </option>
          ))}
        </select>

        <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} aria-label="Filter by action">
          <option value="all">All actions</option>
          {actionOptions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>

        <label>
          From
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
      </div>
      {!loading && !error ? (
        <table className="simple-table">
          <thead>
            <tr>
              <th>action</th>
              <th>actor</th>
              <th>timestamp</th>
              <th>cohort</th>
              <th>previous_state</th>
              <th>resulting_state</th>
              <th>correlation_id</th>
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


