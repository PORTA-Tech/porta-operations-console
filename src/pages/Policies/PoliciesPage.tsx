import { useMemo, useState } from 'react';
import { Panel } from '../../components/Layout/Panel';
import { useConsoleOperations } from '../../hooks/useConsoleOperations';
import type { PolicyRecord } from '../../types/consoleOperations';

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function detectPolicyConflicts(policies: PolicyRecord[]): Array<{ left: string; right: string; reason: string }> {
  const conflicts: Array<{ left: string; right: string; reason: string }> = [];
  for (let i = 0; i < policies.length; i += 1) {
    for (let j = i + 1; j < policies.length; j += 1) {
      const a = policies[i];
      const b = policies[j];
      if (!a || !b || !a.active_flag || !b.active_flag) continue;
      if (a.service_scope === b.service_scope && a.environment_scope === b.environment_scope && a.trigger_metric === b.trigger_metric) {
        conflicts.push({
          left: a.policy_id,
          right: b.policy_id,
          reason: 'Overlapping scope and trigger metric'
        });
      }
    }
  }

  return conflicts;
}

export function PoliciesPage() {
  const { policies, loading, error, savePolicy, deployPolicyById } = useConsoleOperations();
  const [editor, setEditor] = useState<PolicyRecord | null>(null);
  const [message, setMessage] = useState('');
  const conflicts = useMemo(() => detectPolicyConflicts(policies), [policies]);
  const validationError = editor && !semverPattern.test(editor.version) ? 'Version must be MAJOR.MINOR.PATCH.' : undefined;

  const openPolicy = (policy: PolicyRecord) => {
    setEditor(policy);
    setMessage('');
  };

  const save = async () => {
    if (!editor || validationError) return;
    await savePolicy(editor);
    setMessage(`Saved ${editor.policy_id}`);
  };

  const deploy = async () => {
    if (!editor || validationError) return;
    await deployPolicyById(editor.policy_id);
    setMessage(`Deployed ${editor.policy_id}`);
  };

  return (
    <div className="stack">
      <Panel title="Policy library">
        {loading ? <p className="muted-line">Loading policies...</p> : null}
        {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
        <div className="ops-grid">
          <div>
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Policy ID</th>
                  <th>Name</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Last updated</th>
                  <th>Author</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.policy_id} className="click-row" onClick={() => openPolicy(policy)}>
                    <td>{policy.policy_id}</td>
                    <td>{policy.name}</td>
                    <td>{policy.version}</td>
                    <td>{policy.active_flag ? 'Active' : 'Inactive'}</td>
                    <td>{new Date(policy.last_modified).toLocaleString()}</td>
                    <td>{policy.created_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {conflicts.length > 0 ? (
              <div className="ops-conflict-box">
                <strong>Conflict detection</strong>
                <ul>
                  {conflicts.map((conflict) => (
                    <li key={`${conflict.left}:${conflict.right}`}>
                      {conflict.left} vs {conflict.right}: {conflict.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="ops-editor">
            <h4>Policy editor</h4>
            {editor ? (
              <>
                <label>
                  Name
                  <input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
                </label>
                <label>
                  Version
                  <input value={editor.version} onChange={(event) => setEditor({ ...editor, version: event.target.value })} />
                </label>
                <label>
                  Trigger threshold
                  <input
                    type="number"
                    step="0.1"
                    value={editor.trigger_threshold}
                    onChange={(event) => setEditor({ ...editor, trigger_threshold: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Dwell window (seconds)
                  <input
                    type="number"
                    value={editor.dwell_window_seconds}
                    onChange={(event) => setEditor({ ...editor, dwell_window_seconds: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Cooldown (seconds)
                  <input
                    type="number"
                    value={editor.cooldown_seconds}
                    onChange={(event) => setEditor({ ...editor, cooldown_seconds: Number(event.target.value) })}
                  />
                </label>
                {validationError ? <p className="error-line">{validationError}</p> : null}
                <div className="button-row">
                  <button type="button" onClick={() => void save()} disabled={Boolean(validationError)}>
                    Save
                  </button>
                  <button type="button" onClick={() => void deploy()} disabled={Boolean(validationError)}>
                    Save and deploy
                  </button>
                </div>
                {message ? <p className="muted-line">{message}</p> : null}
              </>
            ) : (
              <p className="muted-line">Select a policy to edit.</p>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

