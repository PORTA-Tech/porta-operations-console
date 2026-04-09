export type ActionsActionType = 'Suggestion' | 'Automatic change';
export type ActionsResult =
  | 'Started'
  | 'Accepted'
  | 'Skipped'
  | 'Dismissed'
  | 'Snoozed'
  | 'Suppressed'
  | 'Recovered'
  | 'Done'
  | 'Interrupted'
  | 'Failed';

export interface ActionsRecord {
  id: string;
  machineName: string;
  userName: string;
  userDetail: string | null;
  orgRole: string | null;
  actionName: string;
  actionType: ActionsActionType;
  result: ActionsResult;
  timeUtc: string | null;
  errorMessage: string | null;
}
