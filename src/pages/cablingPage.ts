/**
 * 页面3:成缆排布 —— 多芯 + 填充,节距/绞向/退扭,绞入系数与用量。
 */

import { h, clear, numberInput, select, fmt } from '../ui/dom';
import { appState } from '../app/state';
import { computeCoreGeometry } from '../core/cableModel';
import { computeCabling, CablingSpec, CableCore } from '../core/cabling';
import { computeStrandLayers, conductorWeightPerKm } from '../core/stranding';
import { MATERIALS } from '../core/materials';

export function renderCablingPage(root: HTMLElement): void {
  clear(root);
  const design = appState.design;
  const resultBox = h('div', { className: 'info-panel' });
  const formBox = h('div', {});

  function renderAll(): void {
    renderForm();
    renderResults();
  }

  function renderForm(): void {
    clear(formBox);
    const cb = design.cabling;
    if (!cb) {
      formBox.append(h('button', {
        className: 'btn',
        onclick: () => appState.update((d) => {
          d.cabling = { layLength: 1400, direction: 'S', backTwist: false, fillerDiameter: 8, fillerCount: 3 };
        }),
      }, ['启用成缆(多芯)']));
      return;
    }
    formBox.append(
      h('div', { className: 'form-grid' }, [
        h('label', {}, ['成缆节距 mm', numberInput(cb.layLength, (v) => appState.update(() => { cb.layLength = v; }), { step: 10, min: 50 })]),
        h('label', {}, ['绞向', select(
          [{ value: 'S' as const, label: 'S(左)' }, { value: 'Z' as const, label: 'Z(右)' }],
          cb.direction, (v) => appState.update(() => { cb.direction = v; }),
        )]),
        h('label', {}, ['绞法', select(
          [{ value: 'bt' as const, label: '退扭绞合' }, { value: 'nbt' as const, label: '不退扭绞合' }],
          cb.backTwist ? 'bt' : 'nbt',
          (v) => appState.update(() => { cb.backTwist = v === 'bt'; }),
        )]),
        h('label', {}, ['填充绳 ⌀ mm', numberInput(cb.fillerDiameter, (v) => appState.update(() => { cb.fillerDiameter = v; }), { step: 0.5, min: 0 })]),
        h('label', {}, ['填充绳根数', numberInput(cb.fillerCount, (v) => appState.update(() => { cb.fillerCount = Math.round(v); }), { step: 1, min: 0 })]),
      ]),
    );
    if (!cb.backTwist) {
      formBox.append(h('div', { className: 'warn-box' }, [
        '⚠ 不退扭绞合:线芯每前进一个节距自转一圈,扇形线芯会"翻身",绝缘有挤偏风险(见截面分析)。',
      ]));
    }
  }

  function renderResults(): void {
    clear(resultBox);
    const cb = design.cabling;
    if (!cb) return;
    const coresGeom = design.cores.map((c) => computeCoreGeometry(c));
    const cores: CableCore[] = coresGeom.map((g) => ({
      diameter: g.coreDiameter,
      shape: g.core.conductor.compact?.shape === 'sector' ? 'sector' : 'round',
      sectorAngle: g.compact?.sectorAngle,
      sectorHeight: g.compact?.sectorHeight,
    }));
    const spec: CablingSpec = {
      cores,
      fillers: [{ diameter: cb.fillerDiameter, count: cb.fillerCount }],
      layLength: cb.layLength,
      direction: cb.direction,
      backTwist: cb.backTwist,
    };
    const res = computeCabling(spec);

    // 每公里金属用量(考虑成缆绞入)
    const metalWeights = design.cores.map((c) =>
      conductorWeightPerKm(computeStrandLayers(c.conductor.layers), MATERIALS.cu.density) * res.layFactor,
    );

    resultBox.append(
      h('h3', {}, ['成缆计算结果']),
      h('div', {}, [`成缆节圆直径: ${fmt(res.pitchDiameter, 2)} mm`]),
      h('div', {}, [`成缆外径: ${fmt(res.cabledDiameter, 2)} mm`]),
      h('div', { className: 'highlight' }, [`成缆绞入系数: ${fmt(res.layFactor, 5)}`]),
      h('div', {}, [`每公里单芯长度: ${fmt(res.coreLengthPerKm, 1)} m`]),
      h('div', {}, [`填充绳用量: ${fmt(res.fillerLengthPerKm, 1)} m/km`]),
      h('div', {}, [`每公里铜用量(含成缆绞入): ${fmt(metalWeights.reduce((a, b) => a + b, 0), 1)} kg/km`]),
      cb.backTwist
        ? h('div', {}, ['退扭绞合:线芯自转 0 圈/km'])
        : h('div', { className: 'warn-text' }, [`不退扭:线芯自转 ${fmt(res.twistsPerKm, 1)} 圈/km`]),
    );
  }

  root.append(
    h('div', { className: 'page-header' }, [h('h2', {}, ['成缆排布'])]),
    h('div', { className: 'page-body' }, [formBox, resultBox]),
  );
  renderAll();
  appState.subscribe(renderAll);
}
