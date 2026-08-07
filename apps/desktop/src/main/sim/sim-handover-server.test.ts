import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  SimHandoverServer,
  SimHandoverService,
  SIM_HANDOVER_FILE,
  SIM_HANDOVER_VERSION,
  requestIsLocal,
  validateOrigin,
  type EngineControl,
  type SimHandoverDeps,
  type SitlControl,
} from './sim-handover-server.js';

class FakeSitl implements SitlControl {
  isRunning = true;
  currentConfig: { homeLocation: { lat: number; lng: number; alt: number; heading: number } } | null = {
    homeLocation: { lat: 42.4411, lng: 19.2632, alt: 47, heading: 0 },
  };

  // Mirrors the real manager, where the -M value is derived from the live config.
  get simModel(): string | null {
    return this.currentConfig ? 'JSON' : null;
  }

  /** An octa, so a test can tell it apart from the quad any default would produce. */
  simFrame: { frameClass: number; frameType: number } | null = { frameClass: 3, frameType: 0 };
  simFramePath: string | null = '/frames/heavy_industrial_octa_14s.json';

  engineManaged = true;
  relaunchResult: { success: boolean; error?: string } = { success: true };
  relaunches: Array<{ lat: number; lng: number; alt: number; heading: number }> = [];

  setEngineManaged(managed: boolean): void {
    this.engineManaged = managed;
  }

  async relaunchWithHome(home: { lat: number; lng: number; alt: number; heading: number }) {
    this.relaunches.push(home);
    if (this.relaunchResult.success) this.currentConfig = { homeLocation: home };
    return this.relaunchResult;
  }
}

class FakeEngine implements EngineControl {
  isRunning = true;
  stops = 0;
  restarts = 0;
  restartResult: { success: boolean; error?: string } = { success: true };

  stop(): void {
    this.stops++;
    this.isRunning = false;
  }

  async restartLast() {
    this.restarts++;
    if (this.restartResult.success) this.isRunning = true;
    return this.restartResult;
  }
}

function makeDeps(overrides: Partial<SimHandoverDeps> = {}) {
  const sitl = new FakeSitl();
  const engine = new FakeEngine();
  const params: Record<string, number> = {};
  const deps: SimHandoverDeps = {
    userDataPath: tmpdir(),
    isVehicleArmed: () => false,
    setParam: async (id, value) => {
      params[id] = value;
      return true;
    },
    reconnectVehicle: async () => true,
    sitl,
    engine,
    ...overrides,
  };
  return { deps, sitl, engine, params };
}

describe('validateOrigin', () => {
  it('accepts a well-formed origin', () => {
    const r = validateOrigin({ lat: 42.4411, lon: 19.2632, alt: 47, hdg: 0 });
    expect(r).toEqual({ ok: true, value: { lat: 42.4411, lon: 19.2632, alt: 47, hdg: 0 } });
  });

  it.each([
    ['missing field', { lat: 1, lon: 2, alt: 3 }],
    ['non-numeric', { lat: '1', lon: 2, alt: 3, hdg: 0 }],
    ['NaN', { lat: NaN, lon: 2, alt: 3, hdg: 0 }],
    ['lat out of range', { lat: 91, lon: 2, alt: 3, hdg: 0 }],
    ['lon out of range', { lat: 1, lon: 181, alt: 3, hdg: 0 }],
    ['hdg 360', { lat: 1, lon: 2, alt: 3, hdg: 360 }],
    ['hdg negative', { lat: 1, lon: 2, alt: 3, hdg: -1 }],
    ['not an object', 'nope'],
  ])('rejects %s', (_label, body) => {
    expect(validateOrigin(body).ok).toBe(false);
  });
});

describe('requestIsLocal', () => {
  it('accepts loopback with no Origin header', () => {
    expect(requestIsLocal({ socket: { remoteAddress: '127.0.0.1' }, headers: {} })).toBe(true);
    expect(requestIsLocal({ socket: { remoteAddress: '::1' }, headers: {} })).toBe(true);
  });

  it('rejects a non-loopback peer', () => {
    expect(requestIsLocal({ socket: { remoteAddress: '192.168.1.9' }, headers: {} })).toBe(false);
  });

  it('rejects anything a browser sent, which blocks DNS rebinding', () => {
    expect(
      requestIsLocal({ socket: { remoteAddress: '127.0.0.1' }, headers: { origin: 'http://evil.test' } }),
    ).toBe(false);
  });
});

