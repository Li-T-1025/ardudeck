/**
 * Sim Handover Endpoint
 *
 * A loopback-only HTTP endpoint that lets the ArduDeck Trainer game borrow this
 * app's flight controller and physics, so both can run at once without either
 * being restarted.
 *
 * Why it exists: ArduDeck launches SITL as `-MJSON:127.0.0.1`, meaning SITL asks
 * an EXTERNAL process for physics over UDP 9002, and ArduDeck spawns its own
 * engine to bind that port. The game links the same physics crate but must run
 * its own instance, because only the game knows the baked terrain heightfield
 * and the building / tree / wire contact forces it feeds in every step. Two
 * processes cannot share UDP 9002, so the game asks ArduDeck to let go of it.
 *
 * Four operations, nothing more. This is deliberately NOT the testing MCP
 * server: that one can screenshot, click, type and read any store, which is far
 * too much attack surface for an app that also talks to real aircraft.
 *
 * ─── Origin, and why a reboot is not enough ─────────────────────────────────
 * Measured against a live SITL, not inferred:
 *
 *   With `-O` on the command line (what ArduDeck always passes), setting
 *   SIM_OPOS_LAT/LNG/ALT/HDG and rebooting the FC does NOT move the origin.
 *   SITL reboots by re-exec'ing its own argv, so the original `-O` is applied
 *   again on every boot and outranks the parameters. Without `-O`, the exact
 *   same PARAM_SET plus reboot DOES move it. So SIM_OPOS is re-read at every
 *   boot, but `-O` wins.
 *
 * `/sim/origin` therefore writes the SIM_OPOS_* params (correct, and what any
 * `-O`-less launch would honour) AND relaunches SITL with a new `-O`, which is
 * the only thing that actually takes. The relaunch leaves the physics engine
 * alone whenever it has been released, so the game keeps UDP 9002 throughout.
 */

import http from 'node:http';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ardupilotSitlProcess } from '../sitl/ardupilot-sitl-process.js';
import { simEngineProcess } from './sim-engine-process.js';

export const SIM_HANDOVER_FILE = 'sim-handover.json';
export const SIM_HANDOVER_VERSION = 1;

/** Discovery file the game reads to find this endpoint. */
export interface SimHandoverDiscovery {
  port: number;
  pid: number;
  version: number;
}

export interface SimHandoverStatus {
  sitlRunning: boolean;
  engineRunning: boolean;
  /** The `-M` value SITL was launched with, e.g. "JSON" or "quad". */
  model: string | null;
  homeLat: number | null;
  homeLon: number | null;
  homeAlt: number | null;
  homeHdg: number | null;
  armed: boolean;
  canRelease: boolean;
  reason: string | null;
}

export interface SimOriginRequest {
  lat: number;
  lon: number;
  alt: number;
  hdg: number;
}

/**
 * Everything the endpoint needs from the rest of the main process, injected so
 * this module never reaches into the ipc-handlers module globals and stays unit
 * testable. Mirrors the existing FcAdapter seam.
 */
export interface SimHandoverDeps {
  isVehicleArmed(): boolean;
  setParam(paramId: string, value: number): Promise<boolean>;
  /** Re-establish ArduDeck's own MAVLink link and resolve once it is back. */
  reconnectVehicle(reason: string, timeoutSec: number): Promise<boolean>;
  /** Absolute path of the directory the discovery file is written to. */
  userDataPath: string;
  sitl?: SitlControl;
  engine?: EngineControl;
  log?(level: 'info' | 'warn' | 'error', message: string): void;
}

export interface SitlControl {
  readonly isRunning: boolean;
  readonly simModel: string | null;
  readonly currentConfig: { homeLocation: { lat: number; lng: number; alt: number; heading: number } } | null;
  setEngineManaged(managed: boolean): void;
  relaunchWithHome(home: { lat: number; lng: number; alt: number; heading: number }): Promise<{ success: boolean; error?: string }>;
}

export interface EngineControl {
  readonly isRunning: boolean;
  stop(): void;
  restartLast(): Promise<{ success: boolean; error?: string }>;
}

