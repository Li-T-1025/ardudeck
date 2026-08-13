/**
 * World Magnetic Model 2025 (WMM2025) field computation. Pure and offline: no
 * network at call time, the coefficients are embedded below.
 *
 * Given a site (latitude, longitude, altitude) and a date this returns the
 * expected geomagnetic field: declination (for auto-declination / true-north
 * correction) and total intensity (a yardstick to spot local ferrous
 * interference against a live compass reading).
 *
 * Source: NOAA NCEI World Magnetic Model 2025, official WMM2025.COF coefficient
 * file (epoch 2025.0, valid 2024-11-13 to 2029-11-13). The synthesis is a port
 * of NOAA's reference GeomagnetismLibrary.c algorithm (geodetic to geocentric,
 * Schmidt semi-normalised associated Legendre recursion, spherical harmonic
 * summation, then rotation back to geodetic). Validated against NCEI's official
 * WMM2025 test-value table: see wmm.test.ts.
 */

/** Maximum spherical-harmonic degree of the WMM. */
const N_MAX = 12;

/** Model epoch (decimal year) the coefficients are referenced to. */
export const WMM_EPOCH = 2025.0;

/** Validity window of WMM2025 as UTC millisecond timestamps. */
export const WMM_VALID_FROM_MS = Date.UTC(2024, 10, 13, 3, 0, 0);
export const WMM_VALID_TO_MS = Date.UTC(2029, 10, 13, 3, 0, 0);

// Coefficients flattened by i = n*(n+1)/2 + m, index 0 unused. G/H are the main
// field (nT), DG/DH the secular variation (nT/year). Transcribed verbatim from
// the official NOAA WMM2025.COF; do not hand-edit, regenerate from the .COF.
const G: readonly number[] = [0, -29351.8, -1410.8, -2556.6, 2951.1, 1649.3, 1361, -2404.1, 1243.8, 453.6, 895, 799.5, 55.7, -281.1, 12.1, -233.2, 368.9, 187.2, -138.7, -142, 20.9, 64.4, 63.8, 76.9, -115.7, -40.9, 14.9, -60.7, 79.5, -77, -8.8, 59.3, 15.8, 2.5, -11.1, 14.2, 23.2, 10.8, -17.5, 2, -21.7, 16.9, 15, -16.8, 0.9, 4.6, 7.8, 3, -0.2, -2.5, -13.1, 2.4, 8.6, -8.7, -12.9, -1.3, -6.4, 0.2, 2, -1, -0.6, -0.9, 1.5, 0.9, -2.7, -3.9, 2.9, -1.5, -2.5, 2.4, -0.6, -0.1, -0.6, -0.1, 1.1, -1, -0.2, 2.6, -2, -0.2, 0.3, 1.2, -1.3, 0.6, 0.6, 0.5, -0.1, -0.4, -0.2, -1.3, -0.7];
const H: readonly number[] = [0, 0, 4545.4, 0, -3133.6, -815.1, 0, -56.6, 237.5, -549.5, 0, 278.6, -133.9, 212, -375.6, 0, 45.4, 220.2, -122.9, 43, 106.1, 0, -18.4, 16.8, 48.8, -59.8, 10.9, 72.7, 0, -48.9, -14.4, -1, 23.4, -7.4, -25.1, -2.3, 0, 7.1, -12.6, 11.4, -9.7, 12.7, 0.7, -5.2, 3.9, 0, -24.8, 12.2, 8.3, -3.3, -5.2, 7.2, -0.6, 0.8, 10, 0, 3.3, 0, 2.4, 5.3, -9.1, 0.4, -4.2, -3.8, 0.9, -9.1, 0, 0, 2.9, -0.6, 0.2, 0.5, -0.3, -1.2, -1.7, -2.9, -1.8, -2.3, 0, -1.3, 0.7, 1, -1.4, 0, 0.6, -0.1, 0.8, 0.1, -1, 0.1, 0.2];
const DG: readonly number[] = [0, 12, 9.7, -11.6, -5.2, -8, -1.3, -4.2, 0.4, -15.6, -1.6, -2.4, -6, 5.6, -7, 0.6, 1.4, 0, 0.6, 2.2, 0.9, -0.2, -0.4, 0.9, 1.2, -0.9, 0.3, 0.9, 0, -0.1, -0.1, 0.5, -0.1, -0.8, -0.8, 0.8, -0.1, 0.2, 0, 0.5, -0.1, 0.3, 0.2, 0, 0.2, 0, -0.1, 0.1, 0.3, -0.3, 0, 0.3, -0.1, 0.1, -0.1, 0.1, 0, 0.1, 0.1, 0, -0.3, 0, -0.1, -0.1, 0, 0, 0, 0, 0, 0, 0, -0.1, 0, 0, -0.1, -0.1, -0.1, -0.1, 0, 0, 0, 0, 0, 0, 0.1, 0, 0, 0, -0.1, 0, -0.1];
const DH: readonly number[] = [0, 0, -21.5, 0, -27.7, -12.1, 0, 4, -0.3, -4.1, 0, -1.1, 4.1, 1.6, -4.4, 0, -0.5, 2.2, 0.4, 1.7, 1.9, 0, 0.3, -1.6, -0.4, 0.9, 0.7, 0.9, 0, 0.6, 0.5, -0.8, 0, -1, 0.6, -0.2, 0, -0.2, 0.5, -0.4, 0.4, -0.5, -0.6, 0.3, 0.2, 0, -0.3, 0.3, -0.3, 0.3, 0.2, -0.1, -0.2, 0.4, 0.1, 0, 0, 0, -0.2, 0.1, -0.1, 0.1, 0, -0.1, 0.2, 0, 0, 0, 0.1, 0, 0.1, 0, 0, 0.1, 0, 0, 0, 0, 0, 0, 0, -0.1, 0.1, 0, 0, 0, 0, 0, 0, 0, -0.1];

