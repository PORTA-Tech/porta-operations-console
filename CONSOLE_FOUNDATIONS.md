# Console Foundations (Step 12)

This repository is the correct ownership boundary for Step 12 runtime/UI implementation.

## Runtime profile

- Service: `console-core`
- Frontend: React + TypeScript
- Real-time transport: WebSocket stream (1s refresh)
- Historical source target: TimescaleDB (`90d` hot, longer cold archive)
- Live buffer target: Redis (`7.2`) in control-plane/stream layer

## Implemented concrete values

- Refresh interval: `1000ms`
- Timeline window: `1s` to `24h`
- EWMA alpha: `0.3`
- State scale: `0..1` with `0.1` ticks
- Confidence shading: `+/- 1 sigma`

### State colors

- `stress_likelihood`: `#FF5C5C`
- `overload_likelihood`: `#FFA500`
- `focus_strength`: `#4CAF50`
- `fatigue_probability`: `#2196F3`
- `cognitive_stability_index`: `#9C27B0`

### Intervention overlay colors

- `dim_screen`: `#FFD700`
- `focus_mode`: `#4CAF50`
- `notification_suppress`: `#FFB74D`
- `break_suggestion`: `#64B5F6`

## Views

- Machine timeline with curve plot and intervention overlays
- Risk dashboard (fleet/per-machine gauges)
- Console observability panel:
  - `timeline_render_latency_ms`
  - `state_curve_update_latency_ms`
  - `intervention_overlay_render_latency_ms`
  - `ws_connection_drop_total`
  - `dashboard_refresh_total`
  - `dashboard_refresh_failed_total`

## Integration notes

- Route: `/console`
- WebSocket URL env: `VITE_WS_BASE_URL`
- If websocket stream is unavailable, a deterministic fallback simulator feeds the view at 1s cadence.
