/**
 * 成缆计算:多芯线芯 + 填充绳绞合,退扭/不退扭。
 *
 * 成缆绞入系数与单线绞合同理:线芯中心绕成缆中心做螺旋运动,
 * 节圆直径 Dc = 成缆外径 - 线芯外径(圆芯),绞入系数 k = sqrt(1+(π·Dc/h)²)。
 *
 * 退扭(预扭/不退扭)区别:
 *  - 不退扭(普通绞合):线芯随绞笼公转,自身不反向旋转 → 沿轴向每前进一个节距,
 *    线芯截面绕自身轴旋转 2π(扇形线芯"翻身"即由此产生扭转应力)。
 *  - 退扭绞合:放线盘反向自转抵消公转 → 线芯截面方位在空间保持固定,
 *    扇形始终朝内,无扭转累积。
 * 三维中用每米自转角曲线表现两者差异。
 */

export type CoreShape = 'round' | 'sector';

export interface CableCore {
  /** 线芯外径 mm(含绝缘及屏蔽,圆芯为直径;扇形芯为包络圆直径) */
  diameter: number;
  shape: CoreShape;
  /** 扇形角 rad(圆芯为 2π) */
  sectorAngle?: number;
  /** 扇形高度 mm */
  sectorHeight?: number;
}

export interface FillerSpec {
  /** 填充绳直径 mm */
  diameter: number;
  count: number;
}

export interface CablingSpec {
  cores: CableCore[];
  fillers: FillerSpec[];
  /** 成缆节距 mm */
  layLength: number;
  /** 绞向 */
  direction: 'S' | 'Z';
  /** 退扭:true=退扭绞合(线芯方位固定),false=不退扭 */
  backTwist: boolean;
}

export interface CablingResult {
  /** 成缆节圆直径(线芯中心圆) mm */
  pitchDiameter: number;
  /** 成缆外径(各芯包络圆) mm */
  cabledDiameter: number;
  /** 成缆绞入系数 */
  layFactor: number;
  /** 每公里单芯实际长度 m */
  coreLengthPerKm: number;
  /** 填充绳每公里总长度 m(填充在中心,近似取绞入系数 1 或按各自节圆) */
  fillerLengthPerKm: number;
  /** 不退扭时线芯每公里自转圈数 */
  twistsPerKm: number;
}

/** 圆芯成缆几何:n 芯均布,节圆半径 R = r / sin(π/n)(n≥2) */
export function corePitchRadius(coreRadius: number, coreCount: number): number {
  if (coreCount === 1) return 0;
  if (coreCount === 2) return coreRadius;
  return coreRadius / Math.sin(Math.PI / coreCount);
}

export function computeCabling(spec: CablingSpec): CablingResult {
  const n = spec.cores.length;
  const maxCoreR = Math.max(...spec.cores.map((c) => c.diameter / 2));
  const pitchR = corePitchRadius(maxCoreR, n);
  const pitchDiameter = 2 * pitchR;
  const cabledDiameter = 2 * (pitchR + maxCoreR);
  const layFactor = Math.sqrt(1 + (Math.PI * pitchDiameter / spec.layLength) ** 2);
  const coreLengthPerKm = layFactor * 1000;
  // 中心填充近似不绞入;边部填充按节圆一半估算
  const fillerLengthPerKm = spec.fillers.reduce((s, f) => s + f.count, 0) * 1000 * (1 + (layFactor - 1) / 2);
  // 不退扭:每前进一个节距线芯自转 1 圈 → 圈/km = 1e6 mm / 节距 mm
  const twistsPerKm = spec.backTwist ? 0 : 1_000_000 / spec.layLength;
  return {
    pitchDiameter,
    cabledDiameter,
    layFactor,
    coreLengthPerKm,
    fillerLengthPerKm,
    twistsPerKm,
  };
}

/**
 * 线芯在轴向位置 z(mm)处的空间位姿。
 * @param twistPerLength 自转角速度 rad/mm(不退扭 = 2π/节距,退扭 = 0)
 * @returns 中心位置(绕成缆轴)与自转角
 */
export function corePoseAt(
  spec: CablingSpec,
  coreIndex: number,
  z: number,
): { x: number; y: number; helixAngle: number; spinAngle: number } {
  const n = spec.cores.length;
  const maxCoreR = Math.max(...spec.cores.map((c) => c.diameter / 2));
  const pitchR = corePitchRadius(maxCoreR, n);
  const phase0 = (2 * Math.PI * coreIndex) / n;
  const dir = spec.direction === 'S' ? 1 : -1;
  const helixAngle = phase0 + dir * (2 * Math.PI * z) / spec.layLength;
  const spinAngle = spec.backTwist ? phase0 : helixAngle;
  return {
    x: pitchR * Math.cos(helixAngle),
    y: pitchR * Math.sin(helixAngle),
    helixAngle,
    spinAngle,
  };
}
