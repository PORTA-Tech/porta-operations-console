import { useMemo, useState } from 'react';
import { Panel } from '../../components/Layout/Panel';
import { useConsoleOperations } from '../../hooks/useConsoleOperations';
import type { PolicyRecord, RbacAssignment, RoleName } from '../../types/consoleOperations';

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function toneClass(active: boolean, status: PolicyRecord['status']): string {
  if (!active) return 'status-badge warn';
  if (status === 'error') return 'status-badge critical';
  return 'status-badge ok';
}

function detectPolicyConflicts(policies: PolicyRecord[]): Array<{ left: string; right: string; reason: string }> {
  const conflicts: Array<{ left: string; right: string; reason: string }> = [];
  for (let i = 0; i < policies.length; i += 1) {
    for (let j = i + 1; j < policies.length; j += 1) {
      const a = policies[i];
      const b = policies[j];
      if (!a || !b || !a.active_flag || !b.active_flag) continue;
      if (
        a.service_scope === b.service_scope &&
        a.environment_scope === b.environment_scope &&
        a.trigger_metric === b.trigger_metric
      ) {
        conflicts.push({
          left: a.policy_id,
          right: b.policy_id,
          reason: 'overlapping active scope + trigger metric'
        });
      }
    }
  }
  return conflicts;
}

const rolePermissions: Record<RoleName, Array<'read' | 'write' | 'override'>> = {
  admin: ['read', 'write', 'override'],
  operator: ['read', 'write'],
  auditor: ['read'],
  developer: ['read']
};

