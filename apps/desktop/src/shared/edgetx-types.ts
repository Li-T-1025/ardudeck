/** Shared types for the EdgeTX radio SD-card package feature. */

export interface EdgeTxSdCard {
  volumePath: string;
  volumeName: string;
  sdCardVersion: string | null;
  freeBytes: number;
  hasWidgets: boolean;
}

export interface RadioVariant {
  id: string;
  label: string;
  radios: string;
}

/** Catalog entry as exposed to the renderer (no mapping internals). */
export interface EdgeTxPackageInfo {
  id: string;
  name: string;
  description: string;
  homepage: string;
  license: string;
  variants: RadioVariant[];
}

export interface InstalledPackageRecord {
  version: string;
  variantId: string;
  installedAt: string;
  files: string[];
}

export interface InstallProgress {
  phase: 'resolve' | 'download' | 'extract' | 'copy' | 'done';
  percent: number;
  detail?: string;
}

export interface EdgeTxScanResult {
  cards: EdgeTxSdCard[];
  catalog: EdgeTxPackageInfo[];
  /** Installed records per volumePath, keyed by package id */
  installed: Record<string, Record<string, InstalledPackageRecord>>;
}
