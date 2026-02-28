import { useNavigate } from 'react-router-dom';
import { Panel } from '../../components/Layout/Panel';
import { useConsoleOperations } from '../../hooks/useConsoleOperations';
import { formatUtc } from '../../utils/date';

export function AlertsPage() {
  const navigate = useNavigate();
  const { alerts, loading, error, resolveAlertById } = useConsoleOperations();

  return (
    <div className="stack">
      <Panel title="Real-time alerts triage">
        {loading ? <p className="muted-line">Loading alerts...</p> : null}
        {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
        <table className="simple-table">
          <thead>
            <tr>
              <th>Alert ID</th>
              <th>Severity</th>
              <th>Scope</th>
              <th>Type</th>
              <th>First seen</th>
              <th>Last seen</th>
              <th>Suggested action</th>
              <th>Resolve</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.alert_id} className={alert.severity === 'critical' ? 'row-alert' : undefined}>
                <td>{alert.alert_id}</td>
                <td>{alert.severity}</td>
                <td>{alert.target_service}</td>
                <td>{alert.alert_type}</td>
                <td>{formatUtc(alert.first_seen_at)}</td>
                <td>{formatUtc(alert.last_seen_at)}</td>
                <td>
                  <button type="button" onClick={() => navigate('/audit-traces')}>
                    Open traces
                  </button>
                </td>
                <td>
                  <button type="button" onClick={() => void resolveAlertById(alert.alert_id)}>
                    Mark seen
                  </button>
                </td>
              </tr>
            ))}
            {alerts.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted-line">No active alerts.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

