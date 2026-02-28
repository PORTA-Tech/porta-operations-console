export type GlossaryTerm = {
  term: string;
  plainLabel: string;
  meaning: string;
  whyItMatters: string;
  goodLooksLike: string;
};

export const glossaryTerms: GlossaryTerm[] = [
  {
    term: 'Error Rate',
    plainLabel: 'Error Rate',
    meaning: 'Percentage of operations that failed within the selected time window.',
    whyItMatters: 'Direct measure of system reliability.',
    goodLooksLike: 'Low and stable, especially during rollouts or experiments.'
  },
  {
    term: 'P95 Latency',
    plainLabel: 'P95 Latency',
    meaning: '95% of requests are completed faster than this time.',
    whyItMatters: 'Shows how slow the worst 5% of requests are.',
    goodLooksLike: 'Stable trend with no spikes after configuration changes.'
  },
  {
    term: 'P99 Latency',
    plainLabel: 'P99 Latency',
    meaning: '99% of requests are completed faster than this time.',
    whyItMatters: 'Represents extreme tail latency where users first feel instability.',
    goodLooksLike: 'Consistent and predictable, without sudden jumps.'
  },
  {
    term: 'Performance Change vs Stable',
    plainLabel: 'Performance Change vs Stable (Delta vs Stable)',
    meaning: 'Difference in performance compared to the stable cohort over the selected time window.',
    whyItMatters: 'Shows whether recent changes improved or degraded system behavior.',
    goodLooksLike: 'Close to zero or negative (improvement), with stable direction over time.'
  },
  {
    term: 'Machines Online',
    plainLabel: 'Machines Online',
    meaning: 'Number of machines sending recent heartbeats compared to total expected machines.',
    whyItMatters: 'Detects crashes, disconnects, or rollout failures.',
    goodLooksLike: 'All machines online, or only brief temporary drops.'
  },
  {
    term: 'Cohort',
    plainLabel: 'Cohort',
    meaning: 'A group of machines exposed to the same configuration or experiment.',
    whyItMatters: 'Enables controlled comparisons and safe testing.',
    goodLooksLike: 'Clear separation between stable and experimental groups.'
  },
  {
    term: 'Rollout State',
    plainLabel: 'Rollout State',
    meaning: 'Current promotion state of a configuration change (Idle, Promoting, Monitoring, Halted).',
    whyItMatters: 'Indicates whether changes are actively being deployed.',
    goodLooksLike: 'Controlled progression with no unexpected halts.'
  },
  {
    term: 'Config Trust',
    plainLabel: 'Config Trust',
    meaning: 'Whether configuration signatures validate successfully on machines.',
    whyItMatters: 'Invalid signatures break trust boundaries and may indicate corruption or tampering.',
    goodLooksLike: 'All active machines show valid trust status.'
  },
  {
    term: 'Rollout Cooldown',
    plainLabel: 'Rollout Cooldown',
    meaning: 'Required waiting period after a rollout step before the next promotion.',
    whyItMatters: 'Prevents rapid changes before impact is measurable.',
    goodLooksLike: 'Cooldown respected before further promotion.'
  },
  {
    term: 'SLO',
    plainLabel: 'SLO (Service Level Objective)',
    meaning: 'Reliability target the fleet must meet (error rate, latency thresholds, etc.).',
    whyItMatters: 'Indicates whether the system meets expected reliability standards.',
    goodLooksLike: 'Compliant and stable over time.'
  }
];
