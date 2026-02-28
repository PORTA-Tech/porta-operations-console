export type GlossaryTerm = {
  term: string;
  plainLabel: string;
  meaning: string;
  whyItMatters: string;
  goodLooksLike: string;
};

export const glossaryTerms: GlossaryTerm[] = [
  {
    term: 'P95 / P99 latency',
    plainLabel: 'Slow-response percentiles',
    meaning: 'How slow the worst 5% and worst 1% of requests are.',
    whyItMatters: 'Users feel instability first in these tail latencies.',
    goodLooksLike: 'Stable trend and no sudden spikes after changes.'
  },
  {
    term: 'Degradation',
    plainLabel: 'Delta vs baseline',
    meaning: 'Percent of machines currently operating below expected baseline.',
    whyItMatters: 'Shows whether the product experience is slipping in the field.',
    goodLooksLike: 'Low and flat over time, especially during rollouts.'
  },
  {
    term: 'Config Version',
    plainLabel: 'Config version identifier',
    meaning: 'The active signed configuration version running on a node.',
    whyItMatters: 'Version drift causes non-deterministic behavior.',
    goodLooksLike: 'Most machines on the intended version for their cohort.'
  },
  {
    term: 'Config Trust',
    plainLabel: 'Signature verification state',
    meaning: 'Whether policy/config signatures verify successfully.',
    whyItMatters: 'Invalid signatures break trust boundaries.',
    goodLooksLike: 'Always valid across all active machines.'
  },
  {
    term: 'Cooldown',
    plainLabel: 'Rollout cooldown',
    meaning: 'Forced wait period after a rollout step before next promotion.',
    whyItMatters: 'Prevents runaway changes before impact is measurable.',
    goodLooksLike: 'Cooldown respected, then promote only with stable metrics.'
  }
];
