import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CONSOLE_FOUNDATION_CONSTANTS,
  type ConsoleFoundationMetrics,
  type MachineTelemetrySample,
  type PrimitiveName,
  type StateName
} from '../types/consoleFoundation';

const primitiveList: PrimitiveName[] = [
  'motor_volatility_index',
  'interaction_burst_intensity',
  'focus_switch_rate',
  'sustained_attention_duration',
  'idle_fragmentation_index'
];

const stateList: StateName[] = [
  'stress_likelihood',
  'overload_likelihood',
  'focus_strength',
  'fatigue_probability',
  'cognitive_stability_index'
];

const initialMetrics: ConsoleFoundationMetrics = {
  timeline_render_latency_ms: 0,
  state_curve_update_latency_ms: 0,
  intervention_overlay_render_latency_ms: 0,
  ws_connection_drop_total: 0,
  dashboard_refresh_total: 0,
  dashboard_refresh_failed_total: 0
};

const wsBase = import.meta.env.VITE_WS_BASE_URL?.trim();

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function makeFallbackSample(previous?: MachineTelemetrySample): MachineTelemetrySample {
  const now = new Date();
  const t = now.getTime() / 1000;
  const stress = clamp01(0.45 + Math.sin(t / 20) * 0.2 + Math.random() * 0.08);
  const overload = clamp01(0.2 + Math.cos(t / 25) * 0.15 + Math.random() * 0.06);
  const focus = clamp01(0.72 + Math.sin(t / 17) * 0.12 - overload * 0.15);
  const fatigue = clamp01(0.22 + Math.cos(t / 31) * 0.11 + (1 - focus) * 0.1);
  const stability = clamp01(0.7 + (focus - stress) * 0.2 - fatigue * 0.12);

  const interventions = overload > 0.65 || stress > 0.7
    ? [
        {
          action_type: 'focus_mode' as const,
          start_time: new Date(now.getTime() - 30_000).toISOString(),
          end_time: new Date(now.getTime() + 120_000).toISOString(),
          confidence: clamp01(0.8 + overload * 0.15),
          policy_id: '018f9b74-ff6a-7b10-baa1-6f4e77a2d901',
          reason: 'sustained high overload likelihood'
        }
      ]
    : previous?.interventions ?? [];

  return {
    agent_id: previous?.agent_id ?? 'agent-001',
    machine_id: previous?.machine_id ?? 'machine-001',
    timestamp: now.toISOString(),
    confidence_sigma: 0.08,
    primitives: {
      motor_volatility_index: clamp01(0.3 + stress * 0.5),
      interaction_burst_intensity: clamp01(0.45 + overload * 0.5),
      focus_switch_rate: clamp01(0.18 + overload * 0.4),
      sustained_attention_duration: Math.round(420 + focus * 220),
      idle_fragmentation_index: clamp01(0.12 + fatigue * 0.4)
    },
    states: {
      stress_likelihood: stress,
      overload_likelihood: overload,
      focus_strength: focus,
      fatigue_probability: fatigue,
      cognitive_stability_index: stability
    },
    interventions
  };
}

export function useConsoleFoundation() {
  const [samples, setSamples] = useState<MachineTelemetrySample[]>([]);
  const [metrics, setMetrics] = useState<ConsoleFoundationMetrics>(initialMetrics);
  const wsRef = useRef<WebSocket | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const lastSampleRef = useRef<MachineTelemetrySample | undefined>(undefined);
  const ewmaRef = useRef<Record<StateName, number>>({
    stress_likelihood: 0,
    overload_likelihood: 0,
    focus_strength: 0,
    fatigue_probability: 0,
    cognitive_stability_index: 0
  });

  useEffect(() => {
    const maxPoints = CONSOLE_FOUNDATION_CONSTANTS.max_window_hours * 3600;
    const applySample = (sample: MachineTelemetrySample) => {
      const updateStart = performance.now();
      const alpha = CONSOLE_FOUNDATION_CONSTANTS.ewma_alpha;
      for (const key of stateList) {
        const prev = ewmaRef.current[key];
        ewmaRef.current[key] = prev === 0 ? sample.states[key] : alpha * sample.states[key] + (1 - alpha) * prev;
      }

      setSamples((prev) => {
        const next = [...prev, sample];
        lastSampleRef.current = sample;
        return next.slice(Math.max(0, next.length - maxPoints));
      });

      const updateLatency = performance.now() - updateStart;
      setMetrics((prev) => ({
        ...prev,
        state_curve_update_latency_ms: updateLatency,
        timeline_render_latency_ms: updateLatency,
        intervention_overlay_render_latency_ms: updateLatency,
        dashboard_refresh_total: prev.dashboard_refresh_total + 1
      }));
    };

    const startFallback = () => {
      if (fallbackTimerRef.current !== null) return;
      fallbackTimerRef.current = window.setInterval(() => {
        const sample = makeFallbackSample(lastSampleRef.current);
        applySample(sample);
      }, CONSOLE_FOUNDATION_CONSTANTS.refresh_interval_ms);
    };

    const stopFallback = () => {
      if (fallbackTimerRef.current !== null) {
        window.clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };

    if (!wsBase) {
      startFallback();
      return () => stopFallback();
    }

    try {
      const ws = new WebSocket(`${wsBase.replace(/\/$/, '')}/v1/stream/console-state`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as MachineTelemetrySample;
          applySample(payload);
        } catch {
          setMetrics((prev) => ({
            ...prev,
            dashboard_refresh_failed_total: prev.dashboard_refresh_failed_total + 1
          }));
        }
      };
      ws.onclose = () => {
        setMetrics((prev) => ({ ...prev, ws_connection_drop_total: prev.ws_connection_drop_total + 1 }));
        startFallback();
      };
      ws.onerror = () => {
        ws.close();
      };
    } catch {
      startFallback();
    }

    return () => {
      wsRef.current?.close();
      stopFallback();
    };
  }, []);

  const latest = samples.at(-1);
  const riskAggregate = useMemo(() => {
    if (!latest) return null;
    const fleetScore =
      (latest.states.stress_likelihood +
        latest.states.overload_likelihood +
        latest.states.fatigue_probability +
        (1 - latest.states.focus_strength) +
        (1 - latest.states.cognitive_stability_index)) /
      5;
    return {
      ...latest.states,
      fleet_risk_score: clamp01(fleetScore),
      confidence_sigma: latest.confidence_sigma
    };
  }, [latest]);

  return {
    samples,
    latest,
    metrics,
    riskAggregate,
    ewma: ewmaRef.current,
    primitiveList,
    stateList
  };
}
