import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toApiError, type ApiError } from '../api/client';
import { fetchCategories, type AppCategoryLabel } from '../api/categories';

/**
 * Loads the fleet's app-category labels (2d) and refreshes them on an interval. Exposes a manual
 * `refresh` so the page can re-pull immediately after an operator override.
 */
export function useCategoriesFeed(): {
  rows: AppCategoryLabel[];
  loading: boolean;
  error: ApiError | undefined;
  refresh: () => Promise<void>;
} {
  const [rows, setRows] = useState<AppCategoryLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchCategories();
      if (!mountedRef.current) return;
      setRows(next);
      setError(undefined);
    } catch (nextError) {
      if (!mountedRef.current) return;
      setError(toApiError(nextError));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 15_000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  return useMemo(() => ({ rows, loading, error, refresh }), [rows, loading, error, refresh]);
}
