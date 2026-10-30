import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFlightControlStore } from './flight-control-store';
import { useConnectionStore } from './connection-store';

describe('flight-control stopOverride', () => {
  let rcOverrideRelease: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rcOverrideRelease = vi.fn(async () => true);
    (globalThis as unknown as { window: unknown }).window = { electronAPI: { rcOverrideRelease } };
    useConnectionStore.setState((s) => ({ connectionState: { ...s.connectionState, protocol: 'mavlink' } }));
  });

  it('sends no release frame when no override is running', () => {
    useFlightControlStore.setState({ isOverrideActive: false, overrideInterval: null });
    useFlightControlStore.getState().stopOverride();
    expect(rcOverrideRelease).not.toHaveBeenCalled();
  });

  it('releases a running override and clears it', () => {
    const interval = setInterval(() => {}, 1000);
    useFlightControlStore.setState({ isOverrideActive: true, overrideInterval: interval });
    useFlightControlStore.getState().stopOverride();
    expect(rcOverrideRelease).toHaveBeenCalledTimes(1);
    expect(useFlightControlStore.getState().isOverrideActive).toBe(false);
    expect(useFlightControlStore.getState().overrideInterval).toBeNull();
  });
});
