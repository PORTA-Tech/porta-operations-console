export interface NodeDetail {
  nodeId: string;
  cohortId: string;
  sourceKind: 'snapshot' | 'recent_issue';
  configSeq: number;
  signatureStatus: 'verified' | 'invalid' | 'unknown';
  lastHeartbeatUtc: string;
  degradationState: 'normal' | 'degraded' | 'safe';
  sloCompliant: boolean;
  heartbeatAgeSec: number;
  offline: boolean;
  expectedConfigSeq: number;
  configDrift: boolean;
  agentVersion: string;
  versionMismatch: boolean;
  backendConnected: boolean;
  stateSummary: {
    focus: number | null;
    overload: number | null;
    fatigue: number | null;
    stress: number | null;
    stability: number | null;
    confidence: number | null;
    contributors: string[];
    source: 'stream' | 'snapshot' | 'unavailable';
    lastUpdatedUtc: string | null;
  };
  lastIntervention: string;
  lastInterventionUtc: string | null;
  interventionRate15m: number;
  errorRatePct: number | null;
  degradationTag: 'healthy' | 'warning' | 'critical';
  configIssuer: string | null;
  configExpiryUtc: string | null;
  configDiffSummary: string | null;
  appliedPolicyVersions: string[];
  recentEvents: Array<{
    traceId: string;
    correlationId: string;
    timestampUtc: string;
    policyId: string;
    decision: 'intervene' | 'skip' | 'cooldown' | 'blocked';
    confidence: number;
    trigger: string;
  }>;
  issueReasonCodes: string[];
  issueSummary: string | null;
  lastIssueAtUtc: string | null;
  demo: boolean;
}

export type MachineDataMode = 'live_stream' | 'snapshot' | 'demo';

export type CohortWindow = '15m' | '1h' | '6h' | '24h';

export interface CohortTrendPoint {
  timestampUtc: string;
  errorRatePct: number;
  p99LatencyMs: number;
  degradationRatePct: number;
}
