import { useConfigAudit } from '../../hooks/useConfigAudit';
import { Panel } from '../../components/Layout/Panel';

export function ConfigAuditTable() {
  const { rows, loading, error } = useConfigAudit();

  return (
    <Panel title="Config Audit Ledger">
      {loading ? <p>Loading...</p> : null}
      {error ? <p>{error.code}: {error.message}</p> : null}
      {!loading && !error ? (
        <table className="simple-table">
          <thead>
            <tr>
              <th>Seq</th>
              <th>Version</th>
              <th>Status</th>
              <th>Applied</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(-20).reverse().map((row) => (
              <tr key={row.hash}>
                <td>{row.configSeq}</td>
                <td>{row.configVersion}</td>
                <td>{row.rolloutStatus}</td>
                <td>{new Date(row.appliedAtUtc).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Panel>
  );
}


