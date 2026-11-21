/**
 * 截面分析:最薄点、偏心度、外径公差、挤偏位置。
 */

import { CoreGeometry } from './cableModel';
import { outerDiameterTolerance } from './materials';

export interface LayerThicknessIssue {
  layerName: string;
  /** 最薄点厚度 mm */
  minThickness: number;
  /** 标称厚度 mm */
  nominalThickness: number;
  /** 是否低于标准要求(最薄点 ≥ 标称×0.9 - 0.1,GB/T 12706 绝缘要求) */
  pass: boolean;
}

export interface EccentricityResult {
  /** 偏心度 = (tmax - tmin) / tmax */
  eccentricity: number;
  /** 偏心方向角 rad */
  angle: number;
  /** 偏移量 mm */
  offset: number;
}

/** 由 8 方向实测厚度计算最薄点与偏心度 */
export function analyzeThicknesses(layerName: string, nominal: number, samples: number[]): {
  issue: LayerThicknessIssue;
  ecc: EccentricityResult;
} {
  const tmin = Math.min(...samples);
  const tmax = Math.max(...samples);
  const pass = tmin >= nominal * 0.9 - 0.1 - 1e-9;
  // 偏心方向:最薄点方向
  const idx = samples.indexOf(tmin);
  const angle = (2 * Math.PI * idx) / samples.length;
  // 偏移量近似:(tmax - tmin)/2
  const offset = (tmax - tmin) / 2;
  return {
    issue: { layerName, minThickness: tmin, nominalThickness: nominal, pass },
    ecc: { eccentricity: tmax > 0 ? (tmax - tmin) / tmax : 0, angle, offset },
  };
}

/** 外径公差判定 */
export function checkOuterDiameter(measured: number, nominal: number): {
  deviation: number;
  tolerance: number;
  pass: boolean;
} {
  const tolerance = outerDiameterTolerance(nominal);
  const deviation = measured - nominal;
  return { deviation, tolerance, pass: Math.abs(deviation) <= tolerance };
}

/**
 * 线芯翻身(扇形芯不退扭绞合)导致绝缘挤偏风险位置。
 * 不退扭时线芯每节距自转 1 圈,扇形顶点相对成缆中心的方位角随 z 变化;
 * 当扇形顶点朝向偏离"朝心"方向超过阈值时,绝缘在弯曲内侧受挤压,标记为风险区。
 * @returns 风险区轴向位置列表(每节距内风险区间的中心 z, mm)
 */
export function insulationShiftRiskZones(
  layLength: number,
  cableLength: number,
  backTwist: boolean,
  thresholdRad = Math.PI / 3,
): { zStart: number; zEnd: number }[] {
  if (backTwist) return [];
  const zones: { zStart: number; zEnd: number }[] = [];
  // 每节距内,偏离朝心方向超过阈值的角度区间
  // 方位偏差 δ(z) = 2π·z/h(相对朝心)。|δ mod 2π| > θ 时为风险。
  const frac = thresholdRad / (2 * Math.PI); // 每节距内安全占比的一半
  const h = layLength;
  for (let k = 0; k * h < cableLength; k++) {
    const zStart = (k + frac) * h;
    const zEnd = (k + 1 - frac) * h;
    if (zStart < cableLength) zones.push({ zStart, zEnd: Math.min(zEnd, cableLength) });
  }
  return zones;
}

/** 设计截面单线位置(用于与实测照片叠加对比) */
export interface WirePosition {
  x: number;
  y: number;
  diameter: number;
  layer: number;
}

export function designWirePositions(geom: CoreGeometry): WirePosition[] {
  const out: WirePosition[] = [];
  for (const layer of geom.strandLayers) {
    const R = layer.meanDiameter / 2;
    for (let i = 0; i < layer.wireCount; i++) {
      const a = (2 * Math.PI * i) / layer.wireCount;
      out.push({
        x: layer.index === 0 ? 0 : R * Math.cos(a),
        y: layer.index === 0 ? 0 : R * Math.sin(a),
        diameter: layer.wireDiameter,
        layer: layer.index,
      });
    }
  }
  return out;
}

/** 实测与设计的偏差统计 */
export function compareMeasured(
  design: WirePosition[],
  measuredCount: number,
  measuredOd: number,
  designOd: number,
): {
  countDiff: number;
  odDeviation: number;
  odDeviationPct: number;
} {
  return {
    countDiff: measuredCount - design.length,
    odDeviation: measuredOd - designOd,
    odDeviationPct: designOd > 0 ? ((measuredOd - designOd) / designOd) * 100 : 0,
  };
}