export function ConsoleOperationsPage() {
  const { policies, audits, assignments, metrics, loading, error, savePolicy, deployPolicyById, replay, exportRows, assign } =
    useConsoleOperations();

  const [editor, setEditor] = useState<PolicyRecord | null>(policies[0] ?? null);
  const [deployResult, setDeployResult] = useState<string>('');
  const [auditFilterPolicy, setAuditFilterPolicy] = useState('all');
  const [auditFilterDecision, setAuditFilterDecision] = useState('all');
  const [auditConfidenceMin, setAuditConfidenceMin] = useState(0);
  const [rbacUser, setRbacUser] = useState('');
  const [rbacRole, setRbacRole] = useState<RoleName>('operator');
  const [rbacScope, setRbacScope] = useState<'fleet' | 'agent'>('fleet');
  const [rbacScopeId, setRbacScopeId] = useState('fleet');

  const conflicts = useMemo(() => detectPolicyConflicts(policies), [policies]);

  const filteredAudits = useMemo(
    () =>
      audits.filter((row) => {
        if (auditFilterPolicy !== 'all' && row.policy_id !== auditFilterPolicy) return false;
        if (auditFilterDecision !== 'all' && row.action_decision !== auditFilterDecision) return false;
        if (row.confidence_score < auditConfidenceMin) return false;
        return true;
      }),
    [audits, auditFilterPolicy, auditFilterDecision, auditConfidenceMin]
  );

  const validationError =
    editor && !semverPattern.test(editor.version)
      ? 'Version must follow MAJOR.MINOR.PATCH'
      : undefined;

  const handleSelectPolicy = (policy: PolicyRecord) => {
    setEditor(policy);
  };

  const handleSave = async () => {
    if (!editor || validationError) return;
    await savePolicy(editor);
    setDeployResult(`Saved ${editor.policy_id}`);
  };

  const handleDeploy = async () => {
    if (!editor) return;
    try {
      await deployPolicyById(editor.policy_id);
      setDeployResult(`Deployed ${editor.policy_id} (propagation target <5s)`);
    } catch {
      setDeployResult('Deploy failed');
    }
  };

  return (
    <div className="stack">
      <Panel title="Policy Management UI">
        {loading ? <p className="muted-line">Loading operations data...</p> : null}
        {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
        <div className="ops-grid">
          <div>
            <table className="simple-table">
              <thead>
                <tr>
                  <th>policy_id</th>
                  <th>name</th>
                  <th>version</th>
                  <th>state</th>
                  <th>last_modified</th>
                  <th>created_by</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.policy_id} onClick={() => handleSelectPolicy(policy)} className="click-row">
                    <td>{policy.policy_id}</td>
                    <td>{policy.name}</td>
                    <td>{policy.version}</td>
                    <td>
                      <span className={toneClass(policy.active_flag, policy.status)}>
                        {policy.active_flag ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{new Date(policy.last_modified).toLocaleString()}</td>
                    <td>{policy.created_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {conflicts.length > 0 ? (
              <div className="ops-conflict-box">
                <strong>Conflict Detection</strong>
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
            <h4>Policy Editor</h4>
            {editor ? (
              <>
                <label>
                  Name
                  <input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} />
                </label>
                <label>
                  Version (SemVer)
                  <input value={editor.version} onChange={(e) => setEditor({ ...editor, version: e.target.value })} />
                </label>
                <label>
                  Trigger threshold
                  <input
                    type="number"
                    step="0.1"
                    value={editor.trigger_threshold}
                    onChange={(e) => setEditor({ ...editor, trigger_threshold: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Dwell window (seconds)
                  <input
                    type="number"
                    value={editor.dwell_window_seconds}
                    onChange={(e) => setEditor({ ...editor, dwell_window_seconds: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Cooldown (seconds)
                  <input
                    type="number"
                    value={editor.cooldown_seconds}
                    onChange={(e) => setEditor({ ...editor, cooldown_seconds: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Max intervention duration (seconds)
                  <input
                    type="number"
                    value={editor.max_intervention_duration_seconds}
                    onChange={(e) => setEditor({ ...editor, max_intervention_duration_seconds: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Max interventions/hour
                  <input
                    type="number"
                    value={editor.max_interventions_per_hour}
                    onChange={(e) => setEditor({ ...editor, max_interventions_per_hour: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Escalation ladder
                  <input
                    value={editor.escalation_ladder.join(' -> ')}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        escalation_ladder: e.target.value
                          .split('->')
                          .map((x) => x.trim())
                          .filter(Boolean) as PolicyRecord['escalation_ladder']
                      })
                    }
                  />
                </label>
                {validationError ? <p className="error-line">{validationError}</p> : null}
                <div className="button-row">
                  <button onClick={handleSave} disabled={Boolean(validationError)}>
                    Save
                  </button>
                  <button onClick={handleDeploy} disabled={Boolean(validationError)}>
                    Save + Deploy
                  </button>
                </div>
                {deployResult ? <p className="muted-line">{deployResult}</p> : null}
              </>
            ) : (
              <p className="muted-line">Select policy from list.</p>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Audit UI">
        <div className="table-controls">
          <select value={auditFilterPolicy} onChange={(e) => setAuditFilterPolicy(e.target.value)}>
            <option value="all">All policies</option>
            {policies.map((p) => (
              <option value={p.policy_id} key={p.policy_id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={auditFilterDecision} onChange={(e) => setAuditFilterDecision(e.target.value)}>
            <option value="all">All decisions</option>
            <option value="intervene">intervene</option>
            <option value="skip">skip</option>
            <option value="cooldown">cooldown</option>
            <option value="blocked">blocked</option>
          </select>
          <label>
            Confidence &gt;=
            <input type="number" step="0.05" min={0} max={1} value={auditConfidenceMin} onChange={(e) => setAuditConfidenceMin(Number(e.target.value))} />
          </label>
          <button onClick={() => void exportRows('csv', filteredAudits)}>Export CSV</button>
          <button onClick={() => void exportRows('json', filteredAudits)}>Export JSON</button>
          <button onClick={() => void exportRows('pdf_signed', filteredAudits)}>Export Signed PDF</button>
        </div>
        <table className="simple-table">
          <thead>
            <tr>
              <th>trace_id</th>
              <th>timestamp</th>
              <th>agent_id</th>
              <th>policy_id</th>
              <th>decision</th>
              <th>confidence</th>
              <th>triggered_by</th>
              <th>signature</th>
              <th>replay</th>
            </tr>
          </thead>
          <tbody>
            {filteredAudits.map((row) => (
              <tr key={row.trace_id} className={!row.signature_valid ? 'row-alert' : undefined}>
                <td>{row.trace_id}</td>
                <td>{new Date(row.timestamp).toLocaleString()}</td>
                <td>{row.agent_id}</td>
                <td>{row.policy_id}</td>
                <td>{row.action_decision}</td>
                <td>{row.confidence_score.toFixed(2)}</td>
                <td>{row.triggered_by}</td>
                <td>{row.signature_valid ? '✅' : '❌'}</td>
                <td>
                  <button
                    onClick={() =>
                      void replay(row.trace_id).then((outcome) => {
                        window.alert(`Replay: ${outcome.result} (${outcome.details})`);
                      })
                    }
                  >
                    Replay
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="RBAC UI">
        <div className="ops-grid">
          <div>
            <h4>Permissions Matrix</h4>
            <table className="simple-table">
              <thead>
                <tr>
                  <th>role</th>
                  <th>read</th>
                  <th>write</th>
                  <th>override</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(rolePermissions) as RoleName[]).map((role) => (
                  <tr key={role}>
                    <td>{role}</td>
                    <td>{rolePermissions[role].includes('read') ? '✓' : '-'}</td>
                    <td>{rolePermissions[role].includes('write') ? '✓' : '-'}</td>
                    <td>{rolePermissions[role].includes('override') ? '✓' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted-line">Session max duration: 1h. Sensitive operations require re-authentication.</p>
          </div>
          <div className="ops-editor">
            <h4>Role Assignment</h4>
            <label>
              User ID
              <input value={rbacUser} onChange={(e) => setRbacUser(e.target.value)} />
            </label>
            <label>
              Role
              <select value={rbacRole} onChange={(e) => setRbacRole(e.target.value as RoleName)}>
                <option value="admin">admin</option>
                <option value="operator">operator</option>
                <option value="auditor">auditor</option>
                <option value="developer">developer</option>
              </select>
            </label>
            <label>
              Scope
              <select value={rbacScope} onChange={(e) => setRbacScope(e.target.value as 'fleet' | 'agent')}>
                <option value="fleet">fleet-wide</option>
                <option value="agent">per-agent</option>
              </select>
            </label>
            <label>
              Scope ID
              <input value={rbacScopeId} onChange={(e) => setRbacScopeId(e.target.value)} />
            </label>
            <button
              onClick={() =>
                void assign({
                  user_id: rbacUser,
                  role: rbacRole,
                  scope: rbacScope,
                  scope_id: rbacScopeId,
                  assigned_at: new Date().toISOString(),
                  assigned_by: 'console-admin'
                } as RbacAssignment)
              }
              disabled={!rbacUser.trim()}
            >
              Assign Role
            </button>
            <h4>Recent Assignments</h4>
            <ul className="kv-list">
              {assignments.slice(0, 10).map((a) => (
                <li key={`${a.user_id}:${a.assigned_at}`}>
                  <span>
                    {a.user_id} → {a.role} ({a.scope}:{a.scope_id})
                  </span>
                  <strong>{new Date(a.assigned_at).toLocaleString()}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>

      <Panel title="Operations Observability">
        <div className="console-metric-grid">
          <p>policy_changes_total: <strong>{metrics.policy_changes_total}</strong></p>
          <p>policy_deploy_failures_total: <strong>{metrics.policy_deploy_failures_total}</strong></p>
          <p>audit_queries_total: <strong>{metrics.audit_queries_total}</strong></p>
          <p>audit_signature_mismatch_total: <strong>{metrics.audit_signature_mismatch_total}</strong></p>
          <p>rbac_violations_total: <strong>{metrics.rbac_violations_total}</strong></p>
        </div>
      </Panel>
    </div>
  );
}
