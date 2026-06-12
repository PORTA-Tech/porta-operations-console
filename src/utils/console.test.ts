import { describe, expect, it } from 'vitest';
import { getLastSevenUtcDays } from './console';

describe('getLastSevenUtcDays', () => {
  // 2026-06-12 is a Friday. 20:59 in Asia/Dubai (UTC+4) = 16:59 UTC same day.
  const fridayEveningDubai = Date.parse('2026-06-12T16:59:00.000Z');

  it('produces keys and labels from the same UTC calendar', () => {
    const days = getLastSevenUtcDays(fridayEveningDubai);

    expect(days).toHaveLength(7);
    expect(days.map((d) => d.key)).toEqual([
      '2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09',
      '2026-06-10', '2026-06-11', '2026-06-12'
    ]);
    expect(days.map((d) => d.label)).toEqual([
      'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Today'
    ]);
  });

  it('does not shift the today bucket around UTC midnight', () => {
    // 03:00 in Dubai on the 13th = 23:00 UTC on the 12th. The bucket must
    // match the SAMPLE timezone (UTC), so "today" is still the 12th.
    const justBeforeUtcMidnight = Date.parse('2026-06-12T23:00:00.000Z');
    const days = getLastSevenUtcDays(justBeforeUtcMidnight);
    expect(days[6]?.key).toBe('2026-06-12');

    const justAfterUtcMidnight = Date.parse('2026-06-13T00:05:00.000Z');
    expect(getLastSevenUtcDays(justAfterUtcMidnight)[6]?.key).toBe('2026-06-13');
  });
});
