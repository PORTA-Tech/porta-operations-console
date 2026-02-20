import { toApiError, type ApiError } from '../api/client';
import { useEffect, useState } from 'react';
import { getFleetState } from '../api/fleet';
import { getCohortSnapshots } from '../api/cohorts';
import { useFleetSlice } from '../store/fleetSlice';

export function useFleetState(): { loading: boolean; error?: ApiError } {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const setRollout = useFleetSlice((s) => s.setRollout);
  const setCohorts = useFleetSlice((s) => s.setCohorts);

  useEffect(() => {
    let mounted = true;

    const refresh = async (): Promise<void> => {
      try {
        const [state, cohorts] = await Promise.all([getFleetState(), getCohortSnapshots()]);
        if (!mounted) return;
        setRollout(state);
        setCohorts(cohorts);
        setError(undefined);
      } catch (err) {
        if (!mounted) return;
        setError(toApiError(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [setRollout, setCohorts]);

  return { loading, error };
}
