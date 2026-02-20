import { useEffect, useMemo, useState } from 'react';
import { getConfigDiffPreview, type ConfigDiffPreviewView } from '../api/config';
import { toApiError, type ApiError } from '../api/client';

export function useConfigDiffPreview(): { data?: ConfigDiffPreviewView; loading: boolean; error?: ApiError } {
  const [data, setData] = useState<ConfigDiffPreviewView | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  useEffect(() => {
    let mounted = true;

    getConfigDiffPreview()
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

  return useMemo(() => ({ data, loading, error }), [data, loading, error]);
}
