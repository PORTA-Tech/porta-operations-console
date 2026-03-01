import { useEffect, useMemo, useRef, useState } from 'react';
import { toApiError, type ApiError } from '../api/client';
import { getSystemHealth, postSystemUiMetrics, type SystemHealthSnapshot } from '../api/systemHealth';

function percentile(values: number[], pct: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  const value = sorted[idx];
  return value === undefined ? null : value;
}

export function useSystemHealth(): {
  data: SystemHealthSnapshot | undefined;
  loading: boolean;
  error: ApiError | undefined;
} {
  const [data, setData] = useState<SystemHealthSnapshot | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  const refreshTotalRef = useRef(0);
  const refreshFailedRef = useRef(0);
  const frameSamplesRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    let lastFrame = performance.now();

    const tick = (now: number) => {
      if (!active) return;
      const delta = now - lastFrame;
      lastFrame = now;
      frameSamplesRef.current.push(delta);
      if (frameSamplesRef.current.length > 600) {
        frameSamplesRef.current.splice(0, frameSamplesRef.current.length - 600);
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      active = false;
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const refresh = async (): Promise<void> => {
      const started = performance.now();
      refreshTotalRef.current += 1;
      try {
        const next = await getSystemHealth();
        if (!mounted) return;
        setData(next);
        setError(undefined);

        const renderP95 = percentile(frameSamplesRef.current, 95);
        const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
        const memoryMb = typeof memory?.usedJSHeapSize === 'number'
          ? Math.round((memory.usedJSHeapSize / (1024 * 1024)) * 100) / 100
          : null;

        void postSystemUiMetrics({
          sampled_at_utc: new Date().toISOString(),
          render_latency_ms_p95: renderP95,
          chart_render_failures: 0,
          refresh_total: refreshTotalRef.current,
          refresh_failed: refreshFailedRef.current,
          last_refresh_duration_ms: Math.round((performance.now() - started) * 100) / 100,
          data_coverage_pct: next.data_quality.coverage_pct ?? null,
          memory_usage_mb: memoryMb
        });
      } catch (err) {
        refreshFailedRef.current += 1;
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
