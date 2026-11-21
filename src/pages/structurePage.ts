/**
 * 页面1:电缆结构 —— 按层从里往外建模,截面实时预览。
 */

import { h, clear, numberInput, select, labeled, fmt } from '../ui/dom';
import { appState } from '../app/state';
import { computeCableGeometry, computeCoreGeometry, CableLayer, newId } from '../core/cableModel';
import { conductorWeightPerKm, computeStrandLayers } from '../core/stranding';
import { MATERIALS, LAYER_TYPE_NAMES, LayerType } from '../core/materials';
import { drawCableSection } from '../ui/sectionView';
import { db } from '../db/db';

export function renderStructurePage(root: HTMLElement): void {
  clear(root);
  const design = appState.design;

  const canvas = h('canvas', { width: 520, height: 520, className: 'section-canvas' });
  const infoBox = h('div', { className: 'info-panel' });

  function refresh(): void {
    const coreMetalWeights = design.cores.map((c) =>
      conductorWeightPerKm(computeStrandLayers(c.conductor.layers), MATERIALS.cu.density),
    );
    const geom = computeCableGeometry(design, coreMetalWeights);
    drawCableSection(canvas, geom, { showDimensions: true });
    clear(infoBox);
    infoBox.append(
      h('div', {}, [`成缆外径: ${fmt(geom.cabledDiameter, 2)} mm`]),
      h('div', {}, [`成品外径: ${fmt(geom.outerDiameter, 2)} mm`]),
      h('div', {}, [`总重量(估算): ${fmt(geom.totalWeightPerKm, 1)} kg/km`]),
    );
  }

  // 芯选择
  let coreIdx = 0;
  const coreTabs = h('div', { className: 'tabs' });
  function renderCoreTabs(): void {
    clear(coreTabs);
    design.cores.forEach((c, i) => {
      coreTabs.append(
        h('button', {
          className: i === coreIdx ? 'tab active' : 'tab',
          onclick: () => { coreIdx = i; renderAll(); },
        }, [c.name]),
      );
    });
    coreTabs.append(h('button', {
      className: 'tab', onclick: () => {
        appState.update((d) => {
          const src = d.cores[0];
          const copy: typeof src = JSON.parse(JSON.stringify(src));
          copy.id = newId('core');
          copy.name = `芯${d.cores.length + 1}`;
          copy.layers.forEach((l) => (l.id = newId('layer')));
          d.cores.push(copy);
        });
        coreIdx = design.cores.length - 1;
        renderAll();
      },
    }, ['+ 加芯']));
  }

  const layerList = h('div', { className: 'layer-list' });
  function renderLayers(): void {
    clear(layerList);
    const core = design.cores[coreIdx];
    const geom = computeCoreGeometry(core);
    layerList.append(h('h3', {}, [`${core.name} 包覆层(导体 ⌀${fmt(geom.conductorDiameter, 2)} mm 之外)`]));
    core.layers.forEach((layer, li) => {
      const g = geom.layerGeometries[li];
      layerList.append(layerRow(layer, `${fmt(g.innerDiameter, 2)} → ⌀${fmt(g.outerDiameter, 2)} mm, ${fmt(g.weightPerKm, 1)} kg/km`, () => {
        appState.update(() => { core.layers.splice(li, 1); });
        renderAll();
      }));
    });
    layerList.append(addLayerRow((layer) => {
      appState.update(() => { core.layers.push(layer); });
      renderAll();
    }));

    // 成缆外层
    layerList.append(h('h3', {}, ['成缆外层(内衬/铠装/护套)']));
    const coreMetalWeights = design.cores.map((c) =>
      conductorWeightPerKm(computeStrandLayers(c.conductor.layers), MATERIALS.cu.density),
    );
    const cableGeom = computeCableGeometry(design, coreMetalWeights);
    design.outerLayers.forEach((layer, li) => {
      const g = cableGeom.outerLayerGeometries[li];
      layerList.append(layerRow(layer, `${fmt(g.innerDiameter, 2)} → ⌀${fmt(g.outerDiameter, 2)} mm, ${fmt(g.weightPerKm, 1)} kg/km`, () => {
        appState.update(() => { design.outerLayers.splice(li, 1); });
        renderAll();
      }));
    });
    layerList.append(addLayerRow((layer) => {
      appState.update(() => { design.outerLayers.push(layer); });
      renderAll();
    }));
  }

  function layerRow(layer: CableLayer, info: string, onDelete: () => void): HTMLElement {
    const matSel = select(
      Object.values(MATERIALS).map((m) => ({ value: m.id, label: m.name })),
      layer.materialId,
      (v) => appState.update(() => { layer.materialId = v; }),
    );
    const thickInput = numberInput(layer.thickness, (v) => {
      appState.update(() => { layer.thickness = v; });
    }, { step: 0.1, min: 0 });
    return h('div', { className: 'layer-row' }, [
      h('span', { className: 'layer-type' }, [LAYER_TYPE_NAMES[layer.type]]),
      matSel,
      labeled('厚度mm', thickInput),
      h('span', { className: 'layer-info' }, [info]),
      h('button', { className: 'btn small danger', onclick: onDelete }, ['删']),
    ]);
  }

  function addLayerRow(onAdd: (layer: CableLayer) => void): HTMLElement {
    let type: LayerType = 'insulation';
    let materialId = 'xlpe';
    let thickness = 1.0;
    const typeSel = select(
      (Object.keys(LAYER_TYPE_NAMES) as LayerType[]).map((t) => ({ value: t, label: LAYER_TYPE_NAMES[t] })),
      type, (v) => { type = v; },
    );
    const matSel = select(
      Object.values(MATERIALS).map((m) => ({ value: m.id, label: m.name })),
      materialId, (v) => { materialId = v; },
    );
    const thickInput = numberInput(thickness, (v) => { thickness = v; }, { step: 0.1, min: 0 });
    return h('div', { className: 'layer-row add' }, [
      typeSel, matSel, labeled('厚度mm', thickInput),
      h('button', {
        className: 'btn small',
        onclick: () => onAdd({ id: newId('layer'), type, materialId, thickness, name: LAYER_TYPE_NAMES[type] }),
      }, ['+ 加层']),
    ]);
  }

  // 保存/加载
  const saveBtn = h('button', {
    className: 'btn',
    onclick: async () => {
      await db.saveCable(design);
      saveBtn.textContent = '已保存 ✓';
      setTimeout(() => (saveBtn.textContent = '保存到 IndexedDB'), 1200);
    },
  }, ['保存到 IndexedDB']);

  const nameInput = h('input', { value: design.name, className: 'text-input' });
  nameInput.addEventListener('change', () => appState.update((d) => { d.name = nameInput.value; }));

  function renderAll(): void {
    renderCoreTabs();
    renderLayers();
    refresh();
  }

  const unsub = appState.subscribe(refresh);

  root.append(
    h('div', { className: 'page-header' }, [
      h('h2', {}, ['电缆结构']),
      nameInput,
      saveBtn,
    ]),
    h('div', { className: 'page-body two-col' }, [
      h('div', { className: 'col' }, [coreTabs, layerList]),
      h('div', { className: 'col' }, [canvas, infoBox]),
    ]),
  );
  renderAll();
  // 页面卸载时取消订阅(简单处理:root 清空时)
  const observer = new MutationObserver(() => {
    if (!document.contains(root)) { unsub(); observer.disconnect(); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
