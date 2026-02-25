# Step 15: Observability + Alerts (Console)

## Implemented
- Audit table now displays `correlation_id` for each decision trace.
- Added active alerts panel with resolve action:
  - source endpoint: `GET /v1/audit/alerts`
  - resolve endpoint: `POST /v1/audit/alerts/:alertId/resolve`
- Operations metrics now include:
  - `correlation_trace_complete_total`
  - `correlation_trace_incomplete_total`
  - `alerts_triggered_total`
- Metric aggregation is sum-by-metric across labeled rows from `/v1/audit/metrics`.

## Data Types Added
- `AlertRecord` in `src/types/consoleOperations.ts`
- `correlation_id` added to `AuditDecisionRecord`

## Validation
- `npm run build` passed
