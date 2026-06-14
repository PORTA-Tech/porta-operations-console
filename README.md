# PORTA Operations Console

Admin console for the **Ari** agent fleet.

## What Ari Is

**Ari** is a Windows productivity-tracking agent (`porta-agent-windows-x64`). It runs as three processes on the user's Windows machine:
- **ari.exe** — Windows service: captures input signals, runs the 5-second analysis pipeline, hosts the local HTTP API
- **Porta.UserAgent.exe** — user-session process: keyboard/mouse capture hooks, floating desktop widget
- **Porta.ControlCenter.exe** — WPF dashboard the user opens on demand

The agent connects to `porta-control-plane` for policy sync and fleet telemetry. This console is the operator view of the fleet.

## What This Console Shows

- **Monitor** — machine health, active-now status, realtime fleet state per machine
- **Growth** — registrations, activation rate, D1/D7/D30 retention, cohort table, DAU series, user journey
- **Events** — lifecycle events, interventions, audit trail
- **Analytics** — user activity patterns, focus sessions, calibration stage, pressure history

## Key Domain Terms

| Term | Meaning |
|---|---|
| focus episode | Durable unit of sustained user focus time (≥15s threshold, survives short context switches ≤60s) |
| pressure | User-facing overload score 0–1 (shown as %) |
| overload active | Stabilized binary overload state used for intervention triggers |
| short break | Light break suggestion after ~30 min of effective focus |
| long break | Full break suggestion after ~75 min of effective focus |
| freshness_state | `"fresh"` = state is current; `"stale"` = last refresh pending |
| provisional | Baseline calibration phase — not enough data yet for full confidence |
| capture context | `UserSession` = full input capture; other values = degraded/reconnecting |

## Behavior Glossary

- `focus episode` — Durable user-facing focus time.
- `pressure` — Expressive user-facing overload score.
- `overload active` — Conservative stabilized overload state for intervention logic.
- `short break` — Product-facing name for the lighter break intervention.
- `long break` — Product-facing name for the stronger break intervention.
- `limited` — Truth is usable but certainty is reduced.
- `updating` — Last known usable value is shown while fresh analyzed state catches up.

## Legacy Migration Map

- `taskContinuitySeconds` → focus-episode duration compatibility field
- `taskContinuityScore` → focus-episode quality compatibility field
- `overloadLikelihood` → pressure compatibility field
- `stretch_break_suggestion` → short break
- `break_suggestion` → long break
- `breakPendingAction` → break readiness compatibility field
- `breakPendingKind` → canonical short-break / long-break readiness field

The console may still consume those transport fields, but it should not present them to operators as the final product terminology.

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Checks

```bash
npm run check
npm run build
```

## Environment

### Required

| Variable | Purpose |
|---|---|
| `VITE_OPERATOR_KEY` | Shared secret sent as `x-operator-key` on every `/v1/*` request. Must match `PORTA_OPERATOR_KEY` on the control plane. |

### Optional

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Control plane base URL. Defaults to `http://localhost:8787` in dev, required in production. |
| `VITE_WS_BASE_URL` | WebSocket base URL for realtime (if enabled). |

### Local dev setup

Create `.env.local` in the repo root:

```
VITE_OPERATOR_KEY=<your key>
VITE_API_BASE_URL=https://your-control-plane.onrender.com
```

### Production (Render)

Set both `VITE_OPERATOR_KEY` and `VITE_API_BASE_URL` as environment variables in the Render dashboard, then trigger a redeploy. `VITE_*` variables are baked in at build time — a full rebuild is required after any change.
