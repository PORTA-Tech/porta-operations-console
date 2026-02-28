import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Layout/Panel';
import type { ApiError } from '../../api/client';
import type { NodeDetail } from '../../types/ui';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';

interface NodeDetailsProps {
  nodes: NodeDetail[];
  loading: boolean;
  error: ApiError | undefined;
}

type MachineTab = 'summary' | 'timeline' | 'risk' | 'config';
type TimelineWindow = '1h' | '24h';

interface RawMachineEvent {
  timestampUtc: string;
  payload: Record<string, unknown>;
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

function toWsBase(base: string): string {
  const trimmed = base.trim().replace(/\/$/, '');
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) return trimmed;
  if (trimmed.startsWith('https://')) return `wss://${trimmed.slice('https://'.length)}`;
  if (trimmed.startsWith('http://')) return `ws://${trimmed.slice('http://'.length)}`;
  return `ws://${trimmed}`;
}

function nowWindowMs(window: TimelineWindow): number {
  return window === '24h' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
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

export function NodeDetails({ nodes, loading, error }: NodeDetailsProps) {
  const [params] = useSearchParams();
  const [activeTab, setActiveTab] = useState<MachineTab>('summary');
  const [timelineWindow, setTimelineWindow] = useState<TimelineWindow>('1h');
  const [scrubIndex, setScrubIndex] = useState(0);
  const [showRawStream, setShowRawStream] = useState(false);
  const [rawEvents, setRawEvents] = useState<RawMachineEvent[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const selectedMachineId = params.get('machine') ?? nodes[0]?.nodeId ?? '';
  const selectedNode = nodes.find((node) => node.nodeId === selectedMachineId) ?? nodes[0];
  const wsBase = import.meta.env.VITE_WS_BASE_URL?.trim();
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    setRawEvents([]);
    setActionMessage(null);
    setScrubIndex(0);
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

  const scrubbedEvent = filteredRawEvents[scrubIndex];
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

  const handleCopyDiagnostic = async () => {
    if (!selectedNode) return;
    const payload = {
      machineId: selectedNode.nodeId,
      generatedAtUtc: new Date().toISOString(),
      machineSnapshot: selectedNode,
      selectedTimelineWindow: timelineWindow,
      recentTimelineEvents: timelineRows,
      rawStreamSampleCount: filteredRawEvents.length,
      latestRawEvent: filteredRawEvents[filteredRawEvents.length - 1] ?? null
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
      rawStreamEvents: filteredRawEvents
    };
    downloadJson(`porta-machine-trace-pack-${selectedNode.nodeId}.json`, payload);
    setActionMessage('Trace pack exported.');
  };

  const handleSimulateIntervention = () => {
    if (!selectedNode) return;
    if (!isDev) {
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

      <div className="machine-debug-actions">
        <button type="button" onClick={() => void handleCopyDiagnostic()}>Copy diagnostic snapshot</button>
        <button type="button" onClick={handleExportTracePack}>Export trace pack</button>
        <button type="button" onClick={() => setShowRawStream((current) => !current)}>
          {showRawStream ? 'Hide raw event stream' : 'Open raw event stream'}
        </button>
        <button type="button" onClick={handleSimulateIntervention}>Simulate intervention (test mode)</button>
      </div>
      {actionMessage ? <p className="muted-line">{actionMessage}</p> : null}

      {activeTab === 'summary' ? (
        <div className="machine-tab-grid">
          <ul className="kv-list">
            <li><span>Machine health</span><strong>{selectedNode.offline ? 'Offline' : 'Online'}</strong></li>
            <li><span>Heartbeat age</span><strong>{selectedNode.heartbeatAgeSec}s</strong></li>
            <li><span>Cohort</span><strong>{selectedNode.cohortId}</strong></li>
            <li><span>Agent version</span><strong>{selectedNode.agentVersion}</strong></li>
            <li><span>Config version</span><strong>{selectedNode.configSeq}</strong></li>
            <li><span>Config Trust</span><strong>{selectedNode.signatureStatus}</strong></li>
            <li><span>Backend connected</span><strong>{selectedNode.backendConnected ? 'yes' : 'no'}</strong></li>
            <li><span>Last intervention</span><strong>{selectedNode.lastIntervention}</strong></li>
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
          <div className="table-controls">
            <label>
              Show window
              <select value={timelineWindow} onChange={(event) => setTimelineWindow(event.target.value as TimelineWindow)}>
                <option value="1h">last 1h</option>
                <option value="24h">last 24h</option>
              </select>
            </label>
            <label>
              Scrub event
              <input
                type="range"
                min={0}
                max={Math.max(0, filteredRawEvents.length - 1)}
                value={Math.min(scrubIndex, Math.max(0, filteredRawEvents.length - 1))}
                onChange={(event) => setScrubIndex(Number(event.target.value))}
              />
            </label>
          </div>
          <p className="muted-line">
            Raw stream samples: {filteredRawEvents.length} | Decision events: {timelineRows.length}
          </p>
          <div className="machine-tab-grid">
            <div>
              <h4>State overlay</h4>
              <ul className="kv-list">
                <li><span>Focus</span><strong>{formatState(riskSnapshot.focus)}</strong></li>
                <li><span>Overload</span><strong>{formatState(riskSnapshot.overload)}</strong></li>
                <li><span>Fatigue</span><strong>{formatState(riskSnapshot.fatigue)}</strong></li>
                <li><span>Stress</span><strong>{formatState(riskSnapshot.stress)}</strong></li>
                <li><span>Stability</span><strong>{formatState(riskSnapshot.stability)}</strong></li>
              </ul>
              {scrubbedEvent ? (
                <p className="muted-line">Scrub point: {formatUtc(scrubbedEvent.timestampUtc)}</p>
              ) : (
                <p className="muted-line">No stream samples in this window.</p>
              )}
            </div>
            <div>
              <h4>Intervention overlay</h4>
              <ul className="kv-list">
                {timelineRows.map((event) => (
                  <li key={event.traceId}>
                    <span>{event.decision}</span>
                    <strong>{formatUtc(event.timestampUtc)}</strong>
                  </li>
                ))}
                {timelineRows.length === 0 ? (
                  <li>
                    <span className="muted-line">No interventions in selected window.</span>
                    <strong>n/a</strong>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'risk' ? (
        <div className="machine-tab-grid">
          <ul className="kv-list">
            <li><span>Stress</span><strong>{formatState(riskSnapshot.stress)}</strong></li>
            <li><span>Overload</span><strong>{formatState(riskSnapshot.overload)}</strong></li>
            <li><span>Focus</span><strong>{formatState(riskSnapshot.focus)}</strong></li>
            <li><span>Fatigue</span><strong>{formatState(riskSnapshot.fatigue)}</strong></li>
            <li><span>Stability</span><strong>{formatState(riskSnapshot.stability)}</strong></li>
            <li><span>Confidence</span><strong>{formatState(riskSnapshot.confidence)}</strong></li>
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
            <li><span>Signature validation</span><strong>{selectedNode.signatureStatus}</strong></li>
            <li><span>Issuer</span><strong>{selectedNode.configIssuer ?? 'unavailable'}</strong></li>
            <li><span>Expiry</span><strong>{formatUtc(selectedNode.configExpiryUtc ?? undefined)}</strong></li>
            <li><span>Diff vs previous</span><strong>{selectedNode.configDiffSummary ?? 'unavailable'}</strong></li>
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
