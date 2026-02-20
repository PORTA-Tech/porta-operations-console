export interface NodeDetail {
  nodeId: string;
  cohortId: string;
  configSeq: number;
  signatureStatus: 'verified' | 'invalid' | 'unknown';
  lastHeartbeatUtc: string;
  degradationState: 'normal' | 'degraded' | 'safe';
  sloCompliant: boolean;
}
