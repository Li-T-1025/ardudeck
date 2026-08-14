import { describe, it, expect } from 'vitest';
import { formatParamFile, parseParamFile, parseParamFileHeader } from '../param-file';

describe('parseParamFileHeader', () => {
  it('round-trips the header a vault snapshot writes', () => {
    const file = formatParamFile(
      [{ id: 'MC_ROLLRATE_P', value: 0.15 }],
      { Source: 'ArduDeck fleet vault', Board: 'Agri Octo', Firmware: 'px4' },
    );
    expect(parseParamFileHeader(file)).toEqual({
      Source: 'ArduDeck fleet vault',
      Board: 'Agri Octo',
      Firmware: 'px4',
    });
    // Header parsing must not disturb the params themselves.
    expect(parseParamFile(file)).toEqual([{ id: 'MC_ROLLRATE_P', value: 0.15 }]);
  });

  it('reports no Firmware for a snapshot taken before the stamp existed', () => {
    const legacy = '# Source: ArduDeck fleet vault\n# Board: Old Quad\n\nATC_RAT_RLL_P,0.135\n';
    expect(parseParamFileHeader(legacy).Firmware).toBeUndefined();
  });

  it('stops at the first param line, so a later comment is not a header', () => {
    const file = '# Firmware: px4\n\nMC_ROLLRATE_P,0.15\n# Firmware: ardupilot\n';
    expect(parseParamFileHeader(file).Firmware).toBe('px4');
  });

  it('returns an empty header when there is none', () => {
    expect(parseParamFileHeader('ATC_RAT_RLL_P,0.135\n')).toEqual({});
  });
});
