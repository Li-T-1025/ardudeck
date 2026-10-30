// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

import { StickTestPanel } from './StickTestPanel';
import { useConnectionStore } from '../../../stores/connection-store';

const MAV_TYPE_QUADROTOR = 2;
const MAV_TYPE_FIXED_WING = 1;
const MAV_TYPE_GROUND_ROVER = 10;

describe('StickTestPanel', () => {
  let root: Root;
  let container: HTMLDivElement;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    api = {
      mavlinkArmDisarm: vi.fn(async () => true),
      rcOverrideRelease: vi.fn(async () => true),
      rcOverrideSet: vi.fn(async () => true),
      rcOverrideSetChannels: vi.fn(async () => true),
      mavlinkSetMode: vi.fn(async () => true),
    };
    (window as unknown as { electronAPI: unknown }).electronAPI = api;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    container.remove();
  });

  const mountAndLeave = (mavType: number) => {
    useConnectionStore.setState((s) => ({ connectionState: { ...s.connectionState, mavType } }));
    act(() => root.render(<StrictMode><StickTestPanel /></StrictMode>));
    act(() => root.unmount());
  };

  it.each([
    ['copter', MAV_TYPE_QUADROTOR],
    ['plane', MAV_TYPE_FIXED_WING],
    ['rover', MAV_TYPE_GROUND_ROVER],
  ])('opening and leaving the panel on a %s commands nothing', (_name, mavType) => {
    mountAndLeave(mavType);
    expect(api.mavlinkArmDisarm).not.toHaveBeenCalled();
    expect(api.rcOverrideRelease).not.toHaveBeenCalled();
    expect(api.mavlinkSetMode).not.toHaveBeenCalled();
  });
});
