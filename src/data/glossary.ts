export type GlossaryTerm = {
  term: string;
  plainLabel: string;
  meaning: string;
  whyItMatters: string;
  goodLooksLike: string;
};

const fleetGlossaryTerms: GlossaryTerm[] = [
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

const cohortGlossaryTerms: GlossaryTerm[] = [
  {
    term: 'Cohort',
    plainLabel: 'Cohort',
    meaning: 'A cohort is a group of machines running the same configuration or experiment so behavior can be compared.',
    whyItMatters: 'Cohorts let PORTA test changes on a smaller slice before wider impact.',
    goodLooksLike: 'Clear cohort boundaries with reliable comparisons against baseline.'
  },
  {
    term: 'Baseline Cohort',
    plainLabel: 'Baseline Cohort',
    meaning: 'The reference cohort used to compute all deltas (Error, P99, Degradation).',
    whyItMatters: 'Without a baseline, delta values are not meaningful.',
    goodLooksLike: 'Baseline set intentionally (usually stable) and unchanged during analysis.'
  },
  {
    term: 'Delta (Delta)',
    plainLabel: 'Delta (Delta)',
    meaning: 'The difference between a cohort and baseline for the selected metric and time window.',
    whyItMatters: 'Delta shows direction and size of change, not just raw values.',
    goodLooksLike: 'Near zero or negative for reliability metrics.'
  },
  {
    term: 'Delta P99 Latency',
    plainLabel: 'Delta P99 Latency',
    meaning: 'Difference in P99 latency versus baseline. P99 reflects the slowest 1% of requests.',
    whyItMatters: 'Tail latency regressions often appear here first.',
    goodLooksLike: 'Flat or improved relative to baseline, without sustained positive spikes.'
  },
  {
    term: 'Delta Error',
    plainLabel: 'Delta Error',
    meaning: 'Difference in error rate versus baseline.',
    whyItMatters: 'Shows whether a cohort is causing more failed operations than expected.',
    goodLooksLike: 'Near zero or negative relative to baseline.'
  },
  {
    term: 'Delta Degradation',
    plainLabel: 'Delta Degradation',
    meaning: 'Change in performance regression score compared to baseline.',
    whyItMatters: 'Captures broader degradation that may not appear in a single metric.',
    goodLooksLike: 'Stable and close to baseline, with no sustained positive drift.'
  },
  {
    term: 'Regression',
    plainLabel: 'Regression',
    meaning: 'A cohort is regressing when one or more deltas exceed policy thresholds.',
    whyItMatters: 'Regression flags investigation need before wider rollout.',
    goodLooksLike: 'No active regression, or quick resolution with traceable root cause.'
  },
  {
    term: 'Regression Trigger Threshold',
    plainLabel: 'Regression Trigger Threshold',
    meaning: 'Minimum delta required to classify a regression (for example, Delta P99 > +20ms).',
    whyItMatters: 'Prevents noise from triggering false alarms and keeps triage consistent.',
    goodLooksLike: 'Thresholds are policy-defined, visible, and tuned to real operating conditions.'
  },
  {
    term: 'Confidence Level',
    plainLabel: 'Confidence Level',
    meaning: 'Statistical reliability signal for a detected regression.',
    whyItMatters: 'Helps teams avoid overreacting to weak evidence.',
    goodLooksLike: 'Medium to high confidence before major rollout decisions.'
  },
  {
    term: 'Sample Size',
    plainLabel: 'Sample Size',
    meaning: 'Number of machines in the cohort for the current window.',
    whyItMatters: 'Small samples increase volatility and reduce confidence.',
    goodLooksLike: 'Enough machines to make regression signals stable and repeatable.'
  },
  {
    term: 'Time Window',
    plainLabel: 'Time Window',
    meaning: 'Aggregation duration used for metrics and deltas (15m, 1h, 6h, 24h).',
    whyItMatters: 'Window size changes sensitivity, smoothing, and confidence.',
    goodLooksLike: 'Window selected intentionally for the decision being made.'
  },
  {
    term: 'Lens',
    plainLabel: 'Lens',
    meaning: 'Metric focus mode on the page. Current modes are Reliability and Behavioral.',
    whyItMatters: 'Lens selection changes which signals are emphasized for analysis.',
    goodLooksLike: 'Operators use the lens that matches the current investigation objective.'
  },
  {
    term: 'Config Version',
    plainLabel: 'Config Version',
    meaning: 'Configuration version deployed to machines in the cohort.',
    whyItMatters: 'Version mixing can explain regressions and drift.',
    goodLooksLike: 'Expected version distribution with minimal unintended mixing.'
  },
  {
    term: 'Multi-Signal Regression',
    plainLabel: 'Multi-Signal Regression',
    meaning: 'Regression where more than one metric exceeds threshold at the same time.',
    whyItMatters: 'Usually indicates broader instability rather than a single noisy metric.',
    goodLooksLike: 'Rare occurrence; when present, triaged quickly with scoped blast radius.'
  },
  {
    term: 'Normalize to Baseline',
    plainLabel: 'Normalize to Baseline',
    meaning: 'Trend mode that displays each cohort as deviation from baseline instead of absolute value.',
    whyItMatters: 'Makes drift and divergence patterns easier to detect.',
    goodLooksLike: 'Small, stable deviation lines near zero for healthy cohorts.'
  },
  {
    term: 'Experimental Cohort',
    plainLabel: 'Experimental Cohort',
    meaning: 'Cohort intentionally running new models, policies, thresholds, or adapters.',
    whyItMatters: 'Enables fast iteration with controlled exposure.',
    goodLooksLike: 'Clear hypothesis, measurable outcome, and bounded risk.'
  },
  {
    term: 'Canary Cohort',
    plainLabel: 'Canary Cohort',
    meaning: 'Small rollout cohort used for early regression detection before broad promotion.',
    whyItMatters: 'Limits blast radius while validating safety.',
    goodLooksLike: 'Canary remains close to baseline before promotion to wider cohorts.'
  },
  {
    term: 'Stable Cohort',
    plainLabel: 'Stable Cohort',
    meaning: 'Primary production baseline cohort.',
    whyItMatters: 'Most comparisons and promotion decisions anchor to stable.',
    goodLooksLike: 'Consistent reliability and trust metrics with low variance.'
  },
  {
    term: 'Internal Cohort',
    plainLabel: 'Internal Cohort',
    meaning: 'Cohort reserved for internal testing, QA, and staging validation.',
    whyItMatters: 'Finds issues before they reach customer-facing cohorts.',
    goodLooksLike: 'Useful early signal without being mistaken for production truth.'
  },
  {
    term: 'Blast Radius',
    plainLabel: 'Blast Radius',
    meaning: 'Estimated number of machines impacted if a change is promoted.',
    whyItMatters: 'Supports safe rollout decisions and risk communication.',
    goodLooksLike: 'Progressive expansion with acceptable risk at each stage.'
  },
  {
    term: 'Cohort Drift',
    plainLabel: 'Cohort Drift',
    meaning: 'Unexpected version or behavior divergence inside a cohort.',
    whyItMatters: 'Drift makes comparisons unreliable and can hide true regression causes.',
    goodLooksLike: 'Minimal unplanned drift and fast correction when detected.'
  },
  {
    term: 'Performance Regression Score',
    plainLabel: 'Performance Regression Score',
    meaning: 'Composite score describing deviation from expected baseline performance.',
    whyItMatters: 'Summarizes multi-metric behavior into one decision-oriented signal.',
    goodLooksLike: 'Stable score with no sustained upward drift in candidate cohorts.'
  }
];

export function getGlossaryTerms(pathname: string): GlossaryTerm[] {
  if (pathname === '/cohorts') {
    return cohortGlossaryTerms;
  }
  return fleetGlossaryTerms;
}