const OPOS_PARAMS = ['SIM_OPOS_LAT', 'SIM_OPOS_LNG', 'SIM_OPOS_ALT', 'SIM_OPOS_HDG'] as const;
const REBOOT_TIMEOUT_SEC = 45;
const MAX_BODY_BYTES = 4096;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validateOrigin(body: unknown): { ok: true; value: SimOriginRequest } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'body must be a JSON object' };
  const b = body as Record<string, unknown>;
  for (const k of ['lat', 'lon', 'alt', 'hdg']) {
    if (!isFiniteNumber(b[k])) return { ok: false, error: `${k} must be a finite number` };
  }
  const { lat, lon, alt, hdg } = b as unknown as SimOriginRequest;
  if (lat < -90 || lat > 90) return { ok: false, error: 'lat out of range (-90..90)' };
  if (lon < -180 || lon > 180) return { ok: false, error: 'lon out of range (-180..180)' };
  if (alt < -1000 || alt > 50000) return { ok: false, error: 'alt out of range (-1000..50000)' };
  if (hdg < 0 || hdg >= 360) return { ok: false, error: 'hdg out of range (0..360)' };
  return { ok: true, value: { lat, lon, alt, hdg } };
}

export class SimHandoverService {
  private readonly sitl: SitlControl;
  private readonly engine: EngineControl;

  constructor(private readonly deps: SimHandoverDeps) {
    this.sitl = deps.sitl ?? (ardupilotSitlProcess as unknown as SitlControl);
    this.engine = deps.engine ?? (simEngineProcess as unknown as EngineControl);
  }

  status(): SimHandoverStatus {
    const cfg = this.sitl.currentConfig;
    const home = cfg?.homeLocation ?? null;
    const armed = this.deps.isVehicleArmed();
    const sitlRunning = this.sitl.isRunning;
    const engineRunning = this.engine.isRunning;

    let reason: string | null = null;
    if (armed) reason = 'vehicle is armed';
    else if (!sitlRunning) reason = 'SITL is not running';
    else if (!engineRunning) reason = 'ArduDeck physics engine is not running (already released?)';

    return {
      sitlRunning,
      engineRunning,
      model: this.sitl.simModel,
      homeLat: home?.lat ?? null,
      homeLon: home?.lng ?? null,
      homeAlt: home?.alt ?? null,
      homeHdg: home?.heading ?? null,
      armed,
      canRelease: reason === null,
      reason,
    };
  }

  async setOrigin(req: SimOriginRequest): Promise<{ ok: boolean; error?: string }> {
    if (this.deps.isVehicleArmed()) {
      return { ok: false, error: 'refused: vehicle is armed, disarm before moving the simulated origin' };
    }
    if (!this.sitl.isRunning) return { ok: false, error: 'SITL is not running' };

    const values: Record<(typeof OPOS_PARAMS)[number], number> = {
      SIM_OPOS_LAT: req.lat,
      SIM_OPOS_LNG: req.lon,
      SIM_OPOS_ALT: req.alt,
      SIM_OPOS_HDG: req.hdg,
    };
    // Written first so the stored origin agrees with the `-O` the relaunch is
    // about to use. On its own this changes nothing while `-O` is present; it is
    // what an `-O`-less launch would honour, and it keeps the two in sync.
    for (const id of OPOS_PARAMS) {
      const ok = await this.deps.setParam(id, values[id]);
      if (!ok) return { ok: false, error: `failed to set ${id}` };
    }

    // The operative step. A relaunch is the only reboot that actually moves the
    // origin, and the engine is left untouched so a released UDP 9002 stays with
    // its external owner.
    const res = await this.sitl.relaunchWithHome({
      lat: req.lat,
      lng: req.lon,
      alt: req.alt,
      heading: req.hdg,
    });
    if (!res.success) return { ok: false, error: res.error ?? 'SITL relaunch failed' };

    const back = await this.deps.reconnectVehicle('sim handover: origin moved', REBOOT_TIMEOUT_SEC);
    if (!back) return { ok: false, error: 'flight controller did not come back within the timeout' };
    return { ok: true };
  }

