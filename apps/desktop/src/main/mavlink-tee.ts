/**
 * MavlinkTee - bidirectional raw MAVLink forwarding to secondary GCS
 * endpoints (the mobile app in second-screen mode, or any other GCS on the
 * LAN).
 *
 * Off by default. When started it opens one UDP socket that:
 *   - forwards every raw inbound vehicle chunk to all configured endpoints
 *     plus any learned senders,
 *   - QGC-style passive-learn: any datagram arriving on the socket registers
 *     its sender as an endpoint (so a phone that binds 14550 and sends a GCS
 *     heartbeat gets the stream with zero desktop config),
 *   - injects datagrams received from those endpoints into the active
 *     vehicle transport (the phone commands through the desktop radio link),
 *   - announces ITSELF with a GCS heartbeat, independently of the vehicle.
 *
 * That last one is not decoration. The mobile app discovers by speaking and
 * waiting to be answered, so a tee that only ever relays vehicle bytes is
 * invisible whenever the vehicle link is down, idle or reconnecting - which is
 * exactly when a pilot is setting the phone up. It also lets the scanner tell a
 * forwarder from a vehicle: lan_scan.dart reads MAV_TYPE_GCS as "ground station
 * or forwarder" and anything else as an aircraft. mavlink-router heartbeats for
 * the same reasons.
 *
 * Apart from that heartbeat the tee does not parse anything: it moves bytes.
 * Sysid separation is the vehicle's job (both GCS default to sysid 255;
 * ArduPilot replies to the requester by (sysid, compid), which both ends share,
 * so both see all responses - same behavior as mavlink-router fan-out).
 */
import dgram from 'dgram';
import {
  serializeV2,
  serializeHeartbeat,
  MavType,
  MavAutopilot,
} from '@ardudeck/mavlink-ts';

export interface TeeEndpoint {
  host: string;
  port: number;
}

export interface TeeStatus {
  running: boolean;
  listenPort: number | null;
  endpoints: TeeEndpoint[];
  learned: TeeEndpoint[];
  forwardedBytes: number;
  injectedBytes: number;
  lastError: string | null;
}

const MAX_LEARNED = 8;
/** A learned client that stops talking (no heartbeat) for this long is
 * dropped. Without expiry, failed connection attempts pile up dead
 * endpoints until the table is full and real clients never get learned. */
const LEARNED_TTL_MS = 15_000;
/** Standard MAVLink heartbeat rate, and comfortably inside the mobile
 * scanner's listening window. */
const HEARTBEAT_MS = 1000;
const HEARTBEAT_MSGID = 0;
const HEARTBEAT_CRC_EXTRA = 50;

class MavlinkTee {
  private socket: dgram.Socket | null = null;
  private listenPort: number | null = null;
  private endpoints: TeeEndpoint[] = [];
  private learned = new Map<string, TeeEndpoint & { lastSeen: number }>();
  private injector: ((data: Uint8Array) => void) | null = null;
  private forwardedBytes = 0;
  private injectedBytes = 0;
  private lastError: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  /** Own sequence counter: sharing the serializer's global one would make our
   * announcements interleave into the app's outgoing packet numbering. */
  private heartbeatSeq = 0;

  /** The active-transport write hook; survives start/stop cycles. */
  setInjector(fn: ((data: Uint8Array) => void) | null): void {
    this.injector = fn;
  }

