import { useMemo } from 'react';
import type { ActionsRecord } from '../types/actionsLayer';
import { type MachineActionEvent } from '../api/actions';
import { describeActionError, resolveCatalogAction } from '../utils/actionCatalog';
import { identityPrimaryLabel, identitySecondaryLabel, machineNameLabel, orgRoleLabel } from '../utils/fleetTruth';
import { useMachineActionFeed } from './useMachineActionFeed';
import { useMachineSummaryFeed } from './useMachineSummaryFeed';

function toRecordId(event: MachineActionEvent): string {
  return [
    event.machineId,
    event.interventionId,
    event.timestampUtc,
    event.action,
    event.executionState,
    event.verifiedState
  ].join(':');
}

function toActionType(value: MachineActionEvent['actionCategory']): ActionsRecord['actionType'] | null {
  if (value === 'suggestion') return 'Suggestion';
  if (value === 'automatic_change') return 'Automatic change';
  return null;
}

function toResult(event: MachineActionEvent): ActionsRecord['result'] | null {
  if (event.executionState === 'failed') return 'Failed';
  if (event.executionState === 'overlay_started') return 'Started';
  if (event.executionState === 'accepted') return 'Accepted';
  if (event.executionState === 'skipped') return 'Skipped';
  if (event.executionState === 'dismissed') return 'Dismissed';
  if (event.executionState === 'snoozed') return 'Snoozed';
  if (event.executionState === 'suppressed_by_preference') return 'Suppressed';
  if (event.executionState === 'overlay_recovered') return 'Recovered';
  if (event.executionState === 'overlay_completed') return 'Done';
  if (event.executionState === 'overlay_aborted') return 'Interrupted';
  if (event.actionCategory === 'suggestion') {
    return event.executionState === 'applied' || event.executionState === 'verified' ? 'Done' : null;
  }
  if (event.actionCategory === 'automatic_change') {
    if (event.executionState === 'verified' || event.verifiedState === 'verified') return 'Done';
    if (event.executionState === 'applied' && event.verifiedState === 'not_applicable') return 'Done';
  }
  return null;
}

function actionName(event: MachineActionEvent): string | null {
  const mapped = resolveCatalogAction({
    actionCode: event.action,
    commandType: null
  });
  return mapped?.actionName ?? null;
}

interface ActionCandidate {
  event: MachineActionEvent;
  actionType: ActionsRecord['actionType'];
  result: ActionsRecord['result'];
  actionName: string;
  machineName: string;
  userName: string;
  userDetail: string | null;
  orgRole: string | null;
}

function suggestionGroupKey(event: MachineActionEvent): string | null {
  if (event.actionCategory !== 'suggestion') return null;
  if (!event.interventionId) return null;
  // Terminal states for widget suggestions and break overlay suggestions both collapse
  // into a single representative record per intervention.
  // overlay_completed / overlay_aborted are the break-overlay equivalents of applied/verified/failed.
  const isTerminal =
    event.executionState === 'applied' ||
    event.executionState === 'verified' ||
    event.executionState === 'failed' ||
    event.executionState === 'overlay_completed' ||
    event.executionState === 'overlay_aborted';
  if (!isTerminal) {
    return null;
  }
  return [event.machineId, event.interventionId, event.action].join(':');
}

function compareIsoUtc(left: string | null | undefined, right: string | null | undefined): number {
  return Date.parse(left ?? '') - Date.parse(right ?? '');
}

function resolveSuggestionRepresentative(left: ActionCandidate, right: ActionCandidate): ActionCandidate {
  if (left.result !== right.result) {
    return left.result === 'Done' ? left : right;
  }

  if (left.result === 'Done') {
    return compareIsoUtc(left.event.timestampUtc, right.event.timestampUtc) <= 0 ? left : right;
  }

  return compareIsoUtc(left.event.timestampUtc, right.event.timestampUtc) >= 0 ? left : right;
}

