# Console Operations (Step 13)

This repository is the correct ownership boundary for Step 13 console operations UI.

## Scope implemented

- Policy management UI:
  - policy list with concrete columns:
    - `policy_id`, `name`, `description`, `version`, `active_flag`, `last_modified`, `created_by`
  - editor fields:
    - trigger threshold
    - dwell window
    - cooldown
    - max intervention duration
    - max interventions/hour
    - escalation ladder
    - override permissions
  - semantic version validation (`MAJOR.MINOR.PATCH`)
  - conflict detection for overlapping active scope+metric
  - save/deploy actions wired to control-plane endpoints

- Audit UI:
  - decision table:
    - `trace_id`, `timestamp`, `agent_id`, `policy_id`, `action_decision`, `confidence_score`, `triggered_by`, `signature_valid`
  - filters:
    - policy, decision type, confidence threshold
  - exports:
    - CSV
    - JSON
    - signed PDF request call (`/v1/audit/export`)
  - replay:
    - `trace_id` replay verification call

- RBAC UI:
  - roles: `admin`, `operator`, `auditor`, `developer`
  - permissions matrix for `read/write/override`
  - assignment form with `fleet` or `agent` scope
  - session rule displayed:
    - max session duration `1h`
    - sensitive operations require re-authentication

## Performance and refresh values

- UI refresh cadence: `1s`
- Policy deploy propagation target displayed: `<5s`
- Operations panel metrics:
  - `policy_changes_total`
  - `policy_deploy_failures_total`
  - `audit_queries_total`
  - `audit_signature_mismatch_total`
  - `rbac_violations_total`

## Integration points

- `/v1/policy/catalog`
- `/v1/policy/upsert`
- `/v1/policy/deploy`
- `/v1/audit/decision-traces`
- `/v1/audit/replay/verify`
- `/v1/audit/export`
- `/v1/audit/metrics`
- `/v1/rbac/assignments`
- `/v1/rbac/assign`
