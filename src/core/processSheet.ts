/**
 * 工艺单:由设计参数生成绞线机/成缆机配置。
 */

import { StrandLayerResult } from './stranding';
import { CableDesign } from './cableModel';

export interface MachineRow {
  layerName: string;
  wireCount: number;
  wireDiameter: number;
  layLength: number; // mm
  direction: 'S' | 'Z' | '-';
  /** 牵引速度 m/min(由线速度基准推算) */
  haulSpeed: number;
  /** 绞笼转速 rpm = 牵引速度/节距 */
  cageRpm: number;
}

/** 基准牵引速度 m/min(按设备常规,可由用户调整) */
export function buildProcessSheet(
  strandLayers: StrandLayerResult[],
  baseHaulSpeed = 20,
): MachineRow[] {
  return strandLayers.map((l) => {
    if (l.index === 0) {
      return {
        layerName: '中心线',
        wireCount: l.wireCount,
        wireDiameter: l.wireDiameter,
        layLength: 0,
        direction: '-',
        haulSpeed: baseHaulSpeed,
        cageRpm: 0,
      };
    }
    const layM = l.layLength / 1000;
    return {
      layerName: `第${l.index}层`,
      wireCount: l.wireCount,
      wireDiameter: l.wireDiameter,
      layLength: l.layLength,
      direction: l.direction,
      haulSpeed: baseHaulSpeed,
      cageRpm: layM > 0 ? baseHaulSpeed / layM : 0,
    };
  });
}

export function processSheetText(design: CableDesign, rows: MachineRow[], extra: string): string {
  const lines: string[] = [
    `工艺单 — ${design.name} (${design.voltage})`,
    `生成时间: ${new Date().toLocaleString()}`,
    '',
    '层别\t根数\t单线直径(mm)\t节距(mm)\t绞向\t牵引速度(m/min)\t绞笼转速(rpm)',
    ...rows.map(
      (r) =>
        `${r.layerName}\t${r.wireCount}\t${r.wireDiameter.toFixed(2)}\t${r.layLength ? r.layLength.toFixed(1) : '-'}\t${r.direction}\t${r.haulSpeed.toFixed(1)}\t${r.cageRpm ? r.cageRpm.toFixed(1) : '-'}`,
    ),
    '',
    extra,
  ];
  return lines.join('\n');
}
