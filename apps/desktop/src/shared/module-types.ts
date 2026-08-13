/**
 * Module Manager shared types
 * Used by main process (module-manager, IPC) and renderer (store, view)
 */

/** A module installed on this device */
export interface InstalledModule {
  slug: string;
  name: string;
  version: string;
  installedAt: string; // ISO 8601
  licenseKey: string;
  licenseType: 'perpetual' | 'subscription' | 'trial';
  bundleName: string | null; // null if single-module license
  installPath?: string; // filesystem path where bundle was extracted (installable only)
  manifestVersion?: number; // schema version from module.json
  activatable?: boolean; // built-in feature enabled by license, no bundle downloaded
  /** User toggle: false = keep installed but don't load. Absent means enabled. */
  enabled?: boolean;
}

/** License key payload (decoded from key, verified with Ed25519) */
export interface LicensePayload {
  product: string;
  email: string;
  type: 'perpetual' | 'subscription' | 'trial';
  maxDevices: number;
  expiresAt?: string;
  maxVersion?: string;
  issuedAt: string;
}

/** Progress event pushed from main to renderer during activation */
export interface ModuleProgress {
  stage: 'validating' | 'activating' | 'downloading' | 'verifying' | 'complete' | 'error';
  message: string;
  percent?: number;
}

/** API response types (mirror Hangar API) */
export interface ActivateResponse {
  ok: boolean;
  modules: string[];
  bundle: string | null;
  // Subset of `modules` whose code already ships in the app - enable in place
  // instead of downloading a bundle.
  activatable?: string[];
  error?: string;
}

export interface HeartbeatResponse {
  valid: boolean;
  revoked?: boolean;
}

/**
 * A public, published cargo as returned by the Hangar `GET /public/cargos`
 * endpoint. Only free, public cargos appear here; private and versionless
 * ones are filtered out by the server.
 */
export interface PublicCargo {
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  iconUrl: string | null;
  deliveryType: 'installable' | 'activatable';
  version: string | null;
  downloads: number;
}

/**
 * One block of a cargo's marketing preview, as authored in the Hangar and
 * returned by `GET /public/catalog/:slug`. Mirrors the `PreviewBlock` union in
 * the marketplace's `@ardudeck/shared` package
 * (ardudeck-marketplace/packages/shared/src/catalog.ts); the desktop cannot
 * import that package, so the shapes are kept in sync by hand.
 */
export type CargoPreviewBlock =
  | { type: 'hero'; headline: string; subtitle?: string }
  | { type: 'screenshots'; images: { url: string; alt?: string }[] }
  | { type: 'features'; items: { title: string; description?: string }[] }
  | { type: 'stats'; title?: string; tiles: { value: string; label: string }[] }
  | {
      type: 'conversation';
      title?: string;
      messages: { role: 'user' | 'assistant'; text: string }[];
      footer?: string;
    };

/** The ordered marketing blocks for a cargo. */
export interface CargoPreview {
  blocks: CargoPreviewBlock[];
}

/** One published version of a cargo, as returned in the detail payload. */
export interface CargoVersionSummary {
  id: string;
  version: string;
  changelog: string | null;
  bundleSize: number | null;
  minAppVersion: string | null;
  createdAt: string; // ISO 8601
}

/**
 * The full detail for a single cargo, returned by the Hangar
 * `GET /public/catalog/:slug` endpoint (no auth). Mirrors the marketplace's
 * `ModuleDetail` shape and carries the marketing `preview` blocks plus the full
 * (untruncated) description that the browse card only shows two lines of.
 */
export interface CargoDetail {
  slug: string;
  name: string;
  description: string | null;
  authorName: string;
  category: string | null;
  iconUrl: string | null;
  deliveryType: 'installable' | 'activatable';
  downloads: number;
  latestVersion: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  preview: CargoPreview | null;
  versions: CargoVersionSummary[];
}

export interface UpdateAvailable {
  slug: string;
  name: string;
  currentVersion: string;
  latestVersion: string;
  changelog: string | null;
  bundleSize: number;
}

export interface CheckUpdatesResponse {
  updates: UpdateAvailable[];
}
