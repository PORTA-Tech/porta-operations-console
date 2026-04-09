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
  | 'overlay_started'
  | 'accepted'
  | 'dismissed'
  | 'skipped'
  | 'snoozed'
  | 'suppressed_by_preference'
  | 'overlay_recovered'
  | 'overlay_completed'
  | 'overlay_aborted'
  | 'failed';

export type MachineActionVerifiedState =
  | 'not_applicable'
  | 'pending'
  | 'unverified'
  | 'verified';

export interface MachineActionEvent {
  deviceId?: string;
  accountId?: string | null;
  orgId?: string | null;
  machineId: string;
  userName: string;
  displayName?: string | null;
  primaryEmail?: string | null;
  orgName?: string | null;
  role?: string | null;
  interventionId: string;
  action: string;
  actionCategory: MachineActionCategory;
  decisionState: MachineActionDecisionState;
  executionState: MachineActionExecutionState;
  verifiedState: MachineActionVerifiedState;
  timestampUtc: string;
  appliedAtUtc?: string | null;
  errorCode?: string | null;
  deliverySurface?: string | null;
  interactionKind?: string | null;
  breakKind?: string | null;
  promptOutcome?: string | null;
  overlayState?: string | null;
  policyId: string;
  whatChanged?: string | null;
  howToUndo?: string | null;
}

interface CollectionResponse<T> {
  value?: T[] | null;
  Value?: T[] | null;
  count?: number;
  Count?: number;
}

export async function fetchRecentMachineActions(limit = 100): Promise<MachineActionEvent[]> {
  const response = await apiRequestRaw<MachineActionEvent[] | CollectionResponse<MachineActionEvent>>({
    path: `/v1/actions/recent?limit=${Math.max(1, Math.min(limit, 1000))}`,
    method: 'get'
  });

  if (Array.isArray(response)) {
    return response;
  }

  return response.value ?? response.Value ?? [];
}

export async function fetchMachineActions(machineId: string, limit = 100): Promise<MachineActionEvent[]> {
  const response = await apiRequestRaw<MachineActionEvent[] | CollectionResponse<MachineActionEvent>>({
    path: `/v1/machines/${encodeURIComponent(machineId)}/actions?limit=${Math.max(1, Math.min(limit, 1000))}`,
    method: 'get'
  });

  if (Array.isArray(response)) {
    return response;
  }

  return response.value ?? response.Value ?? [];
}
