import { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import type { Data, Layout, Shape, PlotMouseEvent } from 'plotly.js';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Layout/Panel';
import { useWsConnectionStatus } from '../../hooks/useWsConnectionStatus';
import type { ApiError } from '../../api/client';
import type { NodeDetail } from '../../types/ui';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';

interface NodeDetailsProps {
  nodes: NodeDetail[];
  loading: boolean;
  error: ApiError | undefined;
}

type MachineTab = 'summary' | 'timeline' | 'risk' | 'config';
type TimelineWindow = '1h' | '6h' | '24h';
type TimelineSelectionKind = 'primitive' | 'state' | 'intervention' | 'scrub';

interface RawMachineEvent {
  timestampUtc: string;
  payload: Record<string, unknown>;
}

interface TimelineSelection {
  kind: TimelineSelectionKind;
  sourceLabel: string;
  timestampUtc: string;
  confidence: number | null;
  contributors: string[];
  policyId: string | null;
  reason: string | null;
  undo: string | null;
  whatChanged: string | null;
  values: {
    typingBurst: number | null;
    scrollVelocity: number | null;
    focusSwitchRate: number | null;
    focus: number | null;
    overload: number | null;
    fatigue: number | null;
    stress: number | null;
    stability: number | null;
  };
}

interface TimelineInterventionOverlay {
  timestampUtc: string;
  startUtc: string;
  endUtc: string;
  decision: NodeDetail['recentEvents'][number]['decision'];
  label: string;
  policyId: string;
  reason: string;
  confidence: number;
  undo: string;
}

interface StreamTimelinePoint {
  timestampUtc: string;
  confidence: number | null;
  contributors: string[];
  policyId: string | null;
  reason: string | null;
  undo: string | null;
  whatChanged: string | null;
  values: TimelineSelection['values'];
}

function parseNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function pickNumber(raw: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = parseNumber(raw[key]);
    if (value !== null) return value;
  }
  return null;
}

function pickString(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = parseString(raw[key]);
    if (value !== null) return value;
  }
  return null;
}

