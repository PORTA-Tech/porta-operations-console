# PORTA Operations Console (8B)

Enterprise UI surface for 8A control-plane APIs.

## Purpose
- Visualize fleet state, rollout posture, cohort metrics, node details, and config integrity.
- Orchestrate actions through 8A APIs only (no authority in UI).

## Run
Run npm install then npm run dev.

## Environment
- VITE_API_BASE_URL (default in dev: http://localhost:8787)
- VITE_WS_BASE_URL (optional, websocket base for `/v1/stream/console-state`)

## Structure
- src/api/*: clients to control-plane endpoints
- src/hooks/*: fetch/orchestration hooks
- src/store/*: UI-only state (Zustand)
- src/pages/*: dashboard + rollout + nodes + config views

## Step 12
- See `CONSOLE_FOUNDATIONS.md` for concrete production values and rendering rules.

## Step 13
- See `CONSOLE_OPERATIONS.md` for policy management, audit operations, and RBAC UI foundations.