// WGS84 ellipsoid plus the WMM geomagnetic reference radius (re, km).
const WGS84_A = 6378.137;
const WGS84_B = 6356.7523142;
const GEOMAG_RE = 6371.2;
const EPS_SQ = 1 - (WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);

const DEG = Math.PI / 180;

export interface GeomagneticField {
  /** Declination (deg), angle from true north to magnetic north, east positive. */
  declinationDeg: number;
  /** Inclination / dip (deg), positive downward in the northern hemisphere. */
  inclinationDeg: number;
  /** Horizontal field intensity (nT). */
  horizontalIntensityNt: number;
  /** Total field intensity (nT), the magnitude a compass magnetometer sees. */
  totalIntensityNt: number;
  /** North component X (nT). */
  northNt: number;
  /** East component Y (nT). */
  eastNt: number;
  /** Vertical (down) component Z (nT). */
  downNt: number;
  /** Decimal year the field was evaluated at. */
  decimalYear: number;
}

/**
 * Decimal year using the same convention as NOAA's reference software: whole
 * UTC year plus the fraction of a 365-day year elapsed. Kept identical so
 * results reproduce the official test table exactly.
 */
export function toDecimalYear(date: Date): number {
  const yearInt = date.getUTCFullYear();
  const fractional = (date.valueOf() - Date.UTC(yearInt, 0, 1)) / (1000 * 3600 * 24 * 365);
  return yearInt + fractional;
}

/** True when a date sits inside the WMM2025 validity window. */
export function isWithinModelValidity(date: Date): boolean {
  const t = date.valueOf();
  return t >= WMM_VALID_FROM_MS && t <= WMM_VALID_TO_MS;
}

/**
 * Compute the WMM2025 field at a site. Altitude is height above the WGS84
 * ellipsoid in km (default 0). Date is supplied by the caller (never read from
 * the system clock here) so the same site/date always yields the same field.
 */
