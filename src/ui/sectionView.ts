/**
 * 2D 截面图绘制(电缆结构 / 截面分析共用)。
 */

import { CableGeometry, CoreGeometry } from '../core/cableModel';
import { CrossWire } from '../gl/sceneBuilder';

export interface SectionDrawOptions {
  showDimensions?: boolean;
  highlightLayerIndex?: number;
  /** 实测叠加(照片) */
  overlayImage?: HTMLImageElement | null;
  overlayAlign?: { dx: number; dy: number; scale: number };
  /** 单线故障标记 key → flag */
  wireFlags?: Map<string, number>;
}

const LAYER_COLORS: Record<string, string> = {
  conductor: '#b87333',
  conductorScreen: '#333333',
  insulation: '#f5e6c8',
  insulationScreen: '#444444',
  metalScreen: '#c9a227',
  bedding: '#8fa8bf',
  armor: '#8c8f94',
  sheath: '#2f6db3',
  filler: '#9db38f',
};

export function drawCableSection(
  canvas: HTMLCanvasElement,
  geom: CableGeometry,
  opts: SectionDrawOptions = {},
): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const od = geom.outerDiameter || 1;
  const scale = (Math.min(W, H) / 2 - 24) / (od / 2);
  const cx = W / 2, cy = H / 2;
  const X = (x: number) => cx + x * scale;
  const Y = (y: number) => cy - y * scale;

  // 外层(从外到内填充)
  for (let i = geom.outerLayerGeometries.length - 1; i >= 0; i--) {
    const g = geom.outerLayerGeometries[i];
    ring(ctx, X(0), Y(0), (g.outerDiameter / 2) * scale, (g.innerDiameter / 2) * scale,
      LAYER_COLORS[g.layer.type] ?? '#999');
  }
  // 成缆区域背景
  circle(ctx, X(0), Y(0), (geom.cabledDiameter / 2) * scale, '#e8e4da');

  // 各芯
  const n = geom.cores.length;
  const maxCoreD = Math.max(...geom.cores.map((c) => c.coreDiameter), 1);
  const pitchR = n <= 1 ? 0 : n === 2 ? maxCoreD / 2 : maxCoreD / 2 / Math.sin(Math.PI / n);
  geom.cores.forEach((core, i) => {
    const a = (2 * Math.PI * i) / n;
    const ox = pitchR * Math.cos(a), oy = pitchR * Math.sin(a);
    drawCoreSection(ctx, core, X(ox), Y(oy), scale, opts);
  });

  // 外径标注
  if (opts.showDimensions) {
    ctx.strokeStyle = '#888';
    ctx.fillStyle = '#ddd';
    ctx.font = '12px sans-serif';
    ctx.beginPath();
    ctx.moveTo(X(-od / 2), Y(0) - (od / 2) * scale - 8);
    ctx.lineTo(X(od / 2), Y(0) - (od / 2) * scale - 8);
    ctx.stroke();
    ctx.fillText(`⌀ ${od.toFixed(2)} mm`, cx - 40, Y(0) - (od / 2) * scale - 12);
  }
}

export function drawCoreSection(
  ctx: CanvasRenderingContext2D,
  core: CoreGeometry,
  cx: number,
  cy: number,
  scale: number,
  opts: SectionDrawOptions = {},
): void {
  // 包覆层(从外到内)
  for (let i = core.layerGeometries.length - 1; i >= 0; i--) {
    const g = core.layerGeometries[i];
    ring(ctx, cx, cy, (g.outerDiameter / 2) * scale, (g.innerDiameter / 2) * scale,
      LAYER_COLORS[g.layer.type] ?? '#999');
  }
  // 导体
  circle(ctx, cx, cy, (core.conductorDiameter / 2) * scale, LAYER_COLORS.conductor);
  // 单线
  for (const layer of core.strandLayers) {
    const R = (layer.meanDiameter / 2) * scale;
    const r = (layer.wireDiameter / 2) * scale;
    for (let i = 0; i < layer.wireCount; i++) {
      const a = (2 * Math.PI * i) / layer.wireCount;
      const x = layer.index === 0 ? cx : cx + R * Math.cos(a);
      const y = layer.index === 0 ? cy : cy - R * Math.sin(a);
      const flag = opts.wireFlags?.get(`${layer.index}:${i}`) ?? 0;
      circle(ctx, x, y, r, flag === 1 ? '#e33' : flag === 2 ? '#ec3' : '#d99a4e', '#7a4a12');
    }
  }
}

/** 横切截面(z 位置)单线图 */
export function drawCrossWires(
  canvas: HTMLCanvasElement,
  wires: CrossWire[],
  outerRadius: number,
): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const scale = (Math.min(W, H) / 2 - 16) / outerRadius;
  const cx = W / 2, cy = H / 2;
  circle(ctx, cx, cy, outerRadius * scale, '#f4f0e6', '#bbb');
  for (const w of wires) {
    const flagColor = w.flag === 1 ? '#e33' : w.flag === 2 ? '#ec3' : '#d99a4e';
    circle(ctx, cx + w.x * scale, cy - w.y * scale, (w.diameter / 2) * scale, flagColor, '#7a4a12');
  }
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.5; ctx.stroke(); }
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, rOut: number, rIn: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, rOut), 0, 2 * Math.PI);
  ctx.arc(x, y, Math.max(0.1, rIn), 0, 2 * Math.PI, true);
  ctx.fillStyle = fill;
  ctx.fill();
}
