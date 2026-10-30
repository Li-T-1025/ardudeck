import { create } from 'zustand';
import { useSettingsStore } from './settings-store';

/* Keyed by release so a later dedication shows again without clearing this one. */
const RELEASE = '0.1.2';
const SEEN_KEY = `ardudeck.tribute.seen.${RELEASE}`;
const ENGAGED_KEY = `ardudeck.tribute.engaged.${RELEASE}`;

export const WARP_MS = 2800;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // A blocked store must not keep the banner up forever.
  }
}

function readEngagedBefore(): boolean {
  try {
    return localStorage.getItem(ENGAGED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeEngagedBefore(): void {
  try {
    localStorage.setItem(ENGAGED_KEY, '1');
  } catch {
    // Harmless: the button reads Engage again next launch.
  }
}

function writeSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Harmless: the banner reappears next launch.
  }
}

interface TributeState {
  bannerOpen: boolean;
  warping: boolean;
  momentOpen: boolean;
  engagedBefore: boolean;

  openBanner: () => void;
  dismissBanner: () => void;
  engage: () => void;
  endWarp: () => void;
  openMoment: () => void;
  closeMoment: () => void;
}

export const useTributeStore = create<TributeState>((set, get) => ({
  bannerOpen: !readSeen(),
  warping: false,
  momentOpen: false,
  engagedBefore: readEngagedBefore(),

  openBanner: () => set({ bannerOpen: true }),

  dismissBanner: () => {
    writeSeen();
    set({ bannerOpen: false });
  },

  engage: () => {
    writeSeen();
    writeEngagedBefore();
    if (prefersReducedMotion()) {
      useSettingsStore.getState().setTheme('bridge');
      set({ bannerOpen: false, engagedBefore: true });
      return;
    }
    // The banner leaves as the warp starts, so the bridge appears without it.
    set({ warping: true, engagedBefore: true, bannerOpen: false });
    // The theme lands with the warp, so the switch is hidden by the streaks.
    setTimeout(() => get().endWarp(), WARP_MS);
  },

  endWarp: () => {
    if (!get().warping) return;
    useSettingsStore.getState().setTheme('bridge');
    set({ warping: false, bannerOpen: false });
  },

  openMoment: () => set({ momentOpen: true }),
  closeMoment: () => set({ momentOpen: false }),
}));
