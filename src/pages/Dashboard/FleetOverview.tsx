import { useFleetSlice } from '../../store/fleetSlice';
import { MetricCard } from '../../components/Tables/MetricCard';
import { formatUtc, secondsUntil } from '../../utils/date';
import { StatusBadge } from '../../components/StatusIndicators/StatusBadge';
import { useNavigate } from 'react-router-dom';

export function FleetOverview() {
  const navigate = useNavigate();
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
      <MetricCard
        title="Fleet health score"
        value={`${fleetHealth.toFixed(0)} / 100`}
        note="Computed from rollout posture and SLO status."
        tooltip={{
          meaning: 'A blended health score across rollout safety and service stability.',
          whyItMatters: 'Quickly shows if operators should triage before promotion.',
          goodLooksLike: 'Score stays high and stable during normal operations.'
        }}
      />
      <MetricCard
        title="Rollout status"
        value={rollout?.state ?? 'Unknown'}
        note={`Updated ${formatUtc(rollout?.updatedAtUtc)}`}
        tooltip={{
          meaning: 'Current rollout stage for active change.',
          whyItMatters: 'Tells whether the system is promoting, paused, or halted.',
          goodLooksLike: 'Predictable stage transitions without unexpected halts.'
        }}
      />
      <MetricCard
        title="Active config version"
        value={String(rollout?.activeConfigSeq ?? 'n/a')}
        note="Source of truth from control plane."
        tooltip={{
          meaning: 'The currently applied signed configuration version.',
          whyItMatters: 'Version mismatch causes inconsistent behavior across machines.',
          goodLooksLike: 'Expected version distribution by cohort.'
        }}
      />
      <MetricCard
        title="Rollout cooldown"
        value={rollout?.cooldownUntilUtc ? `${cooldownSeconds}s` : 'Not Active'}
        note={rollout?.cooldownUntilUtc ? `Until ${formatUtc(rollout.cooldownUntilUtc)}` : 'No active cooldown'}
        tooltip={{
          meaning: 'Time remaining before another promotion step is allowed.',
          whyItMatters: 'Prevents over-reactive rollout decisions.',
          goodLooksLike: 'Cooldown obeyed, then promotion based on observed impact.'
        }}
      />
      <MetricCard
        title="SLO compliance"
        value={`${sloCompliance.scorePct.toFixed(1)}%`}
        note={<StatusBadge label={sloCompliance.label} tone={sloTone} />}
        tooltip={{
          meaning: 'Percent of service level objectives currently being met.',
          whyItMatters: 'Directly indicates reliability impact to users.',
          goodLooksLike: 'Compliant with high percentage and low volatility.'
        }}
      />
      <MetricCard
        title="Safety halt"
        value={haltIndicator ? 'Active' : 'Clear'}
        note={<StatusBadge label={haltIndicator ? 'Active' : 'Clear'} tone={haltTone} />}
        tooltip={{
          meaning: 'Shows whether safety logic has paused progression.',
          whyItMatters: 'Signals potential blast-radius risk.',
          goodLooksLike: 'Clear during normal operation; active only with explicit reason.'
        }}
      />
      <section className="panel span-all">
        <h3>Cohort distribution</h3>
        {cohorts.length === 0 ? (
          <p>No cohort data is available yet.</p>
        ) : (
          <div className="cohort-grid">
            {cohorts.map((cohort) => (
              <button
                className="cohort-item"
                type="button"
                key={cohort.cohortId}
                onClick={() => navigate(`/cohorts?cohort=${encodeURIComponent(cohort.cohortId)}`)}
                title="Open cohort details"
              >
                <strong>{cohort.cohortId}</strong>
                <span>{cohort.exposurePct}% exposure</span>
                <span>Status: {cohort.status}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

