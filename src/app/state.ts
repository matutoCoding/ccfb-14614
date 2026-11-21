/**
 * 应用状态:当前电缆设计 + 简单订阅。
 */

import { CableDesign, CoreDesign, newId } from '../core/cableModel';

type Listener = () => void;

class AppState {
  design: CableDesign = defaultDesign();
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(): void {
    for (const fn of this.listeners) fn();
  }
  update(mutate: (d: CableDesign) => void): void {
    mutate(this.design);
    this.emit();
  }
}

export function defaultCore(name: string): CoreDesign {
  return {
    id: newId('core'),
    name,
    conductor: {
      layers: [
        { wireCount: 1, wireDiameter: 2.6, layRatio: 0, direction: 'S' },
        { wireCount: 6, wireDiameter: 2.6, layRatio: 18, direction: 'S' },
        { wireCount: 12, wireDiameter: 2.6, layRatio: 16, direction: 'Z' },
        { wireCount: 18, wireDiameter: 2.6, layRatio: 14, direction: 'S' },
      ],
      compact: { shape: 'round', targetFillFactor: 0.9 },
    },
    layers: [
      { id: newId('layer'), type: 'conductorScreen', materialId: 'semicon_in', thickness: 0.8, name: '导体屏蔽' },
      { id: newId('layer'), type: 'insulation', materialId: 'xlpe', thickness: 4.5, name: 'XLPE绝缘' },
      { id: newId('layer'), type: 'insulationScreen', materialId: 'semicon_out', thickness: 0.8, name: '绝缘屏蔽' },
      { id: newId('layer'), type: 'metalScreen', materialId: 'cu_tape', thickness: 0.12, name: '铜带屏蔽' },
    ],
  };
}

export function defaultDesign(): CableDesign {
  return {
    id: newId('cable'),
    name: 'YJV22 8.7/15kV 3×240',
    voltage: '8.7/15kV',
    cores: [defaultCore('A相'), defaultCore('B相'), defaultCore('C相')],
    cabling: {
      layLength: 1400,
      direction: 'S',
      backTwist: false,
      fillerDiameter: 8,
      fillerCount: 3,
    },
    outerLayers: [
      { id: newId('layer'), type: 'bedding', materialId: 'pvc', thickness: 1.8, name: '内衬层' },
      { id: newId('layer'), type: 'armor', materialId: 'steel_tape', thickness: 1.0, name: '钢带铠装' },
      { id: newId('layer'), type: 'sheath', materialId: 'pvc', thickness: 3.0, name: '外护套' },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const appState = new AppState();
