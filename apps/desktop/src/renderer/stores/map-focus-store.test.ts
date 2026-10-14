import { describe, it, expect } from 'vitest';
import { useMapFocusStore } from './map-focus-store';
import { useNavigationStore } from './navigation-store';

describe('show on map', () => {
  it('opens the telemetry map from a screen without one', () => {
    useNavigationStore.getState().setView('settings');
    useMapFocusStore.getState().centerOn(47.5, 9.7, 16);
    expect(useNavigationStore.getState().currentView).toBe('telemetry');
    expect(useMapFocusStore.getState().request).toMatchObject({ lat: 47.5, lon: 9.7, zoom: 16 });
  });

  it('leaves the planner where it is', () => {
    useNavigationStore.getState().setView('mission');
    useMapFocusStore.getState().centerOn(47.5, 9.7);
    expect(useNavigationStore.getState().currentView).toBe('mission');
  });
});
