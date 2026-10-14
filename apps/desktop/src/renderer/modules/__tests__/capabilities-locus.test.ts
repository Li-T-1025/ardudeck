import { describe, expect, it } from 'vitest';
import { CARGO_VIEWS, LOCUS_CARGO_SLUG, isViewAvailable, viewOwnerSlug } from '../capabilities';

describe('locus view', () => {
  it('is cargo-owned: unlocked by the locus permission, not by a gating slug', () => {
    expect(LOCUS_CARGO_SLUG).toBe('com.ardudeck.locus');
    expect(CARGO_VIEWS.locus).toBe('locus');
    expect(viewOwnerSlug('locus')).toBeUndefined();
    expect(isViewAvailable('locus', new Set())).toBe(true);
  });
});
