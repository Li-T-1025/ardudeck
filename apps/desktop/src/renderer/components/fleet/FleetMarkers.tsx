/**
 * Map markers for every non-active vehicle. The active vehicle keeps its existing detailed
 * marker (heading/speed DOM dynamics, trail, command popup, drawn topmost); this overlay
 * draws the rest of the fleet so the whole picture is on one map. Clicking a fleet marker
 * makes that vehicle active.
 *
 * DENSITY LOD (declutter): every marker renders at its TRUE map position so a formation
 * reads as its actual shape; what shrinks is the marker itself. Each vehicle's tier comes
 * from its nearest neighbor in screen pixels (see marker-tier.ts):
 *   - full: plenty of room, the usual 52px icon and label
 *   - medium: neighbors closing in, a half-size disc with just the SYS id chip
 *   - dot: packed tight, a small identity-colour dot with a heading tick, label on hover
 * Formation leaders never drop below medium, keeping the gold ring + LEAD chip visible.
 * A 6px hysteresis band stops markers flickering between tiers while vehicles jitter.
 *
 * The ONLY case that still fans out on a ring is a group genuinely stacked on one point
 * (within MIN_SPREAD_M, e.g. SITL vehicles sharing a home): the main stays full size and
 * the rest tuck onto a 32px ring with leader lines, since there is no real geometry to
 * preserve. Groups with real spread are never ring-tucked - that destroyed the formation.
 *
 * Rendered inside the telemetry MapContainer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createTacticalVehicleIcon, updateTacticalIconDOM } from '../map/TacticalVehicleIcon';
import { useFleetVehicles, selectActiveVehicle, type FleetVehicle } from '../../hooks/useFleet';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useFormationStore } from '../../stores/formation-store';
import { useVehicleColor } from '../../stores/vehicle-appearance-store';
import { useSettingsStore } from '../../stores/settings-store';
import { formatAltitudeFromMeters, formatSpeedFromMetersPerSecond } from '../../../shared/user-units.js';
import { tierFromDistance, type MarkerTier } from './marker-tier';

const ICON_SIZE = 52;
const ICON_CENTER = ICON_SIZE / 2;
/** Markers whose centres are closer than this (px) can ring-tuck when stacked. */
const OVERLAP_PX = 46;
/** Followers are drawn at this scale so the main vehicle reads as the focus. */
const FOLLOWER_SCALE = 0.6;
/** Distance (px) from the main to each follower's centre - tight, so they almost touch. */
const RING_RADIUS = 32;
/** Below this real separation (m) a group is "stacked on one point" (SITL home) and gets
 *  the ring-tuck; anything with real spread keeps true positions and relies on tiers. */
const MIN_SPREAD_M = 2;
/** The main's info label box sits to its right (east). Reserve this sector (deg, ±around
 *  east) so followers never tuck in behind the box - they're pushed to the arc edge. */
const LABEL_KEEPOUT_DEG = 65;

type Offset = { dx: number; dy: number; scale: number; main: boolean };
type MarkerLod = { tier: MarkerTier; offset?: Offset };

/** Approx ground distance between two [lat,lon] points, metres (equirectangular). */
function geoDistM(a: [number, number], b: [number, number]): number {
  const lat = (a[0] * Math.PI) / 180;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180 * Math.cos(lat);
  return Math.sqrt(dLat * dLat + dLon * dLon) * 6371000;
}

/**
 * Per-vehicle level of detail. Projects every vehicle to layer points, ring-tucks only the
 * groups genuinely stacked on one point, then assigns everyone else a size tier from their
 * nearest-neighbor screen distance. Recomputed on zoom/pan and whenever positions change;
 * distances are screen px, so zooming in naturally promotes markers back to full size.
 */
