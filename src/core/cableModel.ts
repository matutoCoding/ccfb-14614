/**
 * 电缆结构模型:由层叠结构(从里到外)定义,实时计算各层内外径与截面。
 */

import { LayerType, MATERIALS } from './materials';
import { StrandLayerSpec, computeStrandLayers, StrandLayerResult } from './stranding';
import { CompactSpec, CompactResult, compactConductor } from './compacting';

export interface CableLayer {
  id: string;
  type: LayerType;
  materialId: string;
  /** 厚度 mm(导体层忽略,由绞合计算给出) */
  thickness: number;
  /** 名称(显示用) */
  name: string;
}

export interface ConductorDesign {
  layers: StrandLayerSpec[];
  compact: CompactSpec | null;
}

export interface CoreDesign {
  id: string;
  name: string;
  conductor: ConductorDesign;
  /** 导体之外的层,从里到外 */
  layers: CableLayer[];
}

export interface CableDesign {
  id: string;
  name: string;
  voltage: string;
  cores: CoreDesign[];
  /** 成缆参数 */
  cabling: {
    layLength: number;
    direction: 'S' | 'Z';
    backTwist: boolean;
    fillerDiameter: number;
    fillerCount: number;
  } | null;
  /** 成缆外的层(内衬、铠装、护套) */
  outerLayers: CableLayer[];
  createdAt: number;
  updatedAt: number;
}

export interface LayerGeometry {
  layer: CableLayer;
  innerDiameter: number;
  outerDiameter: number;
  /** 每公里重量 kg/km(圆筒近似:π/4·(Do²-Di²)·ρ·1000·1e-3) */
  weightPerKm: number;
}

export interface CoreGeometry {
  core: CoreDesign;
  strandLayers: StrandLayerResult[];
  compact: CompactResult | null;
  conductorDiameter: number;
  layerGeometries: LayerGeometry[];
  coreDiameter: number;
  coreWeightPerKm: number;
}

/** 计算单芯几何:导体(绞合+紧压)→ 各包覆层 */
export function computeCoreGeometry(core: CoreDesign): CoreGeometry {
  const strandLayers = computeStrandLayers(core.conductor.layers);
  const compact = core.conductor.compact ? compactConductor(core.conductor.layers, core.conductor.compact) : null;
  const conductorDiameter = compact
    ? compact.outerDiameter
    : strandLayers.length
      ? strandLayers[strandLayers.length - 1].outerDiameter
      : 0;

  const layerGeometries: LayerGeometry[] = [];
  let d = conductorDiameter;
  for (const layer of core.layers) {
    const inner = d;
    const outer = d + 2 * layer.thickness;
    const rho = MATERIALS[layer.materialId]?.density ?? 1;
    const weightPerKm = (Math.PI / 4) * (outer * outer - inner * inner) * 1000 * rho * 1e-3;
    layerGeometries.push({ layer, innerDiameter: inner, outerDiameter: outer, weightPerKm });
    d = outer;
  }
  const metalDensity = MATERIALS[core.conductor.layers[0] ? 'cu' : 'cu'].density;
  void metalDensity;
  return {
    core,
    strandLayers,
    compact,
    conductorDiameter,
    layerGeometries,
    coreDiameter: d,
    coreWeightPerKm: layerGeometries.reduce((s, g) => s + g.weightPerKm, 0),
  };
}

/** 整缆几何:各芯 + 成缆 + 外层 */
export interface CableGeometry {
  cores: CoreGeometry[];
  cabledDiameter: number;
  outerLayerGeometries: LayerGeometry[];
  outerDiameter: number;
  totalWeightPerKm: number;
}

export function computeCableGeometry(design: CableDesign, coreMetalWeights: number[]): CableGeometry {
  const cores = design.cores.map((c) => computeCoreGeometry(c));
  const maxCoreD = Math.max(...cores.map((c) => c.coreDiameter), 0);
  const n = cores.length;
  const pitchR = n <= 1 ? 0 : n === 2 ? maxCoreD / 2 : maxCoreD / 2 / Math.sin(Math.PI / n);
  const cabledDiameter = n <= 1 ? maxCoreD : 2 * (pitchR + maxCoreD / 2);

  const outerLayerGeometries: LayerGeometry[] = [];
  let d = cabledDiameter;
  for (const layer of design.outerLayers) {
    const inner = d;
    const outer = d + 2 * layer.thickness;
    const rho = MATERIALS[layer.materialId]?.density ?? 1;
    const weightPerKm = (Math.PI / 4) * (outer * outer - inner * inner) * 1000 * rho * 1e-3;
    outerLayerGeometries.push({ layer, innerDiameter: inner, outerDiameter: outer, weightPerKm });
    d = outer;
  }
  const metalTotal = coreMetalWeights.reduce((s, w) => s + w, 0) * (design.cabling ? layFactorOf(design.cabling.layLength, 2 * pitchR) : 1);
  const totalWeightPerKm =
    metalTotal +
    cores.reduce((s, c) => s + c.coreWeightPerKm, 0) +
    outerLayerGeometries.reduce((s, g) => s + g.weightPerKm, 0);
  return { cores, cabledDiameter, outerLayerGeometries, outerDiameter: d, totalWeightPerKm };
}

function layFactorOf(layLength: number, pitchDiameter: number): number {
  if (pitchDiameter <= 0) return 1;
  return Math.sqrt(1 + (Math.PI * pitchDiameter / layLength) ** 2);
}

let idCounter = 0;
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
}
