import { describe, it, expect } from 'vitest';
import { findFrameLayout, layoutToSvgPositions } from './motor-layout-utils';

const OCTAQUAD = 4;
const Y6 = 5;
const TRI = 7;
const DODECAHEXA = 12;
const X = 1;

describe('coaxial frames in the diagram', () => {
  it.each([
    ['OctaQuad X', OCTAQUAD, X],
    ['Y6', Y6, 0],
    ['DodecaHexa X', DODECAHEXA, X],
  ])('%s draws every motor at its own spot', (_name, cls, type) => {
    const layout = findFrameLayout(cls, type)!;
    const positions = layoutToSvgPositions(layout, 340);
    const spots = new Set(positions.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`));
    expect(spots.size).toBe(layout.motors.length);
  });

  it('keeps a coaxial pair on its arm, side by side and smaller', () => {
    const layout = findFrameLayout(OCTAQUAD, X)!;
    const positions = layoutToSvgPositions(layout, 340);
    const m1 = layout.motors.find((m) => m.Number === 1)!;
    const partner = layout.motors.find((m) => m.Number !== 1 && m.Roll === m1.Roll && m.Pitch === m1.Pitch)!;
    const top = positions.find((p) => p.number === 1)!;
    const bottom = positions.find((p) => p.number === partner.Number)!;
    const single = layoutToSvgPositions(findFrameLayout(1, X)!, 340)[0]!;
    expect(top.r).toBeLessThan(single.r);
    expect(Math.hypot(top.cx - bottom.cx, top.cy - bottom.cy)).toBeGreaterThan(top.r * 1.4);
    expect(Math.hypot(top.cx - bottom.cx, top.cy - bottom.cy)).toBeLessThan(top.r * 2.4);
    // both still in the front-right quadrant (negative Roll is the right side)
    for (const p of [top, bottom]) { expect(p.cx).toBeGreaterThan(170); expect(p.cy).toBeLessThan(170); }
  });

  it('marks the tricopter yaw servo at the centre instead of drawing a fourth motor', () => {
    const positions = layoutToSvgPositions(findFrameLayout(TRI, 0)!, 340);
    const servo = positions.filter((p) => p.servo);
    expect(servo).toHaveLength(1);
    expect(servo[0]!.number).toBe(7);
    expect(positions.filter((p) => !p.servo)).toHaveLength(3);
  });

  it('leaves plain frames where they were', () => {
    const positions = layoutToSvgPositions(findFrameLayout(1, X)!, 200);
    expect(positions.every((p) => !p.servo)).toBe(true);
    expect(positions.find((p) => p.number === 1)!.cx).toBeGreaterThan(100);
  });
});
