import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Layout/Panel';
import { authClient } from '../../api/authClient';
import { getRolloutAuditEvents, type AuditLedgerRow } from '../../api/audit';
import {
  getSecurityPermissionsMatrix,
  getSecurityEvents,
  getSensitiveOpsPolicy,
  updateSensitiveOpsPolicy,
  type SecurityPermissionMatrixRow,
  type SensitiveOpsPolicyView,
  type SecurityEventWire
} from '../../api/security';
import { useAuditLedgerView } from '../../hooks/useAuditLedgerView';
import { useConsoleOperations } from '../../hooks/useConsoleOperations';
import { useWsConnectionStatus } from '../../hooks/useWsConnectionStatus';
import type { AuditEvent } from '../../types/apiContracts';
import type { RbacAssignment, RoleName } from '../../types/consoleOperations';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';

type Tab = 'roles' | 'assignments' | 'violations' | 'sensitive';
type WindowSize = '15m' | '1h' | '24h';
type Verdict = 'NORMAL' | 'ELEVATED' | 'INCIDENT' | 'INCONCLUSIVE';

type EventRow = {
  id: string;
  timestampUtc: string;
  userId: string | null;
  role: string | null;
  action: string;
  resource: string | null;
  scope: string | null;
  result: 'DENIED' | 'ALLOWED' | 'UNKNOWN';
  reasonCode: string | null;
  correlationId: string | null;
  traceId: string | null;
  sensitive: boolean;
};

const DEFAULT_MATRIX: SecurityPermissionMatrixRow[] = [
  { role: 'admin', read: true, write: true, override: true, sensitive_actions: ['rollout.promote', 'policy.deploy', 'rbac.assign', 'rbac.revoke'] },
  { role: 'operator', read: true, write: true, override: false, sensitive_actions: ['rollout.promote', 'policy.deploy'] },
  { role: 'auditor', read: true, write: false, override: false, sensitive_actions: [] },
  { role: 'developer', read: true, write: false, override: false, sensitive_actions: [] },
  { role: 'viewer', read: true, write: false, override: false, sensitive_actions: [] }
];

const DEFAULT_POLICY: SensitiveOpsPolicyView = {
  reauth_window_minutes: 10,
  require_2fa_override: false,
  sensitive_actions: ['rollout.promote', 'rollout.halt', 'policy.deploy', 'config.override', 'rbac.assign', 'rbac.revoke'],
  blocked_missing_reauth_last_1h: 0,
  expired_sessions: 0,
  source: 'fallback',
  updated_at_utc: null
};

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function windowMs(size: WindowSize): number {
  if (size === '24h') return 24 * 60 * 60 * 1000;
  if (size === '1h') return 60 * 60 * 1000;
  return 15 * 60 * 1000;
}

function inferResult(action: string, reason: string | null): 'DENIED' | 'ALLOWED' | 'UNKNOWN' {
  const hint = `${action} ${reason ?? ''}`.toLowerCase();
  if (hint.includes('denied') || hint.includes('rejected') || hint.includes('forbidden')) return 'DENIED';
  if (hint.includes('assign') || hint.includes('allow') || hint.includes('grant') || hint.includes('success')) return 'ALLOWED';
  return 'UNKNOWN';
}

function fromAuditEvents(rows: AuditEvent[]): EventRow[] {
  return rows
    .filter((row) => /(rbac|access|auth|permission|role|reauth|override)/i.test(row.action))
    .map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const action = typeof meta.attempted_action === 'string' ? meta.attempted_action : row.action;
      const reason = typeof meta.reason_code === 'string'
        ? meta.reason_code
        : typeof meta.reasonCode === 'string'
          ? meta.reasonCode
          : null;
      const resource = typeof meta.resource === 'string' ? meta.resource : row.target;
      const resultRaw = typeof meta.result === 'string' ? meta.result.toUpperCase() : null;
      const result = resultRaw === 'DENIED' || resultRaw === 'ALLOWED' || resultRaw === 'UNKNOWN'
        ? resultRaw
        : inferResult(row.action, reason);
      const sensitive = /(promote|halt|rollback|deploy|override|assign|revoke)/i.test(`${action} ${resource}`);
      return {
        id: row.eventId,
        timestampUtc: row.occurredAtUtc,
        userId: typeof meta.user_id === 'string' ? meta.user_id : row.actorId,
        role: typeof meta.role === 'string' ? meta.role : null,
        action,
        resource,
        scope: typeof meta.scope === 'string' ? meta.scope : null,
        result,
        reasonCode: reason,
        correlationId: typeof meta.correlation_id === 'string'
          ? meta.correlation_id
          : typeof meta.correlationId === 'string'
            ? meta.correlationId
            : null,
        traceId: typeof meta.trace_id === 'string' ? meta.trace_id : null,
        sensitive
      };
    });
}