  async start(opts: { listenPort?: number; endpoints?: TeeEndpoint[] }): Promise<TeeStatus> {
    await this.stop();
    const listenPort = opts.listenPort ?? 14550;
    this.endpoints = (opts.endpoints ?? []).filter((e) => e.host && e.port > 0);
    this.forwardedBytes = 0;
    this.injectedBytes = 0;
    this.lastError = null;

    await new Promise<void>((resolve, reject) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      socket.on('error', (err) => {
        this.lastError = err.message;
        if (this.socket === socket) {
          socket.close();
          this.socket = null;
          this.listenPort = null;
        }
        reject(err);
      });
      socket.on('message', (msg, rinfo) => {
        const key = `${rinfo.address}:${rinfo.port}`;
        const now = Date.now();
        const existing = this.learned.get(key);
        if (existing) {
          existing.lastSeen = now;
        } else {
          const explicit = this.endpoints.some(
            (e) => e.host === rinfo.address && e.port === rinfo.port,
          );
          if (!explicit) {
            if (this.learned.size >= MAX_LEARNED) {
              // Evict the quietest endpoint; a live client always talks.
              let oldestKey: string | null = null;
              let oldestSeen = Infinity;
              for (const [k, v] of this.learned) {
                if (v.lastSeen < oldestSeen) {
                  oldestSeen = v.lastSeen;
                  oldestKey = k;
                }
              }
              if (oldestKey) this.learned.delete(oldestKey);
            }
            this.learned.set(key, { host: rinfo.address, port: rinfo.port, lastSeen: now });
            // Answer a scanner on the spot rather than up to HEARTBEAT_MS later.
            this.sendHeartbeatTo({ host: rinfo.address, port: rinfo.port });
          }
        }
        this.injectedBytes += msg.length;
        this.injector?.(new Uint8Array(msg));
      });
      socket.bind(listenPort, () => {
        this.socket = socket;
        this.listenPort = listenPort;
        resolve();
      });
    });

    // Announce at once: an endpoint typed into the desktop is push-only and
    // never probes, so learn-on-receive alone would never reach it.
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_MS);

    return this.status();
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    this.listenPort = null;
    this.learned.clear();
    if (socket) {
      await new Promise<void>((resolve) => socket.close(() => resolve()));
    }
  }

  /** Our own presence announcement: a GCS, explicitly not an autopilot. */
  private heartbeatFrame(): Uint8Array {
    const seq = this.heartbeatSeq;
    this.heartbeatSeq = (this.heartbeatSeq + 1) & 0xff;
    const payload = serializeHeartbeat({
      type: MavType.MAV_TYPE_GCS,
      autopilot: MavAutopilot.MAV_AUTOPILOT_INVALID,
      baseMode: 0,
      customMode: 0,
      systemStatus: 4, // MAV_STATE_ACTIVE
      mavlinkVersion: 3,
    });
    return serializeV2(HEARTBEAT_MSGID, payload, HEARTBEAT_CRC_EXTRA, { sequence: seq });
  }

  private sendHeartbeatTo(ep: TeeEndpoint): void {
    const socket = this.socket;
    if (!socket) return;
    socket.send(this.heartbeatFrame(), ep.port, ep.host, (err) => {
      if (err) this.lastError = err.message;
    });
  }

  /** Heartbeat every endpoint, configured or learned; no-op unless running. */
  private sendHeartbeat(): void {
    if (!this.socket) return;
    for (const ep of this.endpoints) this.sendHeartbeatTo(ep);
    for (const ep of this.learned.values()) this.sendHeartbeatTo(ep);
  }

  /** Called with every raw inbound vehicle chunk; no-op unless running. */
  forward(data: Uint8Array): void {
    const socket = this.socket;
    if (!socket) return;
    this.forwardedBytes += data.length;
    const cutoff = Date.now() - LEARNED_TTL_MS;
    for (const [key, ep] of this.learned) {
      if (ep.lastSeen < cutoff) this.learned.delete(key);
    }
    for (const ep of this.endpoints) {
      socket.send(data, ep.port, ep.host, (err) => {
        if (err) this.lastError = err.message;
      });
    }
    for (const ep of this.learned.values()) {
      socket.send(data, ep.port, ep.host, (err) => {
        if (err) this.lastError = err.message;
      });
    }
  }

  status(): TeeStatus {
    return {
      running: this.socket !== null,
      listenPort: this.listenPort,
      endpoints: [...this.endpoints],
      learned: [...this.learned.values()],
      forwardedBytes: this.forwardedBytes,
      injectedBytes: this.injectedBytes,
      lastError: this.lastError,
    };
  }
}

export const mavlinkTee = new MavlinkTee();
