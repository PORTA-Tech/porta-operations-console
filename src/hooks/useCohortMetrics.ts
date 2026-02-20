import { useMemo } from 'react';
import { useCohortSlice } from '../store/cohortSlice';

export function useCohortMetrics(): { cohortId: string; errorRatePct: number; p99LatencyMs: number; driftRisk: 'low' | 'medium' | 'high' } {
  const cohortId = useCohortSlice((s) => s.selectedCohort);

  return useMemo(() => {
    const lookup: Record<string, { errorRatePct: number; p99LatencyMs: number; driftRisk: 'low' | 'medium' | 'high' }> = {
      stable: { errorRatePct: 0.08, p99LatencyMs: 132, driftRisk: 'low' },
      'canary-1': { errorRatePct: 0.18, p99LatencyMs: 176, driftRisk: 'medium' },
      'canary-5': { errorRatePct: 0.26, p99LatencyMs: 202, driftRisk: 'medium' },
      internal: { errorRatePct: 0.05, p99LatencyMs: 118, driftRisk: 'low' },
      experimental: { errorRatePct: 0.49, p99LatencyMs: 238, driftRisk: 'high' }
    };

    return { cohortId, ...(lookup[cohortId] ?? lookup['canary-1']) };
  }, [cohortId]);
}
