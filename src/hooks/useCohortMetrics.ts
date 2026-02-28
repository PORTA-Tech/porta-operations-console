import { useEffect, useMemo, useState } from 'react';
import type { CohortId } from '../types/apiContracts';
import {
  getCohortEvaluation,
  type CohortEvaluationSnapshot,
  type CohortRegressionEvent,
  type CohortSummary
} from '../api/cohorts';
import { toApiError, type ApiError } from '../api/client';
import { useCohortSlice } from '../store/cohortSlice';
import type { CohortWindow } from '../types/ui';

export function useCohortMetrics(): {
  snapshot: CohortEvaluationSnapshot | undefined;
  rows: CohortSummary[];
  generatedAtUtc: string | undefined;
  source: string | undefined;
  activeEvents: CohortRegressionEvent[];
  recentEvents: CohortRegressionEvent[];
  loading: boolean;
  error: ApiError | undefined;
  window: CohortWindow;
  compareMode: boolean;
  primaryCohort: CohortId;
  secondaryCohort: CohortId;
  primary: CohortSummary | undefined;
  secondary: CohortSummary | undefined;
  setWindow: (window: CohortWindow) => void;
  setCompareMode: (enabled: boolean) => void;
  setPrimaryCohort: (cohort: CohortId) => void;
  setSecondaryCohort: (cohort: CohortId) => void;
} {
  const [snapshot, setSnapshot] = useState<CohortEvaluationSnapshot | undefined>();
  const [rows, setRows] = useState<CohortSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const window = useCohortSlice((s) => s.window);
  const compareMode = useCohortSlice((s) => s.compareMode);
  const primaryCohort = useCohortSlice((s) => s.primaryCohort);
  const secondaryCohort = useCohortSlice((s) => s.secondaryCohort);
  const setWindow = useCohortSlice((s) => s.setWindow);
  const setCompareMode = useCohortSlice((s) => s.setCompareMode);
  const setPrimaryCohort = useCohortSlice((s) => s.setPrimaryCohort);
  const setSecondaryCohort = useCohortSlice((s) => s.setSecondaryCohort);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const refresh = async (): Promise<void> => {
      try {
        const data = await getCohortEvaluation(window, secondaryCohort);
        if (!mounted) return;
        setSnapshot(data);
        setRows(data.rows);
        setError(undefined);
      } catch (err) {
        if (!mounted) return;
        setError(toApiError(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void refresh();
    const timer = globalThis.window.setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      mounted = false;
      globalThis.window.clearInterval(timer);
    };
  }, [secondaryCohort, window]);

  const primary = useMemo(() => rows.find((row) => row.cohortId === primaryCohort), [rows, primaryCohort]);
  const secondary = useMemo(() => rows.find((row) => row.cohortId === secondaryCohort), [rows, secondaryCohort]);

  return {
    snapshot,
    rows,
    generatedAtUtc: snapshot?.generatedAtUtc,
    source: snapshot?.source,
    activeEvents: snapshot?.activeEvents ?? [],
    recentEvents: snapshot?.recentEvents ?? [],
    loading,
    error,
    window,
    compareMode,
    primaryCohort,
    secondaryCohort,
    primary,
    secondary,
    setWindow,
    setCompareMode,
    setPrimaryCohort,
    setSecondaryCohort
  };
}
