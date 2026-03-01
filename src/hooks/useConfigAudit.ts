import { toApiError, type ApiError } from '../api/client';
import { useEffect, useState } from 'react';
import type { ConfigLedgerRecord } from '../types/apiContracts';
import { getConfigLedger } from '../api/config';

export function useConfigAudit(): { rows: ConfigLedgerRecord[]; loading: boolean; error: ApiError | undefined } {
  const [rows, setRows] = useState<ConfigLedgerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  useEffect(() => {
    let mounted = true;
    const refresh = async (): Promise<void> => {
      try {
        const data = await getConfigLedger();
        if (!mounted) return;
        setRows(data);
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

  return { rows, loading, error };
}
