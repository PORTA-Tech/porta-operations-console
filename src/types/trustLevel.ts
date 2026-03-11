export type TrustLearningStage = 'Learning' | 'Ready';
export type TrustConfidence = 'Low' | 'Medium' | 'High';
export type TrustDataQuality = 'Good' | 'Partial' | 'Poor';
export type TrustLevelTone = 'live' | 'limited' | 'unavailable';

export interface TrustLevelRecord {
  machineId: string;
  machineName: string;
  userName: string;
  userDetail: string | null;
  orgRole: string | null;
  learningStage: TrustLearningStage;
  confidence: TrustConfidence;
  dataQuality: TrustDataQuality;
  stateTimestampUtc: string | null;
  stateStale: boolean;
  note: string | null;
  tone: TrustLevelTone;
}
