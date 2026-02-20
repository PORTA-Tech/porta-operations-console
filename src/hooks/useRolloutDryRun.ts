import { useEffect, useMemo, useState } from 'react';
import { getRolloutDryRun, type RolloutDryRunView } from '../api/rollout';
import { toApiError, type ApiError } from '../api/client';

export function useRolloutDryRun(): { data: RolloutDryRunView | undefined; loading: boolean; error: ApiError | undefined } {
  const [data, setData] = useState<RolloutDryRunView | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  useEffect(() => {
    let mounted = true;

    const refresh = async (): Promise<void> => {
      try {
        const next = await getRolloutDryRun();
        if (!mounted) return;
        setData(next);
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
    }, 5_000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return useMemo(() => ({ data, loading, error }), [data, loading, error]);
}