function useMarkerLod(
  vehicles: FleetVehicle[],
  map: L.Map,
  leaderKeys: ReadonlySet<string>,
  activeKey: string | null,
): Record<string, MarkerLod> {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    map.on('zoomend', bump);
    map.on('moveend', bump);
    return () => {
      map.off('zoomend', bump);
      map.off('moveend', bump);
    };
  }, [map]);

  // Last tier per key, so tierFromDistance can hold a marker's tier through jitter.
  const lastTierRef = useRef<Record<string, MarkerTier>>({});

  return useMemo(() => {
    const pts = vehicles
      .filter((v) => v.position)
      .map((v) => {
        const p = map.latLngToLayerPoint(v.position as [number, number]);
        return { v, x: p.x, y: p.y, used: false };
      });

    const lod: Record<string, MarkerLod> = {};

    // Pass 1: ring-tuck ONLY groups stacked on one point (e.g. SITL sharing a home). A
    // formation with real spread must keep true positions - shrinking (pass 2) handles it.
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      if (!a || a.used) continue;
      a.used = true;
      const members = [a];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        if (!b || b.used) continue;
        const nearOnScreen = Math.hypot(a.x - b.x, a.y - b.y) < OVERLAP_PX;
        const stacked = geoDistM(a.v.position as [number, number], b.v.position as [number, number]) < MIN_SPREAD_M;
        if (nearOnScreen && stacked) {
          b.used = true;
          members.push(b);
        }
      }
      if (members.length < 2) continue;

      // Main: formation leader, else active/selected, else lowest sysid.
      let main = members.find((m) => leaderKeys.has(m.v.key)) || members.find((m) => m.v.key === activeKey);
      if (!main) {
        main = members[0];
        for (const m of members) if (main && m.v.sysid < main.v.sysid) main = m;
      }
      if (!main) continue;

      const anchor = main;
      const followers = members.filter((m) => m !== anchor);
      const span = 360 - 2 * LABEL_KEEPOUT_DEG; // arc available once the label sector is reserved
      followers.forEach((f, idx) => {
        // Even ring across the arc that avoids the label box (east) - a stacked group has
        // no geometry worth preserving.
        const deg = LABEL_KEEPOUT_DEG + ((idx + 0.5) / followers.length) * span;
        const ang = (deg * Math.PI) / 180;
        lod[f.v.key] = {
          tier: 'full',
          offset: {
            dx: anchor.x + RING_RADIUS * Math.cos(ang) - f.x,
            dy: anchor.y + RING_RADIUS * Math.sin(ang) - f.y,
            scale: FOLLOWER_SCALE,
            main: false,
          },
        };
        lastTierRef.current[f.v.key] = 'full';
      });
      lod[anchor.v.key] = { tier: 'full', offset: { dx: 0, dy: 0, scale: 1, main: true } };
      lastTierRef.current[anchor.v.key] = 'full';
    }

    // Pass 2: density tier for everyone else. Nearest neighbor includes ring-tucked
    // vehicles - a marker brushing against a stack should still step down.
    for (const p of pts) {
      if (lod[p.v.key]) continue;
      let nearest = Infinity;
      for (const q of pts) {
        if (q === p) continue;
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < nearest) nearest = d;
      }
      let tier = tierFromDistance(nearest, lastTierRef.current[p.v.key]);
      lastTierRef.current[p.v.key] = tier;
      // Leaders stay recognisable: never below medium, so the gold ring + LEAD chip and
      // designation survive any density.
      if (tier === 'dot' && leaderKeys.has(p.v.key)) tier = 'medium';
      lod[p.v.key] = { tier };
    }
    return lod;
  }, [vehicles, map, tick, leaderKeys, activeKey]);
}

/**
 * One fleet marker. The icon is memoized on its VISUAL fields only, so a position tick
 * (several times a second) moves the marker without rebuilding the DivIcon DOM - that
 * rebuild is what made the icon flicker. Heading/speed/altitude are this vehicle's OWN live
 * values, applied by DOM mutation so every fleet icon shows its own telemetry, not zeros.
 */
