import { describe, it, expect, beforeEach } from 'vitest';
import { initialMapHome, seedHome } from './map-home';
import { useMapHomeStore } from '../map/instruments/registry';
import { useMissionStore } from '../../stores/mission-store';
import { useTelemetryStore } from '../../stores/telemetry-store';

const armed = (on: boolean) => useTelemetryStore.setState((s) => ({ flight: { ...s.flight, armed: on } }));

beforeEach(() => {
  useMapHomeStore.getState().setHome(null);
  useMissionStore.setState({ homePosition: null });
  armed(false);
});

describe('telemetry map home across a view switch', () => {
  it('a remounted map starts from the home it had, not empty', () => {
    useMapHomeStore.getState().setHome([46.1, 7.2]);
    expect(initialMapHome()).toEqual([46.1, 7.2]);
  });

  it('never takes a planned home from elsewhere', () => {
    useMissionStore.setState({ homePosition: { lat: 46.1, lon: 7.2, alt: 0 } });
    expect(initialMapHome()).toBeNull();
  });

  it('in flight, the aircraft position never becomes home', () => {
    armed(true);
    expect(seedHome(null, [46.5, 7.5])).toBeNull();
  });

  it('on the ground, the first fix still sets home', () => {
    expect(seedHome(null, [46.5, 7.5])).toEqual([46.5, 7.5]);
    expect(seedHome([46.1, 7.2], [46.5, 7.5])).toEqual([46.1, 7.2]);
  });
});
