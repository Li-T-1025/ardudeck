import { describe, it, expect, afterEach } from 'vitest';
import dgram from 'dgram';
import {
  serializeV2,
  createParser,
  MESSAGE_REGISTRY,
  deserializeHeartbeat,
  serializeHeartbeat,
  MavType,
  MavAutopilot,
  type Heartbeat,
} from '@ardudeck/mavlink-ts';
import { mavlinkTee } from './mavlink-tee.js';

/** A free-ish port well away from the 14550 a running desktop already holds. */
const TEE_PORT = 14577;

/** What ardudeck-mobile's LanScanner announces itself as while scanning. */
function gcsHeartbeat(): Uint8Array {
  const msg: Heartbeat = {
    type: MavType.MAV_TYPE_GCS,
    autopilot: MavAutopilot.MAV_AUTOPILOT_INVALID,
    baseMode: 0,
    customMode: 0,
    systemStatus: 4,
    mavlinkVersion: 3,
  };
  return serializeV2(0, serializeHeartbeat(msg), 50);
}

/** Bind a client the way the phone's scanner does: ephemeral port, no listen port. */
async function openClient(): Promise<dgram.Socket> {
  const sock = dgram.createSocket('udp4');
  await new Promise<void>((resolve) => sock.bind(0, () => resolve()));
  return sock;
}

/** First datagram to arrive, or null once `ms` passes without one. */
function nextDatagram(sock: dgram.Socket, ms = 2000): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sock.off('message', onMessage);
      resolve(null);
    }, ms);
    const onMessage = (msg: Buffer): void => {
      clearTimeout(timer);
      sock.off('message', onMessage);
      resolve(msg);
    };
    sock.on('message', onMessage);
  });
}

/** Decode the first HEARTBEAT in a datagram, verifying framing and CRC. */
async function readHeartbeat(datagram: Buffer): Promise<Heartbeat | null> {
  const parser = createParser([MESSAGE_REGISTRY.get(0)!]);
  for await (const pkt of parser.parse(new Uint8Array(datagram))) {
    if (pkt.msgid === 0) return deserializeHeartbeat(pkt.payload);
  }
  return null;
}

describe('MavlinkTee discovery', () => {
  const sockets: dgram.Socket[] = [];

  afterEach(async () => {
    for (const s of sockets.splice(0)) s.close();
    mavlinkTee.setInjector(null);
    await mavlinkTee.stop();
  });

  it('answers a scanner probe even though no vehicle has ever streamed', async () => {
    // The regression: the tee only ever transmitted from forward(), which fires
    // on inbound vehicle bytes. With SITL down the tee bound its port, learned
    // the phone and sent nothing, so the phone's scan came back empty.
    await mavlinkTee.start({ listenPort: TEE_PORT });
    const client = await openClient();
    sockets.push(client);

    client.send(gcsHeartbeat(), TEE_PORT, '127.0.0.1');
    const reply = await nextDatagram(client);

    expect(reply).not.toBeNull();
    expect(await readHeartbeat(reply!)).not.toBeNull();
    expect(mavlinkTee.status().forwardedBytes).toBe(0);
  });

  it('identifies itself as a GCS so a scanner reads it as a forwarder, not a vehicle', async () => {
    // lan_scan.dart: `looksLikeVehicle => vehicleType != null && vehicleType != 6`.
    // Anything but MAV_TYPE_GCS here makes the phone offer the tee as a vehicle.
    await mavlinkTee.start({ listenPort: TEE_PORT });
    const client = await openClient();
    sockets.push(client);

    client.send(gcsHeartbeat(), TEE_PORT, '127.0.0.1');
    const hb = await readHeartbeat((await nextDatagram(client))!);

    expect(hb?.type).toBe(MavType.MAV_TYPE_GCS);
    expect(hb?.autopilot).toBe(MavAutopilot.MAV_AUTOPILOT_INVALID);
  });

  it('heartbeats a configured endpoint that never speaks first', async () => {
    // An endpoint typed into the desktop is push-only: it never probes, so
    // learn-on-receive cannot reach it. Without its own heartbeat the tee stays
    // silent toward it until the vehicle streams.
    const client = await openClient();
    sockets.push(client);
    const clientPort = client.address().port;

    await mavlinkTee.start({
      listenPort: TEE_PORT,
      endpoints: [{ host: '127.0.0.1', port: clientPort }],
    });

    const hb = await readHeartbeat((await nextDatagram(client))!);
    expect(hb?.type).toBe(MavType.MAV_TYPE_GCS);
  });
});
