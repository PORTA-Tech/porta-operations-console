export type PrimitiveName =
  | 'motor_volatility_index'
  | 'interaction_burst_intensity'
  | 'focus_switch_rate'
  | 'sustained_attention_duration'
  | 'idle_fragmentation_index';

export type StateName =
  | 'stress_likelihood'
  | 'overload_likelihood'
  | 'focus_strength'
  | 'fatigue_probability'
  | 'cognitive_stability_index';

export type ActionType = 'dim_screen' | 'focus_mode' | 'notification_suppress' | 'break_suggestion';

export interface InterventionOverlay {
  action_type: ActionType;
  start_time: string;
  end_time: string;
  confidence: number;
  policy_id: string;
  reason: string;
}

export interface MachineTelemetrySample {
  agent_id: string;
  machine_id: string;
  timestamp: string;
  confidence_sigma: number;
  primitives: Record<PrimitiveName, number>;
  states: Record<StateName, number>;
  interventions: InterventionOverlay[];
}

export interface ConsoleFoundationMetrics {
  timeline_render_latency_ms: number;
  state_curve_update_latency_ms: number;
  intervention_overlay_render_latency_ms: number;
  ws_connection_drop_total: number;
  dashboard_refresh_total: number;
  dashboard_refresh_failed_total: number;
}

export const COLOR_BY_STATE: Record<StateName, string> = {
  stress_likelihood: '#FF5C5C',
  overload_likelihood: '#FFA500',
  focus_strength: '#4CAF50',
  fatigue_probability: '#2196F3',
  cognitive_stability_index: '#9C27B0'
};

export const COLOR_BY_ACTION: Record<ActionType, string> = {
  dim_screen: '#FFD700',
  focus_mode: '#4CAF50',
  notification_suppress: '#FFB74D',
  break_suggestion: '#64B5F6'
};

export const CONSOLE_FOUNDATION_CONSTANTS = {
  service_name: 'console-core',
  refresh_interval_ms: 1000,
  ewma_alpha: 0.3,
  min_window_seconds: 1,
  max_window_hours: 24,
  tooltip_reason_max_chars: 200,
  gauge_min: 0,
  gauge_max: 1,
  gauge_tick: 0.1
} as const;

