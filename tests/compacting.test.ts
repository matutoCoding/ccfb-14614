import { describe, it, expect } from 'vitest';
import { compactRound, compactSector } from '../src/core/compacting';
import { StrandLayerSpec, conductorMetalArea } from '../src/core/stranding';

const layers: StrandLayerSpec[] = [
  { wireCount: 1, wireDiameter: 2.6, layRatio: 0, direction: 'S' },
  { wireCount: 6, wireDiameter: 2.6, layRatio: 18, direction: 'S' },
  { wireCount: 12, wireDiameter: 2.6, layRatio: 16, direction: 'Z' },
];

describe('圆形紧压', () => {
  it('金属面积守恒,填充率 = 金属/包络', () => {
    const r = compactRound(layers, 0.9);
    const metal = conductorMetalArea(layers);
    expect(r.metalArea).toBeCloseTo(metal, 10);
    expect(r.envelopeArea).toBeCloseTo(metal / 0.9, 8);
    expect(r.outerDiameter).toBeCloseTo(2 * Math.sqrt(r.envelopeArea / Math.PI), 10);
  });
  it('填充率越高外径越小', () => {
    const a = compactRound(layers, 0.88);
    const b = compactRound(layers, 0.93);
    expect(b.outerDiameter).toBeLessThan(a.outerDiameter);
  });
});

describe('扇形紧压', () => {
  it('包络面积与目标填充率一致(迭代收敛)', () => {
    const r = compactSector(layers, 0.93, 3, 1.0);
    const metal = conductorMetalArea(layers);
    // 迭代后实际包络面积应接近 metal/0.93
    expect(Math.abs(r.envelopeArea - metal / 0.93) / (metal / 0.93)).toBeLessThan(0.001);
    expect(r.sectorAngle).toBeCloseTo((2 * Math.PI) / 3, 10);
    expect(r.sectorHeight!).toBeGreaterThan(0);
    expect(r.cabledDiameter!).toBeGreaterThan(r.outerDiameter);
  });
});
