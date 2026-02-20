import { useFleetSlice } from '../../store/fleetSlice';
import { MetricCard } from '../../components/Tables/MetricCard';
import { formatUtc, secondsUntil } from '../../utils/date';
import { StatusBadge } from '../../components/StatusIndicators/StatusBadge';

export function FleetOverview() {
  const rollout = useFleetSlice((s) => s.rollout);
  const fleetHealth = useFleetSlice((s) => s.fleetHealth);
  const cohorts = useFleetSlice((s) => s.cohortDistribution);
  const sloCompliance = useFleetSlice((s) => s.sloCompliance);
  const haltIndicator = useFleetSlice((s) => s.haltIndicator);

  const sloTone = sloCompliance.label === 'Compliant' ? 'ok' : sloCompliance.label === 'Degraded' ? 'warn' : 'critical';
  const haltTone = haltIndicator ? 'critical' : 'ok';
  const cooldownSeconds = rollout?.cooldownUntilUtc ? secondsUntil(rollout.cooldownUntilUtc) : 0;

  return (
    <div className="grid-three">
      <MetricCard title="Fleet Health Composite Index" value={`${fleetHealth.toFixed(0)} / 100`} note="Computed from rollout + SLO posture" />
      <MetricCard title="Rollout State" value={rollout?.state ?? 'Unknown'} note={`Updated ${formatUtc(rollout?.updatedAtUtc)}`} />
      <MetricCard title="Active Config Seq" value={String(rollout?.activeConfigSeq ?? 'n/a')} note="Authoritative from 8A" />
      <MetricCard
        title="Cooldown Timer"
        value={rollout?.cooldownUntilUtc ? `${cooldownSeconds}s` : 'Not Active'}
        note={rollout?.cooldownUntilUtc ? `Until ${formatUtc(rollout.cooldownUntilUtc)}` : 'No lockout'}
      />
      <MetricCard
        title="SLO Compliance Summary"
        value={`${sloCompliance.scorePct.toFixed(1)}%`}
        note={<StatusBadge label={sloCompliance.label} tone={sloTone} />}
      />
      <MetricCard
        title="Halt Indicator"
        value={haltIndicator ? 'Active' : 'Clear'}
        note={<StatusBadge label={haltIndicator ? 'Halt/Cooldown' : 'No Halt'} tone={haltTone} />}
      />
      <section className="panel span-all">
        <h3>Cohort Distribution</h3>
        {cohorts.length === 0 ? (
          <p>No cohort data from backend yet.</p>
        ) : (
          <div className="cohort-grid">
            {cohorts.map((cohort) => (
              <div className="cohort-item" key={cohort.cohortId}>
                <strong>{cohort.cohortId}</strong>
                <span>{cohort.exposurePct}% exposure</span>
                <span>state: {cohort.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

