import { useActiveConfigIntegrity } from '../../hooks/useActiveConfigIntegrity';
import { Panel } from '../../components/Layout/Panel';
import { shortHash } from '../../utils/crypto';

export function ConfigDiffViewer() {
  const { data, loading, error } = useActiveConfigIntegrity();

  const countdownLabel = (seconds: number): string => {
    const clamped = Math.max(0, seconds);
    const hours = Math.floor(clamped / 3600);
    const minutes = Math.floor((clamped % 3600) / 60);
    const secs = clamped % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const toneClass =
    data?.integrity_status === 'verified'
      ? 'integrity-verified'
      : data?.integrity_status === 'expiry_approaching'
        ? 'integrity-warning'
        : 'integrity-invalid';

  return (
    <Panel title="Config Integrity Panel">
      {loading ? <p className="muted-line">Loading active config integrity...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {data ? (
        <div className={`integrity-panel-body ${toneClass}`}>
          <p>config_seq: <strong>{data.config_seq}</strong></p>
          <p>config_version: <strong>{data.config_version}</strong></p>
          <p>issuer: <strong>{data.issuer}</strong></p>
          <p>signature validity: <strong>{data.signature_validity ? 'Verified' : 'Invalid'}</strong></p>
          <p>expiry countdown: <strong>{countdownLabel(data.expiry_countdown_seconds)}</strong></p>
          <p>hash fingerprint: <strong>{shortHash(data.hash_fingerprint) || 'n/a'}</strong></p>
          <p>full diff from previous:</p>

          <div className="grid-three">
            <div>
              <h4>Added keys</h4>
              <ul>
                {data.full_diff_from_previous.added_keys.length > 0
                  ? data.full_diff_from_previous.added_keys.map((key) => <li key={key}>{key}</li>)
                  : <li>None</li>}
              </ul>
            </div>
            <div>
              <h4>Modified keys</h4>
              <ul>
                {data.full_diff_from_previous.modified_keys.length > 0
                  ? data.full_diff_from_previous.modified_keys.map((key) => <li key={key}>{key}</li>)
                  : <li>None</li>}
              </ul>
            </div>
            <div>
              <h4>Removed keys</h4>
              <ul>
                {data.full_diff_from_previous.removed_keys.length > 0
                  ? data.full_diff_from_previous.removed_keys.map((key) => <li key={key}>{key}</li>)
                  : <li>None</li>}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

