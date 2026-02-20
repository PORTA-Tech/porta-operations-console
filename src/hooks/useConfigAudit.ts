import { useEffect, useState } from 'react';
import type { ConfigLedgerRecord } from '../types/contracts';
import { fetchConfigLedger } from '../api/configClient';

export function useConfigAudit(): { rows: ConfigLedgerRecord[]; loading: boolean; error?: string } {
  const [rows, setRows] = useState<ConfigLedgerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let mounted = true;

    fetchConfigLedger()
      .then((data) => {
        if (!mounted) return;
        setRows(data);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : String(err));
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
