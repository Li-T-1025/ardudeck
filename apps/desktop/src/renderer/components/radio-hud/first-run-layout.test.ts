// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { firstRunLayout } from './RadioHudView';

describe('firstRunLayout', () => {
  const ids = (cls: Parameters<typeof firstRunLayout>[0]) => firstRunLayout(cls).map((t) => t.id);

  it('starts a plane and a VTOL on the plane set', () => {
    expect(ids('plane')).toContain('wind');
    expect(ids('vtol')).toEqual(ids('plane'));
  });

  it('starts a rover on the rover set and a sub on the sub set', () => {
    expect(ids('rover')).toContain('thr');
    expect(ids('sub')).toEqual(['alt', 'compass', 'att', 'batt', 'timer']);
  });

  it('keeps the classic layout for a copter', () => {
    expect(ids('copter')).not.toEqual(ids('plane'));
  });
});
