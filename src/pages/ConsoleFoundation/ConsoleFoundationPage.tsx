import Plot from 'react-plotly.js';
import type { Data, Layout, Shape } from 'plotly.js';
import { Panel } from '../../components/Layout/Panel';
import { useConsoleFoundation } from '../../hooks/useConsoleFoundation';
import { COLOR_BY_ACTION, COLOR_BY_STATE } from '../../types/consoleFoundation';

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function ConsoleFoundationPage() {
  const { samples, latest, metrics, riskAggregate, stateList } = useConsoleFoundation();

  const timestamps = samples.map((s) => s.timestamp);
  const interventions = samples.flatMap((sample) =>
    sample.interventions.map((overlay) => ({
      ...overlay,
      renderTime: sample.timestamp
    }))
  );

  const stateTraces: Partial<Data>[] = stateList.map((stateName) => ({
    x: timestamps,
    y: samples.map((s) => s.states[stateName]),
    type: 'scatter',
    mode: 'lines',
    line: { color: COLOR_BY_STATE[stateName], width: 2 },
    name: stateName
  }));

  const sigma = latest?.confidence_sigma ?? 0;
  const sigmaUpper = samples.map((s) => Math.min(1, s.states.stress_likelihood + sigma));
  const sigmaLower = samples.map((s) => Math.max(0, s.states.stress_likelihood - sigma));

  const timelineShapes: Partial<Shape>[] = interventions.map((overlay) => ({
    type: 'rect',
    xref: 'x',
    yref: 'paper',
    x0: overlay.start_time,
    x1: overlay.end_time,
    y0: 0,
    y1: 1,
    fillcolor: COLOR_BY_ACTION[overlay.action_type],
    opacity: Math.max(0.5, Math.min(1.0, overlay.confidence)),
    line: { width: 0 }
  }));

  return (
    <div className="stack">
      <Panel title="Machine Timeline + Intervention Overlay (1s refresh, 24h max)">
        <div className="console-grid-two">
          <div className="plot-wrap">
            <Plot
              data={[
                ...stateTraces,
                {
                  x: timestamps,
                  y: sigmaUpper,
                  mode: 'lines',
                  line: { width: 0 },
                  showlegend: false,
                  name: 'stress_upper'
                },
                {
                  x: timestamps,
                  y: sigmaLower,
                  mode: 'lines',
                  fill: 'tonexty',
                  fillcolor: 'rgba(255,92,92,0.18)',
                  line: { width: 0 },
                  showlegend: true,
                  name: 'stress ±1σ'
                }
              ]}
              layout={{
                autosize: true,
                margin: { l: 42, r: 12, t: 10, b: 28 },
                xaxis: { title: { text: 'RFC3339 timeline' }, rangeslider: { visible: false } },
                yaxis: { title: { text: 'State probability' }, range: [0, 1], dtick: 0.1 },
                shapes: timelineShapes,
                legend: { orientation: 'h' }
              } as Partial<Layout>}
              config={{ responsive: true, displaylogo: false }}
              style={{ width: '100%', height: '380px' }}
            />
          </div>
          <div className="timeline-side">
            <h4>Latest Primitive Snapshot</h4>
            {latest ? (
              <ul className="kv-list">
                {Object.entries(latest.primitives).map(([name, value]) => (
                  <li key={name}>
                    <span>{name}</span>
                    <strong>{typeof value === 'number' ? value.toFixed(3) : String(value)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-line">Waiting for first sample...</p>
            )}
            <h4>Intervention Overlay</h4>
            {latest?.interventions.length ? (
              <ul className="kv-list">
                {latest.interventions.map((itv) => (
                  <li key={`${itv.policy_id}:${itv.start_time}`}>
                    <span>{itv.action_type}</span>
                    <strong title={itv.reason}>{formatPct(itv.confidence)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-line">No active intervention.</p>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Risk Dashboard (Fleet + Per-Machine)">
        <div className="risk-grid">
          {riskAggregate
            ? Object.entries(COLOR_BY_STATE).map(([stateName, color]) => {
                const value = riskAggregate[stateName as keyof typeof riskAggregate] as number;
                return (
                  <div key={stateName} className="risk-gauge">
                    <p>{stateName}</p>
                    <div className="risk-track">
                      <div className="risk-fill" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
                    </div>
                    <strong>
                      {formatPct(value)} ± {(riskAggregate.confidence_sigma * 100).toFixed(1)}%
                    </strong>
                  </div>
                );
              })
            : <p className="muted-line">Waiting for state stream...</p>}
        </div>
      </Panel>

      <Panel title="Console Observability Metrics">
        <div className="console-metric-grid">
          <p>timeline_render_latency_ms: <strong>{metrics.timeline_render_latency_ms.toFixed(2)}</strong></p>
          <p>state_curve_update_latency_ms: <strong>{metrics.state_curve_update_latency_ms.toFixed(2)}</strong></p>
          <p>intervention_overlay_render_latency_ms: <strong>{metrics.intervention_overlay_render_latency_ms.toFixed(2)}</strong></p>
          <p>ws_connection_drop_total: <strong>{metrics.ws_connection_drop_total}</strong></p>
          <p>dashboard_refresh_total: <strong>{metrics.dashboard_refresh_total}</strong></p>
          <p>dashboard_refresh_failed_total: <strong>{metrics.dashboard_refresh_failed_total}</strong></p>
        </div>
      </Panel>
    </div>
  );
}