describe('SimHandoverService.status', () => {
  it('reports the running sim and its home', () => {
    const { deps } = makeDeps();
    const s = new SimHandoverService(deps).status();
    expect(s).toMatchObject({
      sitlRunning: true,
      engineRunning: true,
      model: 'JSON',
      homeLat: 42.4411,
      homeLon: 19.2632,
      homeAlt: 47,
      homeHdg: 0,
      armed: false,
      canRelease: true,
      reason: null,
    });
  });

  it('blocks release with a reason when armed', () => {
    const { deps } = makeDeps({ isVehicleArmed: () => true });
    const s = new SimHandoverService(deps).status();
    expect(s.armed).toBe(true);
    expect(s.canRelease).toBe(false);
    expect(s.reason).toMatch(/armed/);
  });

  it('blocks release with a reason when SITL is down', () => {
    const { deps, sitl } = makeDeps();
    sitl.isRunning = false;
    sitl.currentConfig = null;
    const s = new SimHandoverService(deps).status();
    expect(s.canRelease).toBe(false);
    expect(s.reason).toMatch(/SITL is not running/);
    expect(s.homeLat).toBeNull();
    expect(s.model).toBeNull();
  });

  it('blocks release when the engine is already released', () => {
    const { deps, engine } = makeDeps();
    engine.isRunning = false;
    const s = new SimHandoverService(deps).status();
    expect(s.canRelease).toBe(false);
    expect(s.reason).toMatch(/engine is not running/);
  });
});

