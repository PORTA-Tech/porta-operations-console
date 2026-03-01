import { apiRequestRaw } from './client';

export type ReliabilityVerdict = 'HEALTHY' | 'DEGRADED' | 'UNRELIABLE' | 'INCONCLUSIVE';

export interface SystemHealthPoint {
  timestamp_utc: string;
  value: number | null;
}

export interface SystemHealthSnapshot {
  evaluated_at_utc: string;
  verdict: {
    status: ReliabilityVerdict;
    reason_code: string;
    reason_message: string;
    trigger_count: number;
    last_successful_update_utc: string | null;
    last_successful_update_age_seconds: number | null;
  };
  data_quality: {
    coverage_pct: number;
    freshness_seconds: number | null;
    ws_stream_ok: boolean;
    metrics_available: boolean;
    min_required_reporting_machines: number;
    min_required_coverage_pct: number;
    source: 'authoritative' | 'fallback';
    messages: string[];
  };
  stream_metrics: {
    connection_state: 'CONNECTED' | 'STALE' | 'DISCONNECTED';
    realtime_enabled: boolean;
    drops_last_1m: number;
    drops_last_15m: number;
    drops_last_1h: number;
    reconnect_attempts_last_1h: number;
    last_message_utc: string | null;
    last_message_age_seconds: number | null;
    subscriptions: {
      console_state: boolean;
      node_snapshots: boolean;
    };
    source: 'authoritative' | 'fallback';
  };
  api_metrics: {
    reachable: boolean;
    total_requests_last_15m: number;
    failed_requests_last_15m: number;
    error_rate_pct: number | null;
    status_4xx_rate_pct: number | null;
    status_5xx_rate_pct: number | null;
    latency_ms: {
      p50: number | null;
      p95: number | null;
      p99: number | null;
    };
    last_success_utc: string | null;
    source: 'authoritative' | 'fallback';
  };
  ui_metrics: {
    render_latency_ms_p95: number | null;
    chart_render_failures: number | null;
    frame_drop_pct: number | null;
    memory_usage_mb: number | null;
    placeholder_detected: boolean | null;
    source: 'authoritative' | 'fallback';
    reason_code?: string;
  };
  refresh_metrics: {
    refresh_total: number | null;
    refresh_failed: number | null;
    failed_rate_pct: number | null;
    last_refresh_duration_ms: number | null;
    data_coverage_pct: number | null;
    placeholder_detection_status: 'CLEAR' | 'DETECTED' | 'UNKNOWN';
    source: 'authoritative' | 'fallback';
  };
  needs_attention: Array<{
    id: string;
    panel: 'stream' | 'api' | 'ui' | 'refresh';
    severity: 'warning' | 'critical';
    title: string;
    detail: string;
    reason_code: string;
  }>;
  triggers: Array<{
    reason_code: string;
    severity: 'warning' | 'critical';
    summary: string;
    details: Record<string, string | number | boolean | null>;
  }>;
  series: {
    stream_drops_per_minute: SystemHealthPoint[];
    message_age_seconds: SystemHealthPoint[];
    api_latency_p95_ms: SystemHealthPoint[];
    api_error_rate_pct: SystemHealthPoint[];
    refresh_failures_per_minute: SystemHealthPoint[];
    coverage_pct: SystemHealthPoint[];
    ui_render_latency_p95_ms: SystemHealthPoint[];
  };
}

export async function getSystemHealth(): Promise<SystemHealthSnapshot> {
  return apiRequestRaw<SystemHealthSnapshot>({
    path: '/v1/system/health',
    method: 'get'
  });
}

export async function postSystemUiMetrics(input: {
  sampled_at_utc: string;
  render_latency_ms_p95: number | null;
  chart_render_failures: number;
  refresh_total: number;
  refresh_failed: number;
  last_refresh_duration_ms: number | null;
  data_coverage_pct: number | null;
  memory_usage_mb: number | null;
}): Promise<void> {
  await apiRequestRaw<{ ok: boolean }>({
    path: '/v1/system/ui-metrics',
    method: 'post',
    body: input
  });
}