function fromSecurityEvents(rows: SecurityEventWire[]): EventRow[] {
  return rows.map((row, idx) => ({
    id: `${row.timestamp_utc}:${row.user_id ?? 'unknown'}:${idx}`,
    timestampUtc: row.timestamp_utc,
    userId: row.user_id,
    role: row.role,
    action: row.attempted_action,
    resource: row.resource,
    scope: row.scope,
    result: row.result,
    reasonCode: row.reason_code,
    correlationId: row.correlation_id,
    traceId: row.trace_id,
    sensitive: /(promote|halt|rollback|deploy|override|assign|revoke)/i.test(`${row.attempted_action} ${row.resource ?? ''}`)
  }));
}

function fromAssignments(rows: RbacAssignment[]): EventRow[] {
  return rows.map((row) => ({
    id: `assign:${row.user_id}:${row.role}:${row.scope}:${row.scope_id}:${row.assigned_at}`,
    timestampUtc: row.assigned_at,
    userId: row.user_id,
    role: row.role,
    action: 'rbac.assign',
    resource: 'rbac.assignment',
    scope: row.scope,
    result: 'ALLOWED',
    reasonCode: null,
    correlationId: null,
    traceId: null,
    sensitive: true
  }));
}

function roleName(value: string): RoleName {
  return value === 'admin' || value === 'operator' || value === 'auditor' || value === 'developer' ? value : 'operator';
}

function hasFocus(ledger: AuditLedgerRow[], focus: boolean): boolean {
  return focus && ledger.length > 0;
}

