/**
 * 紧压导体计算:圆形紧压与扇形(型线)紧压。
 *
 * 紧压系数 η(填充系数相关)定义:
 *   η = 紧压后金属实际截面积 / 紧压后轮廓(包络)截面积
 * 工艺上常用"紧压系数"指压缩程度:紧压后截面 = 绞合截面 × (1 - 压缩率)。
 * 本模块采用工程通用做法:
 *   - 输入目标紧压外径(或目标填充率),由金属截面积守恒求变形后单线截面;
 *   - 单线变形后仍为等截面(沿轴向不变),面积 = 金属总面积 / 根数;
 *   - 填充率 = 金属面积 / 包络圆(或扇形包络)面积。
 */

import { conductorMetalArea, StrandLayerSpec } from './stranding';

export type CompactShape = 'round' | 'sector';

export interface CompactSpec {
  shape: CompactShape;
  /** 目标填充率(圆形紧压典型 0.90~0.93,扇形可达 0.93~0.96) */
  targetFillFactor: number;
  /** 扇形参数:芯数(3/4/5 芯决定扇形角),仅 shape='sector' 有效 */
  sectorCores?: 3 | 4 | 5;
  /** 扇形圆角半径 mm(工艺圆角) */
  sectorCornerRadius?: number;
}

export interface CompactResult {
  shape: CompactShape;
  /** 金属总截面积 mm²(守恒,与绞合前一致) */
  metalArea: number;
  /** 紧压后包络截面积 mm² */
  envelopeArea: number;
  /** 实际填充率 */
  fillFactor: number;
  /** 紧压后导体外径 mm(圆形为直径;扇形为包络圆直径,即同截面圆导体的等效外径) */
  outerDiameter: number;
  /** 变形后单根单线截面积 mm² */
  wireAreaAfter: number;
  /** 扇形:扇形角 rad */
  sectorAngle?: number;
  /** 扇形:高度(扇形顶点到底边距离) mm */
  sectorHeight?: number;
  /** 扇形:成缆后绞合外径(各芯包络圆) mm */
  cabledDiameter?: number;
}

/**
 * 圆形紧压。
 * 由金属面积与目标填充率求包络圆:envelope = metal / η,D = sqrt(4·envelope/π)。
 */
export function compactRound(layers: StrandLayerSpec[], targetFillFactor: number): CompactResult {
  const metalArea = conductorMetalArea(layers);
  const envelopeArea = metalArea / targetFillFactor;
  const outerDiameter = 2 * Math.sqrt(envelopeArea / Math.PI);
  const count = layers.reduce((s, l) => s + l.wireCount, 0);
  return {
    shape: 'round',
    metalArea,
    envelopeArea,
    fillFactor: targetFillFactor,
    outerDiameter,
    wireAreaAfter: metalArea / count,
  };
}

/**
 * 扇形紧压(3/4/5 芯成缆用)。
 * 扇形角 θ = 2π/N(N 为芯数),扇形轮廓:两侧直边 + 内外圆弧 + 圆角。
 * 工程算法:扇形金属面积 = metalArea;包络面积 = metalArea / η;
 * 由包络面积反推扇形几何:设成缆中心到扇形外弧半径为 R2、内弧半径 R1,
 * 包络面积 ≈ θ/2·(R2² - R1²) - 圆角修正(简化为圆角面积补偿)。
 * 此处采用常用近似:先按理想扇形(无圆角)求 R2(给定 R1 = 内垫层半径,默认 0),
 * 再按圆角半径扣除角部面积迭代一次。
 */
export function compactSector(
  layers: StrandLayerSpec[],
  targetFillFactor: number,
  cores: 3 | 4 | 5,
  cornerRadius = 1.0,
): CompactResult {
  const metalArea = conductorMetalArea(layers);
  const envelopeArea = metalArea / targetFillFactor;
  const theta = (2 * Math.PI) / cores;
  const count = layers.reduce((s, l) => s + l.wireCount, 0);

  // 理想扇形:R1 从 0 起,包络面积 = θ/2·R2² → R2
  // 实际扇形内弧贴合成缆中心一个小圆(填充绳位置),取 R1 = 0.05·R2 起步迭代
  let R1 = 0;
  let R2 = Math.sqrt((2 * envelopeArea) / theta);
  for (let i = 0; i < 20; i++) {
    R1 = 0.05 * R2;
    // 包络面积 = 扇形环面积 - 两角圆角扣除(近似:每角扣除 (1-π/4)·r² 的角部空缺)
    const cornerLoss = 2 * (1 - Math.PI / 4) * cornerRadius * cornerRadius;
    const area = (theta / 2) * (R2 * R2 - R1 * R1) - cornerLoss;
    const err = envelopeArea - area;
    if (Math.abs(err) < 1e-6) break;
    // 用导数近似调整 R2:dA/dR2 = θ·R2
    R2 += err / (theta * R2);
  }
  const sectorHeight = R2 - R1;
  // 成缆外径:各芯外弧顶点位于直径 2·R2 的圆上
  const cabledDiameter = 2 * R2;
  // 等效外径:与包络面积同面积的圆直径
  const outerDiameter = 2 * Math.sqrt(envelopeArea / Math.PI);

  return {
    shape: 'sector',
    metalArea,
    envelopeArea,
    fillFactor: targetFillFactor,
    outerDiameter,
    wireAreaAfter: metalArea / count,
    sectorAngle: theta,
    sectorHeight,
    cabledDiameter,
  };
}

export function compactConductor(layers: StrandLayerSpec[], spec: CompactSpec): CompactResult {
  if (spec.shape === 'round') return compactRound(layers, spec.targetFillFactor);
  return compactSector(layers, spec.targetFillFactor, spec.sectorCores ?? 3, spec.sectorCornerRadius ?? 1.0);
}
