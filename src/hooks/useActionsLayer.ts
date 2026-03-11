import { useMemo } from 'react';
import type { ActionsRecord } from '../types/actionsLayer';
import { type MachineActionEvent } from '../api/actions';
import { describeActionError, resolveCatalogAction } from '../utils/actionCatalog';
import { machineNameLabel } from '../utils/fleetTruth';
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

    const mappedRows: Array<ActionsRecord | null> = actionsFeed.rows.map((event) => {
        const actionType = toActionType(event.actionCategory);
        const result = toResult(event);
        const resolvedActionName = actionName(event);

        if (!actionType || !result || !resolvedActionName) return null;

        return {
          id: toRecordId(event),
          machineName: machineNameById.get(event.machineId) ?? event.machineId,
          userName: event.userName || 'Unknown user',
          actionName: resolvedActionName,
          actionType,
          result,
          timeUtc: result === 'Done'
            ? (event.appliedAtUtc ?? event.timestampUtc)
            : event.timestampUtc,
          errorMessage: result === 'Failed' ? describeActionError(event.errorCode ?? null) : null
        } satisfies ActionsRecord;
      });

    return mappedRows
      .filter((row): row is ActionsRecord => row !== null)
      .sort((left, right) => Date.parse(right.timeUtc ?? '') - Date.parse(left.timeUtc ?? ''));
  }, [actionsFeed.rows, summaryFeed.rows]);

  const notices = useMemo(() => {
    if (actionsFeed.loading || actionsFeed.error) return [];
    if (actionsFeed.rows.length > 0 && records.length === 0) {
      return ['No terminal meaningful actions were found. Layer 4 only shows suggestion and automatic-change actions with authoritative completion or failure truth.'];
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