function formatState(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return value.toFixed(2);
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function clamp01(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function shortDecisionLabel(decision: NodeDetail['recentEvents'][number]['decision']): string {
  if (decision === 'intervene') return 'Intervene';
  if (decision === 'cooldown') return 'Cooldown';
  if (decision === 'blocked') return 'Blocked';
  return 'Skip';
}

function interventionTone(decision: NodeDetail['recentEvents'][number]['decision']): string {
  if (decision === 'intervene') return 'rgba(245, 158, 11, 0.30)';
  if (decision === 'cooldown') return 'rgba(124, 58, 237, 0.24)';
  if (decision === 'blocked') return 'rgba(220, 38, 38, 0.26)';
  return 'rgba(100, 116, 139, 0.24)';
}

function defaultUndo(decision: NodeDetail['recentEvents'][number]['decision']): string {
  if (decision === 'intervene') return 'Use Resume/Undo action in Controls.';
  if (decision === 'cooldown') return 'Wait for cooldown expiry or adjust policy window.';
  if (decision === 'blocked') return 'Fix policy/trust gate and retry evaluation.';
  return 'No system change applied.';
}

function nowWindowMs(window: TimelineWindow): number {
  if (window === '24h') return 24 * 60 * 60 * 1000;
  if (window === '6h') return 6 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

function interventionSpanMs(window: TimelineWindow): number {
  if (window === '24h') return 12 * 60 * 1000;
  if (window === '6h') return 4 * 60 * 1000;
  return 90 * 1000;
}

function confidenceLabel(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'unknown';
  if (value >= 0.75) return 'high';
  if (value >= 0.45) return 'medium';
  return 'low';
}

function normalizeLane(value: number | null): number {
  const clamped = clamp01(value);
  return clamped === null ? 0.5 : clamped;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseContributors(raw: Record<string, unknown>): string[] {
  const fromArray = parseStringArray(raw.contributors);
  if (fromArray.length > 0) return fromArray;
  const triggeredBy = parseString(raw.triggered_by);
  return triggeredBy ? [triggeredBy] : [];
}

function parseWhatChanged(raw: Record<string, unknown>): string | null {
  return pickString(raw, ['what_changed', 'system_change', 'change_summary', 'intervention']);
}

function findNearestStreamPoint(timestampUtc: string, points: StreamTimelinePoint[]): StreamTimelinePoint | null {
  const targetMs = Date.parse(timestampUtc);
  if (!Number.isFinite(targetMs) || points.length === 0) return null;
  const first = points[0];
  if (!first) return null;
  let nearest: StreamTimelinePoint = first;
  let bestDelta = Math.abs(Date.parse(first.timestampUtc) - targetMs);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (!point) continue;
    const delta = Math.abs(Date.parse(point.timestampUtc) - targetMs);
    if (delta < bestDelta) {
      nearest = point;
      bestDelta = delta;
    }
  }
  return nearest;
}

function toWsBase(base: string): string {
  const trimmed = base.trim().replace(/\/$/, '');
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) return trimmed;
  if (trimmed.startsWith('https://')) return `wss://${trimmed.slice('https://'.length)}`;
  if (trimmed.startsWith('http://')) return `ws://${trimmed.slice('http://'.length)}`;
  return `ws://${trimmed}`;
}

function machineIdFromPayload(payload: Record<string, unknown>): string | null {
  return pickString(payload, ['machine_id', 'machineId', 'agent_id', 'node_id']);
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function selectionFromStreamPoint(
  kind: TimelineSelectionKind,
  sourceLabel: string,
  point: StreamTimelinePoint
): TimelineSelection {
  return {
    kind,
    sourceLabel,
    timestampUtc: point.timestampUtc,
    confidence: point.confidence,
    contributors: point.contributors,
    policyId: point.policyId,
    reason: point.reason,
    undo: point.undo,
    whatChanged: point.whatChanged,
    values: point.values
  };
}

function telemetryStatusMessage(input: {
  simulatedMachine: boolean;
  sourceKind: NodeDetail['sourceKind'];
  rawSamples: number;
  wsStatus: string;
}): string | null {
  if (input.simulatedMachine) {
    return 'This machine is synthetic (demo fixture). No real telemetry or policy decisions are available.';
  }
  if (input.sourceKind === 'recent_issue') {
    return 'This machine row comes from recent issue history and may not have current snapshot telemetry.';
  }
  if (input.rawSamples === 0 && input.wsStatus !== 'Connected') {
    return `Realtime channel is ${input.wsStatus.toLowerCase()}. Timeline controls will activate when samples arrive.`;
  }
  return null;
}

export function NodeDetails({ nodes, loading, error }: NodeDetailsProps) {
  const [params] = useSearchParams();
  const [activeTab, setActiveTab] = useState<MachineTab>('summary');
  const [timelineWindow, setTimelineWindow] = useState<TimelineWindow>('1h');
  const [scrubIndex, setScrubIndex] = useState(0);
  const [showRawStream, setShowRawStream] = useState(false);
  const [rawEvents, setRawEvents] = useState<RawMachineEvent[]>([]);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState<TimelineSelection | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const selectedMachineId = params.get('machine') ?? nodes[0]?.nodeId ?? '';
  const selectedNode = nodes.find((node) => node.nodeId === selectedMachineId) ?? nodes[0];
  const wsBase = import.meta.env.VITE_WS_BASE_URL?.trim();
  const isDev = import.meta.env.DEV;
  const debugModeEnabled = isDev || import.meta.env.VITE_RND_DEBUG_MODE === '1';
  const wsStatus = useWsConnectionStatus();
  const simulatedMachine = selectedNode?.demo ?? false;

  useEffect(() => {
    setRawEvents([]);
    setActionMessage(null);
    setScrubIndex(0);
    setSelectedTimelinePoint(null);
  }, [selectedMachineId]);

  useEffect(() => {
    if (!selectedMachineId || !wsBase) {
      return () => undefined;
    }

    let disposed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;

    const connect = () => {
      if (disposed) return;
      try {
        const url = `${toWsBase(wsBase)}/v1/stream/console-state`;
        ws = new WebSocket(url);
      } catch {
        return;
      }

      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
          const machineId = machineIdFromPayload(payload);
          if (machineId !== selectedMachineId) return;
          const timestampUtc = pickString(payload, ['timestamp', 'timestamp_utc', 'at_utc']) ?? new Date().toISOString();
          setRawEvents((current) => [...current, { timestampUtc, payload }].slice(-200));
        } catch {
          // Ignore malformed stream payloads in drilldown pane.
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        reconnectTimer = window.setTimeout(connect, 5000);
      };
      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [selectedMachineId, wsBase]);

  const filteredRawEvents = useMemo(() => {
    const lowerBound = Date.now() - nowWindowMs(timelineWindow);
    return rawEvents.filter((event) => {
      const ts = Date.parse(event.timestampUtc);
      return Number.isFinite(ts) && ts >= lowerBound;
    });
  }, [rawEvents, timelineWindow]);

  useEffect(() => {
    if (filteredRawEvents.length === 0) {
      setScrubIndex(0);
      return;
    }
    setScrubIndex((current) => Math.min(current, filteredRawEvents.length - 1));
  }, [filteredRawEvents]);

  const latestStreamPayload = filteredRawEvents[filteredRawEvents.length - 1]?.payload;

  const riskSnapshot = useMemo(() => {
    const states = (latestStreamPayload?.states as Record<string, unknown> | undefined) ?? undefined;
    const focus = states ? pickNumber(states, ['focus_strength', 'focus']) : selectedNode?.stateSummary.focus ?? null;
    const overload = states ? pickNumber(states, ['overload_likelihood', 'overload']) : selectedNode?.stateSummary.overload ?? null;
    const fatigue = states ? pickNumber(states, ['fatigue_probability', 'fatigue']) : selectedNode?.stateSummary.fatigue ?? null;
    const stress = states ? pickNumber(states, ['stress_likelihood', 'stress']) : selectedNode?.stateSummary.stress ?? null;
    const stability = states ? pickNumber(states, ['cognitive_stability_index', 'stability']) : selectedNode?.stateSummary.stability ?? null;
    const confidence = pickNumber(
      (latestStreamPayload ?? {}) as Record<string, unknown>,
      ['confidence_score', 'confidence_sigma', 'confidence']
    ) ?? selectedNode?.stateSummary.confidence ?? null;
    return {
      focus,
      overload,
      fatigue,
      stress,
      stability,
      confidence
    };
  }, [latestStreamPayload, selectedNode]);

  const timelineRows = useMemo(() => {
    if (!selectedNode) return [];
    const lowerBound = Date.now() - nowWindowMs(timelineWindow);
    return selectedNode.recentEvents.filter((event) => {
      const ts = Date.parse(event.timestampUtc);
      return Number.isFinite(ts) && ts >= lowerBound;
    });
  }, [selectedNode, timelineWindow]);

  const timelineStreamPoints = useMemo<StreamTimelinePoint[]>(() => (
    filteredRawEvents.map((event) => {
      const root = event.payload;
      const primitives = toRecord(root.primitives);
      const states = toRecord(root.states);
      const confidence = pickNumber(root, ['confidence_score', 'confidence_sigma', 'confidence']);
      const reason = pickString(root, ['reason', 'trigger']) ?? pickString(primitives, ['trigger']) ?? pickString(states, ['trigger']);
      const undo = pickString(root, ['undo', 'undo_hint', 'rollback_hint', 'rollback']);
      const policyId = pickString(root, ['policy_id', 'policyId']);

      return {
        timestampUtc: event.timestampUtc,
        confidence,
        contributors: parseContributors(root),
        policyId,
        reason,
        undo,
        whatChanged: parseWhatChanged(root),
        values: {
          typingBurst: pickNumber(primitives, ['typing_burst', 'typingBurst', 'typing_burst_rate']),
          scrollVelocity: pickNumber(primitives, ['scroll_velocity', 'scrollVelocity']),
          focusSwitchRate: pickNumber(primitives, ['focus_switch_rate', 'focusSwitchRate']),
          focus: pickNumber(states, ['focus_strength', 'focus']),
          overload: pickNumber(states, ['overload_likelihood', 'overload']),
          fatigue: pickNumber(states, ['fatigue_probability', 'fatigue']),
          stress: pickNumber(states, ['stress_likelihood', 'stress']),
          stability: pickNumber(states, ['cognitive_stability_index', 'stability'])
        }
      };
    })
  ), [filteredRawEvents]);

  const scrubbedTimelinePoint = timelineStreamPoints[scrubIndex] ?? null;

  useEffect(() => {
    if (!scrubbedTimelinePoint) return;
    setSelectedTimelinePoint(selectionFromStreamPoint('scrub', 'Scrubbed sample', scrubbedTimelinePoint));
  }, [scrubbedTimelinePoint]);

  const timelineInterventions = useMemo<TimelineInterventionOverlay[]>(() => {
    const spanMs = interventionSpanMs(timelineWindow);
    const ordered = [...timelineRows].sort((left, right) => Date.parse(left.timestampUtc) - Date.parse(right.timestampUtc));
    return ordered.map((event, index) => {
      const startMs = Date.parse(event.timestampUtc);
      const nextMs = Date.parse(ordered[index + 1]?.timestampUtc ?? '');
      const cappedEndMs = Number.isFinite(nextMs)
        ? Math.min(startMs + spanMs, Math.max(startMs + 1000, nextMs - 1000))
        : (startMs + spanMs);
      const nearest = findNearestStreamPoint(event.timestampUtc, timelineStreamPoints);
      return {
        timestampUtc: event.timestampUtc,
        startUtc: new Date(startMs).toISOString(),
        endUtc: new Date(cappedEndMs).toISOString(),
        decision: event.decision,
        label: shortDecisionLabel(event.decision),
        policyId: event.policyId,
        reason: event.trigger || nearest?.reason || 'Threshold-based intervention signal',
        confidence: clamp01(event.confidence) ?? nearest?.confidence ?? 0.5,
        undo: defaultUndo(event.decision)
      };
    });
  }, [timelineRows, timelineWindow, timelineStreamPoints]);

  const timelinePlotModel = useMemo(() => {
    const laneCenter = {
      primitives: 2.5,
      states: 1.5,
      interventions: 0.5
    } as const;
    const laneHalfHeight = 0.33;
    const laneValue = (center: number, value: number | null): number => (
      center - laneHalfHeight + normalizeLane(value) * laneHalfHeight * 2
    );

    const traces: Partial<Data>[] = [];

    const buildLaneTrace = (
      label: string,
      color: string,
      kind: 'primitive' | 'state',
      center: number,
      extractor: (point: StreamTimelinePoint) => number | null
    ): Partial<Data> | null => {
      const x: string[] = [];
      const y: number[] = [];
      const text: string[] = [];
      const customData: string[] = [];

      timelineStreamPoints.forEach((point) => {
        const value = extractor(point);
        if (value === null) return;
        x.push(point.timestampUtc);
        y.push(laneValue(center, value));
        text.push(value.toFixed(3));
        customData.push(JSON.stringify(selectionFromStreamPoint(kind, label, point)));
      });

      if (x.length === 0) return null;
      return {
        x,
        y,
        mode: 'lines+markers',
        type: 'scatter',
        name: label,
        line: { width: 2, color },
        marker: { size: 5, color },
        text,
        customdata: customData,
        hovertemplate: `${label}: %{text}<br>%{x}<extra></extra>`
      };
    };

    const primitiveTraces = [
      buildLaneTrace('Typing burst', '#0284c7', 'primitive', laneCenter.primitives, (point) => point.values.typingBurst),
      buildLaneTrace('Scroll velocity', '#0f766e', 'primitive', laneCenter.primitives, (point) => point.values.scrollVelocity),
      buildLaneTrace('Focus switch rate', '#f97316', 'primitive', laneCenter.primitives, (point) => point.values.focusSwitchRate)
    ];

    const stateTraces = [
      buildLaneTrace('Focus', '#16a34a', 'state', laneCenter.states, (point) => point.values.focus),
      buildLaneTrace('Overload', '#dc2626', 'state', laneCenter.states, (point) => point.values.overload),
      buildLaneTrace('Fatigue', '#7c3aed', 'state', laneCenter.states, (point) => point.values.fatigue)
    ];

    traces.push(...primitiveTraces.filter((trace): trace is Partial<Data> => trace !== null));
    traces.push(...stateTraces.filter((trace): trace is Partial<Data> => trace !== null));

    const interventionX: string[] = [];
    const interventionY: number[] = [];
    const interventionText: string[] = [];
    const interventionHoverText: string[] = [];
    const interventionCustomData: string[] = [];
    timelineInterventions.forEach((overlay) => {
      const startMs = Date.parse(overlay.startUtc);
      const endMs = Date.parse(overlay.endUtc);
      const centerMs = startMs + ((endMs - startMs) / 2);
      const nearest = findNearestStreamPoint(overlay.timestampUtc, timelineStreamPoints);
      const baselineValues: TimelineSelection['values'] = nearest?.values ?? {
        typingBurst: null,
        scrollVelocity: null,
        focusSwitchRate: null,
        focus: null,
        overload: null,
        fatigue: null,
        stress: null,
        stability: null
      };
      interventionX.push(new Date(centerMs).toISOString());
      interventionY.push(laneCenter.interventions);
      interventionText.push(overlay.label);
      interventionHoverText.push(
        `${overlay.label}<br>Why: ${overlay.reason}<br>Confidence: ${overlay.confidence.toFixed(2)} (${confidenceLabel(overlay.confidence)})<br>Undo: ${overlay.undo}<br>Policy: ${overlay.policyId}`
      );
      interventionCustomData.push(JSON.stringify({
        kind: 'intervention',
        sourceLabel: `${overlay.label} window`,
        timestampUtc: overlay.timestampUtc,
        confidence: overlay.confidence,
        contributors: nearest?.contributors ?? [],
        policyId: overlay.policyId,
        reason: overlay.reason,
        undo: overlay.undo,
        whatChanged: nearest?.whatChanged ?? overlay.reason,
        values: baselineValues
      }));
    });

    if (interventionX.length > 0) {
      traces.push({
        x: interventionX,
        y: interventionY,
        mode: 'text+markers',
        type: 'scatter',
        name: 'Interventions',
        marker: {
          size: 8,
          color: '#334155',
          opacity: 0.01
        },
        text: interventionText,
        textposition: 'middle center',
        textfont: { color: '#0f172a', size: 11 },
        hovertext: interventionHoverText,
        customdata: interventionCustomData,
        hovertemplate: '%{hovertext}<extra></extra>'
      });
    }

    const shapes: Partial<Shape>[] = [
      { type: 'rect', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 2, y1: 3, fillcolor: 'rgba(2, 132, 199, 0.05)', line: { width: 0 } },
      { type: 'rect', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 1, y1: 2, fillcolor: 'rgba(22, 163, 74, 0.05)', line: { width: 0 } },
      { type: 'rect', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 0, y1: 1, fillcolor: 'rgba(71, 85, 105, 0.05)', line: { width: 0 } },
      { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 2, y1: 2, line: { width: 1, color: 'rgba(100, 116, 139, 0.35)' } },
      { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 1, y1: 1, line: { width: 1, color: 'rgba(100, 116, 139, 0.35)' } }
    ];

    timelineInterventions.forEach((overlay) => {
      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'y',
        x0: overlay.startUtc,
        x1: overlay.endUtc,
        y0: 0.15,
        y1: 0.85,
        fillcolor: interventionTone(overlay.decision),
        line: { width: 0 }
      });
    });

    const latestTsMs = Date.parse(timelineStreamPoints[timelineStreamPoints.length - 1]?.timestampUtc ?? '');
    const upperBoundMs = Number.isFinite(latestTsMs) ? latestTsMs : Date.now();
    const lowerBoundMs = upperBoundMs - nowWindowMs(timelineWindow);

    const layout: Partial<Layout> = {
      autosize: true,
      margin: { l: 90, r: 20, t: 20, b: 42 },
      xaxis: {
        title: { text: 'Timeline' },
        range: [new Date(lowerBoundMs).toISOString(), new Date(upperBoundMs).toISOString()],
        rangeslider: { visible: true, thickness: 0.12 }
      },
      yaxis: {
        range: [0, 3],
        tickmode: 'array',
        tickvals: [2.5, 1.5, 0.5],
        ticktext: ['Primitives', 'States', 'Interventions'],
        fixedrange: true,
        gridcolor: 'rgba(148, 163, 184, 0.2)',
        zeroline: false
      },
      legend: { orientation: 'h', x: 0, y: 1.18 },
      shapes,
      uirevision: `timeline-${timelineWindow}`
    };

    return {
      traces,
      layout
    };
  }, [timelineInterventions, timelineStreamPoints, timelineWindow]);

  const explainSelection = selectedTimelinePoint;
  const scrubDisabled = filteredRawEvents.length === 0;
  const scrubReason = scrubDisabled ? 'No timeline samples available yet.' : null;
  const telemetryBanner = telemetryStatusMessage({
    simulatedMachine,
    sourceKind: selectedNode?.sourceKind ?? 'recent_issue',
    rawSamples: filteredRawEvents.length,
    wsStatus: wsStatus.statusLabel
  });

  const handleTimelinePointClick = (event: PlotMouseEvent) => {
    const hit = event.points?.[0];
    if (!hit) return;
    const customDataRaw = hit.customdata as unknown;
    const customDataJson = typeof customDataRaw === 'string' ? customDataRaw : null;
    if (customDataJson) {
      try {
        const parsed = JSON.parse(customDataJson) as TimelineSelection;
        if (parsed && typeof parsed === 'object') {
          setSelectedTimelinePoint(parsed);
          return;
        }
      } catch {
        // Ignore malformed point payload and fall back to nearest raw sample.
      }
    }
    const fallbackTimestamp = typeof hit.x === 'string'
      ? hit.x
      : (hit.x instanceof Date ? hit.x.toISOString() : null);
    if (!fallbackTimestamp) return;
    const nearest = findNearestStreamPoint(fallbackTimestamp, timelineStreamPoints);
    if (!nearest) return;
    setSelectedTimelinePoint(selectionFromStreamPoint('scrub', 'Nearest stream sample', nearest));
  };

  const handleCopyDiagnostic = async () => {
    if (!selectedNode) return;
    const payload = {
      machineId: selectedNode.nodeId,
      generatedAtUtc: new Date().toISOString(),
      machineSnapshot: selectedNode,
      selectedTimelineWindow: timelineWindow,
      recentTimelineEvents: timelineRows,
      rawStreamSampleCount: filteredRawEvents.length,
      latestRawEvent: filteredRawEvents[filteredRawEvents.length - 1] ?? null,
      selectedTimelinePoint
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setActionMessage('Diagnostic snapshot copied to clipboard.');
    } catch {
      setActionMessage('Clipboard is unavailable. Use Export trace pack instead.');
    }
  };

  const handleExportTracePack = () => {
    if (!selectedNode) return;
    const payload = {
      machineId: selectedNode.nodeId,
      exportedAtUtc: new Date().toISOString(),
      machineSnapshot: selectedNode,
      timelineWindow,
      timelineEvents: timelineRows,
      rawStreamEvents: filteredRawEvents,
      selectedTimelinePoint
    };
    downloadJson(`porta-machine-trace-pack-${selectedNode.nodeId}.json`, payload);
    setActionMessage('Trace pack exported.');
  };

  const handleSimulateIntervention = () => {
    if (!selectedNode) return;
    if (!debugModeEnabled) {
      setActionMessage('Simulation is disabled outside dev mode. Endpoint would be POST /v1/simulate/intervention.');
      return;
    }
    const simulated: RawMachineEvent = {
      timestampUtc: new Date().toISOString(),
      payload: {
        machine_id: selectedNode.nodeId,
        simulated: true,
        intervention: 'focus_mode',
        reason: 'dev_test_overload_spike',
        states: {
          overload_likelihood: 0.82,
          focus_strength: 0.44,
          fatigue_probability: 0.57,
          stress_likelihood: 0.73,
          cognitive_stability_index: 0.41
        }
      }
    };
    setRawEvents((current) => [...current, simulated].slice(-200));
    setActionMessage('Simulated intervention injected into local drilldown stream.');
  };

  if (loading) {
    return (
      <Panel title="Machine drilldown">
        <p className="muted-line">Loading machine drilldown...</p>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="Machine drilldown">
        <p className="error-line">{error.code}: {error.message}</p>
      </Panel>
    );
  }

  if (!selectedNode) {
    return (
      <Panel title="Machine drilldown">
        <p className="muted-line">Select a machine row to open the drilldown tabs.</p>
      </Panel>
    );
  }

  return (
    <Panel title={`Machine drilldown: ${selectedNode.nodeId}`}>
      <div className="machine-drilldown-tabs">
        <button type="button" className={activeTab === 'summary' ? 'active' : ''} onClick={() => setActiveTab('summary')}>
          Summary
        </button>
        <button type="button" className={activeTab === 'timeline' ? 'active' : ''} onClick={() => setActiveTab('timeline')}>
          Timeline
        </button>
        <button type="button" className={activeTab === 'risk' ? 'active' : ''} onClick={() => setActiveTab('risk')}>
          Risk &amp; State
        </button>
        <button type="button" className={activeTab === 'config' ? 'active' : ''} onClick={() => setActiveTab('config')}>
          Config &amp; Trust
        </button>
      </div>

      {debugModeEnabled ? (
        <div className="machine-debug-actions">
          <button type="button" onClick={() => void handleCopyDiagnostic()}>Copy diagnostic snapshot</button>
          <button type="button" onClick={handleExportTracePack}>Export trace pack</button>
          <button
            type="button"
            onClick={() => setShowRawStream((current) => !current)}
            disabled={filteredRawEvents.length === 0 && !showRawStream}
            title={filteredRawEvents.length === 0 ? 'No raw stream samples available.' : 'Open raw stream samples'}
          >
            {showRawStream ? 'Hide raw event stream' : 'Open raw event stream'}
          </button>
          <button type="button" onClick={handleSimulateIntervention}>Simulate intervention (test mode)</button>
        </div>
      ) : (
        <p className="muted-line">R&D debug actions are hidden outside Dev/Test mode.</p>
      )}
      {actionMessage ? <p className="muted-line">{actionMessage}</p> : null}

      <p className="muted-line">
        Data source: {simulatedMachine ? 'Simulated fixtures' : `Live machine (${selectedNode.stateSummary.source})`} | Last heartbeat: {formatUtc(selectedNode.lastHeartbeatUtc)} ({formatRelativeFromNow(selectedNode.lastHeartbeatUtc)})
      </p>
      {telemetryBanner ? <p className="focus-banner">{telemetryBanner}</p> : null}

      {activeTab === 'summary' ? (
        <div className="machine-tab-grid">
          <ul className="kv-list">
            <li><span>Record source</span><strong>{selectedNode.sourceKind === 'snapshot' ? 'active snapshot' : 'recent issue history'}</strong></li>
            <li><span>Machine health</span><strong>{selectedNode.offline ? 'Offline' : 'Online'}</strong></li>
            <li><span>Heartbeat age</span><strong>{selectedNode.heartbeatAgeSec}s</strong></li>
            <li><span>Cohort</span><strong>{selectedNode.cohortId}</strong></li>
            <li><span>Agent version</span><strong>{selectedNode.agentVersion}</strong></li>
            <li><span>Config version</span><strong>{selectedNode.configSeq}</strong></li>
            <li><span>Config Trust</span><strong>{simulatedMachine ? 'simulated' : selectedNode.signatureStatus}</strong></li>
            <li><span>Backend connected</span><strong>{simulatedMachine ? 'simulated' : (selectedNode.backendConnected ? 'yes' : 'no')}</strong></li>
            <li><span>Last intervention</span><strong>{simulatedMachine ? 'simulated' : selectedNode.lastIntervention}</strong></li>
            <li><span>Last intervention age</span><strong>{formatRelativeFromNow(selectedNode.lastInterventionUtc ?? undefined)}</strong></li>
          </ul>
          <div>
            <h4>Last 10 events</h4>
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Decision</th>
                  <th>Policy</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {selectedNode.recentEvents.map((event) => (
                  <tr key={event.traceId}>
                    <td>{formatUtc(event.timestampUtc)}</td>
                    <td>{event.decision}</td>
                    <td>{event.policyId}</td>
                    <td>{event.confidence.toFixed(2)}</td>
                  </tr>
                ))}
                {selectedNode.recentEvents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted-line">No events for this machine yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === 'timeline' ? (
        <div className="machine-timeline-tab">
          {timelineStreamPoints.length === 0 ? (
            <p className="focus-banner">
              No timeline yet. Waiting for snapshots. Realtime channel is {wsStatus.statusLabel.toLowerCase()} and last heartbeat is {formatRelativeFromNow(selectedNode.lastHeartbeatUtc)}.
            </p>
          ) : null}
          {timelineRows.length === 0 ? (
            <p className="focus-banner-neutral">No decisions received yet for this window.</p>
          ) : null}
          {timelineInterventions.length === 0 ? (
            <p className="focus-banner-neutral">No interventions triggered yet for this window.</p>
          ) : null}
          <div className="table-controls">
            <div className="timeline-zoom-presets" role="group" aria-label="timeline zoom presets">
              {(['1h', '6h', '24h'] as TimelineWindow[]).map((windowOption) => (
                <button
                  key={windowOption}
                  type="button"
                  className={timelineWindow === windowOption ? 'active' : ''}
                  onClick={() => setTimelineWindow(windowOption)}
                >
                  {windowOption}
                </button>
              ))}
            </div>
            <label>
              Scrub sample
              <input
                type="range"
                min={0}
                max={Math.max(0, filteredRawEvents.length - 1)}
                value={Math.min(scrubIndex, Math.max(0, filteredRawEvents.length - 1))}
                onChange={(event) => setScrubIndex(Number(event.target.value))}
                disabled={scrubDisabled}
                title={scrubReason ?? 'Scrub timeline sample'}
              />
            </label>
          </div>
          {scrubReason ? <p className="muted-line">{scrubReason}</p> : null}
          <p className="muted-line">
            Raw stream samples: {filteredRawEvents.length} | Decision events: {timelineRows.length} | Intervention windows: {timelineInterventions.length}
          </p>
          <div className={`console-grid-two ${simulatedMachine ? 'demo-watermark-surface' : ''}`}>
            <div className="plot-wrap">
              <Plot
                data={timelinePlotModel.traces}
                layout={timelinePlotModel.layout}
                config={{ responsive: true, displaylogo: false }}
                onClick={handleTimelinePointClick}
                style={{ width: '100%', height: '420px' }}
              />
            </div>
            <div className="timeline-side">
              <h4>Click to explain</h4>
              {explainSelection ? (
                <>
                  <ul className="kv-list">
                    <li><span>Timestamp</span><strong>{formatUtc(explainSelection.timestampUtc)}</strong></li>
                    <li><span>Lane</span><strong>{explainSelection.kind}</strong></li>
                    <li><span>Metric</span><strong>{explainSelection.sourceLabel}</strong></li>
                    <li><span>Confidence</span><strong>{explainSelection.confidence === null ? 'unknown' : `${explainSelection.confidence.toFixed(2)} (${confidenceLabel(explainSelection.confidence)})`}</strong></li>
                    <li><span>Policy</span><strong>{explainSelection.policyId ?? 'n/a'}</strong></li>
                    <li><span>Reason</span><strong>{explainSelection.reason ?? 'n/a'}</strong></li>
                    <li><span>Undo</span><strong>{explainSelection.undo ?? 'n/a'}</strong></li>
                    <li><span>What changed</span><strong>{explainSelection.whatChanged ?? 'n/a'}</strong></li>
                  </ul>
                  <h4>Exact values</h4>
                  <ul className="kv-list">
                    <li><span>Typing burst</span><strong>{formatState(explainSelection.values.typingBurst)}</strong></li>
                    <li><span>Scroll velocity</span><strong>{formatState(explainSelection.values.scrollVelocity)}</strong></li>
                    <li><span>Focus switch rate</span><strong>{formatState(explainSelection.values.focusSwitchRate)}</strong></li>
                    <li><span>Focus</span><strong>{formatState(explainSelection.values.focus)}</strong></li>
                    <li><span>Overload</span><strong>{formatState(explainSelection.values.overload)}</strong></li>
                    <li><span>Fatigue</span><strong>{formatState(explainSelection.values.fatigue)}</strong></li>
                    <li><span>Stress</span><strong>{formatState(explainSelection.values.stress)}</strong></li>
                    <li><span>Stability</span><strong>{formatState(explainSelection.values.stability)}</strong></li>
                  </ul>
                  <h4>Contributors ranked</h4>
                  {explainSelection.contributors.length > 0 ? (
                    <ol className="timeline-ranked-list">
                      {explainSelection.contributors.map((contributor) => (
                        <li key={contributor}>{contributor}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="muted-line">No contributors provided for this point.</p>
                  )}
                </>
              ) : (
                <p className="muted-line">
                  {timelineStreamPoints.length === 0
                    ? 'Waiting for first snapshot sample. Click-to-explain will activate once timeline points arrive.'
                    : 'Click a point or use the scrubber to inspect exact values and system changes.'}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'risk' ? (
        <div className="machine-tab-grid">
          <ul className="kv-list">
            <li><span>Stress</span><strong>{simulatedMachine ? 'simulated' : formatState(riskSnapshot.stress)}</strong></li>
            <li><span>Overload</span><strong>{simulatedMachine ? 'simulated' : formatState(riskSnapshot.overload)}</strong></li>
            <li><span>Focus</span><strong>{simulatedMachine ? 'simulated' : formatState(riskSnapshot.focus)}</strong></li>
            <li><span>Fatigue</span><strong>{simulatedMachine ? 'simulated' : formatState(riskSnapshot.fatigue)}</strong></li>
            <li><span>Stability</span><strong>{simulatedMachine ? 'simulated' : formatState(riskSnapshot.stability)}</strong></li>
            <li><span>Confidence</span><strong>{simulatedMachine ? 'simulated' : formatState(riskSnapshot.confidence)}</strong></li>
          </ul>
          <div>
            <h4>Contributors</h4>
            <ul className="kv-list">
              {selectedNode.stateSummary.contributors.map((contributor) => (
                <li key={contributor}>
                  <span>{contributor}</span>
                  <strong>active</strong>
                </li>
              ))}
              {selectedNode.stateSummary.contributors.length === 0 ? (
                <li>
                  <span className="muted-line">Contributors unavailable for current source.</span>
                  <strong>n/a</strong>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {activeTab === 'config' ? (
        <div className="machine-tab-grid">
          <ul className="kv-list">
            <li><span>Config version</span><strong>{selectedNode.configSeq}</strong></li>
            <li><span>Expected config version</span><strong>{selectedNode.expectedConfigSeq}</strong></li>
            <li><span>Config drift</span><strong>{selectedNode.configDrift ? 'yes' : 'no'}</strong></li>
            <li><span>Signature validation</span><strong>{simulatedMachine ? 'simulated' : selectedNode.signatureStatus}</strong></li>
            <li><span>Issuer</span><strong>{simulatedMachine ? 'simulated' : (selectedNode.configIssuer ?? 'unavailable')}</strong></li>
            <li><span>Expiry</span><strong>{simulatedMachine ? 'simulated' : formatUtc(selectedNode.configExpiryUtc ?? undefined)}</strong></li>
            <li><span>Diff vs previous</span><strong>{simulatedMachine ? 'simulated' : (selectedNode.configDiffSummary ?? 'unavailable')}</strong></li>
          </ul>
          <div>
            <h4>Applied policy versions</h4>
            <ul className="kv-list">
              {selectedNode.appliedPolicyVersions.map((policy) => (
                <li key={policy}>
                  <span>{policy}</span>
                  <strong>applied</strong>
                </li>
              ))}
              {selectedNode.appliedPolicyVersions.length === 0 ? (
                <li>
                  <span className="muted-line">No policy versions captured for this machine.</span>
                  <strong>n/a</strong>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {showRawStream ? (
        <div className="machine-raw-stream">
          <h4>Raw event stream ({filteredRawEvents.length})</h4>
          <pre>{JSON.stringify(filteredRawEvents.slice(-20), null, 2)}</pre>
        </div>
      ) : null}
    </Panel>
  );
}

