# PORTA Operations Console

Operator-facing web console for PORTA fleet visibility and governance.

This app consumes typed control-plane APIs and live websocket streams to render machine timelines, risk/state dashboards, rollout controls, policy/audit operations, and RBAC-aware workflows.

## What This Repository Owns

- Fleet dashboard and cohort views
- Console Foundations UI (state curves, overlays, realtime stream rendering)
- Console Operations UI (policy management, audit tools, RBAC-facing operations)
- Rollout center (promotion path, dry-run, blast-radius, adapter controls)
- Node drilldown and config integrity views
- Client-side telemetry/latency counters for console runtime

## Implemented Scope (Steps)

- Step 12: console foundations (timeline/state/risk/intervention visualization)
- Step 13: operations layer (policy management, audit UI, RBAC UX)
- Step 15: observability and alert-linked surfaces
- Step 16: hardening/rollout support with websocket smoke tooling

## Tech Stack

- React 19 + TypeScript
- Vite build/runtime
- `react-router-dom` for page routing
- `plotly.js` + `react-plotly.js` for curves and overlays
- Zustand for shared UI state

## Routes

- `/` dashboard overview
- `/console` console foundation page
- `/operations` console operations page
- `/rollout` rollout center
- `/cohorts` cohort view
- `/nodes` node drilldown
- `/config` config integrity tools

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

### Type-check and build

```bash
npm run check
npm run build
```

### Lint

```bash
npm run lint
```

### Preview production build

```bash
npm run preview
```

### Step 16 websocket smoke

```bash
npm run step16:ws-smoke
```

## Environment Variables

- `VITE_API_BASE_URL`: control-plane HTTP base URL (required in production)
- `VITE_WS_BASE_URL`: websocket base for live console stream (`/v1/stream/console-state`)

Development fallback for API base is `http://localhost:8787`.

## API Contract Integration

Typed API clients are generated from control-plane OpenAPI schema into:

- `src/api/generated/controlPlane.ts`

Regenerate when contract changes:

```bash
npx openapi-typescript ../porta-api-contracts/src/openapi/control-plane.yaml -o src/api/generated/controlPlane.ts
```

## Docs

- `CONSOLE_FOUNDATIONS.md`
- `CONSOLE_OPERATIONS.md`
- `STEP15_OBSERVABILITY_ALERTS.md`
- `STEP16_HARDENING_ROLLOUT.md`

## Boundaries

This repo does not own:

- Policy execution and signed intervention issuance: `porta-control-plane`
- Endpoint signal capture and local tray behavior: `porta-agent-windows-x64`
- Shared schema/DTO definitions: `porta-api-contracts`
