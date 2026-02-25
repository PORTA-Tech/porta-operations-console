# Step 16: Hardening + Rollout (Console)

## Security Hardening Applied
- Browser CSP added in `index.html`.
- Referrer policy set to `no-referrer`.
- Console continues RBAC-scoped API access using operator role headers.

## Performance / Resilience Harness
- Script: `scripts/step16-ws-smoke.mjs`
- Command: `npm run step16:ws-smoke`
- Output: JSON summary (messages, drops, p95 latency)
- Inputs:
  - `VITE_WS_BASE_URL`
  - `STEP16_DURATION_SECONDS`

## Rollout Guidance
- Canary stages:
  - 5% -> 25% -> 50% -> 100%
- Promote only when:
  - websocket drop rate < 0.01%/hour equivalent
  - console refresh stays < 1s
  - no unresolved critical alerts in alert center

## Operational SLO Alignment
- Console update target: <1s
- End-to-end event->console alert threshold: >2s triggers alert in control-plane
