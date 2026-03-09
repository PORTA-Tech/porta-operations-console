import { useEffect, useState } from 'react';
import { toApiError, type ApiError } from '../api/client';
import { getNodeSnapshot } from '../api/nodes';
import { useFleetSlice } from '../store/fleetSlice';

export function useFleetState(): { loading: boolean; error: ApiError | undefined } {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const setRefreshState = useFleetSlice((state) => state.setRefreshState);

  useEffect(() => {
    let mounted = true;

    const refresh = async (): Promise<void> => {
      try {
        await getNodeSnapshot();
        if (!mounted) return;
        setRefreshState({
          liveConnected: true,
          lastUpdatedUtc: new Date().toISOString()
        });
        setError(undefined);
      } catch (nextError) {
        if (!mounted) return;
        setRefreshState({
          liveConnected: false
        });
        setError(toApiError(nextError));
      } finally {
        if (mounted) setLoading(false);
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
  }, [setRefreshState]);

  return { loading, error };
}
