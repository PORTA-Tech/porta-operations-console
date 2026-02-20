import { Panel } from '../../components/Layout/Panel';
import { useFleetSlice } from '../../store/fleetSlice';
import { formatUtc } from '../../utils/date';
import { StatusBadge } from '../../components/StatusIndicators/StatusBadge';

export function RolloutControl() {
  const rollout = useFleetSlice((s) => s.rollout);
  const haltIndicator = useFleetSlice((s) => s.haltIndicator);

  return (
    <Panel title="Rollout Governance Snapshot (Read-Only)">
      <p>rollout_state: <strong>{rollout?.state ?? 'Unknown'}</strong></p>
      <p>config_seq: <strong>{rollout?.activeConfigSeq ?? 'n/a'}</strong></p>
      <p>cooldown_until_utc: <strong>{rollout?.cooldownUntilUtc ? formatUtc(rollout.cooldownUntilUtc) : 'n/a'}</strong></p>
      <p>
        halt_status:{' '}
        <StatusBadge label={haltIndicator ? 'Active' : 'Clear'} tone={haltIndicator ? 'critical' : 'ok'} />
      </p>
      <p className="muted-line">Phase 2 policy: mutation controls disabled until read-only governance validation completes.</p>
    </Panel>
  );
}

