import { useEffect, useMemo, useState } from 'react';
import { getAuditLedgerView, type AuditLedgerRow } from '../api/audit';
import { toApiError, type ApiError } from '../api/client';

export function useAuditLedgerView(): { rows: AuditLedgerRow[]; loading: boolean; error?: ApiError } {
  const [rows, setRows] = useState<AuditLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  useEffect(() => {
    let mounted = true;

    const refresh = async (): Promise<void> => {
      try {
        const response = await getAuditLedgerView();
        if (!mounted) return;
        setRows(response);
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

  return useMemo(() => ({ rows, loading, error }), [rows, loading, error]);
}
