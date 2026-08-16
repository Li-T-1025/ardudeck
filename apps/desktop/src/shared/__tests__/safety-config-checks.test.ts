import { describe, it, expect } from 'vitest';
import { checkSafetyConfig } from '../safety-config-checks';

const SANE = { FS_EKF_ACTION: 1, FS_EKF_THRESH: 0.8, FENCE_ENABLE: 1, FENCE_ACTION: 2 };

describe('checkSafetyConfig', () => {
  it('says nothing when the aircraft is set up sensibly', () => {
    // The whole design depends on this: a card that always shows something
    // gets ignored, and an ignored safety card is worse than none.
    expect(checkSafetyConfig({ params: SANE })).toEqual([]);
  });

  it('flags a navigation failsafe that only reports', () => {
    const findings = checkSafetyConfig({ params: { ...SANE, FS_EKF_ACTION: 0 } });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warning');
    expect(findings[0]!.recommend).toEqual({ param: 'FS_EKF_ACTION', value: 1, label: 'Land when navigation fails' });
  });

  it('escalates that to critical when the compass is already weak', () => {
    // The combination that loses aircraft: a heading you cannot trust and
    // nothing set to act on it.
    const findings = checkSafetyConfig({
      params: { ...SANE, FS_EKF_ACTION: 0 },
      compassVerdict: 'marginal',
    });
    expect(findings[0]!.id).toBe('ekf-failsafe-report-only');
    expect(findings[0]!.severity).toBe('critical');
  });

  it('flags a disabled navigation quality check', () => {
    const findings = checkSafetyConfig({ params: { ...SANE, FS_EKF_THRESH: 0 } });
    expect(findings.map((f) => f.id)).toContain('ekf-threshold-disabled');
    expect(findings[0]!.severity).toBe('critical');
  });

  it('warns about flying home on a breach only when the compass is suspect', () => {
    const rtlFence = { ...SANE, FENCE_ACTION: 1 };
    expect(checkSafetyConfig({ params: rtlFence })).toEqual([]);
    const findings = checkSafetyConfig({ params: rtlFence, compassVerdict: 'bad' });
    expect(findings.map((f) => f.id)).toContain('fence-rtl-with-weak-compass');
  });

  it('does not nag about the fence when the fence is off', () => {
    const findings = checkSafetyConfig({
      params: { ...SANE, FENCE_ENABLE: 0, FENCE_ACTION: 1 },
      compassVerdict: 'bad',
    });
    expect(findings.map((f) => f.id)).not.toContain('fence-rtl-with-weak-compass');
  });

  it('puts a lost calibration above everything else', () => {
    const findings = checkSafetyConfig({
      params: { ...SANE, FS_EKF_ACTION: 0 },
      calibrationLost: true,
      calibrationLostType: 'compass',
      compassVerdict: 'marginal',
    });
    expect(findings[0]!.id).toBe('calibration-lost');
    expect(findings[0]!.title).toContain('compass');
  });

  it('mentions a weak compass once, not twice', () => {
    // It is already the reason the failsafe finding is critical; repeating it
    // as its own row is the kind of noise that trains people to close the card.
    const findings = checkSafetyConfig({
      params: { ...SANE, FS_EKF_ACTION: 0 },
      compassVerdict: 'marginal',
    });
    expect(findings.filter((f) => f.id === 'compass-weak')).toHaveLength(0);
  });

  it('mentions a weak compass on its own when the rest is set up right', () => {
    const findings = checkSafetyConfig({ params: SANE, compassVerdict: 'marginal' });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('advisory');
  });

  it('checks nothing it cannot read', () => {
    // Params still downloading must not produce phantom findings.
    expect(checkSafetyConfig({ params: {} })).toEqual([]);
  });

  it('accepts a Map, which is how the parameter store holds values', () => {
    const params = new Map(Object.entries({ ...SANE, FS_EKF_ACTION: 0 }));
    expect(checkSafetyConfig({ params }).map((f) => f.id)).toContain('ekf-failsafe-report-only');
  });
});
