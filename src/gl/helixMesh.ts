/**
 * 螺旋线扫掠网格生成:把圆形(或多边形)截面沿螺旋线扫掠成管状网格。
 * 同一层所有单线共享同一螺旋形状,仅起始角不同 → 一份网格 + 实例化旋转。
 */

export interface TubeMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export interface HelixParams {
  /** 节圆半径 mm */
  radius: number;
  /** 节距 mm */
  layLength: number;
  /** 绞向:+1 = S(右旋), -1 = Z */
  direction: 1 | -1;
  /** 单线半径 mm */
  wireRadius: number;
  /** 渲染长度 mm */
  length: number;
  /** 圆周分段数 */
  radialSegments?: number;
  /** 每节距轴向分段数 */
  segmentsPerLay?: number;
}

/** 螺旋线中心在参数 t(0..1,沿 length)处的位置(起始角 0) */
export function helixCenter(p: HelixParams, t: number): [number, number, number] {
  const z = t * p.length;
  const a = p.direction * (2 * Math.PI * z) / p.layLength;
  return [p.radius * Math.cos(a), p.radius * Math.sin(a), z];
}

/** 圆形截面沿螺旋线扫掠(平行传输标架,避免 Frenet 标架翻转) */
export function sweepHelixTube(p: HelixParams): TubeMesh {
  const radial = p.radialSegments ?? 10;
  const perLay = p.segmentsPerLay ?? 48;
  const lays = p.length / p.layLength;
  const rings = Math.max(2, Math.ceil(lays * perLay) + 1);

  const positions = new Float32Array(rings * radial * 3);
  const normals = new Float32Array(rings * radial * 3);
  const indices = new Uint32Array((rings - 1) * radial * 6);

  // 平行传输标架:初始切向
  const c0 = helixCenter(p, 0);
  const c1 = helixCenter(p, 1e-4);
  let tangent = norm3([c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]]);
  // 初始法向:指向轴心
  let normal: number[] = p.radius > 1e-9 ? norm3([-c0[0], -c0[1], 0]) : [1, 0, 0];
  if (p.radius <= 1e-9) normal = [1, 0, 0];

  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const c = helixCenter(p, t);
    const cNext = helixCenter(p, Math.min(1, t + 1e-4));
    const newTangent = norm3([cNext[0] - c[0], cNext[1] - c[1], cNext[2] - c[2]]);
    // 平行传输:把法向绕 (tangent×newTangent) 旋转
    const axis = cross3(tangent, newTangent);
    const sinA = len3(axis);
    if (sinA > 1e-9) {
      const cosA = clamp(dot3(tangent, newTangent), -1, 1);
      const angle = Math.acos(cosA);
      normal = rotateRodrigues(normal, norm3(axis), Math.cos(angle), Math.sin(angle));
    }
    tangent = newTangent;
    const binormal = cross3(tangent, normal);
    for (let j = 0; j < radial; j++) {
      const a = (2 * Math.PI * j) / radial;
      const nx = normal[0] * Math.cos(a) + binormal[0] * Math.sin(a);
      const ny = normal[1] * Math.cos(a) + binormal[1] * Math.sin(a);
      const nz = normal[2] * Math.cos(a) + binormal[2] * Math.sin(a);
      const k = (i * radial + j) * 3;
      positions[k] = c[0] + nx * p.wireRadius;
      positions[k + 1] = c[1] + ny * p.wireRadius;
      positions[k + 2] = c[2] + nz * p.wireRadius;
      normals[k] = nx;
      normals[k + 1] = ny;
      normals[k + 2] = nz;
    }
  }
  let q = 0;
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      indices[q++] = a; indices[q++] = c; indices[q++] = b;
      indices[q++] = b; indices[q++] = c; indices[q++] = d;
    }
  }
  return { positions, normals, indices };
}

/**
 * 任意截面多边形沿螺旋线扫掠,截面随 spin(z) 自转(用于扇形线芯退扭/不退扭对比)。
 * @param crossSection 截面多边形(局部坐标,绕自身中心)
 * @param spinAt 给定 z 返回截面自转角 rad
 */
