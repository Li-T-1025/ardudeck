import { describe, it, expect } from 'vitest';
import { isRestoreTargetMatch, isRestoreFirmwareMatch } from './fleet-repo-store';

const BOARD = '0102030405060708090a0b0c0d0e0f1011';
const OTHER = 'ffeeddccbbaa99887766554433221100ff';

describe('isRestoreTargetMatch', () => {
  it('allows restoring a snapshot onto the vehicle it came from', () => {
    expect(isRestoreTargetMatch(BOARD, null, BOARD, undefined)).toBe(true);
  });

  it('refuses another aircraft\'s snapshot', () => {
    // The vault history list is repo-wide: opening any commit loads its diff,
    // so this is the case that would otherwise push one aircraft's parameters
    // into whatever happens to be on the link.
    expect(isRestoreTargetMatch(OTHER, null, BOARD, undefined)).toBe(false);
  });

  it('matches through a unit alias, not just the folder id', () => {
    // A unit keeps aliases for board ids it has been known by (identity scheme
    // change, swapped FC). Naive uid equality would block a legitimate restore.
    expect(isRestoreTargetMatch(OTHER, null, BOARD, [BOARD])).toBe(true);
    expect(isRestoreTargetMatch(OTHER, null, BOARD, ['something-else'])).toBe(false);
  });

  it('lets an explicit "Working on" override decide', () => {
    // The user asserting "the connected vehicle IS unit X" is the deliberate
    // way to restore across identities, and it beats the detected board.
    expect(isRestoreTargetMatch(OTHER, OTHER, BOARD, undefined)).toBe(true);
    expect(isRestoreTargetMatch(BOARD, OTHER, BOARD, undefined)).toBe(false);
  });

  it('refuses when the vehicle cannot be identified at all', () => {
    // No board uid and no override: PX4 SITL currently lands here, as do boards
    // that report no uid in AUTOPILOT_VERSION.
    expect(isRestoreTargetMatch(BOARD, null, null, undefined)).toBe(false);
    expect(isRestoreTargetMatch(BOARD, null, null, [BOARD])).toBe(false);
  });
});

describe('isRestoreFirmwareMatch', () => {
  it('allows a restore within the same flight stack', () => {
    expect(isRestoreFirmwareMatch('ardupilot', 'ardupilot')).toBe(true);
    expect(isRestoreFirmwareMatch('px4', 'px4')).toBe(true);
  });

  it('refuses across stacks on the same board', () => {
    // The uid survives a reflash, so this is the same vault unit: the target
    // guard passes and only the stack stamp catches it.
    expect(isRestoreFirmwareMatch('ardupilot', 'px4')).toBe(false);
    expect(isRestoreFirmwareMatch('px4', 'ardupilot')).toBe(false);
  });

  it('allows when either side is unknown', () => {
    // Snapshots predating the Firmware stamp carry no stack; refusing them
    // would break every restore of older history.
    expect(isRestoreFirmwareMatch(undefined, 'px4')).toBe(true);
    expect(isRestoreFirmwareMatch('px4', undefined)).toBe(true);
    expect(isRestoreFirmwareMatch(undefined, undefined)).toBe(true);
  });
});
