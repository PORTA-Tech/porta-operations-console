# PORTA Operations Console (8B)

Enterprise UI surface for 8A control-plane APIs.

## Purpose
- Visualize fleet state, rollout posture, cohort metrics, node details, and config integrity.
- Orchestrate actions through 8A APIs only (no authority in UI).

## Run
Run npm install then npm run dev.

## Environment
- VITE_CONTROL_PLANE_URL (default: http://localhost:8787)

## Structure
- src/api/*: clients to control-plane endpoints
- src/hooks/*: fetch/orchestration hooks
- src/store/*: UI-only state (Zustand)
- src/pages/*: dashboard + rollout + nodes + config views
