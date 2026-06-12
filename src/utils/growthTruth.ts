import type { GrowthCohortRow, GrowthUserJourney } from '../api/growth';

const DAY_MS = 86_400_000;

// A cohort cell has three honest states. The old table rendered the first two
// identically as "n/a", which made "server sent no data" indistinguishable
// from "window hasn't arrived yet" (e.g. a cohort with D1 missing but D7
// present — impossible if n/a only meant immaturity).
export type CohortCellState =
  | { kind: 'pending' }
  | { kind: 'nodata' }
  | { kind: 'value'; pct: number; retained: number; eligible: number };

export function cohortCellState(row: GrowthCohortRow, day: number, now: number = Date.now()): CohortCellState {
  const matured = Date.parse(row.cohortDate) + day * DAY_MS <= now;
  const w = row.windows.find((x) => x.day === day);
  if (w && w.retentionRatePct != null) {
    return { kind: 'value', pct: w.retentionRatePct, retained: w.retainedUsers, eligible: w.eligibleUsers };
  }
  return matured ? { kind: 'nodata' } : { kind: 'pending' };
}

export interface RetentionAggregate {
  day: number;
  retained: number;
  eligible: number;
  pct: number | null;
  /** Registered users in matured cohorts the server returned no data for. */
  missingUsers: number;
  /** Registered users whose window has not matured yet. */
  pendingUsers: number;
}

/**
 * Fleet-wide retention derived from cohort windows, with real denominators.
 * The summary endpoint's single percentage hides both the denominator and the
 * users excluded for missing data — at fleet sizes like 4 users that's the
 * difference between "100% retained" and "3 of 3, plus 1 unknown".
 */
export function aggregateRetention(rows: GrowthCohortRow[], day: number, now: number = Date.now()): RetentionAggregate {
  let retained = 0;
  let eligible = 0;
  let missingUsers = 0;
  let pendingUsers = 0;
  rows.forEach((row) => {
    const cell = cohortCellState(row, day, now);
    if (cell.kind === 'value') {
      retained += cell.retained;
      eligible += cell.eligible;
    } else if (cell.kind === 'nodata') {
      missingUsers += row.registeredUsers;
    } else {
      pendingUsers += row.registeredUsers;
    }
  });
  return {
    day,
    retained,
    eligible,
    pct: eligible > 0 ? (retained / eligible) * 100 : null,
    missingUsers,
    pendingUsers
  };
}

/** Accounts whose journey shows activity on the given UTC day (YYYY-MM-DD). */
export function accountsActiveOnDay(journeys: GrowthUserJourney[], dayKey: string): GrowthUserJourney[] {
  return journeys.filter((j) => j.activeDays.some((d) => d.slice(0, 10) === dayKey));
}