export function reduceActionEventsToRecords(
  events: MachineActionEvent[],
  machineNameById: Map<string, string>
): ActionsRecord[] {
  const candidates: ActionCandidate[] = events.flatMap((event) => {
    const actionType = toActionType(event.actionCategory);
    const result = toResult(event);
    const resolvedActionName = actionName(event);

    if (!actionType || !result || !resolvedActionName) return [];

    return [{
      event,
      actionType,
      result,
      actionName: resolvedActionName,
      machineName: machineNameById.get(event.machineId) ?? event.machineId,
      userName: identityPrimaryLabel(event.displayName, event.userName),
      userDetail: identitySecondaryLabel(event.displayName, event.primaryEmail, event.userName),
      orgRole: orgRoleLabel(event.orgName, event.role)
    }];
  });

  const collapsed: ActionCandidate[] = [];
  const suggestionIndexes = new Map<string, number>();

  for (const candidate of candidates) {
    const key = suggestionGroupKey(candidate.event);
    if (key === null) {
      collapsed.push(candidate);
      continue;
    }

    const existingIndex = suggestionIndexes.get(key);
    if (existingIndex === undefined) {
      suggestionIndexes.set(key, collapsed.length);
      collapsed.push(candidate);
      continue;
    }

    const existing = collapsed[existingIndex];
    if (!existing) {
      collapsed[existingIndex] = candidate;
      continue;
    }

    collapsed[existingIndex] = resolveSuggestionRepresentative(existing, candidate);
  }

  return collapsed
    .map((candidate) => ({
      id: suggestionGroupKey(candidate.event) ?? toRecordId(candidate.event),
      machineName: candidate.machineName,
      userName: candidate.userName,
      userDetail: candidate.userDetail,
      orgRole: candidate.orgRole,
      actionName: candidate.actionName,
      actionType: candidate.actionType,
      result: candidate.result,
      timeUtc: candidate.result === 'Done'
        ? (candidate.event.executionState === 'overlay_completed'
            ? candidate.event.timestampUtc
            : (candidate.event.appliedAtUtc ?? candidate.event.timestampUtc))
        : candidate.event.timestampUtc,
      errorMessage: candidate.result === 'Failed' ? describeActionError(candidate.event.errorCode ?? null) : null
    } satisfies ActionsRecord))
    .sort((left, right) => Date.parse(right.timeUtc ?? '') - Date.parse(left.timeUtc ?? ''));
}

export function useActionsLayer(): {
  records: ActionsRecord[];
  loading: boolean;
  error: import('../api/client').ApiError | undefined;
  lastRefreshUtc: string | undefined;
  notices: string[];
} {
  const actionsFeed = useMachineActionFeed(250);
  const summaryFeed = useMachineSummaryFeed();

  const records = useMemo<ActionsRecord[]>(() => {
    const machineNameById = new Map(
      summaryFeed.rows.map((row) => [row.machineId, machineNameLabel(row.machineName)])
    );

    return reduceActionEventsToRecords(actionsFeed.rows, machineNameById);
  }, [actionsFeed.rows, summaryFeed.rows]);

  const notices = useMemo(() => {
    if (actionsFeed.loading || actionsFeed.error) return [];
    if (actionsFeed.rows.length > 0 && records.length === 0) {
      return ['No meaningful action records were found. Layer 4 now expects explicit suggestion lifecycle or automatic-change truth from the control plane.'];
    }
    return [];
  }, [actionsFeed.error, actionsFeed.loading, actionsFeed.rows.length, records.length]);

  return useMemo(
    () => ({
      records,
      loading: actionsFeed.loading || summaryFeed.loading,
      error: actionsFeed.error ?? summaryFeed.error,
      lastRefreshUtc: actionsFeed.lastRefreshUtc ?? summaryFeed.lastRefreshUtc,
      notices
    }),
    [
      actionsFeed.error,
      actionsFeed.lastRefreshUtc,
      actionsFeed.loading,
      notices,
      records,
      summaryFeed.error,
      summaryFeed.lastRefreshUtc,
      summaryFeed.loading
    ]
  );
}
