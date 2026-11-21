/**
 * 铠装计算:钢带绕包(搭盖率/间隙)与钢丝绞合。
 */

export interface SteelTapeArmorSpec {
  kind: 'tape';
  /** 钢带宽度 mm */
  tapeWidth: number;
  /** 钢带厚度 mm */
  tapeThickness: number;
  /** 层数(通常双层,内层间隙被外层覆盖) */
  layers: 1 | 2;
  /** 搭盖率(0~1,重叠宽度/带宽;负值表示间隙绕包,|值| = 间隙/带宽) */
  overlap: number;
  /** 绕包节距由带宽与搭盖决定,也可显式给绕包角 */
  wrapAngleDeg?: number;
  /** 铠装内径(绕包基圆直径) mm */
  baseDiameter: number;
}

export interface SteelWireArmorSpec {
  kind: 'wire';
  wireDiameter: number;
  wireCount: number;
  layRatio: number;
  direction: 'S' | 'Z';
  baseDiameter: number;
}

export type ArmorSpec = SteelTapeArmorSpec | SteelWireArmorSpec;

export interface TapeArmorResult {
  kind: 'tape';
  /** 绕包角(与电缆轴向夹角的余角,即螺旋角) deg */
  helixAngleDeg: number;
  /** 绕包节距 mm */
  layLength: number;
  /** 每圈轴向推进 mm */
  axialPitch: number;
  /** 实际搭盖宽度 mm(负为间隙) */
  overlapWidth: number;
  /** 每公里钢带长度 m */
  tapeLengthPerKm: number;
  /** 每公里钢带重量 kg/km(双层×2) */
  weightPerKm: number;
  /** 铠装外径 mm */
  outerDiameter: number;
}

export interface WireArmorResult {
  kind: 'wire';
  layFactor: number;
  layLength: number;
  outerDiameter: number;
  /** 钢丝间隙(相邻钢丝表面距离) mm,负值表示排不下 */
  gap: number;
  weightPerKm: number;
}

export function computeTapeArmor(spec: SteelTapeArmorSpec): TapeArmorResult {
  const D = spec.baseDiameter + spec.tapeThickness; // 节圆(带中心)
  // 绕包角默认约 45°(工程常用 40~50°)
  const angleDeg = spec.wrapAngleDeg ?? 45;
  const angle = (angleDeg * Math.PI) / 180;
  // 带在圆柱上螺旋绕包:带在轴向的占用宽度 = 带宽/sin(绕包角)
  const axialWidth = spec.tapeWidth / Math.sin(angle);
  const overlapWidth = spec.overlap * spec.tapeWidth;
  // 每圈轴向推进 = 轴向占用宽度 - 搭盖宽度(负搭盖即间隙,推进变大)
  const pitch = axialWidth - overlapWidth;
  const h = pitch;
  const helixLen = Math.sqrt(h * h + (Math.PI * D) ** 2);
  const tapeLengthPerKm = (1000_000 / h) * helixLen / 1000; // m
  const volume = tapeLengthPerKm * 1000 * spec.tapeWidth * spec.tapeThickness; // mm³
  const weightPerKm = (volume * 7.85 * 1e-6) * spec.layers; // mm³→kg: ×7.85e-6
  return {
    kind: 'tape',
    helixAngleDeg: angleDeg,
    layLength: h,
    axialPitch: pitch,
    overlapWidth,
    tapeLengthPerKm: tapeLengthPerKm * spec.layers,
    weightPerKm,
    outerDiameter: spec.baseDiameter + 2 * spec.tapeThickness * spec.layers,
  };
}

export function computeWireArmor(spec: SteelWireArmorSpec): WireArmorResult {
  const D = spec.baseDiameter + spec.wireDiameter;
  const layLength = spec.layRatio * D;
  const layFactor = Math.sqrt(1 + (Math.PI * D / layLength) ** 2);
  // 相邻钢丝中心弦长 = 2R·sin(π/n),间隙 = 弦长 - d
  const R = D / 2;
  const chord = 2 * R * Math.sin(Math.PI / spec.wireCount);
  const gap = chord - spec.wireDiameter;
  const area = (Math.PI * spec.wireDiameter ** 2) / 4;
  const weightPerKm = area * spec.wireCount * layFactor * 1000 * 7.85 * 1e-3;
  return {
    kind: 'wire',
    layFactor,
    layLength,
    outerDiameter: spec.baseDiameter + 2 * spec.wireDiameter,
    gap,
    weightPerKm,
  };
}

export function computeArmor(spec: ArmorSpec): TapeArmorResult | WireArmorResult {
  return spec.kind === 'tape' ? computeTapeArmor(spec) : computeWireArmor(spec);
}
