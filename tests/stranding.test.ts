/**
 * 绞入系数与每公里用铜量:与手册手算值对比,误差 ≤0.2%。
 */

import { describe, it, expect } from 'vitest';
import {
  computeStrandLayers, layFactor, layFactorFromRatio,
  conductorWeightPerKm, conductorMetalArea, regularLayerCounts,
  maxWiresInLayer, StrandLayerSpec,
} from '../src/core/stranding';

/** 手算:节圆直径 D,节距 h,单线直径 d,根数 n,密度 ρ → kg/km */
function handCalcWeight(D: number, h: number, d: number, n: number, rho: number): number {
  const L = Math.sqrt(h * h + Math.PI * Math.PI * D * D); // 一个节距单线长 mm
  const perKm = (L / h) * 1000; // 每公里单线长 m
  const area = (Math.PI * d * d) / 4; // mm²
  return area * n * perKm * rho * 1e-3;
}

describe('绞入系数', () => {
  it('k = sqrt(1+(π/m)^2) 与定义一致', () => {
    expect(layFactorFromRatio(10)).toBeCloseTo(Math.sqrt(1 + (Math.PI / 10) ** 2), 12);
    expect(layFactorFromRatio(20)).toBeCloseTo(Math.sqrt(1 + (Math.PI / 20) ** 2), 12);
  });

  it('由节圆直径与节距计算 k', () => {
    const D = 20, h = 300;
    expect(layFactor(D, h)).toBeCloseTo(Math.sqrt(h * h + Math.PI ** 2 * D * D) / h, 12);
  });

  it('节距比无穷大时 k→1', () => {
    expect(layFactorFromRatio(1e6)).toBeCloseTo(1, 5);
  });
});

describe('正规绞层数', () => {
  it('7/19/37/61 根判定', () => {
    expect(regularLayerCounts(7)).toEqual([1, 6]);
    expect(regularLayerCounts(19)).toEqual([1, 6, 12]);
    expect(regularLayerCounts(37)).toEqual([1, 6, 12, 18]);
    expect(regularLayerCounts(61)).toEqual([1, 6, 12, 18, 24]);
    expect(regularLayerCounts(20)).toBeNull();
  });
});

describe('每公里用铜量(对手手算)', () => {
  // 例:19 根 2.60mm 单线,1+6+12,节距比 18/16
  const layers: StrandLayerSpec[] = [
    { wireCount: 1, wireDiameter: 2.6, layRatio: 0, direction: 'S' },
    { wireCount: 6, wireDiameter: 2.6, layRatio: 18, direction: 'S' },
    { wireCount: 12, wireDiameter: 2.6, layRatio: 16, direction: 'Z' },
  ];
  const results = computeStrandLayers(layers);

  it('层几何:节圆直径逐层累加', () => {
    expect(results[0].outerDiameter).toBeCloseTo(2.6, 10);
    expect(results[1].meanDiameter).toBeCloseTo(2.6 + 2.6, 10);
    expect(results[1].outerDiameter).toBeCloseTo(2.6 * 3, 10);
    expect(results[2].meanDiameter).toBeCloseTo(2.6 * 4, 10);
    expect(results[2].outerDiameter).toBeCloseTo(2.6 * 5, 10);
  });

  it('每层绞入系数与手算一致(≤0.2%)', () => {
    for (const r of results) {
      if (r.index === 0) continue;
      const hand = Math.sqrt(1 + (Math.PI / r.layRatio) ** 2);
      expect(Math.abs(r.layFactor - hand) / hand).toBeLessThan(0.002);
    }
  });

  it('总用铜量与逐层手算之和一致(≤0.2%)', () => {
    const prog = conductorWeightPerKm(results, 8.89);
    let hand = 0;
    for (const r of results) {
      if (r.index === 0) {
        hand += handCalcWeight(0, 1, r.wireDiameter, r.wireCount, 8.89); // 中心线 k=1
      } else {
        hand += handCalcWeight(r.meanDiameter, r.layLength, r.wireDiameter, r.wireCount, 8.89);
      }
    }
    expect(Math.abs(prog - hand) / hand).toBeLessThan(0.002);
  });

  it('与手册参考值同量级(19×2.6mm ≈ 100mm² → ~900 kg/km)', () => {
    const prog = conductorWeightPerKm(results, 8.89);
    const area = conductorMetalArea(layers);
    expect(area).toBeCloseTo(19 * Math.PI * 2.6 ** 2 / 4, 6);
    // 无绞入时重量 = 面积×1000×8.89e-3
    const base = area * 1000 * 8.89e-3;
    expect(prog).toBeGreaterThan(base);
    expect(prog / base).toBeLessThan(1.05); // 绞入增量 <5%
  });
});

describe('层容纳根数', () => {
  it('第1层(内径 d)恰好容纳 6 根', () => {
    expect(maxWiresInLayer(2.6, 2.6)).toBe(6);
  });
  it('第2层(内径 3d)容纳 12 根', () => {
    expect(maxWiresInLayer(2.6 * 3, 2.6)).toBe(12);
  });
});
