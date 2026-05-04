import { describe, expect, it } from 'vitest';
import type { MachineActionEvent } from '../api/actions';
import { reduceActionEventsToRecords } from './useActionsLayer';

function buildSuggestionEvent(overrides: Partial<MachineActionEvent>): MachineActionEvent {
  return {
    machineId: 'DESKTOP-0MMJH0I',
    userName: 'yadin',
    displayName: 'Yadin',
    primaryEmail: 'yadin@example.com',
    orgName: 'Yadin Workspace',
    role: 'Owner',
    interventionId: 'same-intervention',
    action: 'break_suggestion',
    actionCategory: 'suggestion',
    decisionState: 'decided',
    executionState: 'applied',
    verifiedState: 'not_applicable',
    timestampUtc: '2026-03-24T14:42:25.000Z',
    appliedAtUtc: '2026-03-24T14:42:32.390Z',
    errorCode: null,
    policyId: 'overload-relief-v1',
    whatChanged: 'Long break suggestion shown',
    howToUndo: 'Dismiss toast',
    ...overrides
  };
}

describe('reduceActionEventsToRecords', () => {
  it('collapses activated and deactivated suggestion rows for the same intervention', () => {
    const machineNameById = new Map([['DESKTOP-0MMJH0I', 'DESKTOP-0MMJH0I']]);
    const records = reduceActionEventsToRecords(
      [
        buildSuggestionEvent({
          timestampUtc: '2026-03-24T14:42:25.000Z'
        }),
        buildSuggestionEvent({
          timestampUtc: '2026-03-24T14:42:55.000Z',
          whatChanged: 'Long break suggestion deactivated'
        })
      ],
      machineNameById
    );

    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record?.actionName).toBe('Long break');
    expect(record?.result).toBe('Done');
    expect(record?.timeUtc).toBe('2026-03-24T14:42:32.390Z');
  });

  it('keeps separate interventions as separate records', () => {
    const machineNameById = new Map([['DESKTOP-0MMJH0I', 'DESKTOP-0MMJH0I']]);
    const records = reduceActionEventsToRecords(
      [
        buildSuggestionEvent({
          interventionId: 'first',
          timestampUtc: '2026-03-24T14:42:25.000Z'
        }),
        buildSuggestionEvent({
          interventionId: 'second',
          timestampUtc: '2026-03-24T15:01:10.000Z',
          appliedAtUtc: '2026-03-24T15:01:21.931Z'
        })
      ],
      machineNameById
    );

    expect(records).toHaveLength(2);
  });

  it('collapses multiple overlay_completed rows for the same intervention into one Done record', () => {
    const machineNameById = new Map([['DESKTOP-0MMJH0I', 'DESKTOP-0MMJH0I']]);
    const records = reduceActionEventsToRecords(
      [
        buildSuggestionEvent({ action: 'long_break', executionState: 'overlay_completed', timestampUtc: '2026-03-24T14:47:35.000Z' }),
        buildSuggestionEvent({ action: 'long_break', executionState: 'overlay_completed', timestampUtc: '2026-03-24T14:48:00.000Z' })
      ],
      machineNameById
    );

    expect(records).toHaveLength(1);
    expect(records[0]?.result).toBe('Done');
    expect(records[0]?.actionName).toBe('Long break');
  });

  it('maps overlay_aborted to Interrupted and collapses duplicate rows', () => {
    const machineNameById = new Map([['DESKTOP-0MMJH0I', 'DESKTOP-0MMJH0I']]);
    const records = reduceActionEventsToRecords(
      [
        buildSuggestionEvent({ action: 'short_break', executionState: 'overlay_aborted', timestampUtc: '2026-03-24T14:44:00.000Z' }),
        buildSuggestionEvent({ action: 'short_break', executionState: 'overlay_aborted', timestampUtc: '2026-03-24T14:44:05.000Z' })
      ],
      machineNameById
    );

    expect(records).toHaveLength(1);
    expect(records[0]?.result).toBe('Interrupted');
    expect(records[0]?.actionName).toBe('Short break');
  });

  it('resolves canonical short_break and long_break action names in operator view', () => {
    const machineNameById = new Map([['DESKTOP-0MMJH0I', 'DESKTOP-0MMJH0I']]);
    const records = reduceActionEventsToRecords(
      [
        buildSuggestionEvent({ action: 'long_break', executionState: 'overlay_completed', interventionId: 'long-1', timestampUtc: '2026-03-24T14:47:00.000Z' }),
        buildSuggestionEvent({ action: 'short_break', executionState: 'overlay_completed', interventionId: 'short-1', timestampUtc: '2026-03-24T15:02:00.000Z' })
      ],
      machineNameById
    );

    expect(records).toHaveLength(2);
    const names = records.map((r) => r.actionName).sort();
    expect(names).toEqual(['Long break', 'Short break']);
  });

  it('keeps break overlay lifecycle rows separate and maps their operator results', () => {
    const machineNameById = new Map([['DESKTOP-0MMJH0I', 'DESKTOP-0MMJH0I']]);
    const records = reduceActionEventsToRecords(
      [
        buildSuggestionEvent({
          executionState: 'overlay_started',
          timestampUtc: '2026-03-24T14:42:25.000Z'
        }),
        buildSuggestionEvent({
          executionState: 'accepted',
          timestampUtc: '2026-03-24T14:42:35.000Z'
        }),
        buildSuggestionEvent({
          executionState: 'overlay_completed',
          timestampUtc: '2026-03-24T14:47:35.000Z'
        })
      ],
      machineNameById
    );

    expect(records).toHaveLength(3);
    expect(records.map((record) => record.result)).toEqual(['Done', 'Accepted', 'Started']);
  });
});
