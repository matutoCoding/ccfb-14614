/**
 * 材料库:密度与手册参考数据。
 * 密度单位 g/cm³(= kg/dm³)。
 */

export interface Material {
  id: string;
  name: string;
  density: number;
  /** 20℃ 电阻率 Ω·mm²/m,金属材料有效 */
  resistivity?: number;
  category: 'metal' | 'insulation' | 'sheath' | 'screen' | 'armor' | 'filler';
}

export const MATERIALS: Record<string, Material> = {
  cu: { id: 'cu', name: '铜导体', density: 8.89, resistivity: 0.017241, category: 'metal' },
  al: { id: 'al', name: '铝导体', density: 2.703, resistivity: 0.028264, category: 'metal' },
  xlpe: { id: 'xlpe', name: '交联聚乙烯绝缘', density: 0.922, category: 'insulation' },
  pvc: { id: 'pvc', name: '聚氯乙烯', density: 1.38, category: 'sheath' },
  pe: { id: 'pe', name: '聚乙烯', density: 0.93, category: 'sheath' },
  semicon_in: { id: 'semicon_in', name: '导体屏蔽(半导电)', density: 1.08, category: 'screen' },
  semicon_out: { id: 'semicon_out', name: '绝缘屏蔽(半导电)', density: 1.08, category: 'screen' },
  cu_tape: { id: 'cu_tape', name: '铜带屏蔽', density: 8.89, category: 'screen' },
  steel_tape: { id: 'steel_tape', name: '镀锌钢带', density: 7.85, category: 'armor' },
  steel_wire: { id: 'steel_wire', name: '镀锌钢丝', density: 7.85, category: 'armor' },
  pp_filler: { id: 'pp_filler', name: 'PP填充绳', density: 0.91, category: 'filler' },
  wrap_tape: { id: 'wrap_tape', name: '无纺布绕包带', density: 0.6, category: 'filler' },
};

export type LayerType =
  | 'conductor'
  | 'conductorScreen'
  | 'insulation'
  | 'insulationScreen'
  | 'metalScreen'
  | 'bedding'
  | 'armor'
  | 'sheath'
  | 'filler';

export const LAYER_TYPE_NAMES: Record<LayerType, string> = {
  conductor: '导体',
  conductorScreen: '导体屏蔽',
  insulation: '绝缘',
  insulationScreen: '绝缘屏蔽',
  metalScreen: '金属屏蔽',
  bedding: '内衬层',
  armor: '铠装',
  sheath: '护套',
  filler: '填充',
};

/** 常用绝缘标称厚度(中压 XLPE,GB/T 12706 参考) */
export const XLPE_THICKNESS_TABLE: Record<string, number> = {
  '3.6/6kV': 2.5,
  '6/6kV': 3.4,
  '6/10kV': 3.4,
  '8.7/10kV': 4.5,
  '8.7/15kV': 4.5,
  '12/20kV': 5.5,
  '18/30kV': 8.0,
  '26/35kV': 10.5,
};

/** 外径公差(GB/T 12706 护套外径参考,简化:±2% 或按标准表) */
export function outerDiameterTolerance(nominalOd: number): number {
  // 工程简化:±0.1mm + 1.5%
  return 0.1 + 0.015 * nominalOd;
}
