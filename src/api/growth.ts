import { apiRequestRaw } from './client';
import type { components } from './generated/controlPlane';

export type GrowthSeriesMetric = components['schemas']['GrowthSeriesMetric'];
// installs is served by the control plane but not yet in the generated contract.
export type ConsoleSeriesMetric = GrowthSeriesMetric | 'installs';
export type GrowthSeriesInterval = components['schemas']['GrowthSeriesInterval'];
export type GrowthUserJourneyEventType = components['schemas']['GrowthUserJourneyEventType'];

type GrowthSummaryResponse = components['schemas']['GrowthSummary'];
type GrowthSeriesResponse = components['schemas']['GrowthSeries'];
type GrowthSeriesPointResponse = components['schemas']['GrowthSeriesPoint'];
type GrowthCohortsResponse = components['schemas']['GrowthCohorts'];
type GrowthCohortRowResponse = components['schemas']['GrowthCohortRow'];
type GrowthCohortWindowResponse = components['schemas']['GrowthCohortWindow'];
type GrowthUserJourneyResponse = components['schemas']['GrowthUserJourney'];
type GrowthUserJourneyEventResponse = components['schemas']['GrowthUserJourneyEvent'];

export interface GrowthSummary {
  timezone: string;
  generatedAtUtc: string;
  windowStartUtc: string;
  windowEndUtc: string;
  totalRegisteredUsers: number;
  newRegisteredUsers: number;
  activatedUsers: number;
  activationRatePct: number | null;
  retentionRateD1Pct: number | null;
  retentionRateD7Pct: number | null;
  retentionRateD30Pct: number | null;
  churnRateD1Pct: number | null;
  churnRateD7Pct: number | null;
  churnRateD30Pct: number | null;
  // Install-funnel fields (additive on the control plane; absent on older deploys).
  totalInstalls: number | null;
  reportingMachines48h: number | null;
  linkedMachines: number | null;
  unlinkedMachines: number | null;
  installToRegistrationRatePct: number | null;
}

export interface GrowthSeriesPoint {
  bucketStartUtc: string;
  bucketEndUtc: string;
  value: number;
}

export interface GrowthSeries {
  metric: GrowthSeriesMetric;
  interval: GrowthSeriesInterval;
  timezone: string;
  points: GrowthSeriesPoint[];
}

export interface GrowthCohortWindow {
  day: number;
  eligibleUsers: number;
  retainedUsers: number;
  retentionRatePct: number | null;
  churnedUsers: number;
  churnRatePct: number | null;
}

export interface GrowthCohortRow {
  cohortDate: string;
  registeredUsers: number;
  activatedUsers: number;
  windows: GrowthCohortWindow[];
}

export interface GrowthCohorts {
  timezone: string;
  rows: GrowthCohortRow[];
}

export interface GrowthUserJourneyEvent {
  eventType: GrowthUserJourneyEventType;
  occurredAtUtc: string;
  activityDate?: string | null;
  deviceId?: string | null;
  orgId?: string | null;
  machineId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface GrowthUserJourney {
  accountId: string;
  userId: string;
  source: components['schemas']['GrowthUserSource'];
  registrationAtUtc?: string | null;
  activationAtUtc?: string | null;
  events: GrowthUserJourneyEvent[];
  activeDays: string[];
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    search.set(key, String(value));
  }

  const encoded = search.toString();
  return encoded.length > 0 ? `?${encoded}` : '';
}

function normalizeSummary(response: GrowthSummaryResponse): GrowthSummary {
  const funnel = response as unknown as {
    total_installs?: number | null;
    reporting_machines_48h?: number | null;
    linked_machines?: number | null;
    unlinked_machines?: number | null;
    install_to_registration_rate_pct?: number | null;
  };
  return {
    timezone: response.timezone,
    generatedAtUtc: response.generated_at_utc,
    windowStartUtc: response.window_start_utc,
    windowEndUtc: response.window_end_utc,
    totalRegisteredUsers: response.total_registered_users,
    newRegisteredUsers: response.new_registered_users,
    activatedUsers: response.activated_users,
    activationRatePct: response.activation_rate_pct,
    retentionRateD1Pct: response.retention_rate_d1_pct,
    retentionRateD7Pct: response.retention_rate_d7_pct,
    retentionRateD30Pct: response.retention_rate_d30_pct,
    churnRateD1Pct: response.churn_rate_d1_pct,
    churnRateD7Pct: response.churn_rate_d7_pct,
    churnRateD30Pct: response.churn_rate_d30_pct,
    totalInstalls: funnel.total_installs ?? null,
    reportingMachines48h: funnel.reporting_machines_48h ?? null,
    linkedMachines: funnel.linked_machines ?? null,
    unlinkedMachines: funnel.unlinked_machines ?? null,
    installToRegistrationRatePct: funnel.install_to_registration_rate_pct ?? null
  };
}

