import { describe, expect, it } from 'vitest';
import type { GrowthCohortRow, GrowthUserJourney } from '../api/growth';
import { accountsActiveOnDay, aggregateRetention, cohortCellState } from './growthTruth';

// Frozen "now": 2026-06-12 12:00 UTC — matches the fleet observed on that day.
const NOW = Date.parse('2026-06-12T12:00:00.000Z');

function cohort(date: string, windows: GrowthCohortRow['windows'], registered = 1): GrowthCohortRow {
  return { cohortDate: date, registeredUsers: registered, activatedUsers: registered, windows };
}

function win(day: number, retained: number, eligible: number): GrowthCohortRow['windows'][number] {
  return {
    day,
    eligibleUsers: eligible,
    retainedUsers: retained,
    retentionRatePct: eligible > 0 ? (retained / eligible) * 100 : null,
    churnedUsers: eligible - retained,
    churnRatePct: eligible > 0 ? ((eligible - retained) / eligible) * 100 : null
  };
}

describe('cohortCellState', () => {
  it('distinguishes pending (immature) from nodata (matured, server silent)', () => {
    // The real 2026-05-24 cohort: D7 present, D1 missing — D1 matured long ago,
    // so the missing window is a data gap, not an immature window.
    const row = cohort('2026-05-24', [win(7, 0, 1)]);
    expect(cohortCellState(row, 1, NOW)).toEqual({ kind: 'nodata' });
    expect(cohortCellState(row, 7, NOW)).toEqual({ kind: 'value', pct: 0, retained: 0, eligible: 1 });
    // D30 for a 2026-06-02 cohort has not arrived by 2026-06-12.
    expect(cohortCellState(cohort('2026-06-02', []), 30, NOW)).toEqual({ kind: 'pending' });
  });
});

describe('aggregateRetention', () => {
  // The observed fleet: 4 cohorts of 1 user each.
  const rows = [
    cohort('2026-05-17', [win(1, 1, 1), win(7, 1, 1)]),
    cohort('2026-05-24', [win(7, 0, 1)]), // D1 missing — matured, no data
    cohort('2026-05-25', [win(1, 1, 1), win(7, 1, 1)]),
    cohort('2026-06-02', [win(1, 1, 1), win(7, 0, 1)])
  ];

  it('produces denominators and flags users with missing windows', () => {
    const d1 = aggregateRetention(rows, 1, NOW);
    expect(d1.retained).toBe(3);
    expect(d1.eligible).toBe(3);
    expect(d1.pct).toBe(100);
    expect(d1.missingUsers).toBe(1); // the 05-24 user — NOT silently "100% all returned"

    const d7 = aggregateRetention(rows, 7, NOW);
    expect(d7.retained).toBe(2);
    expect(d7.eligible).toBe(4);
    expect(d7.pct).toBe(50);
    expect(d7.missingUsers).toBe(0);
  });

  it('reports pending users instead of fabricating a percentage', () => {
    const d30 = aggregateRetention(rows, 30, NOW);
    // Only 05-17's D30 window (16 Jun > 12 Jun? no — 17 May + 30d = 16 Jun, pending)
    expect(d30.pct).toBeNull();
    expect(d30.pendingUsers + d30.missingUsers).toBe(4);
  });
});

describe('accountsActiveOnDay', () => {
  it('matches journeys by UTC day key', () => {
    const journey = (id: string, days: string[]): GrowthUserJourney => ({
      accountId: id,
      userId: id,
      source: 'registered' as GrowthUserJourney['source'],
      events: [],
      activeDays: days
    });
    const journeys = [
      journey('a', ['2026-06-11', '2026-06-12']),
      journey('b', ['2026-06-10'])
    ];
    expect(accountsActiveOnDay(journeys, '2026-06-12').map((j) => j.accountId)).toEqual(['a']);
    expect(accountsActiveOnDay(journeys, '2026-06-09')).toHaveLength(0);
  });
});
