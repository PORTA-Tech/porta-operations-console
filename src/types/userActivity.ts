export type UserActivityFocusLevel = 'Low' | 'Medium' | 'High' | 'Unavailable';
export type UserActivityDeepWork = 'Active' | 'Not active' | 'Unavailable';
export type UserActivityOverloadRisk = 'Low' | 'Medium' | 'High' | 'Unavailable';
export type UserActivityBreakNeeded = 'Yes' | 'No' | 'Unavailable';
export type UserActivityTone = 'live' | 'limited' | 'unavailable';

export interface UserActivityRecord {
  machineId: string;
  machineName: string;
  userName: string;
  userDetail: string | null;
  orgRole: string | null;
  focusLevel: UserActivityFocusLevel;
  deepWork: UserActivityDeepWork;
  overloadRisk: UserActivityOverloadRisk;
  focusDurationSec: number | null;
  focusDurationLabel: string;
  breakNeeded: UserActivityBreakNeeded;
  stateTimestampUtc: string | null;
  stateStale: boolean;
  note: string | null;
  tone: UserActivityTone;
}