export function SecurityAccessPage() {
  const [params] = useSearchParams();
  const focus = params.get('focus') === 'rbac-violations';
  const { operatorRole, operatorId } = authClient.getOperatorAuth();
  const canMutate = operatorRole === 'admin';
  const ws = useWsConnectionStatus();
  const auditLedger = useAuditLedgerView();
  const { assignments, loading, error, assign, revoke, metrics } = useConsoleOperations();

  const [tab, setTab] = useState<Tab>('violations');
  const [windowSize, setWindowSize] = useState<WindowSize>('1h');
  const [eventsApi, setEventsApi] = useState<SecurityEventWire[] | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [matrix, setMatrix] = useState<SecurityPermissionMatrixRow[]>(DEFAULT_MATRIX);
  const [matrixSource, setMatrixSource] = useState('fallback');
  const [policy, setPolicy] = useState<SensitiveOpsPolicyView>(DEFAULT_POLICY);
  const [securityLoading, setSecurityLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<RoleName>('operator');
  const [scope, setScope] = useState<'fleet' | 'agent'>('fleet');
  const [scopeId, setScopeId] = useState('fleet');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [reauthWindow, setReauthWindow] = useState(10);

  const [roleFilter, setRoleFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [deniedOnly, setDeniedOnly] = useState(hasFocus(auditLedger.rows, focus));

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const [matrixRes, policyRes, eventsRes, auditRes] = await Promise.all([
        getSecurityPermissionsMatrix(),
        getSensitiveOpsPolicy(),
        getSecurityEvents('24h'),
        getRolloutAuditEvents(500).catch(() => [])
      ]);
      if (!mounted) return;
      if (matrixRes && matrixRes.rows.length > 0) {
        setMatrix(matrixRes.rows);
        setMatrixSource(matrixRes.source);
      } else {
        setMatrix(DEFAULT_MATRIX);
        setMatrixSource('fallback');
      }
      if (policyRes) {
        setPolicy(policyRes);
        setReauthWindow(policyRes.reauth_window_minutes);
      } else {
        setPolicy(DEFAULT_POLICY);
      }
      setEventsApi(eventsRes);
      setAuditEvents(auditRes);
      setSecurityLoading(false);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const allEvents = useMemo(() => {
    const merged = [...(eventsApi ? fromSecurityEvents(eventsApi) : []), ...fromAuditEvents(auditEvents), ...fromAssignments(assignments)];
    const seen = new Set<string>();
    return merged.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    }).sort((a, b) => (toMs(b.timestampUtc) ?? 0) - (toMs(a.timestampUtc) ?? 0));
  }, [eventsApi, auditEvents, assignments]);

  const now = Date.now();
  const currentFrom = now - windowMs(windowSize);
  const previousFrom = now - windowMs(windowSize) * 2;
  const current = allEvents.filter((row) => {
    const ts = toMs(row.timestampUtc);
    return ts !== null && ts >= currentFrom && ts <= now;
  });
  const previous = allEvents.filter((row) => {
    const ts = toMs(row.timestampUtc);
    return ts !== null && ts >= previousFrom && ts < currentFrom;
  });

  const deniedCurrent = current.filter((row) => row.result === 'DENIED').length;
  const deniedPrevious = previous.filter((row) => row.result === 'DENIED').length;
  const spikePct = deniedPrevious === 0 ? (deniedCurrent > 0 ? 100 : 0) : Math.round(((deniedCurrent - deniedPrevious) / deniedPrevious) * 100);
  const latestTs = current[0]?.timestampUtc ?? allEvents[0]?.timestampUtc ?? null;
  const freshnessSec = latestTs ? Math.max(0, Math.round((now - (toMs(latestTs) ?? now)) / 1000)) : null;
  const sensitiveBlocked = current.filter((row) => row.sensitive && row.result === 'DENIED' && /(reauth|auth)/i.test(row.reasonCode ?? '')).length + policy.blocked_missing_reauth_last_1h;

  const verdict: Verdict = current.length < 5 || (ws.statusLabel !== 'Connected' && current.length === 0)
    ? 'INCONCLUSIVE'
    : (deniedCurrent >= 20 && spikePct >= 200) || sensitiveBlocked >= 5
      ? 'INCIDENT'
      : deniedCurrent >= 8 || spikePct >= 100 || sensitiveBlocked > 0
        ? 'ELEVATED'
        : 'NORMAL';

  const filtered = current.filter((row) => {
    if (roleFilter !== 'all' && (row.role ?? 'unknown') !== roleFilter) return false;
    if (scopeFilter !== 'all' && (row.scope ?? 'unknown') !== scopeFilter) return false;
    if (deniedOnly && row.result !== 'DENIED') return false;
    if (userFilter && !(row.userId ?? '').toLowerCase().includes(userFilter.toLowerCase())) return false;
    if (actionFilter && !row.action.toLowerCase().includes(actionFilter.toLowerCase())) return false;
    if (reasonFilter && !(row.reasonCode ?? '').toLowerCase().includes(reasonFilter.toLowerCase())) return false;
    return true;
  });

  const topUsers = [...new Map(filtered.filter((r) => r.result === 'DENIED').map((r) => [r.userId ?? 'unknown', 0])).entries()]
    .map(([user]) => [user, filtered.filter((row) => row.result === 'DENIED' && (row.userId ?? 'unknown') === user).length] as const)
    .sort((a, b) => b[1] - a[1]).slice(0, 3);

  const accessPill = verdict === 'INCONCLUSIVE' ? 'Inconclusive' : verdict === 'INCIDENT' ? 'Incident' : verdict === 'ELEVATED' ? 'Elevated' : 'Normal';
  const rbacPill = spikePct >= 150 ? 'Spiking' : deniedCurrent >= 8 ? 'High' : 'Low';
  const sensitivePill = sensitiveBlocked > 0 ? 'Re-auth required' : 'Clear';
  const freshnessPill = freshnessSec === null || freshnessSec > 300 ? 'Stale' : 'Healthy';

  const assignRole = async () => {
    if (!userId.trim()) return;
    const payload: RbacAssignment = {
      user_id: userId.trim(),
      role,
      scope,
      scope_id: scopeId.trim() || (scope === 'fleet' ? 'fleet' : userId.trim()),
      assigned_by: operatorId,
      assigned_at: new Date().toISOString()
    };
    if (reason.trim().length > 0) payload.reason = reason.trim();
    if (expiresAt) payload.expires_at = new Date(expiresAt).toISOString();
    await assign(payload);
    setMessage(`Assigned ${role} to ${userId.trim()}.`);
    setUserId('');
  };

  return (
    <div className="stack">
      <Panel title="Security & Access">
        {loading || securityLoading ? <p className="muted-line">Loading security state...</p> : null}
        {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
        {message ? <p className="muted-line">{message}</p> : null}

        <div className="security-status-grid">
          <button type="button" className={`security-status-pill ${accessPill.toLowerCase().includes('incident') ? 'critical' : accessPill.toLowerCase().includes('elevated') || accessPill === 'Inconclusive' ? 'warn' : 'ok'}`} onClick={() => setTab('violations')}>
            <p className="status-card-title">Access Posture</p><p className="right-now-value">{accessPill}</p>
          </button>
          <button type="button" className={`security-status-pill ${rbacPill === 'Spiking' || rbacPill === 'High' ? 'critical' : 'ok'}`} onClick={() => setTab('violations')}>
            <p className="status-card-title">RBAC Violations</p><p className="right-now-value">{rbacPill}</p>
          </button>
          <button type="button" className={`security-status-pill ${sensitivePill === 'Clear' ? 'ok' : 'warn'}`} onClick={() => setTab('sensitive')}>
            <p className="status-card-title">Sensitive Ops</p><p className="right-now-value">{sensitivePill}</p>
          </button>
          <button type="button" className={`security-status-pill ${freshnessPill === 'Healthy' ? 'ok' : 'warn'}`} onClick={() => setTab('violations')}>
            <p className="status-card-title">Auth Freshness</p><p className="right-now-value">{freshnessPill}</p>
          </button>
        </div>

        <div className="security-attention-list">
          {(spikePct >= 150 ? [{ id: 'spike', title: 'RBAC activity spike detected', detail: `${deniedCurrent} denied in ${windowSize} (${spikePct}% vs previous window).`, apply: () => { setTab('violations'); setDeniedOnly(true); } }] : []).concat(
            sensitiveBlocked > 0 ? [{ id: 'reauth', title: 'Sensitive actions blocked', detail: `${sensitiveBlocked} blocked for missing re-auth.`, apply: () => { setTab('sensitive'); setDeniedOnly(true); setReasonFilter('reauth'); } }] : []
          ).map((item) => (
            <button key={item.id} type="button" className="security-attention-item" onClick={item.apply}>
              <strong>{item.title}</strong><span>{item.detail}</span>
            </button>
          ))}
          {spikePct < 150 && sensitiveBlocked === 0 ? <p className="muted-line">No active security attention items.</p> : null}
        </div>

        <div className="machine-drilldown-tabs">
          <button type="button" className={tab === 'roles' ? 'active' : ''} onClick={() => setTab('roles')}>Roles & Permissions</button>
          <button type="button" className={tab === 'assignments' ? 'active' : ''} onClick={() => setTab('assignments')}>Assignments</button>
          <button type="button" className={tab === 'violations' ? 'active' : ''} onClick={() => setTab('violations')}>Violations & Security Events</button>
          <button type="button" className={tab === 'sensitive' ? 'active' : ''} onClick={() => setTab('sensitive')}>Sensitive Ops Policy</button>
        </div>

        {tab === 'roles' ? (
          <div className="stack">
            {focus ? <p className="focus-banner">Filter applied: RBAC activity spike detected.</p> : null}
            <p className="muted-line">Matrix source: {matrixSource}</p>
            <div className="table-scroll-wrap">
              <table className="simple-table"><thead><tr><th>Role</th><th>Read</th><th>Write</th><th>Override</th><th>Sensitive actions</th></tr></thead><tbody>
                {matrix.map((row) => <tr key={row.role}><td>{row.role}</td><td>{row.read ? 'Y' : '-'}</td><td>{row.write ? 'Y' : '-'}</td><td>{row.override ? 'Y' : '-'}</td><td>{row.sensitive_actions.join(', ') || 'none'}</td></tr>)}
              </tbody></table>
            </div>
          </div>
        ) : null}

        {tab === 'assignments' ? (
          <div className="ops-grid">
            <div className="ops-editor">
              <h4>Assign role</h4>
              <label>User ID<input value={userId} onChange={(e) => setUserId(e.target.value)} /></label>
              <label>Role<select value={role} onChange={(e) => setRole(roleName(e.target.value))}><option value="admin">admin</option><option value="operator">operator</option><option value="auditor">auditor</option><option value="developer">developer</option></select></label>
              <label>Scope<select value={scope} onChange={(e) => setScope(e.target.value as 'fleet' | 'agent')}><option value="fleet">fleet-wide</option><option value="agent">per-agent</option></select></label>
              <label>Scope ID<input value={scopeId} onChange={(e) => setScopeId(e.target.value)} /></label>
              <label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              <label>Expires<input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label>
              <button type="button" onClick={() => void assignRole()} disabled={!canMutate || !userId.trim()} title={!canMutate ? 'Requires admin role' : 'Assign role'}>Assign role</button>
            </div>
            <div className="table-scroll-wrap">
              <table className="simple-table"><thead><tr><th>User</th><th>Role</th><th>Scope</th><th>Assigned by</th><th>At</th><th>Actions</th></tr></thead><tbody>
                {assignments.slice(0, 30).map((row) => (
                  <tr key={`${row.user_id}:${row.role}:${row.scope}:${row.scope_id}:${row.assigned_at}`}>
                    <td>{row.user_id}</td><td>{row.role}</td><td>{row.scope}:{row.scope_id}</td><td>{row.assigned_by}</td><td>{formatUtc(row.assigned_at)}</td>
                    <td><button type="button" disabled={!canMutate} title={!canMutate ? 'Requires admin role' : 'Revoke role'} onClick={() => { void revoke({ user_id: row.user_id, role: row.role, scope: row.scope, scope_id: row.scope_id }).then(() => setMessage(`Revoked ${row.role} from ${row.user_id}.`)).catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Revoke failed')); }}>Revoke</button></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </div>
        ) : null}

        {tab === 'violations' ? (
          <div className="stack">
            <section className={`rollout-verdict-card ${verdict === 'INCIDENT' ? 'critical' : verdict === 'ELEVATED' || verdict === 'INCONCLUSIVE' ? 'warn' : 'ok'}`}>
              <p className="rollout-verdict-label">Security Verdict</p>
              <p className="rollout-verdict-value">{verdict}</p>
              <p className="muted-line">denied_current={deniedCurrent} | denied_previous={deniedPrevious} | spike={spikePct}%</p>
            </section>
            <div className="table-controls">
              <label>Window<select value={windowSize} onChange={(e) => setWindowSize(e.target.value as WindowSize)}><option value="15m">Last 15m</option><option value="1h">Last 1h</option><option value="24h">Last 24h</option></select></label>
              <label>Role<input value={roleFilter === 'all' ? '' : roleFilter} onChange={(e) => setRoleFilter(e.target.value || 'all')} /></label>
              <label>User<input value={userFilter} onChange={(e) => setUserFilter(e.target.value)} /></label>
              <label>Action<input value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} /></label>
              <label>Reason<input value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)} /></label>
              <label>Scope<input value={scopeFilter === 'all' ? '' : scopeFilter} onChange={(e) => setScopeFilter(e.target.value || 'all')} /></label>
              <label>Denied only<input type="checkbox" checked={deniedOnly} onChange={(e) => setDeniedOnly(e.target.checked)} /></label>
            </div>
            <p className="muted-line">Results: {filtered.length} | Sample size: {current.length} | Freshness: {freshnessSec === null ? 'n/a' : `${freshnessSec}s`} | Telemetry: {ws.statusLabel}</p>
            <div className="security-top-grid">
              <div className="ops-editor"><h4>Top users denied</h4><ul className="kv-list">{topUsers.map(([user, count]) => <li key={user}><span>{user}</span><strong>{count}</strong></li>)}</ul></div>
              <div className="ops-editor"><h4>Violation timeline</h4><div className="security-timeline-chart">{Array.from({ length: Math.min(24, Math.max(6, Math.round(windowMs(windowSize) / (15 * 60 * 1000)))) }).map((_, index) => { const from = now - windowMs(windowSize) + index * Math.floor(windowMs(windowSize) / Math.min(24, Math.max(6, Math.round(windowMs(windowSize) / (15 * 60 * 1000))))); const to = from + Math.floor(windowMs(windowSize) / Math.min(24, Math.max(6, Math.round(windowMs(windowSize) / (15 * 60 * 1000))))); const count = filtered.filter((row) => { const ts = toMs(row.timestampUtc); return ts !== null && ts >= from && ts < to && row.result === 'DENIED'; }).length; const height = Math.max(4, (count / Math.max(1, deniedCurrent)) * 100); return <div key={`${from}`} className="security-timeline-col" title={`${count} denied`}><div className="security-timeline-bar" style={{ height: `${height}%` }} /><span>{new Date(from).getHours().toString().padStart(2, '0')}:{new Date(from).getMinutes().toString().padStart(2, '0')}</span></div>; })}</div></div>
            </div>
            <div className="table-scroll-wrap">
              <table className="simple-table"><thead><tr><th>Timestamp</th><th>User</th><th>Role</th><th>Action</th><th>Resource</th><th>Scope</th><th>Result</th><th>Reason</th><th>Correlation</th><th>Replay</th></tr></thead><tbody>
                {filtered.slice(0, 250).map((row) => <tr key={row.id} className={row.result === 'DENIED' ? 'row-alert' : undefined}><td>{formatUtc(row.timestampUtc)}</td><td>{row.userId ?? 'n/a'}</td><td>{row.role ?? 'n/a'}</td><td>{row.action}</td><td>{row.resource ?? 'n/a'}</td><td>{row.scope ?? 'n/a'}</td><td>{row.result}</td><td>{row.reasonCode ?? 'n/a'}</td><td>{row.correlationId ?? 'n/a'}</td><td><button type="button" disabled={!row.traceId && !row.correlationId} title={!row.traceId && !row.correlationId ? 'No replay evidence' : 'Replay available'}>Replay</button></td></tr>)}
                {filtered.length === 0 ? <tr><td colSpan={10} className="muted-line">No security events match current filters.</td></tr> : null}
              </tbody></table>
            </div>
          </div>
        ) : null}

        {tab === 'sensitive' ? (
          <div className="stack">
            <p className="muted-line">Source: {policy.source} | Updated: {formatUtc(policy.updated_at_utc ?? undefined)} | Operator role: {operatorRole}</p>
            <div className="security-policy-grid">
              <div className="ops-editor">
                <h4>Sensitive operations policy</h4>
                <ul className="kv-list">
                  <li><span>Re-auth window</span><strong>{policy.reauth_window_minutes}m</strong></li>
                  <li><span>2FA for override</span><strong>{policy.require_2fa_override ? 'required' : 'disabled'}</strong></li>
                  <li><span>Expired sessions</span><strong>{policy.expired_sessions}</strong></li>
                  <li><span>Blocked missing re-auth (1h)</span><strong>{policy.blocked_missing_reauth_last_1h}</strong></li>
                </ul>
              </div>
              <div className="ops-editor">
                <h4>Admin controls</h4>
                <label>Re-auth window minutes<input type="number" min={1} value={reauthWindow} onChange={(e) => setReauthWindow(Number(e.target.value))} /></label>
                <button type="button" disabled={operatorRole !== 'admin'} onClick={() => { void updateSensitiveOpsPolicy({ reauth_window_minutes: Math.max(1, Math.trunc(reauthWindow)), require_2fa_override: policy.require_2fa_override }).then((ok) => setMessage(ok ? 'Sensitive policy update requested.' : 'Sensitive policy update endpoint unavailable.')).catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Sensitive policy update failed')); }} title={operatorRole !== 'admin' ? 'Requires admin role' : 'Update policy'}>
                  Update policy
                </button>
              </div>
            </div>
            <h4>Actions requiring re-authentication</h4>
            <ul className="kv-list">
              {policy.sensitive_actions.map((action) => <li key={action}><span>{action}</span><strong>required</strong></li>)}
              {policy.sensitive_actions.length === 0 ? <li><span className="muted-line">No sensitive actions configured.</span><strong>n/a</strong></li> : null}
            </ul>
          </div>
        ) : null}

        <p className="muted-line">RBAC violations total={metrics.rbac_violations_total} | WS={ws.statusLabel} ({formatRelativeFromNow(ws.lastChangedUtc)})</p>
      </Panel>
    </div>
  );
}
