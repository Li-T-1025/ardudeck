import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/i18n/index.js', () => ({ t: (k: string) => k }));

import { cancelProposalsFor, getPendingProposal, proposeFence } from '../module-proposal-registry';

const existing = { inclusionShapes: 0, inclusionPoints: 0, exclusionShapes: 0, hasReturnPoint: false };
const ring = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }];

describe('proposal registry with exclusions', () => {
  it('accepts an exclusion-only proposal', async () => {
    const p = proposeFence('com.x', 'X', { name: 'Obstacles', exclusions: [{ name: 'a', points: ring }], reason: 'r' }, existing);
    const pending = getPendingProposal();
    expect(pending?.kind === 'fence' ? pending.proposal.exclusions?.length : 0).toBe(1);
    cancelProposalsFor('com.x');
    expect((await p).accepted).toBe(false);
  });

  it('refuses a proposal with neither inclusion nor exclusions', async () => {
    const r = await proposeFence('com.x', 'X', { name: 'Empty', reason: 'r' }, existing);
    expect(r.accepted).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('still accepts a plain inclusion proposal', async () => {
    const p = proposeFence('com.x', 'X', { name: 'Box', inclusion: ring, reason: 'r' }, existing);
    const pendingBox = getPendingProposal();
    expect(pendingBox?.kind === 'fence' ? pendingBox.proposal.inclusion?.length : 0).toBe(3);
    cancelProposalsFor('com.x');
    expect((await p).accepted).toBe(false);
  });
});
