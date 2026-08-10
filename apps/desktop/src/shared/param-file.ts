/**
 * Mission Planner compatible parameter file format (NAME,VALUE lines,
 * `#` comments). Shared by the fleet vault writer (main) and diff/restore
 * readers (renderer, tests).
 */

export interface ParamEntry {
  id: string;
  value: number;
}

export function formatParamFile(params: ParamEntry[], header: Record<string, string>): string {
  const lines = Object.entries(header).map(([k, v]) => `# ${k}: ${v}`);
  lines.push('');
  const sorted = [...params].sort((a, b) => a.id.localeCompare(b.id));
  for (const p of sorted) {
    const v = Number.isInteger(p.value) ? String(p.value) : String(parseFloat(p.value.toPrecision(7)));
    lines.push(`${p.id},${v}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function parseParamFile(content: string): ParamEntry[] {
  const out: ParamEntry[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const parts = line.split(/[,\t ]+/);
    const id = parts[0];
    const value = parts[1] !== undefined ? parseFloat(parts[1]) : NaN;
    if (id && Number.isFinite(value)) out.push({ id, value });
  }
  return out;
}