function normalizeSeriesPoint(response: GrowthSeriesPointResponse): GrowthSeriesPoint {
  return {
    bucketStartUtc: response.bucket_start_utc,
    bucketEndUtc: response.bucket_end_utc,
    value: response.value
  };
}

function normalizeSeries(response: GrowthSeriesResponse): GrowthSeries {
  return {
    metric: response.metric,
    interval: response.interval,
    timezone: response.timezone,
    points: response.points.map(normalizeSeriesPoint)
  };
}

function normalizeCohortWindow(response: GrowthCohortWindowResponse): GrowthCohortWindow {
  return {
    day: response.day,
    eligibleUsers: response.eligible_users,
    retainedUsers: response.retained_users,
    retentionRatePct: response.retention_rate_pct,
    churnedUsers: response.churned_users,
    churnRatePct: response.churn_rate_pct
  };
}

function normalizeCohortRow(response: GrowthCohortRowResponse): GrowthCohortRow {
  return {
    cohortDate: response.cohort_date,
    registeredUsers: response.registered_users,
    activatedUsers: response.activated_users,
    windows: response.windows.map(normalizeCohortWindow)
  };
}

function normalizeCohorts(response: GrowthCohortsResponse): GrowthCohorts {
  return {
    timezone: response.timezone,
    rows: response.rows.map(normalizeCohortRow)
  };
}

function normalizeJourneyEvent(response: GrowthUserJourneyEventResponse): GrowthUserJourneyEvent {
  return {
    eventType: response.event_type,
    occurredAtUtc: response.occurred_at_utc,
    ...(response.activity_date !== undefined ? { activityDate: response.activity_date ?? null } : {}),
    ...(response.device_id !== undefined ? { deviceId: response.device_id ?? null } : {}),
    ...(response.org_id !== undefined ? { orgId: response.org_id ?? null } : {}),
    ...(response.machine_id !== undefined ? { machineId: response.machine_id ?? null } : {}),
    ...(response.metadata ? { metadata: response.metadata } : {})
  };
}

function normalizeJourney(response: GrowthUserJourneyResponse): GrowthUserJourney {
  return {
    accountId: response.account_id,
    userId: response.user_id,
    source: response.source,
    ...(response.registration_at_utc !== undefined ? { registrationAtUtc: response.registration_at_utc ?? null } : {}),
    ...(response.activation_at_utc !== undefined ? { activationAtUtc: response.activation_at_utc ?? null } : {}),
    events: response.events.map(normalizeJourneyEvent),
    activeDays: response.active_days
  };
}

export async function fetchGrowthSummary(windowDays = 30): Promise<GrowthSummary> {
  const response = await apiRequestRaw<GrowthSummaryResponse>({
    path: `/v1/growth/summary${buildQuery({ window_days: windowDays })}`,
    method: 'get'
  });

  return normalizeSummary(response);
}

export async function fetchGrowthSeries(input: {
  metric: ConsoleSeriesMetric;
  interval?: GrowthSeriesInterval;
  from?: string;
  to?: string;
}): Promise<GrowthSeries> {
  const response = await apiRequestRaw<GrowthSeriesResponse>({
    path: `/v1/growth/series${buildQuery({
      metric: input.metric,
      interval: input.interval,
      from: input.from,
      to: input.to
    })}`,
    method: 'get'
  });

  return normalizeSeries(response);
}

export async function fetchGrowthCohorts(input: {
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<GrowthCohorts> {
  const response = await apiRequestRaw<GrowthCohortsResponse>({
    path: `/v1/growth/cohorts${buildQuery({
      from: input.from,
      to: input.to,
      limit: input.limit
    })}`,
    method: 'get'
  });

  return normalizeCohorts(response);
}

export async function fetchGrowthUserJourney(accountId: string): Promise<GrowthUserJourney> {
  const response = await apiRequestRaw<GrowthUserJourneyResponse>({
    path: `/v1/growth/users/${encodeURIComponent(accountId)}/journey`,
    method: 'get'
  });

  return normalizeJourney(response);
}
