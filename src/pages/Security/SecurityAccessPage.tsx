import { useState } from 'react';
import { Panel } from '../../components/Layout/Panel';
import { useConsoleOperations } from '../../hooks/useConsoleOperations';
import type { RbacAssignment, RoleName } from '../../types/consoleOperations';
import { useSearchParams } from 'react-router-dom';

const rolePermissions: Record<RoleName, Array<'read' | 'write' | 'override'>> = {
  admin: ['read', 'write', 'override'],
  operator: ['read', 'write'],
  auditor: ['read'],
  developer: ['read']
};

export function SecurityAccessPage() {
  const [params] = useSearchParams();
  const { assignments, loading, error, assign, metrics } = useConsoleOperations();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<RoleName>('operator');
  const [scope, setScope] = useState<'fleet' | 'agent'>('fleet');
  const [scopeId, setScopeId] = useState('fleet');
  const focusRbacViolations = params.get('focus') === 'rbac-violations';

  const submitAssignment = async () => {
    if (!userId.trim()) {
      return;
    }

    await assign({
      user_id: userId.trim(),
      role,
      scope,
      scope_id: scopeId.trim(),
      assigned_at: new Date().toISOString(),
      assigned_by: 'console-admin'
    } as RbacAssignment);
  };

  return (
    <div className="stack">
      <Panel title="Security and access controls">
        {loading ? <p className="muted-line">Loading RBAC state...</p> : null}
        {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
        <div className="ops-grid">
          <div>
            <h4>Permissions matrix</h4>
            {focusRbacViolations ? (
              <p className="focus-banner">Filter applied: RBAC violations increased</p>
            ) : null}
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Read</th>
                  <th>Write</th>
                  <th>Override</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(rolePermissions) as RoleName[]).map((name) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{rolePermissions[name].includes('read') ? 'Y' : '-'}</td>
                    <td>{rolePermissions[name].includes('write') ? 'Y' : '-'}</td>
                    <td>{rolePermissions[name].includes('override') ? 'Y' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted-line">Sensitive operations require explicit operator/admin role and re-auth policy.</p>
            <p className={focusRbacViolations ? 'focus-stat' : 'muted-line'}>
              RBAC violations (recent total): <strong>{metrics.rbac_violations_total}</strong>
            </p>
          </div>

          <div className="ops-editor">
            <h4>Assign role</h4>
            <label>
              User ID
              <input value={userId} onChange={(event) => setUserId(event.target.value)} />
            </label>
            <label>
              Role
              <select value={role} onChange={(event) => setRole(event.target.value as RoleName)}>
                <option value="admin">admin</option>
                <option value="operator">operator</option>
                <option value="auditor">auditor</option>
                <option value="developer">developer</option>
              </select>
            </label>
            <label>
              Scope
              <select value={scope} onChange={(event) => setScope(event.target.value as 'fleet' | 'agent')}>
                <option value="fleet">fleet-wide</option>
                <option value="agent">per-agent</option>
              </select>
            </label>
            <label>
              Scope ID
              <input value={scopeId} onChange={(event) => setScopeId(event.target.value)} />
            </label>
            <button type="button" onClick={() => void submitAssignment()} disabled={!userId.trim()}>
              Assign role
            </button>
            <h4>Recent assignments</h4>
            <ul className="kv-list">
              {assignments.slice(0, 12).map((item) => (
                <li key={`${item.user_id}:${item.assigned_at}`}>
                  <span>
                    {item.user_id}
                    {' -> '}
                    {item.role} ({item.scope}:{item.scope_id})
                  </span>
                  <strong>{new Date(item.assigned_at).toLocaleString()}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
    </div>
  );
}
