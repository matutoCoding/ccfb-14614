import { describe, it, expect } from 'vitest';
import { computeCabling, corePitchRadius, CablingSpec } from '../src/core/cabling';

const spec3: CablingSpec = {
  cores: [
    { diameter: 20, shape: 'round' },
    { diameter: 20, shape: 'round' },
    { diameter: 20, shape: 'round' },
  ],
  fillers: [{ diameter: 8, count: 3 }],
  layLength: 1400,
  direction: 'S',
  backTwist: false,
};

describe('成缆', () => {
  it('3 芯节圆半径 = r/sin(π/3)', () => {
    expect(corePitchRadius(10, 3)).toBeCloseTo(10 / Math.sin(Math.PI / 3), 10);
    expect(corePitchRadius(10, 2)).toBe(10);
    expect(corePitchRadius(10, 1)).toBe(0);
  });

  it('绞入系数与手算一致', () => {
    const r = computeCabling(spec3);
    const D = 2 * corePitchRadius(10, 3);
    const hand = Math.sqrt(1 + (Math.PI * D / 1400) ** 2);
    expect(Math.abs(r.layFactor - hand) / hand).toBeLessThan(0.002);
    expect(r.coreLengthPerKm).toBeCloseTo(hand * 1000, 6);
  });

  it('退扭时自转 0 圈,不退扭 = 1e6/节距 圈/km', () => {
    const nbt = computeCabling(spec3);
    expect(nbt.twistsPerKm).toBeCloseTo(1_000_000 / 1400, 6);
    const bt = computeCabling({ ...spec3, backTwist: true });
    expect(bt.twistsPerKm).toBe(0);
  });

  it('成缆外径 = 2(节圆半径+芯半径)', () => {
    const r = computeCabling(spec3);
    expect(r.cabledDiameter).toBeCloseTo(2 * (corePitchRadius(10, 3) + 10), 10);
  });
});
