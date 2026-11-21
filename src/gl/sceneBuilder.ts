/**
 * 由设计参数构建三维场景节点 + 横截面解析计算。
 */

import { StrandLayerResult } from '../core/stranding';
import { CablingSpec, corePitchRadius } from '../core/cabling';
import { ArmorSpec } from '../core/armoring';
import { sweepHelixTube, sweepPolygonHelix, sweepHelixRibbon } from './helixMesh';
import { SceneNode, InstanceData } from './renderer';

export const WIRE_COLORS: [number, number, number][] = [
  [0.90, 0.62, 0.28], // 亮铜
  [0.72, 0.45, 0.18], // 深铜
  [0.85, 0.70, 0.35], // 黄铜
  [0.60, 0.38, 0.15], // 青铜
  [0.80, 0.55, 0.22],
  [0.70, 0.50, 0.30],
];

/** 绞合导体场景:每层一份螺旋网格,实例化该层所有单线 */
export function buildStrandScene(
  layers: StrandLayerResult[],
  length: number,
  flags?: Map<string, 0 | 1 | 2>,
): SceneNode[] {
  const nodes: SceneNode[] = [];
  for (const layer of layers) {
    if (layer.index === 0) {
      // 中心线:直圆柱
      const mesh = sweepHelixTube({
        radius: 0, layLength: length, direction: 1,
        wireRadius: layer.wireDiameter / 2, length, radialSegments: 12, segmentsPerLay: 2,
      });
      nodes.push({ kind: 'mesh', mesh, color: WIRE_COLORS[0] });
      continue;
    }
    const mesh = sweepHelixTube({
      radius: layer.meanDiameter / 2,
      layLength: layer.layLength,
      direction: layer.direction === 'S' ? 1 : -1,
      wireRadius: layer.wireDiameter / 2,
      length,
    });
    const instances: InstanceData[] = [];
    const base = WIRE_COLORS[layer.index % WIRE_COLORS.length];
    for (let i = 0; i < layer.wireCount; i++) {
      const angle = (2 * Math.PI * i) / layer.wireCount;
      const key = `${layer.index}:${i}`;
      // 相邻单线轻微色差,便于分辨根数
      const jitter = 0.9 + 0.2 * ((i * 37 % 10) / 10);
      instances.push({
        angle,
        color: [base[0] * jitter, base[1] * jitter, base[2] * jitter],
        flag: flags?.get(key) ?? 0,
      });
    }
    nodes.push({ kind: 'instanced', mesh, instances });
  }
  return nodes;
}

/** 截面处单线中心位置(z 处横切) */
export interface CrossWire {
  x: number;
  y: number;
  diameter: number;
  layer: number;
  index: number;
  flag: 0 | 1 | 2;
}

export function crossSectionAt(layers: StrandLayerResult[], z: number): CrossWire[] {
  const wires: CrossWire[] = [];
  for (const layer of layers) {
    if (layer.index === 0) {
      wires.push({ x: 0, y: 0, diameter: layer.wireDiameter, layer: 0, index: 0, flag: 0 });
      continue;
    }
    const R = layer.meanDiameter / 2;
    const dir = layer.direction === 'S' ? 1 : -1;
    for (let i = 0; i < layer.wireCount; i++) {
      const a = (2 * Math.PI * i) / layer.wireCount + dir * (2 * Math.PI * z) / layer.layLength;
      wires.push({
        x: R * Math.cos(a), y: R * Math.sin(a),
        diameter: layer.wireDiameter, layer: layer.index, index: i, flag: 0,
      });
    }
  }
  return wires;
}

/**
 * 压入/悬空检测:
 *  - 同层相邻单线中心距 < d·(1-ε) → 压入(标红)
 *  - 单线到内层表面距离 > 0.05·d(未贴合)→ 悬空(标黄)
 * 实际生产中压入来自节距过小或根数过多;悬空来自根数不足。
 */
export function detectWireFaults(wires: CrossWire[], tolerance = 0.02): Map<string, 0 | 1 | 2> {
  const flags = new Map<string, 0 | 1 | 2>();
  const byLayer = new Map<number, CrossWire[]>();
  for (const w of wires) {
    if (!byLayer.has(w.layer)) byLayer.set(w.layer, []);
    byLayer.get(w.layer)!.push(w);
  }
  for (const [layerIdx, ws] of byLayer) {
    if (layerIdx === 0) continue;
    const d = ws[0].diameter;
    // 同层相邻(按角度排序)
    const sorted = [...ws].sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const b = sorted[(i + 1) % sorted.length];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < d * (1 - tolerance)) {
        flags.set(`${a.layer}:${a.index}`, 1);
        flags.set(`${b.layer}:${b.index}`, 1);
      }
    }
    // 悬空:到内层表面的径向间隙
    const inner = byLayer.get(layerIdx - 1);
    if (inner && inner.length) {
      const innerR = Math.hypot(inner[0].x, inner[0].y) + inner[0].diameter / 2;
      for (const w of ws) {
        const r = Math.hypot(w.x, w.y);
        const gap = r - w.diameter / 2 - innerR;
        if (gap > 0.05 * d && !flags.has(`${w.layer}:${w.index}`)) {
          flags.set(`${w.layer}:${w.index}`, 2);
        }
      }
    }
  }
  return flags;
}

