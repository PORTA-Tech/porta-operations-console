import { useMemo } from 'react';
import { authClient } from '../api/authClient';

export function useOperatorAuth(): {
  operatorId: string;
  operatorRole: 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer';
} {
  return useMemo(() => authClient.getOperatorAuth(), []);
}
