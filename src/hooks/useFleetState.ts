import { useEffect, useState } from 'react';
import { fetchRolloutState } from '../api/rolloutClient';
import { useFleetSlice } from '../store/fleetSlice';

export function useFleetState(): { loading: boolean; error?: string } {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const setRollout = useFleetSlice((s) => s.setRollout);

  useEffect(() => {
    let mounted = true;

    const refresh = async (): Promise<void> => {
      try {
        const state = await fetchRolloutState();
        if (!mounted) return;
        setRollout(state);
        setError(undefined);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [setRollout]);

  return { loading, error };
}
