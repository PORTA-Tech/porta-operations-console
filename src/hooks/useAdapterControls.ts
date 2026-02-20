import { useEffect, useMemo, useState } from 'react';
import { getAdapterControls, updateAdapterControls, type AdapterActivationControlsView } from '../api/adapter';
import { toApiError, type ApiError } from '../api/client';

export function useAdapterControls(): {
  data: AdapterActivationControlsView | undefined;
  loading: boolean;
  error: ApiError | undefined;
  saving: boolean;
  saveError: ApiError | undefined;
  lastMutation: AdapterActivationControlsView | undefined;
  refresh: () => Promise<void>;
  save: (next: AdapterActivationControlsView) => Promise<AdapterActivationControlsView | undefined>;
} {
  const [data, setData] = useState<AdapterActivationControlsView | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | undefined>();
  const [saveError, setSaveError] = useState<ApiError | undefined>();
  const [lastMutation, setLastMutation] = useState<AdapterActivationControlsView | undefined>();

  const refresh = async (): Promise<void> => {
    try {
      const response = await getAdapterControls();
      setData(response);
      setError(undefined);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const save = async (next: AdapterActivationControlsView): Promise<AdapterActivationControlsView | undefined> => {
    setSaving(true);
    setSaveError(undefined);
    try {
      const response = await updateAdapterControls({
        feature_adapter_enabled: next.feature_adapter_enabled,
        allowed_cohorts: next.allowed_cohorts,
        rate_limit: next.rate_limit,
        circuit_breaker_threshold: next.circuit_breaker_threshold,
        schema_version: next.schema_version
      });
      setData(response);
      setLastMutation(response);
      return response;
    } catch (err) {
      setSaveError(toApiError(err));
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const safeRefresh = async (): Promise<void> => {
      if (!mounted) return;
      await refresh();
    };

    void safeRefresh();
    return () => {
      mounted = false;
    };
  }, []);

  return useMemo(
    () => ({ data, loading, error, saving, saveError, lastMutation, refresh, save }),
    [data, loading, error, saving, saveError, lastMutation]
  );
}
