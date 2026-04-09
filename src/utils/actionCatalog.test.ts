import { describe, expect, it } from 'vitest';
import { resolveCatalogAction } from './actionCatalog';

describe('resolveCatalogAction', () => {
  it('maps legacy break action codes to canonical labels', () => {
    const longBreak = resolveCatalogAction({ actionCode: 'break_suggestion', commandType: null });
    const shortBreak = resolveCatalogAction({ actionCode: 'stretch_break_suggestion', commandType: null });

    expect(longBreak?.actionName).toBe('Long break');
    expect(shortBreak?.actionName).toBe('Short break');
  });

  it('maps canonical break action codes to canonical labels', () => {
    const longBreak = resolveCatalogAction({ actionCode: 'long_break', commandType: null });
    const shortBreak = resolveCatalogAction({ actionCode: 'short_break', commandType: null });

    expect(longBreak?.actionName).toBe('Long break');
    expect(shortBreak?.actionName).toBe('Short break');
  });
});
