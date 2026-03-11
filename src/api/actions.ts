import { apiRequestRaw } from './client';

export type MachineActionCategory =
  | 'suggestion'
  | 'automatic_change'
  | 'policy_intent'
  | 'unsupported'
  | 'decision_record';

export type MachineActionDecisionState = 'decided';

export type MachineActionExecutionState =
  | 'decision_only'
  | 'decided'
  | 'applied'
  | 'verified'
  | 'failed';

export type MachineActionVerifiedState =
  | 'not_applicable'
  | 'pending'
  | 'unverified'
  | 'verified';

export interface MachineActionEvent {
  machineId: string;
  userName: string;
  interventionId: string;
  action: string;
  actionCategory: MachineActionCategory;
  decisionState: MachineActionDecisionState;
  executionState: MachineActionExecutionState;
  verifiedState: MachineActionVerifiedState;
  timestampUtc: string;
  appliedAtUtc?: string | null;
  errorCode?: string | null;
  policyId: string;
  whatChanged?: string | null;
  howToUndo?: string | null;
}

export async function fetchRecentMachineActions(limit = 100): Promise<MachineActionEvent[]> {
  return apiRequestRaw<MachineActionEvent[]>({
    path: `/v1/actions/recent?limit=${Math.max(1, Math.min(limit, 1000))}`,
    method: 'get'
  });
}

export async function fetchMachineActions(machineId: string, limit = 100): Promise<MachineActionEvent[]> {
  return apiRequestRaw<MachineActionEvent[]>({
    path: `/v1/machines/${encodeURIComponent(machineId)}/actions?limit=${Math.max(1, Math.min(limit, 1000))}`,
    method: 'get'
  });
}