function FleetMarker({ v, isLeader, lod }: { v: FleetVehicle; isLeader: boolean; lod?: MarkerLod }) {
  const markerRef = useRef<L.Marker | null>(null);
  const identityColor = useVehicleColor(v.key, v.sysid);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const offset = lod?.offset;
  const tier = lod?.tier ?? 'full';
  const isMain = offset?.main ?? false;
  const icon = useMemo(
    () => createTacticalVehicleIcon({
      vehicleClass: v.vehicleClass,
      state: v.state,
      selected: false,
      mode: v.mode,
      designation: v.label,
      isLeader,
      bodyColor: identityColor,
      // A stacked group's main shows its full label; everyone else collapses to the SYS id
      // chip (medium/dot tiers restrict the label further in the factory).
      compact: !isMain,
      tier,
    }),
    [v.vehicleClass, v.state, v.mode, v.label, isLeader, identityColor, isMain, tier],
  );

  useEffect(() => {
    const el = markerRef.current?.getElement();
    if (!el) return;
    updateTacticalIconDOM(el, {
      heading: v.heading,
      groundspeed: v.groundspeed,
      speedText: formatSpeedFromMetersPerSecond(v.groundspeed, speedUnit),
      altitudeAgl: v.altitudeAgl,
      altitudeText: formatAltitudeFromMeters(v.altitudeAgl, altitudeUnit),
    }, v.vehicleClass === 'antenna');
  }, [v.heading, v.groundspeed, v.altitudeAgl, v.vehicleClass, icon, speedUnit, altitudeUnit]);

  // Apply the grouping offset: translate + scale the icon content to its tucked-in position
  // and draw a dashed leader line from the true map point (marker centre) to it. Reapplied
  // when the icon DOM is rebuilt (icon dep) or the offset changes.
  const dx = offset?.dx ?? 0;
  const dy = offset?.dy ?? 0;
  const scale = offset?.scale ?? 1;
  useEffect(() => {
    const el = markerRef.current?.getElement();
    if (!el) return;
    // A tucked-in follower hides its label until hover (see .tvi-grouped in globals.css).
    el.classList.toggle('tvi-grouped', !!offset && !offset.main);
    const content = el.querySelector<HTMLElement>('.tactical-vehicle-icon');
    if (content) content.style.transform = dx || dy || scale !== 1 ? `translate(${dx}px,${dy}px) scale(${scale})` : '';

    let line = el.querySelector<SVGSVGElement>('svg.tvi-leader');
    if (dx || dy) {
      if (!line) {
        line = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        line.setAttribute('class', 'tvi-leader');
        line.setAttribute('width', String(ICON_SIZE));
        line.setAttribute('height', String(ICON_SIZE));
        line.innerHTML = '<line stroke="rgba(148,163,184,0.55)" stroke-width="1.5" stroke-dasharray="3 3" />';
        el.insertBefore(line, el.firstChild);
      }
      const ln = line.firstElementChild as SVGLineElement;
      ln.setAttribute('x1', String(ICON_CENTER));
      ln.setAttribute('y1', String(ICON_CENTER));
      ln.setAttribute('x2', String(ICON_CENTER + dx));
      ln.setAttribute('y2', String(ICON_CENTER + dy));
      line.style.display = '';
    } else if (line) {
      line.style.display = 'none';
    }
  }, [dx, dy, scale, icon]);

  return (
    <Marker
      ref={markerRef}
      position={v.position as [number, number]}
      zIndexOffset={4000}
      icon={icon}
      eventHandlers={{
        click: (e) => {
          L.DomEvent.stopPropagation(e.originalEvent);
          selectActiveVehicle(v.key, v.transportId);
        },
        contextmenu: (e) => {
          L.DomEvent.stopPropagation(e.originalEvent);
          L.DomEvent.preventDefault(e.originalEvent);
          useFormationStore.getState().openContextMenu({
            x: e.originalEvent.clientX,
            y: e.originalEvent.clientY,
            vehicleKey: v.key,
          });
        },
      }}
    />
  );
}

export function FleetMarkers() {
  const vehicles = useFleetVehicles();
  const formations = useActiveVehicleStore((s) => s.formations);
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const map = useMap();
  const leaderKeys = useMemo(() => new Set(Object.keys(formations)), [formations]);
  const lod = useMarkerLod(vehicles, map, leaderKeys, activeVehicleKey);

  return (
    <>
      {vehicles
        .filter((v) => !v.isActive && v.position !== null)
        .map((v) => (
          <FleetMarker key={v.key} v={v} isLeader={leaderKeys.has(v.key)} lod={lod[v.key]} />
        ))}
    </>
  );
}
