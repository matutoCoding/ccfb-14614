/**
 * 页面6:工艺单 —— 绞线机配置、节距、绞向、牵引速度、绞笼转速,导出。
 */

import { h, clear, numberInput, fmt } from '../ui/dom';
import { appState } from '../app/state';
import { computeStrandLayers, conductorWeightPerKm } from '../core/stranding';
import { buildProcessSheet, processSheetText, MachineRow } from '../core/processSheet';
import { computeCableGeometry } from '../core/cableModel';
import { MATERIALS } from '../core/materials';
import { drawCableSection } from '../ui/sectionView';

export function renderProcessSheetPage(root: HTMLElement): void {
  clear(root);
  const design = appState.design;
  let coreIdx = 0;
  let haulSpeed = 20;

  const tableBox = h('div', {});
  const canvas = h('canvas', { width: 360, height: 360, className: 'section-canvas small' });

  function currentRows(): MachineRow[] {
    const layers = computeStrandLayers(design.cores[coreIdx].conductor.layers);
    return buildProcessSheet(layers, haulSpeed);
  }

  function renderTable(): void {
    clear(tableBox);
    const rows = currentRows();
    const table = h('table', { className: 'data-table' }, [
      h('tr', {}, [
        h('th', {}, ['层别']), h('th', {}, ['根数']), h('th', {}, ['单线⌀ mm']),
        h('th', {}, ['节距 mm']), h('th', {}, ['绞向']),
        h('th', {}, ['牵引速度 m/min']), h('th', {}, ['绞笼转速 rpm']),
      ]),
    ]);
    for (const r of rows) {
      table.append(h('tr', {}, [
        h('td', {}, [r.layerName]),
        h('td', {}, [String(r.wireCount)]),
        h('td', {}, [fmt(r.wireDiameter, 2)]),
        h('td', {}, [r.layLength ? fmt(r.layLength, 1) : '-']),
        h('td', {}, [r.direction]),
        h('td', {}, [fmt(r.haulSpeed, 1)]),
        h('td', {}, [r.cageRpm ? fmt(r.cageRpm, 1) : '-']),
      ]));
    }
    tableBox.append(table);

    // 用量汇总
    const layers = computeStrandLayers(design.cores[coreIdx].conductor.layers);
    const weight = conductorWeightPerKm(layers, MATERIALS.cu.density);
    tableBox.append(h('div', { className: 'info-panel' }, [
      `该芯每公里铜用量: ${fmt(weight, 1)} kg/km`,
    ]));
  }

  function renderSection(): void {
    const coreMetalWeights = design.cores.map((c) =>
      conductorWeightPerKm(computeStrandLayers(c.conductor.layers), MATERIALS.cu.density));
    const geom = computeCableGeometry(design, coreMetalWeights);
    drawCableSection(canvas, geom, { showDimensions: true });
  }

  function exportText(): void {
    const rows = currentRows();
    const coreMetalWeights = design.cores.map((c) =>
      conductorWeightPerKm(computeStrandLayers(c.conductor.layers), MATERIALS.cu.density));
    const geom = computeCableGeometry(design, coreMetalWeights);
    const extra = [
      `成品外径: ${fmt(geom.outerDiameter, 2)} mm`,
      `总重量估算: ${fmt(geom.totalWeightPerKm, 1)} kg/km`,
      design.cabling
        ? `成缆: 节距 ${design.cabling.layLength} mm,${design.cabling.direction} 向,${design.cabling.backTwist ? '退扭' : '不退扭'}`
        : '单芯(无成缆)',
    ].join('\n');
    const text = processSheetText(design, rows, extra);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `工艺单_${design.name}.txt` });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportImages(): void {
    // 截面图导出
    const a = h('a', { href: canvas.toDataURL('image/png'), download: `截面图_${design.name}.png` });
    a.click();
  }

  const coreTabs = h('div', { className: 'tabs' });
  design.cores.forEach((c, i) => {
    coreTabs.append(h('button', {
      className: i === coreIdx ? 'tab active' : 'tab',
      onclick: () => { coreIdx = i; renderTable(); },
    }, [c.name]));
  });

  root.append(
    h('div', { className: 'page-header' }, [
      h('h2', {}, ['工艺单']),
      coreTabs,
      h('label', { className: 'field' }, [
        h('span', { className: 'field-label' }, ['牵引速度 m/min']),
        numberInput(haulSpeed, (v) => { haulSpeed = v; renderTable(); }, { step: 1, min: 1 }),
      ]),
      h('button', { className: 'btn', onclick: exportText }, ['导出工艺单']),
      h('button', { className: 'btn', onclick: exportImages }, ['导出截面图']),
    ]),
    h('div', { className: 'page-body two-col' }, [
      h('div', { className: 'col' }, [tableBox]),
      h('div', { className: 'col' }, [h('h3', {}, ['截面图']), canvas]),
    ]),
  );
  renderTable();
  renderSection();
}