export function computeGeomagneticField(
  latDeg: number,
  lonDeg: number,
  date: Date,
  altitudeKm = 0,
): GeomagneticField {
  const dyear = toDecimalYear(date) - WMM_EPOCH;

  // Time-adjust the coefficients to the requested epoch.
  const g = new Array<number>(G.length).fill(0);
  const h = new Array<number>(H.length).fill(0);
  for (let n = 1; n <= N_MAX; n++) {
    for (let m = 0; m <= n; m++) {
      const i = (n * (n + 1)) / 2 + m;
      g[i] = G[i]! + dyear * DG[i]!;
      h[i] = H[i]! + dyear * DH[i]!;
    }
  }

  // Geodetic -> geocentric spherical (r, geocentric latitude phig).
  const coslat = Math.cos(latDeg * DEG);
  const sinlat = Math.sin(latDeg * DEG);
  const rc = WGS84_A / Math.sqrt(1 - EPS_SQ * sinlat * sinlat);
  const xp = (rc + altitudeKm) * coslat;
  const zp = (rc * (1 - EPS_SQ) + altitudeKm) * sinlat;
  const r = Math.sqrt(xp * xp + zp * zp);
  const phig = Math.asin(zp / r) / DEG;

  const { pcup, dpcup } = legendre(phig);
  const { relativeRadiusPower, cosM, sinM } = harmonicVariables(lonDeg, r);

  // Spherical-harmonic summation in geocentric frame.
  let bx = 0;
  let by = 0;
  let bz = 0;
  for (let n = 1; n <= N_MAX; n++) {
    for (let m = 0; m <= n; m++) {
      const i = (n * (n + 1)) / 2 + m;
      const rrp = relativeRadiusPower[n]!;
      const gh = g[i]! * cosM[m]! + h[i]! * sinM[m]!;
      bz -= rrp * gh * (n + 1) * pcup[i]!;
      by += rrp * (g[i]! * sinM[m]! - h[i]! * cosM[m]!) * m * pcup[i]!;
      bx -= rrp * gh * dpcup[i]!;
    }
  }

  const cosPhi = Math.cos(phig * DEG);
  if (Math.abs(cosPhi) > 1e-10) {
    by = by / cosPhi;
  } else {
    by = poleEastComponent(phig, g, h, relativeRadiusPower, sinM, cosM);
  }

  // Rotate the geocentric field back to the geodetic frame.
  const psi = (phig - latDeg) * DEG;
  const bxGeo = bx * Math.cos(psi) - bz * Math.sin(psi);
  const bzGeo = bx * Math.sin(psi) + bz * Math.cos(psi);

  const horizontal = Math.sqrt(bxGeo * bxGeo + by * by);
  const total = Math.sqrt(horizontal * horizontal + bzGeo * bzGeo);

  return {
    declinationDeg: Math.atan2(by, bxGeo) / DEG,
    inclinationDeg: Math.atan2(bzGeo, horizontal) / DEG,
    horizontalIntensityNt: horizontal,
    totalIntensityNt: total,
    northNt: bxGeo,
    eastNt: by,
    downNt: bzGeo,
    decimalYear: WMM_EPOCH + dyear,
  };
}

