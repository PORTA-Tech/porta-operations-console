import { useEffect, useMemo, useState } from 'react';
import {
  getAdapterObservability,
  getAdapterReplayLog,
  type AdapterCohortObservabilityRow,
  type AdapterReplayLogRow
} from '../api/adapter';
import { toApiError, type ApiError } from '../api/client';

export function useAdapterObservability(): {
  rows: AdapterCohortObservabilityRow[];
  replayRows: AdapterReplayLogRow[];
  selectedCohort: string | undefined;
  loading: boolean;
  replayLoading: boolean;
  error: ApiError | undefined;
  replayError: ApiError | undefined;
  setSelectedCohort: (cohort: string) => void;
} {
  const [rows, setRows] = useState<AdapterCohortObservabilityRow[]>([]);
  const [replayRows, setReplayRows] = useState<AdapterReplayLogRow[]>([]);
  const [selectedCohort, setSelectedCohort] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [replayLoading, setReplayLoading] = useState(false);
  const [error, setError] = useState<ApiError | undefined>();
  const [replayError, setReplayError] = useState<ApiError | undefined>();

  useEffect(() => {
    let mounted = true;
    const refresh = async (): Promise<void> => {
      try {
        const response = await getAdapterObservability();
        if (!mounted) return;
        setRows(response);
        setSelectedCohort((current) => current ?? response[0]?.cohort);
        setError(undefined);
      } catch (err) {
        if (!mounted) return;
        setError(toApiError(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedCohort) return;
    let mounted = true;
    setReplayLoading(true);
    setReplayError(undefined);

    getAdapterReplayLog(selectedCohort)
      .then((response) => {
        if (!mounted) return;
        setReplayRows(response);
      })
      .catch((err) => {
        if (!mounted) return;
        setReplayError(toApiError(err));
      })
      .finally(() => {
        if (mounted) setReplayLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedCohort]);

  return useMemo(
    () => ({
      rows,
      replayRows,
      selectedCohort,
      loading,
      replayLoading,
      error,
      replayError,
      setSelectedCohort
    }),
    [rows, replayRows, selectedCohort, loading, replayLoading, error, replayError]
  );
}