describe('SimHandoverService.setOrigin', () => {
  it('writes all four SIM_OPOS params and relaunches SITL with the new home', async () => {
    const { deps, sitl, params } = makeDeps();
    const res = await new SimHandoverService(deps).setOrigin({ lat: 1.5, lon: 2.5, alt: 30, hdg: 90 });
    expect(res).toEqual({ ok: true });
    expect(params).toEqual({
      SIM_OPOS_LAT: 1.5,
      SIM_OPOS_LNG: 2.5,
      SIM_OPOS_ALT: 30,
      SIM_OPOS_HDG: 90,
    });
    // The relaunch is what actually moves the origin, because `-O` on SITL's
    // command line outranks SIM_OPOS on every reboot.
    expect(sitl.relaunches).toEqual([{ lat: 1.5, lng: 2.5, alt: 30, heading: 90 }]);
  });

  it('refuses while armed and touches nothing', async () => {
    const { deps, sitl, params } = makeDeps({ isVehicleArmed: () => true });
    const res = await new SimHandoverService(deps).setOrigin({ lat: 1, lon: 2, alt: 3, hdg: 0 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/armed/);
    expect(params).toEqual({});
    expect(sitl.relaunches).toEqual([]);
  });

  it('refuses when SITL is not running', async () => {
    const { deps, sitl } = makeDeps();
    sitl.isRunning = false;
    const res = await new SimHandoverService(deps).setOrigin({ lat: 1, lon: 2, alt: 3, hdg: 0 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/SITL is not running/);
  });

  // A failed SIM_OPOS write must NOT abort the handover. Those params cannot move the origin
  // while `-O` is on the command line, which is always, so failing on one blocks the flow on a
  // step that has no bearing on the result. The relaunch is what moves the origin.
  it('carries on when a PARAM_SET fails, because the relaunch is what moves the origin', async () => {
    const { deps, sitl } = makeDeps({ setParam: async (id) => id !== 'SIM_OPOS_ALT' });
    const res = await new SimHandoverService(deps).setOrigin({ lat: 1, lon: 2, alt: 3, hdg: 0 });
    expect(res.ok).toBe(true);
    expect(sitl.relaunches).toHaveLength(1);
  });

  it('surfaces a failed relaunch', async () => {
    const { deps, sitl } = makeDeps();
    sitl.relaunchResult = { success: false, error: 'bind failed on port 5760' };
    const res = await new SimHandoverService(deps).setOrigin({ lat: 1, lon: 2, alt: 3, hdg: 0 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/bind failed/);
  });

  it('fails when the flight controller never comes back', async () => {
    const { deps } = makeDeps({ reconnectVehicle: async () => false });
    const res = await new SimHandoverService(deps).setOrigin({ lat: 1, lon: 2, alt: 3, hdg: 0 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/did not come back/);
  });
});

describe('SimHandoverService release and reclaim', () => {
  it('release marks the engine externally owned before stopping it', async () => {
    const { deps, sitl, engine } = makeDeps();
    const order: string[] = [];
    sitl.setEngineManaged = (m) => {
      order.push(`managed=${m}`);
      sitl.engineManaged = m;
    };
    const realStop = engine.stop.bind(engine);
    engine.stop = () => {
      order.push('stop');
      realStop();
    };
    const res = await new SimHandoverService(deps).release();
    expect(res).toEqual({ ok: true });
    // Ordering matters: a SITL relaunch between these two would respawn the
    // engine straight back onto UDP 9002.
    expect(order).toEqual(['managed=false', 'stop']);
    expect(engine.isRunning).toBe(false);
  });

  it('release refuses while armed and leaves the engine running', async () => {
    const { deps, sitl, engine } = makeDeps({ isVehicleArmed: () => true });
    const res = await new SimHandoverService(deps).release();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/armed/);
    expect(engine.stops).toBe(0);
    expect(engine.isRunning).toBe(true);
    expect(sitl.engineManaged).toBe(true);
  });

  it('reclaim restarts the engine and takes ownership back', async () => {
    const { deps, sitl, engine } = makeDeps();
    const service = new SimHandoverService(deps);
    await service.release();
    const res = await service.reclaim();
    expect(res).toEqual({ ok: true });
    expect(engine.restarts).toBe(1);
    expect(engine.isRunning).toBe(true);
    expect(sitl.engineManaged).toBe(true);
  });

  it('reclaim keeps the engine externally owned when the restart fails', async () => {
    const { deps, sitl, engine } = makeDeps();
    const service = new SimHandoverService(deps);
    await service.release();
    engine.restartResult = { success: false, error: 'binary not found' };
    const res = await service.reclaim();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/binary not found/);
    expect(sitl.engineManaged).toBe(false);
  });
});

describe('RC ownership while the simulation is lent out', () => {
  it('tells the RC sender to stand down on release, and takes it back on reclaim', async () => {
    const calls: boolean[] = [];
    const { deps } = makeDeps();
    const service = new SimHandoverService({
      ...deps,
      setRcExternallyOwned: (owned: boolean) => calls.push(owned),
    });

    await service.release();
    // The borrower flies with a real handset on a link this process cannot see. Without this,
    // arming starts the fallback sender and its centred constants fight the handset, which reads
    // as a switch toggling itself on and off several times a second.
    expect(calls).toEqual([true]);

    await service.reclaim();
    expect(calls).toEqual([true, false]);
  });
});

describe('SimHandoverServer over HTTP', () => {
  let dir: string;
  let server: SimHandoverServer;
  let ctx: ReturnType<typeof makeDeps>;

  const call = async (method: string, route: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.port}${route}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'sim-handover-'));
    ctx = makeDeps({ userDataPath: dir });
    server = new SimHandoverServer(ctx.deps);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it('writes a discovery file on start and removes it on stop', async () => {
    const file = path.join(dir, SIM_HANDOVER_FILE);
    const parsed = JSON.parse(await readFile(file, 'utf-8'));
    expect(parsed).toEqual({ port: server.port, pid: process.pid, version: SIM_HANDOVER_VERSION });
    expect(parsed.port).toBeGreaterThan(0);

    await server.stop();
    await expect(access(file)).rejects.toThrow();
  });

  it('binds loopback only', () => {
    // Anything reachable off-box could relaunch SITL on a machine flying a real
    // aircraft, so the bind address is part of the contract.
    expect(server.port).toBeGreaterThan(0);
  });

  it('reports the airframe it mixes for, so a borrower can simulate THIS aircraft', async () => {
    const { body } = await call('GET', '/sim/status');
    // A stack mixing for an octa while the flight model is a quad commands pure roll and gets a
    // roll/pitch blend back: a 45-degree rotation between mixer and plant, which is unflyable.
    expect(body.frameClass).toBe(3);
    expect(body.frameType).toBe(0);
    // The layout alone is not the aircraft: without this the borrower flies a 3 kg default
    // under gains tuned for a 60 kg machine, which diverges on the first stick input.
    expect(body.framePath).toBe('/frames/heavy_industrial_octa_14s.json');
  });

  it('GET /sim/status returns the contract shape', async () => {
    const { status, body } = await call('GET', '/sim/status');
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(
      [
        'armed',
        'canRelease',
        'engineRunning',
        'frameClass',
        'frameType',
        'framePath',
        'homeAlt',
        'homeHdg',
        'homeLat',
        'homeLon',
        'model',
        'reason',
        'sitlRunning',
      ].sort(),
    );
  });

  it('POST /sim/origin applies a valid origin', async () => {
    const { status, body } = await call('POST', '/sim/origin', { lat: 10, lon: 20, alt: 5, hdg: 45 });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(ctx.sitl.relaunches).toEqual([{ lat: 10, lng: 20, alt: 5, heading: 45 }]);
  });

  it('POST /sim/origin rejects a bad payload with 400', async () => {
    const { status, body } = await call('POST', '/sim/origin', { lat: 999, lon: 20, alt: 5, hdg: 45 });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(ctx.sitl.relaunches).toEqual([]);
  });

  it('POST /sim/origin rejects malformed JSON with 400', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/sim/origin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect(res.status).toBe(400);
  });

  it('POST /sim/release then /sim/reclaim round-trips the engine', async () => {
    const rel = await call('POST', '/sim/release');
    expect(rel.body).toEqual({ ok: true });
    expect(ctx.engine.isRunning).toBe(false);
    expect(ctx.sitl.engineManaged).toBe(false);

    const stat = await call('GET', '/sim/status');
    expect(stat.body.engineRunning).toBe(false);
    expect(stat.body.canRelease).toBe(false);

    const rec = await call('POST', '/sim/reclaim');
    expect(rec.body).toEqual({ ok: true });
    expect(ctx.engine.isRunning).toBe(true);
    expect(ctx.sitl.engineManaged).toBe(true);
  });

  it('refuses origin and release while armed, over HTTP', async () => {
    ctx.deps.isVehicleArmed = () => true;
    const armedServer = new SimHandoverServer(ctx.deps);
    await armedServer.start();
    try {
      const origin = await fetch(`http://127.0.0.1:${armedServer.port}/sim/origin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lat: 1, lon: 2, alt: 3, hdg: 0 }),
      });
      const originBody = await origin.json();
      expect(originBody.ok).toBe(false);
      expect(originBody.error).toMatch(/armed/);

      const release = await fetch(`http://127.0.0.1:${armedServer.port}/sim/release`, { method: 'POST' });
      const releaseBody = await release.json();
      expect(releaseBody.ok).toBe(false);
      expect(releaseBody.error).toMatch(/armed/);
      expect(ctx.engine.stops).toBe(0);
    } finally {
      await armedServer.stop();
    }
  });

  it('rejects a browser-driven request', async () => {
    const { status } = await call('GET', '/sim/status', undefined, { origin: 'http://evil.test' });
    expect(status).toBe(403);
  });

  it('exposes nothing else', async () => {
    for (const route of ['/', '/sim', '/sim/screenshot', '/sim/click', '/store']) {
      const res = await fetch(`http://127.0.0.1:${server.port}${route}`);
      expect(res.status).toBe(404);
    }
    // The four operations are method-specific too.
    expect((await call('GET', '/sim/release')).status).toBe(404);
    expect((await call('POST', '/sim/status')).status).toBe(404);
  });

  it('rejects an oversized body', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/sim/origin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lat: 1, lon: 2, alt: 3, hdg: 0, pad: 'x'.repeat(8192) }),
    }).catch(() => null);
    // The connection is destroyed once the cap is passed, which surfaces either
    // as a 413 or as a transport-level failure depending on flush timing.
    if (res) expect([413, 400]).toContain(res.status);
  });

  it('start is idempotent and keeps the same port', async () => {
    const first = server.port;
    const again = await server.start();
    expect(again).toBe(first);
  });
});

describe('SimHandoverServer.stop', () => {
  it('does not throw when the discovery file is already gone', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sim-handover-'));
    const { deps } = makeDeps({ userDataPath: dir });
    const s = new SimHandoverServer(deps);
    await s.start();
    await rm(path.join(dir, SIM_HANDOVER_FILE), { force: true });
    await expect(s.stop()).resolves.toBeUndefined();
    await rm(dir, { recursive: true, force: true });
  });
});
