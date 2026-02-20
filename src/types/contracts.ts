export type RolloutState = 'IDLE' | 'PROMOTING' | 'MONITORING' | 'HALTED' | 'ROLLED_BACK' | 'COOLDOWN';

export interface RolloutStatusView {
  state: RolloutState;
  activeConfigSeq: number;
  cooldownUntilUtc?: string;
  updatedAtUtc: string;
}

export interface SLOMetrics {
  windowStartUtc: string;
  windowEndUtc: string;
  cohortId: string;
  errorRatePct: number;
  p99LatencyMs: number;
  degradationRatePct: number;
  heartbeatGapIntervals: number;
}

export interface ConfigLedgerRecord {
  configSeq: number;
  configVersion: string;
  appliedAtUtc: string;
  issuerId: string;
  payload: Record<string, unknown>;
  diffFromPrevious?: string;
  previousConfigSeq?: number;
  rolloutStatus: 'pending' | 'promoting' | 'halted' | 'rolled_back' | 'completed';
  hash: string;
  previousHash?: string;
}

export interface AuditEvent {
  eventId: string;
  actorId: string;
  action: string;
  target: string;
  occurredAtUtc: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface NodeDetail {
  nodeId: string;
  cohortId: string;
  configSeq: number;
  signatureStatus: 'verified' | 'invalid' | 'unknown';
  lastHeartbeatUtc: string;
  degradationState: 'normal' | 'degraded' | 'safe';
  sloCompliant: boolean;
}
