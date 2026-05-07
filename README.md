# PORTA Operations Console

Admin console for the **Ari** agent fleet.

## What Ari Is

**Ari** is a Windows productivity-tracking agent (`porta-agent-windows-x64`). It runs as three processes on the user's Windows machine:
- **ari.exe** — Windows service: captures input signals, runs the 5-second analysis pipeline, hosts the local HTTP API
- **Porta.UserAgent.exe** — user-session process: keyboard/mouse capture hooks, floating desktop widget
- **Porta.ControlCenter.exe** — WPF dashboard the user opens on demand

The agent connects to `porta-control-plane` for policy sync and fleet telemetry. This console is the operator view of the fleet.

## What This Console Shows

- **System Health** — service status, capture quality, API health per machine
- **User Activity** — work-today timeline, focus sessions, pressure history
- **Trust Level** — baseline calibration stage (Cold / Provisional / Ready / Calibrated)
- **Actions** — break suggestions, interventions, pause/resume history

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

---

Admin console for the current PORTA V1 operations surface.

## Current Scope

- `System Health`
- `User Activity`
- `Trust Level`
- `Actions`

## Behavior Glossary

The console should use the canonical product meanings below even while control-plane and Windows transport still expose some legacy compatibility fields:

- `focus episode`
  - Durable user-facing focus time.
- `pressure`
  - Expressive user-facing overload score.
- `overload active`
  - Conservative stabilized overload state for intervention logic.
- `short break`
  - Product-facing name for the lighter break intervention.
- `long break`
  - Product-facing name for the stronger break intervention.
- `limited`
  - Truth is usable but certainty is reduced.
- `updating`
  - Last known usable value is shown while fresh analyzed state catches up.

## Legacy Migration Map

- `taskContinuitySeconds` -> focus-episode duration compatibility field
- `taskContinuityScore` -> focus-episode quality compatibility field
- `overloadLikelihood` -> pressure compatibility field
- `stretch_break_suggestion` -> short break
- `break_suggestion` -> long break
- `breakPendingAction` -> break readiness compatibility field
- `breakPendingKind` -> canonical short-break / long-break readiness field

The console may still consume those transport fields, but it should not present them to operators as the final product terminology.

## Run

```bash
npm install
npm run dev
```

## Checks

```bash
npm run check
npm run build
```

## Environment

- `VITE_API_BASE_URL`
- `VITE_WS_BASE_URL`
