export type ActionsActionType = 'Suggestion' | 'Automatic change';
export type ActionsResult = 'Done' | 'Failed';

export interface ActionsRecord {
  id: string;
  machineName: string;
  userName: string;
  actionName: string;
  actionType: ActionsActionType;
  result: ActionsResult;
  timeUtc: string | null;
  errorMessage: string | null;
}
