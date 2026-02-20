import { useFleetSlice } from '../../store/fleetSlice';
import { MetricCard } from '../../components/Tables/MetricCard';
import { formatUtc, secondsUntil } from '../../utils/date';

export function FleetOverview() {
  const rollout = useFleetSlice((s) => s.rollout);
  const fleetHealth = useFleetSlice((s) => s.fleetHealth);

  return (
    <div className="grid-two">
      <MetricCard title="Fleet Health" value={`${fleetHealth.toFixed(0)} / 100`} note="Composite from rollout + SLO posture" />
      <MetricCard title="Rollout State" value={rollout?.state ?? 'Unknown'} note={`Updated ${formatUtc(rollout?.updatedAtUtc)}`} />
      <MetricCard title="Active Config Seq" value={String(rollout?.activeConfigSeq ?? 'n/a')} note="Authoritative from 8A" />
      <MetricCard
        title="Cooldown"
        value={rollout?.cooldownUntilUtc ? `${secondsUntil(rollout.cooldownUntilUtc)}s` : 'Not Active'}
        note={rollout?.cooldownUntilUtc ? `Until ${formatUtc(rollout.cooldownUntilUtc)}` : 'No lockout'}
      />
    </div>
  );
}

