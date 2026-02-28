import { useEffect, useMemo, useState } from 'react';
import { getRolloutEvaluation, type RolloutEvaluation } from '../api/rollout';
import { toApiError, type ApiError } from '../api/client';

export function useRolloutEvaluation(): {
  data: RolloutEvaluation | undefined;
  loading: boolean;
  error: ApiError | undefined;
} {
  const [data, setData] = useState<RolloutEvaluation | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  useEffect(() => {
    let mounted = true;

    const refresh = async (): Promise<void> => {
      try {
        const next = await getRolloutEvaluation();
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
