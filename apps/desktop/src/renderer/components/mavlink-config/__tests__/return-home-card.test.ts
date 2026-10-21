import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Issue #98: the RTL height card is shared by Quick setup and Safety.
 * One component owns the parameter logic; both tabs render it.
 */
const dir = join(__dirname, '..');
const card = readFileSync(join(dir, 'ReturnHomeCard.tsx'), 'utf-8');
const safety = readFileSync(join(dir, 'SafetyTab.tsx'), 'utf-8');
const quick = readFileSync(join(dir, 'QuickSetupTab.tsx'), 'utf-8');

describe('issue #98 - return height on the Safety page', () => {
  it('ReturnHomeCard handles every firmware spelling of the return height', () => {
    for (const name of ['RTL_ALT_M', 'RTL_ALT', 'RTL_ALTITUDE', 'ALT_HOLD_RTL', 'RTL_ALT_FINAL_M', 'RTL_ALT_FINAL', 'RTL_ALT_TYPE', 'RTL_LOIT_TIME']) {
      expect(card, `ReturnHomeCard.tsx no longer handles ${name}`).toContain(`'${name}'`);
    }
  });

  it('SafetyTab renders the shared card instead of its own RTL fields', () => {
    expect(safety).toContain("import { ReturnHomeCard } from './ReturnHomeCard'");
    expect(safety).toContain('<ReturnHomeCard');
    expect(safety).not.toContain("'RTL_ALT'");
  });

  it('SafetyTab shows the card only for aircraft', () => {
    expect(safety).toMatch(/vehicleClass === 'copter' \|\| vehicleClass === 'plane' \|\| vehicleClass === 'vtol'/);
    expect(safety).not.toMatch(/vehicleClass === 'rover'/);
  });

  it('QuickSetupTab imports the card rather than defining it', () => {
    expect(quick).toContain("import { ReturnHomeCard } from './ReturnHomeCard'");
    expect(quick).not.toContain('function ReturnHomeCard(');
  });

  it('the card stages writes through the parameter store like the rest of the tab', () => {
    expect(card).toContain("from './quick-setup-ui'");
    expect(card).toContain('useParam()');
    expect(card).not.toContain('useParameterStore');
  });
});
