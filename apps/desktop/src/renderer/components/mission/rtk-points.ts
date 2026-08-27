/**
 * Parser for surveyed point lists (RTK pole measurements handed over as
 * text/CSV). One point per line, tolerant of the formats field tools emit:
 *
 *   53.397635, 8.136100
 *   53.397635 8.136100 12.3        (trailing numbers ignored)
 *   P1; 53,397635; 8,136100        (label + decimal commas)
 *   corner_ne  53.397635  8.136100
 *   # comment / header lines are skipped and reported
 *
 * Latitude before longitude. When the first number cannot be a latitude but
 * the second can (|lat| > 90, |lng| <= 90) the pair is swapped.
 */

export interface ParsedPoint {
  lat: number;
  lng: number;
  label: string | null;
}

export interface ParseResult {
  points: ParsedPoint[];
  /** 1-based line numbers that contained content but produced no point. */
  skipped: number[];
}

/** "53,397635" -> 53.397635; leaves "53.397635" and integers untouched. */
function numToken(tok: string): number | null {
  const normalized = /^-?\d+,\d+$/.test(tok) ? tok.replace(',', '.') : tok;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function finishPoint(a: number, b: number, label: string | null): ParsedPoint | null {
  let lat = a;
  let lng = b;
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lat, lng] = [lng, lat];
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // A surveyed point at exactly 0,0 is an instrument default, not a fix.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng, label };
}

function parseLine(line: string): ParsedPoint | null {
  // Structured separators first (CSV/TSV exports): fields may carry decimal
  // commas because the comma is not doing separator duty.
  for (const sep of [';', '\t']) {
    if (!line.includes(sep)) continue;
    const fields = line.split(sep).map((f) => f.trim()).filter((f) => f.length > 0);
    const nums: number[] = [];
    const words: string[] = [];
    for (const f of fields) {
      const n = numToken(f);
      if (n !== null && nums.length < 2) nums.push(n);
      else if (n === null) words.push(f);
    }
    if (nums.length === 2) return finishPoint(nums[0]!, nums[1]!, words[0] ?? null);
  }

  // Free-form: grab standalone decimal numbers in order. The lookbehind keeps
  // digits embedded in labels ("P1", "corner_2") from being read as numbers.
  const matches = [...line.matchAll(/(?<![A-Za-z0-9_.,])-?\d+(?:[.,]\d+)?/g)];
  const nums = matches.map((m) => numToken(m[0])).filter((n): n is number => n !== null);
  if (nums.length < 2) return null;
  // Everything before the first standalone number is the label ("P1 53.4 ..."
  // keeps "P1" whole - the digit inside it was never matched as a number).
  const firstNumIdx = matches[0]!.index ?? 0;
  const label = firstNumIdx > 0 ? line.slice(0, firstNumIdx).replace(/[\s,;:=]+$/, '').trim() : '';
  return finishPoint(nums[0]!, nums[1]!, label.length > 0 ? label : null);
}

export function parseSurveyedPoints(text: string): ParseResult {
  const points: ParsedPoint[] = [];
  const skipped: number[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.length === 0 || line.startsWith('#') || line.startsWith('//')) continue;
    const pt = parseLine(line);
    if (pt) points.push(pt);
    else skipped.push(i + 1);
  }
  return { points, skipped };
}