  async release(): Promise<{ ok: boolean; error?: string }> {
    if (this.deps.isVehicleArmed()) {
      return { ok: false, error: 'refused: vehicle is armed, disarm before releasing the physics engine' };
    }
    // Mark the engine externally owned BEFORE stopping it, so nothing in the
    // SITL lifecycle can race in and respawn it onto UDP 9002.
    this.sitl.setEngineManaged(false);
    this.engine.stop();
    this.deps.log?.('info', 'sim handover: physics engine released to an external owner');
    return { ok: true };
  }

  async reclaim(): Promise<{ ok: boolean; error?: string }> {
    const res = await this.engine.restartLast();
    if (!res.success) {
      return { ok: false, error: res.error ?? 'could not restart the ArduDeck physics engine' };
    }
    this.sitl.setEngineManaged(true);
    this.deps.log?.('info', 'sim handover: physics engine reclaimed');
    return { ok: true };
  }
}

/** Reject anything that did not come from loopback, and anything a browser sent. */
export function requestIsLocal(req: {
  socket?: { remoteAddress?: string | undefined };
  headers: http.IncomingHttpHeaders;
}): boolean {
  const addr = req.socket?.remoteAddress ?? '';
  const loopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  if (!loopback) return false;
  // A same-origin fetch from a page cannot set Origin to nothing, so its
  // presence means a browser drove this. Blocks DNS-rebinding at zero cost.
  if (req.headers.origin) return false;
  return true;
}

export class SimHandoverServer {
  private server: http.Server | null = null;
  private service: SimHandoverService;
  private discoveryPath: string;
  private _port: number | null = null;

  constructor(private readonly deps: SimHandoverDeps) {
    this.service = new SimHandoverService(deps);
    this.discoveryPath = path.join(deps.userDataPath, SIM_HANDOVER_FILE);
  }

  get port(): number | null {
    return this._port;
  }

  async start(): Promise<number> {
    if (this.server) return this._port!;
    const server = http.createServer((req, res) => {
      void this.handle(req, res);
    });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      // Loopback only. Never 0.0.0.0: this endpoint can relaunch SITL.
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    const addr = server.address();
    this._port = typeof addr === 'object' && addr !== null ? addr.port : 0;

    const discovery: SimHandoverDiscovery = {
      port: this._port,
      pid: process.pid,
      version: SIM_HANDOVER_VERSION,
    };
    await writeFile(this.discoveryPath, JSON.stringify(discovery), 'utf-8');
    this.deps.log?.('info', `sim handover endpoint on 127.0.0.1:${this._port}`);
    return this._port;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this._port = null;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await unlink(this.discoveryPath).catch(() => {
      /* never written, or already gone */
    });
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const send = (code: number, body: unknown) => {
      const json = JSON.stringify(body);
      res.writeHead(code, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      res.end(json);
    };

    try {
      if (!requestIsLocal(req)) return send(403, { error: 'forbidden' });

      const url = req.url ?? '';
      const route = url.split('?')[0];

      if (req.method === 'GET' && route === '/sim/status') {
        return send(200, this.service.status());
      }

      if (req.method === 'POST' && route === '/sim/release') {
        return send(200, await this.service.release());
      }

      if (req.method === 'POST' && route === '/sim/reclaim') {
        return send(200, await this.service.reclaim());
      }

      if (req.method === 'POST' && route === '/sim/origin') {
        const raw = await readBody(req);
        if (raw === null) return send(413, { ok: false, error: 'body too large' });
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw || '{}');
        } catch {
          return send(400, { ok: false, error: 'invalid JSON body' });
        }
        const valid = validateOrigin(parsed);
        if (!valid.ok) return send(400, { ok: false, error: valid.error });
        return send(200, await this.service.setOrigin(valid.value));
      }

      return send(404, { error: 'not found' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.deps.log?.('error', `sim handover request failed: ${message}`);
      send(500, { ok: false, error: message });
    }
  }
}

function readBody(req: http.IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', () => resolve(null));
  });
}

let singleton: SimHandoverServer | null = null;

export async function startSimHandoverServer(deps: SimHandoverDeps): Promise<SimHandoverServer> {
  if (singleton) return singleton;
  const server = new SimHandoverServer(deps);
  await server.start();
  singleton = server;
  return server;
}

export async function stopSimHandoverServer(): Promise<void> {
  const server = singleton;
  singleton = null;
  if (server) await server.stop();
}
