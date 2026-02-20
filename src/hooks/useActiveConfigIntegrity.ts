import { useEffect, useMemo, useState } from 'react';
import { getActiveConfigIntegrity, type ActiveConfigIntegrityView } from '../api/config';
import { toApiError, type ApiError } from '../api/client';

export function useActiveConfigIntegrity(): { data?: ActiveConfigIntegrityView; loading: boolean; error?: ApiError } {
  const [data, setData] = useState<ActiveConfigIntegrityView | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  useEffect(() => {
    let mounted = true;

    const refresh = async (): Promise<void> => {
      try {
        const result = await getActiveConfigIntegrity();
        if (!mounted) return;
        setData(result);
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