export function sweepPolygonHelix(
  radius: number,
  layLength: number,
  direction: 1 | -1,
  length: number,
  crossSection: [number, number][],
  spinAt: (z: number) => number,
  segmentsPerLay = 48,
  phase = 0,
): TubeMesh {
  const m = crossSection.length;
  const lays = length / layLength;
  const rings = Math.max(2, Math.ceil(lays * segmentsPerLay) + 1);
  const positions = new Float32Array(rings * m * 3);
  const normals = new Float32Array(rings * m * 3);
  const indices = new Uint32Array((rings - 1) * m * 6);

  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const z = t * length;
    const ha = phase + direction * (2 * Math.PI * z) / layLength;
    const cx = radius * Math.cos(ha);
    const cy = radius * Math.sin(ha);
    const spin = spinAt(z);
    // 截面局部标架:径向(指向轴心)与周向
    const radialX = -Math.cos(ha), radialY = -Math.sin(ha);
    const tangX = -Math.sin(ha), tangY = Math.cos(ha);
    for (let j = 0; j < m; j++) {
      const [px, py] = crossSection[j];
      const rx = px * Math.cos(spin) - py * Math.sin(spin);
      const ry = px * Math.sin(spin) + py * Math.cos(spin);
      const wx = cx + radialX * rx + tangX * ry;
      const wy = cy + radialY * rx + tangY * ry;
      const k = (i * m + j) * 3;
      positions[k] = wx; positions[k + 1] = wy; positions[k + 2] = z;
      // 法向近似:相邻截面点切向叉乘(简化用径向)
      normals[k] = radialX * rx + tangX * ry;
      normals[k + 1] = radialY * rx + tangY * ry;
      normals[k + 2] = 0;
      const nl = Math.hypot(normals[k], normals[k + 1], normals[k + 2]) || 1;
      normals[k] /= nl; normals[k + 1] /= nl; normals[k + 2] /= nl;
    }
  }
  let q = 0;
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = i * m + j;
      const b = i * m + ((j + 1) % m);
      const c = (i + 1) * m + j;
      const d = (i + 1) * m + ((j + 1) % m);
      indices[q++] = a; indices[q++] = c; indices[q++] = b;
      indices[q++] = b; indices[q++] = c; indices[q++] = d;
    }
  }
  return { positions, normals, indices };
}

/** 螺旋带(钢带绕包):沿螺旋线的带状网格,带宽 w,厚度忽略(双面渲染) */
export function sweepHelixRibbon(
  radius: number,
  layLength: number,
  direction: 1 | -1,
  length: number,
  tapeWidth: number,
  helixAngleDeg: number,
  segmentsPerLay = 64,
): TubeMesh {
  const lays = length / layLength;
  const rings = Math.max(2, Math.ceil(lays * segmentsPerLay) + 1);
  const positions = new Float32Array(rings * 2 * 3);
  const normals = new Float32Array(rings * 2 * 3);
  const indices = new Uint32Array((rings - 1) * 6);
  // 带方向:带宽方向在圆柱展开面上垂直于螺旋方向
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const z = t * length;
    const a = direction * (2 * Math.PI * z) / layLength;
    const cx = radius * Math.cos(a), cy = radius * Math.sin(a);
    // 螺旋切向
    const tx = -Math.sin(a) * direction, ty = Math.cos(a) * direction, tz = (layLength / (2 * Math.PI * radius)) || 0;
    const tl = Math.hypot(tx, ty, tz);
    // 带宽方向 = 圆柱法向 × 切向
    const nx = Math.cos(a), ny = Math.sin(a), nz = 0;
    let wx = ny * (tz / tl) - nz * (ty / tl);
    let wy = nz * (tx / tl) - nx * (tz / tl);
    let wz = nx * (ty / tl) - ny * (tx / tl);
    const wl = Math.hypot(wx, wy, wz) || 1;
    wx /= wl; wy /= wl; wz /= wl;
    const half = tapeWidth / 2;
    const k0 = (i * 2) * 3, k1 = (i * 2 + 1) * 3;
    positions[k0] = cx - wx * half; positions[k0 + 1] = cy - wy * half; positions[k0 + 2] = z - wz * half;
    positions[k1] = cx + wx * half; positions[k1 + 1] = cy + wy * half; positions[k1 + 2] = z + wz * half;
    normals[k0] = nx; normals[k0 + 1] = ny; normals[k0 + 2] = nz;
    normals[k1] = nx; normals[k1 + 1] = ny; normals[k1 + 2] = nz;
  }
  let q = 0;
  for (let i = 0; i < rings - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    indices[q++] = a; indices[q++] = c; indices[q++] = b;
    indices[q++] = b; indices[q++] = c; indices[q++] = d;
  }
  return { positions, normals, indices };
}

function norm3(v: number[]): number[] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross3(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot3(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function len3(a: number[]): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
function rotateRodrigues(v: number[], k: number[], cosA: number, sinA: number): number[] {
  const c = cross3(k, v);
  const d = dot3(k, v) * (1 - cosA);
  return [
    v[0] * cosA + c[0] * sinA + k[0] * d,
    v[1] * cosA + c[1] * sinA + k[1] * d,
    v[2] * cosA + c[2] * sinA + k[2] * d,
  ];
}
