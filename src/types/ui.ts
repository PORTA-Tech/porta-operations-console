export interface NodeDetail {
  nodeId: string;
  cohortId: string;
  configSeq: number;
  signatureStatus: 'verified' | 'invalid' | 'unknown';
  lastHeartbeatUtc: string;
  degradationState: 'normal' | 'degraded' | 'safe';
  sloCompliant: boolean;
}

export type CohortWindow = '15m' | '1h' | '6h' | '24h';

export interface CohortTrendPoint {
  timestampUtc: string;
  errorRatePct: number;
  p99LatencyMs: number;
  degradationRatePct: number;
}
