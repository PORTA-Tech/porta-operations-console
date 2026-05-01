import type { ActionsActionType, ActionsResult } from '../types/actionsLayer';

type ActionCatalogEntry = {
  displayName: string;
  actionType: ActionsActionType;
  actionCodes: string[];
  commandTypes: string[];
};

type TerminalResult = {
  result: ActionsResult;
  timePreference: 'applied' | 'acked';
};

const ACTION_CATALOG: ActionCatalogEntry[] = [
  {
    displayName: 'Long break',
    actionType: 'Suggestion',
    actionCodes: ['long_break', 'break_suggestion'],
    commandTypes: ['show_break_overlay', 'show_break_toast']
  },
  {
    displayName: 'Short break',
    actionType: 'Suggestion',
    actionCodes: ['short_break', 'stretch_break_suggestion'],
    commandTypes: ['show_break_overlay', 'show_stretch_break_toast']
  },
  {
    displayName: 'Focus lock suggestion',
    actionType: 'Suggestion',
    actionCodes: ['focus_lock_in_suggestion'],
    commandTypes: ['show_focus_lock_in_toast']
  },
  {
    displayName: 'Notifications muted',
    actionType: 'Automatic change',
    actionCodes: ['deep_work_notifications_suppressed'],
    commandTypes: ['suppress_notifications']
  },
  {
    displayName: 'Notifications restored',
    actionType: 'Automatic change',
    actionCodes: ['deep_work_notifications_restored'],
    commandTypes: ['restore_notifications']
  }
];

const ACTION_BY_CODE = new Map<string, ActionCatalogEntry>();
const ACTION_BY_COMMAND = new Map<string, ActionCatalogEntry>();

for (const entry of ACTION_CATALOG) {
  for (const actionCode of entry.actionCodes) {
    ACTION_BY_CODE.set(actionCode, entry);
  }
  for (const commandType of entry.commandTypes) {
    ACTION_BY_COMMAND.set(commandType, entry);
  }
}

const ERROR_MESSAGES = new Map<string, string>([
  ['session_unavailable', 'User session unavailable'],
  ['user_session_unavailable', 'User session unavailable'],
  ['toast_unavailable', 'Suggestion toast unavailable'],
  ['toast_renderer_failed', 'Suggestion toast failed'],
  ['missing_payload', 'Action payload missing'],
  ['invalid_payload', 'Action payload invalid'],
  ['payload_parse_failed', 'Action payload invalid'],
  ['missing_toast_message', 'Suggestion message missing'],
  ['unsupported_command', 'Unsupported command'],
  ['break_overlay_disposed', 'Break overlay unavailable'],
  ['break_overlay_not_ready', 'Break overlay not ready'],
  ['break_overlay_dispatch_failed', 'Break overlay failed to open'],
  ['break_overlay_recovery_failed', 'Break overlay recovery failed'],
  ['break_overlay_recovery_missing', 'Break overlay recovery state missing'],
  ['snapshot_capture_failed', 'Notification API unavailable'],
  ['notification_snapshot_failed', 'Notification API unavailable'],
  ['snapshot_invalid', 'Notification snapshot invalid'],
  ['snapshot_persist_failed', 'Notification snapshot save failed'],
  ['suppression_apply_failed', 'Notification mute failed'],
  ['notification_suppress_failed', 'Notification mute failed'],
  ['snapshot_missing_or_invalid', 'Saved notification state unavailable'],
  ['suppression_restore_failed', 'Notification restore failed'],
  ['notification_restore_failed', 'Notification restore failed'],
  ['signature_verification_failed', 'Command signature verification failed'],
  ['policy_version_mismatch', 'Command policy version mismatch'],
  ['command_expired', 'Command expired'],
  ['local_execution_failed', 'Local execution failed'],
  ['capture_context_missing', 'Capture context missing'],
  ['apply_denied', 'Apply denied']
]);

function normalize(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function resolveCatalogAction(input: {
  actionCode: string | null;
  commandType: string | null;
}): { actionName: string; actionType: ActionsActionType } | null {
  const normalizedAction = normalize(input.actionCode);
  if (normalizedAction) {
    const match = ACTION_BY_CODE.get(normalizedAction);
    if (match) {
      return {
        actionName: match.displayName,
        actionType: match.actionType
      };
    }
  }

  const normalizedCommand = normalize(input.commandType);
  if (normalizedCommand) {
    const match = ACTION_BY_COMMAND.get(normalizedCommand);
    if (match) {
      return {
        actionName: match.displayName,
        actionType: match.actionType
      };
    }
  }

  return null;
}

export function resolveTerminalResult(value: string | null): TerminalResult | null {
  const normalized = normalize(value);
  if (!normalized) return null;

  if (normalized === 'applied' || normalized === 'done' || normalized === 'success' || normalized === 'succeeded' || normalized === 'completed') {
    return {
      result: 'Done',
      timePreference: 'applied'
    };
  }

  if (normalized === 'overlay_completed') {
    return {
      result: 'Done',
      timePreference: 'acked'
    };
  }

  if (normalized === 'overlay_started') {
    return {
      result: 'Started',
      timePreference: 'acked'
    };
  }

  if (normalized === 'accepted') {
    return {
      result: 'Accepted',
      timePreference: 'acked'
    };
  }

  if (normalized === 'skipped') {
    return {
      result: 'Skipped',
      timePreference: 'acked'
    };
  }

  if (normalized === 'dismissed') {
    return {
      result: 'Dismissed',
      timePreference: 'acked'
    };
  }

  if (normalized === 'snoozed') {
    return {
      result: 'Snoozed',
      timePreference: 'acked'
    };
  }

  if (normalized === 'suppressed_by_preference') {
    return {
      result: 'Suppressed',
      timePreference: 'acked'
    };
  }

  if (normalized === 'overlay_recovered') {
    return {
      result: 'Recovered',
      timePreference: 'acked'
    };
  }

  if (normalized === 'overlay_aborted') {
    return {
      result: 'Interrupted',
      timePreference: 'acked'
    };
  }

  if (normalized === 'failed' || normalized === 'error' || normalized === 'rejected') {
    return {
      result: 'Failed',
      timePreference: 'acked'
    };
  }

  if (normalized === 'decided' || normalized === 'decision_only' || normalized === 'pending' || normalized === 'queued') {
    return null;
  }

  return null;
}

export function describeActionError(errorCode: string | null): string | null {
  const normalized = normalize(errorCode);
  if (!normalized) return null;

  const mapped = ERROR_MESSAGES.get(normalized);
  if (mapped) return mapped;

  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