// Schmidt semi-normalised associated Legendre functions and derivatives at the
// geocentric latitude. Only the low-degree recursion is needed: N_MAX is 12,
// well below the degree where the high-latitude scaled variant matters.
function legendre(phigDeg: number): { pcup: number[]; dpcup: number[] } {
  const x = Math.sin(phigDeg * DEG);
  const size = (N_MAX * (N_MAX + 1)) / 2 + N_MAX + 1;
  const schmidt = new Array<number>(size).fill(0);
  const pcup = new Array<number>(size).fill(0);
  const dpcup = new Array<number>(size).fill(0);
  schmidt[0] = 1;
  pcup[0] = 1;
  const z = Math.sqrt((1 - x) * (1 + x));

  for (let n = 1; n <= N_MAX; n++) {
    for (let m = 0; m <= n; m++) {
      const i = (n * (n + 1)) / 2 + m;
      if (n === m) {
        const i1 = ((n - 1) * n) / 2 + m - 1;
        pcup[i] = z * pcup[i1]!;
        dpcup[i] = z * dpcup[i1]! + x * pcup[i1]!;
      } else if (n === 1 && m === 0) {
        const i1 = ((n - 1) * n) / 2 + m;
        pcup[i] = x * pcup[i1]!;
        dpcup[i] = x * dpcup[i1]! - z * pcup[i1]!;
      } else if (n > 1 && n !== m) {
        const i1 = ((n - 2) * (n - 1)) / 2 + m;
        const i2 = ((n - 1) * n) / 2 + m;
        if (m > n - 2) {
          pcup[i] = x * pcup[i2]!;
          dpcup[i] = x * dpcup[i2]! - z * pcup[i2]!;
        } else {
          const k = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
          pcup[i] = x * pcup[i2]! - k * pcup[i1]!;
          dpcup[i] = x * dpcup[i2]! - z * pcup[i2]! - k * dpcup[i1]!;
        }
      }
    }
  }

  for (let n = 1; n <= N_MAX; n++) {
    let i = (n * (n + 1)) / 2;
    const i1 = ((n - 1) * n) / 2;
    schmidt[i] = (schmidt[i1]! * (2 * n - 1)) / n;
    for (let m = 1; m <= n; m++) {
      i = (n * (n + 1)) / 2 + m;
      const prev = (n * (n + 1)) / 2 + m - 1;
      schmidt[i] = schmidt[prev]! * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m));
    }
  }

  for (let n = 1; n <= N_MAX; n++) {
    for (let m = 0; m <= n; m++) {
      const i = (n * (n + 1)) / 2 + m;
      pcup[i] = pcup[i]! * schmidt[i]!;
      dpcup[i] = dpcup[i]! * -schmidt[i]!;
    }
  }

  return { pcup, dpcup };
}

function harmonicVariables(lonDeg: number, r: number): {
  relativeRadiusPower: number[];
  cosM: number[];
  sinM: number[];
} {
  const cosLambda = Math.cos(lonDeg * DEG);
  const sinLambda = Math.sin(lonDeg * DEG);
  const cosM = [1, cosLambda];
  const sinM = [0, sinLambda];
  const relativeRadiusPower = [(GEOMAG_RE / r) * (GEOMAG_RE / r)];
  for (let n = 1; n <= N_MAX; n++) {
    relativeRadiusPower[n] = relativeRadiusPower[n - 1]! * (GEOMAG_RE / r);
  }
  for (let m = 2; m <= N_MAX; m++) {
    cosM[m] = cosM[m - 1]! * cosLambda - sinM[m - 1]! * sinLambda;
    sinM[m] = cosM[m - 1]! * sinLambda + sinM[m - 1]! * cosLambda;
  }
  return { relativeRadiusPower, cosM, sinM };
}

// East component is a 0/0 form at the geographic poles; NOAA's library uses a
// dedicated series there. Reproduced so pole queries do not return NaN.
function poleEastComponent(
  phigDeg: number,
  g: number[],
  h: number[],
  relativeRadiusPower: number[],
  sinM: number[],
  cosM: number[],
): number {
  let by = 0;
  let qn1 = 1;
  const pcupS = [1];
  const sinPhi = Math.sin(phigDeg * DEG);
  for (let n = 1; n <= N_MAX; n++) {
    const i = (n * (n + 1)) / 2 + 1;
    const qn2 = (qn1 * (2 * n - 1)) / n;
    const qn3 = qn2 * Math.sqrt((2 * n) / (n + 1));
    qn1 = qn2;
    if (n === 1) {
      pcupS[n] = pcupS[n - 1]!;
    } else {
      const k = ((n - 1) * (n - 1) - 1) / ((2 * n - 1) * (2 * n - 3));
      pcupS[n] = sinPhi * pcupS[n - 1]! - k * pcupS[n - 2]!;
    }
    by += relativeRadiusPower[n]! * (g[i]! * sinM[1]! - h[i]! * cosM[1]!) * pcupS[n]! * qn3;
  }
  return by;
}
