import { useEffect, useMemo, useRef, useState } from 'react';
import { getNodeSnapshot, type NodeSnapshotRow } from '../api/nodes';
import { fetchAuditDecisions } from '../api/operations';
import { toApiError, type ApiError } from '../api/client';
import type { MachineDataMode, NodeDetail } from '../types/ui';
import type { AuditDecisionRecord } from '../types/consoleOperations';

type StreamState = {
  focus: number | null;
  overload: number | null;
  fatigue: number | null;
  stress: number | null;
  stability: number | null;
  confidence: number | null;
  contributors: string[];
  lastUpdatedUtc: string;
};

const OFFLINE_HEARTBEAT_THRESHOLD_SEC = 30;
const HIGH_OVERLOAD_THRESHOLD = 0.75;
const HIGH_INTERVENTION_RATE_15M = 3;

function parseNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function pickString(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = parseString(raw[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function pickNumber(raw: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = parseNumber(raw[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function parseHeartbeatAgeSec(lastHeartbeatUtc: string): number {
  const heartbeatMs = Date.parse(lastHeartbeatUtc);
  if (!Number.isFinite(heartbeatMs)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.max(0, Math.floor((Date.now() - heartbeatMs) / 1000));
}

function classifyDegradationTag(row: NodeSnapshotRow, errorRatePct: number | null): 'healthy' | 'warning' | 'critical' {
  if (row.SLO_compliance !== 'compliant' || row.degradation_state === 'degraded') {
    return 'critical';
  }
  if ((errorRatePct !== null && errorRatePct > 0.1) || row.degradation_state === 'safe') {
    return 'warning';
  }
  return 'healthy';
}

function normalizeContributors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
    .slice(0, 5);
}

function toWsBase(base: string): string {
  const trimmed = base.trim().replace(/\/$/, '');
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed;
  }
  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length)}`;
  }
  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length)}`;
  }
  return `ws://${trimmed}`;
}

function buildDemoNodes(): NodeSnapshotRow[] {
  const now = new Date();
  const nodes: NodeSnapshotRow[] = [];
  const cohorts: Array<NodeSnapshotRow['cohort']> = ['stable', 'canary-1', 'canary-5', 'internal', 'experimental'];
  for (let idx = 0; idx < 12; idx += 1) {
    const heartbeat = new Date(now.getTime() - (idx % 4) * 18_000).toISOString();
    const cohort = cohorts[idx % cohorts.length] ?? 'stable';
    nodes.push({
      node_id: `demo-machine-${idx + 1}`,
      cohort,
      config_seq: idx % 3 === 0 ? 31 : 30,
      signature_valid: idx % 5 !== 0,
      last_heartbeat: heartbeat,
      degradation_state: idx % 4 === 0 ? 'degraded' : idx % 3 === 0 ? 'safe' : 'normal',
      SLO_compliance: idx % 4 === 0 ? 'breach' : 'compliant'
    });
  }
  return nodes;
}

function buildExpectedConfigByCohort(rows: NodeSnapshotRow[]): Record<string, number> {
  const countsByCohort = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const byConfig = countsByCohort.get(row.cohort) ?? new Map<number, number>();
    byConfig.set(row.config_seq, (byConfig.get(row.config_seq) ?? 0) + 1);
    countsByCohort.set(row.cohort, byConfig);
  }

  const expected: Record<string, number> = {};
  for (const [cohort, byConfig] of countsByCohort.entries()) {
    const sorted = [...byConfig.entries()].sort((left, right) => right[1] - left[1]);
    expected[cohort] = sorted[0]?.[0] ?? 0;
  }
  return expected;
}

function buildFleetVersionMode(rows: NodeSnapshotRow[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = row as unknown as Record<string, unknown>;
    const version = pickString(raw, ['agent_version', 'agentVersion', 'version']);
    if (!version) continue;
    counts.set(version, (counts.get(version) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  return sorted[0]?.[0] ?? null;
}

function decisionTimestampMs(decision: AuditDecisionRecord): number {
  const ms = Date.parse(decision.timestamp);
  return Number.isFinite(ms) ? ms : 0;
}

export function useNodeDrilldown(): {
  nodes: NodeDetail[];
  loading: boolean;
  error: ApiError | undefined;
  lastUpdatedUtc: string | undefined;
  dataMode: MachineDataMode;
  highOverloadThreshold: number;
  highInterventionRateThreshold: number;
} {
  const [nodes, setNodes] = useState<NodeDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [lastUpdatedUtc, setLastUpdatedUtc] = useState<string | undefined>(undefined);
  const [dataMode, setDataMode] = useState<MachineDataMode>('snapshot');
  const streamStateRef = useRef<Record<string, StreamState>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const wsBase = import.meta.env.VITE_WS_BASE_URL?.trim();
  const demoEnabled = import.meta.env.VITE_ENABLE_DEMO_DATA === '1';

  useEffect(() => {
    if (!wsBase) {
      return () => undefined;
    }

    let disposed = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      if (disposed) return;
      let streamUrl: string;
      try {
        streamUrl = `${toWsBase(wsBase)}/v1/stream/console-state`;
        new URL(streamUrl);
      } catch {
        return;
      }

      const ws = new WebSocket(streamUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
          const machineId = pickString(payload, ['machine_id', 'machineId', 'agent_id', 'node_id']);
          if (!machineId) return;
          const states = payload.states as Record<string, unknown> | undefined;
          const primitives = payload.primitives as Record<string, unknown> | undefined;
          const timestamp = pickString(payload, ['timestamp', 'timestamp_utc', 'at_utc']) ?? new Date().toISOString();
          if (!states && !primitives) return;

          const next: StreamState = {
            focus: states ? pickNumber(states, ['focus_strength', 'focus']) : null,
            overload: states ? pickNumber(states, ['overload_likelihood', 'overload']) : null,
            fatigue: states ? pickNumber(states, ['fatigue_probability', 'fatigue']) : null,
            stress: states ? pickNumber(states, ['stress_likelihood', 'stress']) : null,
            stability: states ? pickNumber(states, ['cognitive_stability_index', 'stability']) : null,
            confidence: pickNumber(payload, ['confidence_score', 'confidence_sigma', 'confidence']),
            contributors: normalizeContributors(payload.contributors ?? payload.triggered_by),
            lastUpdatedUtc: timestamp
          };

          streamStateRef.current = {
            ...streamStateRef.current,
            [machineId]: next
          };
        } catch {
          // Ignore malformed stream records; snapshot remains source of truth.
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        reconnectTimer = window.setTimeout(connect, 5000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [wsBase]);

  useEffect(() => {
    let mounted = true;

    const refresh = async (): Promise<void> => {
      try {
        const [snapshotResult, decisions] = await Promise.all([
          getNodeSnapshot(),
          fetchAuditDecisions().catch(() => [])
        ]);
        if (!mounted) return;

        const snapshot = snapshotResult;
        const expectedConfigByCohort = buildExpectedConfigByCohort(snapshot);
        const fleetVersionMode = buildFleetVersionMode(snapshot);
        const nowMs = Date.now();
        const window15m = nowMs - 15 * 60 * 1000;

        const decisionsByAgent = new Map<string, AuditDecisionRecord[]>();
        for (const decision of decisions) {
          const bucket = decisionsByAgent.get(decision.agent_id) ?? [];
          bucket.push(decision);
          decisionsByAgent.set(decision.agent_id, bucket);
        }
        for (const entries of decisionsByAgent.values()) {
          entries.sort((left, right) => decisionTimestampMs(right) - decisionTimestampMs(left));
        }

        const nextNodes = snapshot.map((row) => {
          const raw = row as unknown as Record<string, unknown>;
          const heartbeatAgeSec = parseHeartbeatAgeSec(row.last_heartbeat);
          const offline = heartbeatAgeSec > OFFLINE_HEARTBEAT_THRESHOLD_SEC;
          const expectedConfigSeq = expectedConfigByCohort[row.cohort] ?? row.config_seq;
          const configDrift = expectedConfigSeq > 0 ? row.config_seq !== expectedConfigSeq : false;
          const agentVersion = pickString(raw, ['agent_version', 'agentVersion', 'version']) ?? 'unknown';
          const versionMismatch = fleetVersionMode !== null && agentVersion !== 'unknown' && agentVersion !== fleetVersionMode;
          const backendConnectedRaw = pickString(raw, ['backend_connected', 'backendConnected']);
          const backendConnected = backendConnectedRaw !== null
            ? backendConnectedRaw.toLowerCase() === 'true'
            : !offline;
          const errorRatePct = pickNumber(raw, ['error_rate_pct', 'errorRatePct']);

          const streamState = streamStateRef.current[row.node_id];
          const stateSummary = streamState
            ? {
                focus: streamState.focus,
                overload: streamState.overload,
                fatigue: streamState.fatigue,
                stress: streamState.stress,
                stability: streamState.stability,
                confidence: streamState.confidence,
                contributors: streamState.contributors,
                source: 'stream' as const,
                lastUpdatedUtc: streamState.lastUpdatedUtc
              }
            : {
                focus: pickNumber(raw, ['focus_strength', 'focus']),
                overload: pickNumber(raw, ['overload_likelihood', 'overload']),
                fatigue: pickNumber(raw, ['fatigue_probability', 'fatigue']),
                stress: pickNumber(raw, ['stress_likelihood', 'stress']),
                stability: pickNumber(raw, ['cognitive_stability_index', 'stability']),
                confidence: pickNumber(raw, ['confidence_score', 'confidence']),
                contributors: normalizeContributors(raw.contributors),
                source: 'unavailable' as const,
                lastUpdatedUtc: null
              };

          const machineDecisions = decisionsByAgent.get(row.node_id) ?? [];
          const recentEvents = machineDecisions.slice(0, 10).map((event) => ({
            traceId: event.trace_id,
            correlationId: event.correlation_id,
            timestampUtc: event.timestamp,
            policyId: event.policy_id,
            decision: event.action_decision,
            confidence: event.confidence_score,
            trigger: event.triggered_by
          }));
          const interventions = machineDecisions.filter((event) => event.action_decision === 'intervene');
          const lastInterventionRecord = interventions[0];
          const interventionRate15m = interventions.filter((event) => {
            const eventMs = decisionTimestampMs(event);
            return eventMs >= window15m;
          }).length;
          const policyVersions = [...new Set(machineDecisions.map((event) => event.policy_id).filter((id) => id !== ''))];
          const demo = row.node_id.startsWith('demo-') || row.node_id.startsWith('demo_machine');

          return {
            nodeId: row.node_id,
            cohortId: row.cohort,
            configSeq: row.config_seq,
            signatureStatus: row.signature_valid ? 'verified' : 'invalid',
            lastHeartbeatUtc: row.last_heartbeat,
            degradationState: row.degradation_state,
            sloCompliant: row.SLO_compliance === 'compliant',
            heartbeatAgeSec,
            offline,
            expectedConfigSeq,
            configDrift,
            agentVersion,
            versionMismatch,
            backendConnected,
            stateSummary,
            lastIntervention: lastInterventionRecord
              ? `${lastInterventionRecord.action_decision} via ${lastInterventionRecord.policy_id}`
              : 'none',
            lastInterventionUtc: lastInterventionRecord?.timestamp ?? null,
            interventionRate15m,
            errorRatePct,
            degradationTag: classifyDegradationTag(row, errorRatePct),
            configIssuer: pickString(raw, ['issuer', 'config_issuer']),
            configExpiryUtc: pickString(raw, ['config_expires_at_utc', 'configExpiryUtc']),
            configDiffSummary: pickString(raw, ['config_diff_summary', 'configDiffSummary']),
            appliedPolicyVersions: policyVersions,
            recentEvents,
            demo
          } satisfies NodeDetail;
        });

        setNodes(nextNodes);
        setLastUpdatedUtc(new Date().toISOString());
        setDataMode(streamStateRef.current && Object.keys(streamStateRef.current).length > 0 ? 'live_stream' : 'snapshot');
        setError(undefined);
      } catch (err) {
        if (!mounted) return;
        if (demoEnabled) {
          const demoSnapshot = buildDemoNodes();
          const nowIso = new Date().toISOString();
          const expectedConfigByCohort = buildExpectedConfigByCohort(demoSnapshot);
          const demoNodes = demoSnapshot.map((row) => {
            const heartbeatAgeSec = parseHeartbeatAgeSec(row.last_heartbeat);
            const offline = heartbeatAgeSec > OFFLINE_HEARTBEAT_THRESHOLD_SEC;
            return {
              nodeId: row.node_id,
              cohortId: row.cohort,
              configSeq: row.config_seq,
              signatureStatus: row.signature_valid ? 'verified' : 'invalid',
              lastHeartbeatUtc: row.last_heartbeat,
              degradationState: row.degradation_state,
              sloCompliant: row.SLO_compliance === 'compliant',
              heartbeatAgeSec,
              offline,
              expectedConfigSeq: expectedConfigByCohort[row.cohort] ?? row.config_seq,
              configDrift: (expectedConfigByCohort[row.cohort] ?? row.config_seq) !== row.config_seq,
              agentVersion: 'demo',
              versionMismatch: false,
              backendConnected: !offline,
              stateSummary: {
                focus: null,
                overload: null,
                fatigue: null,
                stress: null,
                stability: null,
                confidence: null,
                contributors: [],
                source: 'unavailable',
                lastUpdatedUtc: null
              },
              lastIntervention: 'none',
              lastInterventionUtc: null,
              interventionRate15m: 0,
              errorRatePct: null,
              degradationTag: classifyDegradationTag(row, null),
              configIssuer: null,
              configExpiryUtc: null,
              configDiffSummary: null,
              appliedPolicyVersions: [],
              recentEvents: [],
              demo: true
            } satisfies NodeDetail;
          });
          setNodes(demoNodes);
          setDataMode('demo');
          setLastUpdatedUtc(nowIso);
          setError(undefined);
        } else {
          setError(toApiError(err));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 5_000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [demoEnabled]);

  return useMemo(
    () => ({
      nodes,
      loading,
      error,
      lastUpdatedUtc,
      dataMode,
      highOverloadThreshold: HIGH_OVERLOAD_THRESHOLD,
      highInterventionRateThreshold: HIGH_INTERVENTION_RATE_15M
    }),
    [nodes, loading, error, lastUpdatedUtc, dataMode]
  );
}