/** 成缆场景:各芯沿成缆螺旋扫掠(圆芯用管,扇形芯用多边形扫掠) */
export function buildCablingScene(
  spec: CablingSpec,
  coreDiameters: number[],
  length: number,
): SceneNode[] {
  const nodes: SceneNode[] = [];
  const n = spec.cores.length;
  const maxR = Math.max(...coreDiameters) / 2;
  const pitchR = corePitchRadius(maxR, n);
  const dir = spec.direction === 'S' ? 1 : -1;
  const coreColors: [number, number, number][] = [
    [0.2, 0.5, 0.85], [0.85, 0.3, 0.25], [0.3, 0.75, 0.35], [0.85, 0.7, 0.2], [0.6, 0.4, 0.8],
  ];
  spec.cores.forEach((core, i) => {
    const phase = (2 * Math.PI * i) / n;
    const d = coreDiameters[i];
    if (core.shape === 'sector' && core.sectorAngle && core.sectorHeight) {
      // 扇形截面多边形
      const poly = sectorPolygon(core.sectorAngle, core.sectorHeight, 24);
      const spinAt = (z: number) =>
        spec.backTwist ? phase : phase + dir * (2 * Math.PI * z) / spec.layLength;
      const mesh = sweepPolygonHelix(pitchR, spec.layLength, dir, length, poly, spinAt, 48, phase);
      nodes.push({ kind: 'mesh', mesh, color: coreColors[i % coreColors.length] });
    } else {
      const mesh = sweepHelixTube({
        radius: pitchR, layLength: spec.layLength, direction: dir,
        wireRadius: d / 2, length, radialSegments: 16, segmentsPerLay: 48,
      });
      nodes.push({
        kind: 'instanced',
        mesh,
        instances: [{ angle: phase, color: coreColors[i % coreColors.length], flag: 0 }],
      });
    }
  });
  return nodes;
}

/** 扇形多边形(局部坐标,顶点朝 -x 即朝心) */
export function sectorPolygon(angle: number, height: number, segments: number): [number, number][] {
  const pts: [number, number][] = [];
  const R2 = height; // 外弧半径近似
  const R1 = 0.05 * height;
  const half = angle / 2;
  // 外弧(从 -half 到 +half)
  for (let i = 0; i <= segments; i++) {
    const a = -half + (angle * i) / segments;
    pts.push([R2 * Math.cos(a), R2 * Math.sin(a)]);
  }
  // 内弧(反向)
  for (let i = segments; i >= 0; i--) {
    const a = -half + (angle * i) / segments;
    pts.push([R1 * Math.cos(a), R1 * Math.sin(a)]);
  }
  return pts;
}

/** 铠装场景 */
export function buildArmorScene(spec: ArmorSpec, length: number): SceneNode[] {
  if (spec.kind === 'wire') {
    const D = spec.baseDiameter + spec.wireDiameter;
    const layLength = spec.layRatio * D;
    const mesh = sweepHelixTube({
      radius: D / 2, layLength, direction: spec.direction === 'S' ? 1 : -1,
      wireRadius: spec.wireDiameter / 2, length,
    });
    const instances: InstanceData[] = [];
    for (let i = 0; i < spec.wireCount; i++) {
      instances.push({
        angle: (2 * Math.PI * i) / spec.wireCount,
        color: [0.55, 0.57, 0.6], flag: 0,
      });
    }
    return [{ kind: 'instanced', mesh, instances }];
  }
  // 钢带:螺旋带,搭盖通过内外两层表现
  const angleDeg = spec.wrapAngleDeg ?? 45;
  const angle = (angleDeg * Math.PI) / 180;
  const axialWidth = spec.tapeWidth / Math.sin(angle);
  const pitch = axialWidth - spec.overlap * spec.tapeWidth;
  const layLength = pitch; // 每圈轴向推进
  const nodes: SceneNode[] = [];
  for (let layer = 0; layer < spec.layers; layer++) {
    const r = spec.baseDiameter / 2 + spec.tapeThickness * (layer + 0.5);
    const mesh = sweepHelixRibbon(r, layLength, layer % 2 === 0 ? 1 : -1, length, spec.tapeWidth, angleDeg);
    nodes.push({
      kind: 'mesh', mesh,
      color: layer === 0 ? [0.6, 0.62, 0.65] : [0.5, 0.52, 0.55],
      doubleSide: true,
    });
  }
  return nodes;
}
