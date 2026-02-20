import { useEffect, useMemo, useState } from 'react';
import type { CohortId } from '../types/apiContracts';
import { getCohortSummary, type CohortSummary } from '../api/cohorts';
import { toApiError, type ApiError } from '../api/client';
import { useCohortSlice } from '../store/cohortSlice';
import type { CohortWindow } from '../types/ui';

export function useCohortMetrics(): {
  rows: CohortSummary[];
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

    getCohortSummary(window)
      .then((data) => {
        if (!mounted) return;
        setRows(data);
        setError(undefined);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(toApiError(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [window]);

  const primary = useMemo(() => rows.find((row) => row.cohortId === primaryCohort), [rows, primaryCohort]);
  const secondary = useMemo(() => rows.find((row) => row.cohortId === secondaryCohort), [rows, secondaryCohort]);

  return {
    rows,
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
