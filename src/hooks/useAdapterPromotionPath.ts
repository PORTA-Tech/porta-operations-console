import { useEffect, useMemo, useState } from 'react';
import { advanceAdapterPromotionPath, getAdapterPromotionPath, type AdapterPromotionPathView } from '../api/adapter';
import { toApiError, type ApiError } from '../api/client';

export function useAdapterPromotionPath(): {
  data?: AdapterPromotionPathView;
  loading: boolean;
  error?: ApiError;
  advancing: boolean;
  advanceError?: ApiError;
  lastAdvance?: AdapterPromotionPathView;
  advance: () => Promise<AdapterPromotionPathView | undefined>;
} {
  const [data, setData] = useState<AdapterPromotionPathView | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<ApiError | undefined>();
  const [lastAdvance, setLastAdvance] = useState<AdapterPromotionPathView | undefined>();

  useEffect(() => {
    let mounted = true;
    getAdapterPromotionPath()
      .then((response) => {
        if (!mounted) return;
        setData(response);
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
  }, []);

  const advance = async (): Promise<AdapterPromotionPathView | undefined> => {
    setAdvancing(true);
    setAdvanceError(undefined);
    try {
      const response = await advanceAdapterPromotionPath();
      setData(response);
      setLastAdvance(response);
      return response;
    } catch (err) {
      setAdvanceError(toApiError(err));
      return undefined;
    } finally {
      setAdvancing(false);
    }
  };

  return useMemo(
    () => ({ data, loading, error, advancing, advanceError, lastAdvance, advance }),
    [data, loading, error, advancing, advanceError, lastAdvance]
  );
}
