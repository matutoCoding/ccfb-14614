/**
 * 导体绞合计算核心。
 *
 * 绞入系数(绞入率相关)定义:
 *   单线绕在平均直径为 D 的圆柱上,节距(节距长度)为 h。
 *   一个节距内单线实际长度 L = sqrt(h^2 + (π·D)^2)
 *   绞入系数 k = L / h = sqrt(1 + (π·D/h)^2) = sqrt(1 + (π/m)^2),m = h/D 为节距比(节径比)。
 * 每公里电缆该层单线用量 = k × 1000 m × 根数。
 *
 * 注意:节距比 m 按"层平均直径"(节圆直径)计,即该层单线中心所在圆的直径,
 * 与工艺手册一致。绞入系数精确式即上式,不用近似 1+(π/m)^2/2。
 */

export type LayDirection = 'S' | 'Z';

export interface StrandLayerSpec {
  /** 单线根数(中心层为 1) */
  wireCount: number;
  /** 单线直径 mm(本层,通常各层相同) */
  wireDiameter: number;
  /** 节距比 m = 节距 / 层平均直径 */
  layRatio: number;
  /** 绞向 */
  direction: LayDirection;
}

export interface StrandLayerResult extends StrandLayerSpec {
  /** 层序号,0 = 中心 */
  index: number;
  /** 层内径(该层单线内切圆直径) mm */
  innerDiameter: number;
  /** 层平均直径(节圆直径,单线中心圆) mm */
  meanDiameter: number;
  /** 层外径 mm */
  outerDiameter: number;
  /** 节距 mm */
  layLength: number;
  /** 绞入系数 k = sqrt(1+(π/m)^2) */
  layFactor: number;
  /** 一个节距内单根单线实际长度 mm */
  wireLengthPerLay: number;
  /** 每公里电缆该层单线总长度 m */
  wireLengthPerKm: number;
}

/** 正规绞合各层根数:1, 6, 12, 18, 24 ... 第 n 层(n≥1)为 6n */
export function regularLayerWireCount(layerIndex: number): number {
  return layerIndex === 0 ? 1 : 6 * layerIndex;
}

/** 由总根数反推正规绞层数,如 7→[1,6], 19→[1,6,12], 37→[1,6,12,18], 61, 91, 127 */
export function regularLayerCounts(totalWires: number): number[] | null {
  const counts: number[] = [1];
  let sum = 1;
  let layer = 1;
  while (sum < totalWires) {
    const c = regularLayerWireCount(layer);
    sum += c;
    counts.push(c);
    if (sum === totalWires) return counts;
    if (sum > totalWires) return null; // 非正规
    layer++;
    if (layer > 100) return null;
  }
  return counts;
}

/**
 * 非正规绞(如 1+6+12+15,或 7+12 等)允许用户直接给每层根数。
 * 几何可容纳性校验:第 n 层最多容纳的根数 ≈ π·(D_inner + d)/d 取整(等径单线)。
 */
export function maxWiresInLayer(innerDiameter: number, wireDiameter: number): number {
  // 单线中心位于直径 D = innerDiameter + wireDiameter 的圆上
  // 相邻单线中心弦长 ≥ d → 2·R·sin(π/n) ≥ d
  const R = (innerDiameter + wireDiameter) / 2;
  const n = Math.PI / Math.asin(Math.min(1, wireDiameter / (2 * R)));
  return Math.floor(n + 1e-9);
}

/** 绞入系数(精确式) */
export function layFactor(meanDiameter: number, layLength: number): number {
  return Math.sqrt(1 + (Math.PI * meanDiameter / layLength) ** 2);
}

/** 由节距比求绞入系数 k = sqrt(1+(π/m)^2) */
export function layFactorFromRatio(layRatio: number): number {
  return Math.sqrt(1 + (Math.PI / layRatio) ** 2);
}

/**
 * 逐层计算绞合导体几何与绞入系数。
 * @param layers 从中心(第0层)向外排列
 * @returns 每层结果,含节圆直径、节距、绞入系数、每公里单线长度
 */
export function computeStrandLayers(layers: StrandLayerSpec[]): StrandLayerResult[] {
  const results: StrandLayerResult[] = [];
  let innerDiameter = 0; // 第0层(中心线)内径按 0 处理
  layers.forEach((spec, index) => {
    const d = spec.wireDiameter;
    const meanDiameter = index === 0 ? 0 : innerDiameter + d;
    const outerDiameter = index === 0 ? d : innerDiameter + 2 * d;
    const layLength = index === 0 ? Infinity : spec.layRatio * meanDiameter;
    const k = index === 0 ? 1 : layFactor(meanDiameter, layLength);
    const wireLengthPerLay = index === 0 ? layLength : layLength * k;
    results.push({
      ...spec,
      index,
      innerDiameter,
      meanDiameter,
      outerDiameter,
      layLength,
      layFactor: k,
      wireLengthPerLay,
      wireLengthPerKm: k * 1000 * spec.wireCount,
    });
    innerDiameter = outerDiameter;
  });
  return results;
}

/** 圆单线截面积 mm² */
export function wireArea(diameter: number): number {
  return Math.PI * diameter * diameter / 4;
}

export interface MaterialUsage {
  /** 材料密度 g/cm³ */
  density: number;
  /** 每公里长度 m */
  lengthPerKm: number;
  /** 单根截面积 mm² */
  areaEach: number;
  /** 根数 */
  count: number;
  /** 每公里重量 kg/km */
  weightPerKm: number;
}

/**
 * 每公里材料重量。
 * areaEach mm² × length m → 体积 mm²·m = 1e-3 L;密度 g/cm³ = kg/L → kg = mm²·m·ρ·1e-3
 */
export function materialWeightPerKm(areaEach: number, count: number, layFactorK: number, density: number): MaterialUsage {
  const lengthPerKm = layFactorK * 1000;
  const weightPerKm = areaEach * count * lengthPerKm * density * 1e-3;
  return { density, lengthPerKm, areaEach, count, weightPerKm };
}

/** 整根绞合导体每公里金属总重(各层可不同材料时逐层算再求和,此处同材料) */
export function conductorWeightPerKm(layers: StrandLayerResult[], density: number): number {
  return layers.reduce(
    (sum, l) => sum + materialWeightPerKm(wireArea(l.wireDiameter), l.wireCount, l.layFactor, density).weightPerKm,
    0,
  );
}

/** 绞合导体总截面积(各单线截面积之和) mm² */
export function conductorMetalArea(layers: StrandLayerSpec[]): number {
  return layers.reduce((s, l) => s + l.wireCount * wireArea(l.wireDiameter), 0);
}

/** 绞合外径(未紧压) mm */
export function strandedOuterDiameter(layers: StrandLayerResult[]): number {
  return layers.length ? layers[layers.length - 1].outerDiameter : 0;
}

/** 相邻层默认反向:给定上一层绞向,返回本层默认绞向 */
export function alternateDirection(prev: LayDirection): LayDirection {
  return prev === 'S' ? 'Z' : 'S';
}
