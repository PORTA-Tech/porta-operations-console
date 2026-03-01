import { useMemo, useRef } from 'react';
import { Panel } from '../../components/Layout/Panel';
import { useSystemHealth } from '../../hooks/useSystemHealth';
import type { SystemHealthPoint, SystemHealthSnapshot } from '../../api/systemHealth';
import { formatUtc } from '../../utils/date';

const CHART_WIDTH = 360;
const CHART_HEIGHT = 110;
const CHART_PADDING = 10;

function formatValue(value: number | null | undefined, suffix = '', decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return `${value.toFixed(decimals)}${suffix}`;
}

function verdictTone(status: SystemHealthSnapshot['verdict']['status']): 'ok' | 'warn' | 'critical' | 'neutral' {
  if (status === 'HEALTHY') return 'ok';
  if (status === 'DEGRADED') return 'warn';
  if (status === 'UNRELIABLE') return 'critical';
  return 'neutral';
}

function verdictLabel(status: SystemHealthSnapshot['verdict']['status']): string {
  if (status === 'HEALTHY') return 'Healthy';
  if (status === 'DEGRADED') return 'Degraded';
  if (status === 'UNRELIABLE') return 'Unreliable';
  return 'Inconclusive';
}

function MiniLineChart(props: {
  title: string;
  points: SystemHealthPoint[];
  unit?: string;
  decimals?: number;
}) {
  const valid = props.points
    .map((point, index) => ({ point, index }))
    .filter((entry): entry is { point: SystemHealthPoint; index: number } => entry.point.value !== null && Number.isFinite(entry.point.value));

  const latest = valid.at(-1)?.point.value ?? null;

  if (valid.length < 2) {
    return (
      <div className="system-health-chart">
        <p className="system-health-chart-title">{props.title}</p>
        <p className="muted-line">No data</p>
      </div>
    );
  }

  const min = Math.min(...valid.map((entry) => entry.point.value as number));
  const max = Math.max(...valid.map((entry) => entry.point.value as number));
  const span = max - min || 1;

  const toX = (idx: number): number => {
    const ratio = valid.length <= 1 ? 0 : idx / (valid.length - 1);
    return CHART_PADDING + ratio * (CHART_WIDTH - CHART_PADDING * 2);
  };

  const toY = (value: number): number => {
    const ratio = (value - min) / span;
    return CHART_HEIGHT - CHART_PADDING - ratio * (CHART_HEIGHT - CHART_PADDING * 2);
  };

  const path = valid
    .map((entry, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(idx).toFixed(2)} ${toY(entry.point.value as number).toFixed(2)}`)
    .join(' ');

  return (
    <div className="system-health-chart">
      <div className="system-health-chart-head">
        <p className="system-health-chart-title">{props.title}</p>
        <p className="muted-line">Latest: {formatValue(latest, props.unit ?? '', props.decimals ?? 2)}</p>
      </div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} aria-label={props.title}>
        <line x1={CHART_PADDING} y1={CHART_HEIGHT - CHART_PADDING} x2={CHART_WIDTH - CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} className="system-health-axis" />
        <line x1={CHART_PADDING} y1={CHART_PADDING} x2={CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} className="system-health-axis" />
        <path d={path} className="system-health-line" />
      </svg>
      <p className="muted-line">Range: {formatValue(min, props.unit ?? '', props.decimals ?? 2)} - {formatValue(max, props.unit ?? '', props.decimals ?? 2)}</p>
    </div>
  );
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

export function ConsoleFoundationPage() {
  const { data, loading, error } = useSystemHealth();
  const streamRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<HTMLDivElement | null>(null);
  const uiRef = useRef<HTMLDivElement | null>(null);
  const refreshRef = useRef<HTMLDivElement | null>(null);

  const diagnosticsJson = useMemo(() => (data ? JSON.stringify(data, null, 2) : ''), [data]);

  const openPanel = (panel: 'stream' | 'api' | 'ui' | 'refresh') => {
    const map = {
      stream: streamRef.current,
      api: apiRef.current,
      ui: uiRef.current,
      refresh: refreshRef.current
    };
    map[panel]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="stack">
      <Panel title="Console Reliability">
        {loading ? <p className="muted-line">Evaluating console reliability...</p> : null}
        {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

        {data ? (
          <>
            <section className={`rollout-verdict-card ${verdictTone(data.verdict.status)}`}>
              <p className="rollout-verdict-label">Reliability verdict</p>
              <p className="rollout-verdict-value">{verdictLabel(data.verdict.status)}</p>
              <p className="rollout-verdict-reason"><strong>Why:</strong> {data.verdict.reason_message}</p>
              <details className="rollout-detail-box">
                <summary>Details</summary>
                <div className="rollout-detail-content">
                  <p>reason_code: {data.verdict.reason_code}</p>
                  <p>trigger_count: {data.verdict.trigger_count}</p>
                </div>
              </details>
              <p className="muted-line">
                Last successful data update: {formatUtc(data.verdict.last_successful_update_utc ?? undefined)}
                {' · '}
                Age: {data.verdict.last_successful_update_age_seconds === null ? 'n/a' : `${data.verdict.last_successful_update_age_seconds}s`}
              </p>
            </section>

            <div className="machines-data-banner">
              <span>Data freshness: <strong>{data.data_quality.freshness_seconds === null ? 'n/a' : `${data.data_quality.freshness_seconds}s`}</strong></span>
              <span>Coverage: <strong>{formatValue(data.data_quality.coverage_pct, '%', 1)}</strong></span>
              <span>Stream: <strong>{data.stream_metrics.connection_state}</strong></span>
              <span>Realtime: <strong>{data.stream_metrics.realtime_enabled ? 'Enabled' : 'Disabled'}</strong></span>
            </div>

            <div className="button-row">
              <button
                type="button"
                onClick={() => {
                  void copyText(diagnosticsJson);
                }}
              >
                Copy diagnostics
              </button>
              <button
                type="button"
                onClick={() => downloadJson(`system-health-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, data)}
              >
                Export JSON
              </button>
            </div>

            <h4>Needs Attention</h4>
            <div className="needs-attention-list">
              {data.needs_attention.map((item) => (
                <button key={item.id} type="button" className="needs-attention-item" onClick={() => openPanel(item.panel)}>
                  <span className={`delta-chip ${item.severity === 'critical' ? 'critical' : 'warn'}`}>{item.severity}</span>
                  <span className="needs-attention-title">{item.title}</span>
                  <span className="needs-attention-detail">{item.detail}</span>
                </button>
              ))}
              {data.needs_attention.length === 0 ? <p className="muted-line">No active reliability issues detected.</p> : null}
            </div>
          </>
        ) : null}
      </Panel>

      {data ? (
        <div className="grid-two system-health-grid">
          <div ref={streamRef}>
            <Panel title="Stream Health">
              <ul className="kv-list">
                <li><span>Connection</span><strong>{data.stream_metrics.connection_state}</strong></li>
                <li><span>Drops (1m / 15m / 1h)</span><strong>{data.stream_metrics.drops_last_1m} / {data.stream_metrics.drops_last_15m} / {data.stream_metrics.drops_last_1h}</strong></li>
                <li><span>Reconnects (1h)</span><strong>{data.stream_metrics.reconnect_attempts_last_1h}</strong></li>
                <li><span>Last message</span><strong>{formatUtc(data.stream_metrics.last_message_utc ?? undefined)} ({data.stream_metrics.last_message_age_seconds === null ? 'n/a' : `${data.stream_metrics.last_message_age_seconds}s`})</strong></li>
              </ul>
              <MiniLineChart title="Drops per minute" points={data.series.stream_drops_per_minute} unit="" decimals={0} />
              <MiniLineChart title="Message age (s)" points={data.series.message_age_seconds} unit="s" decimals={1} />
            </Panel>
          </div>

          <div ref={apiRef}>
            <Panel title="API Health">
              <ul className="kv-list">
                <li><span>Reachable</span><strong>{data.api_metrics.reachable ? 'Yes' : 'No'}</strong></li>
                <li><span>Latency p50 / p95 / p99</span><strong>{formatValue(data.api_metrics.latency_ms.p50, 'ms')} / {formatValue(data.api_metrics.latency_ms.p95, 'ms')} / {formatValue(data.api_metrics.latency_ms.p99, 'ms')}</strong></li>
                <li><span>Error rate</span><strong>{formatValue(data.api_metrics.error_rate_pct, '%')}</strong></li>
                <li><span>4xx / 5xx rate</span><strong>{formatValue(data.api_metrics.status_4xx_rate_pct, '%')} / {formatValue(data.api_metrics.status_5xx_rate_pct, '%')}</strong></li>
              </ul>
              <MiniLineChart title="API latency p95 (ms)" points={data.series.api_latency_p95_ms} unit="ms" decimals={1} />
              <MiniLineChart title="API error rate (%)" points={data.series.api_error_rate_pct} unit="%" decimals={1} />
            </Panel>
          </div>

          <div ref={uiRef}>
            <Panel title="UI Health">
              <ul className="kv-list">
                <li><span>Render latency p95</span><strong>{formatValue(data.ui_metrics.render_latency_ms_p95, 'ms')}</strong></li>
                <li><span>Chart render failures</span><strong>{formatValue(data.ui_metrics.chart_render_failures, '', 0)}</strong></li>
                <li><span>Memory usage</span><strong>{formatValue(data.ui_metrics.memory_usage_mb, 'MB')}</strong></li>
                <li><span>Placeholder detection</span><strong>{data.ui_metrics.placeholder_detected === null ? 'unknown' : data.ui_metrics.placeholder_detected ? 'detected' : 'clear'}</strong></li>
              </ul>
              <MiniLineChart title="Render latency p95 (ms)" points={data.series.ui_render_latency_p95_ms} unit="ms" decimals={1} />
            </Panel>
          </div>

          <div ref={refreshRef}>
            <Panel title="Refresh & Data Pipeline">
              <ul className="kv-list">
                <li><span>Refresh total</span><strong>{formatValue(data.refresh_metrics.refresh_total, '', 0)}</strong></li>
                <li><span>Refresh failed</span><strong>{formatValue(data.refresh_metrics.refresh_failed, '', 0)}</strong></li>
                <li><span>Failed rate</span><strong>{formatValue(data.refresh_metrics.failed_rate_pct, '%')}</strong></li>
                <li><span>Last refresh duration</span><strong>{formatValue(data.refresh_metrics.last_refresh_duration_ms, 'ms')}</strong></li>
                <li><span>Coverage</span><strong>{formatValue(data.refresh_metrics.data_coverage_pct, '%')}</strong></li>
              </ul>
              <MiniLineChart title="Refresh failures per minute (%)" points={data.series.refresh_failures_per_minute} unit="%" decimals={1} />
              <MiniLineChart title="Coverage (%)" points={data.series.coverage_pct} unit="%" decimals={1} />
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}
