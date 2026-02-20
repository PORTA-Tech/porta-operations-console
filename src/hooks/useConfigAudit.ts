import { toApiError, type ApiError } from '../api/client';
import { useEffect, useState } from 'react';
import type { ConfigLedgerRecord } from '@porta/api-contracts';
import { getConfigLedger } from '../api/config';

export function useConfigAudit(): { rows: ConfigLedgerRecord[]; loading: boolean; error?: ApiError } {
  const [rows, setRows] = useState<ConfigLedgerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  useEffect(() => {
    let mounted = true;

    getConfigLedger()
      .then((data) => {
        if (!mounted) return;
        setRows(data);
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

  return { rows, loading, error };
}
