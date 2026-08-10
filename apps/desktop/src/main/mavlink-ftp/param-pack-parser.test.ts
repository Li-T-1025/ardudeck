import { describe, it, expect } from 'vitest';
import { parseParamPack } from './param-pack-parser';

/**
 * Build a minimal param.pck (magic 0x671b, no defaults) with int8 params.
 * Entry layout: type byte (int8=1), name-info byte, name chars, value byte.
 */
function buildPack(names: string[], declaredCount = names.length, totalParams = names.length): Uint8Array {
  const bytes: number[] = [];
  bytes.push(0x1b, 0x67); // magic, little endian
  bytes.push(declaredCount & 0xff, (declaredCount >> 8) & 0xff);
  bytes.push(totalParams & 0xff, (totalParams >> 8) & 0xff);
  for (const name of names) {
    bytes.push(1); // type int8, no flags
    bytes.push(((name.length - 1) & 0x0f) << 4); // all-new chars, no common prefix
    for (const ch of name) bytes.push(ch.charCodeAt(0));
    bytes.push(7); // value
  }
  return new Uint8Array(bytes);
}

describe('param.pck truncation detection', () => {
  it('marks a fully decoded file complete', () => {
    const pack = buildPack(['WPNAV_SPD', 'RTL_ALT', 'ATC_RAT_X']);
    const result = parseParamPack(pack);
    expect(result).not.toBeNull();
    expect(result!.params.map((p) => p.name)).toEqual(['WPNAV_SPD', 'RTL_ALT', 'ATC_RAT_X']);
    expect(result!.complete).toBe(true);
  });

  it('marks a truncated file incomplete instead of returning a silent partial set', () => {
    const pack = buildPack(['WPNAV_SPD', 'RTL_ALT', 'ATC_RAT_X']);
    const truncated = pack.slice(0, pack.length - 6); // cut into the last entry
    const result = parseParamPack(truncated);
    expect(result).not.toBeNull();
    expect(result!.params.length).toBeLessThan(3);
    expect(result!.complete).toBe(false);
  });

  it('marks a file whose header promises more entries than present incomplete', () => {
    const pack = buildPack(['WPNAV_SPD'], 5, 5);
    const result = parseParamPack(pack);
    expect(result).not.toBeNull();
    expect(result!.complete).toBe(false);
  });
});
