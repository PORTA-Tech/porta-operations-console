export type OperationsTruthLabel = 'Yes' | 'No' | 'Unknown';
export type OperationsRiskLabel = 'Low' | 'Medium' | 'High' | 'Unknown';
export type OperationsActivityLabel = 'Active' | 'Not active' | 'Unknown';
export type OperationsLearningStage = 'Learning' | 'Ready' | 'Unknown';
export type OperationsDataQuality = 'Good' | 'Partial' | 'Poor' | 'Unknown';
export type OperationsActionType = 'Suggestion' | 'Automatic change' | 'Unknown';
export type OperationsActionResult = 'Done' | 'Failed' | 'Unknown';
export type OperationsMachineHealth = 'healthy' | 'warning' | 'critical';

export interface OperationsLayer1 {
  machineName: string;
  userName: string;
  lastSeenAtUtc: string | null;
  agentRunning: OperationsTruthLabel;
  userSessionConnected: OperationsTruthLabel;
  activityDetected: OperationsTruthLabel;
  lastActivityAtUtc: string | null;
  errorMessage: string | null;
}

export interface OperationsLayer2 {
  focusLevel: OperationsRiskLabel;
  deepWork: OperationsActivityLabel;
  overloadRisk: OperationsRiskLabel;
  focusDurationSec: number | null;
  breakNeeded: OperationsTruthLabel;
}

export interface OperationsLayer3 {
  learningStage: OperationsLearningStage;
  confidence: OperationsRiskLabel;
  dataQuality: OperationsDataQuality;
}

export interface OperationsActionItem {
  id: string;
  machine: string;
  user: string;
  actionName: string;
  actionType: OperationsActionType;
  result: OperationsActionResult;
  timeUtc: string | null;
  error: string | null;
}

export interface OperationsConsoleRecord {
  machineId: string;
  machineName: string;
  userName: string;
  lastRefreshUtc: string;
  healthTone: OperationsMachineHealth;
  reliabilityBlocked: boolean;
  layer1: OperationsLayer1;
  layer2: OperationsLayer2;
  layer3: OperationsLayer3;
  actions: OperationsActionItem[];
  sources: {
    snapshot: boolean;
    stream: boolean;
    traces: number;
    alerts: number;
  };
}
