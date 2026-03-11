import { useEffect, useMemo, useState } from 'react';
import { toApiError, type ApiError } from '../api/client';
import { fetchRecentMachineActions, type MachineActionEvent } from '../api/actions';

export function useMachineActionFeed(limit = 100): {
  rows: MachineActionEvent[];
  loading: boolean;
  error: ApiError | undefined;
  lastRefreshUtc: string | undefined;
} {
  const [rows, setRows] = useState<MachineActionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [lastRefreshUtc, setLastRefreshUtc] = useState<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      try {
        const nextRows = await fetchRecentMachineActions(limit);
        if (!mounted) return;
        setRows(nextRows);
        setError(undefined);
      } catch (nextError) {
        if (!mounted) return;
        setRows([]);
        setError(toApiError(nextError));
      } finally {
        if (!mounted) return;
        setLastRefreshUtc(new Date().toISOString());
        setLoading(false);
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 5_000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [limit]);

  return useMemo(
    () => ({
      rows,
      loading,
      error,
      lastRefreshUtc
    }),
    [error, lastRefreshUtc, loading, rows]
  );
}
