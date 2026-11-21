/**
 * 页面4:三维校验 —— 螺旋扫掠 + 实例化渲染,任意位置横切,压入/悬空标色。
 */

import { h, clear, select, fmt } from '../ui/dom';
import { appState } from '../app/state';
import { computeStrandLayers } from '../core/stranding';
import { computeCoreGeometry } from '../core/cableModel';
import { CablingSpec, CableCore } from '../core/cabling';
import { Renderer } from '../gl/renderer';
import {
  buildStrandScene, buildCablingScene, buildArmorScene,
  crossSectionAt, detectWireFaults,
} from '../gl/sceneBuilder';
import { drawCrossWires } from '../ui/sectionView';
import { ArmorSpec } from '../core/armoring';

type ViewMode = 'strand' | 'cabling' | 'armor';

export function renderViewer3DPage(root: HTMLElement): void {
  clear(root);
  const design = appState.design;

  const canvas = h('canvas', { className: 'gl-canvas' });
  const sectionCanvas = h('canvas', { width: 320, height: 320, className: 'section-canvas small' });
  const infoBox = h('div', { className: 'info-panel' });

  let mode: ViewMode = 'strand';
  let coreIdx = 0;
  const RENDER_LEN = 300; // mm

  const renderer = new Renderer(canvas);
  (window as unknown as { __renderer: Renderer }).__renderer = renderer;

  const clipSlider = h('input', {
    type: 'range', min: '0', max: String(RENDER_LEN), value: String(RENDER_LEN), step: '1',
    className: 'clip-slider',
  }) as HTMLInputElement;
  const clipCheck = h('input', { type: 'checkbox' }) as HTMLInputElement;

  function currentStrandLayers() {
    return computeStrandLayers(design.cores[coreIdx].conductor.layers);
  }

  function rebuild(): void {
    if (mode === 'strand') {
      const layers = currentStrandLayers();
      // 先在截面 z=RENDER_LEN/2 处检测故障,把标色映射到实例
      const wires = crossSectionAt(layers, RENDER_LEN / 2);
      const flags = detectWireFaults(wires);
      renderer.setScene(buildStrandScene(layers, RENDER_LEN, flags));
      const od = layers.length ? layers[layers.length - 1].outerDiameter : 10;
      // 近距离观察螺旋,用户可滚轮缩放看全长
      renderer.distance = od * 5;
      renderer.pitch = 0.15;
      renderer.target = [0, 0, RENDER_LEN / 2];
    } else if (mode === 'cabling') {
      const cb = design.cabling ?? { layLength: 1400, direction: 'S' as const, backTwist: false, fillerDiameter: 8, fillerCount: 3 };
      const coresGeom = design.cores.map((c) => computeCoreGeometry(c));
      const cores: CableCore[] = coresGeom.map((g) => ({
        diameter: g.coreDiameter,
        shape: g.core.conductor.compact?.shape === 'sector' ? 'sector' : 'round',
        sectorAngle: g.compact?.sectorAngle,
        sectorHeight: g.compact?.sectorHeight,
      }));
      const spec: CablingSpec = {
        cores, fillers: [], layLength: cb.layLength, direction: cb.direction, backTwist: cb.backTwist,
      };
      const len = Math.min(cb.layLength * 1.5, 3000);
      clipSlider.max = String(len);
      renderer.setScene(buildCablingScene(spec, cores.map((c) => c.diameter), len));
      const maxD = Math.max(...cores.map((c) => c.diameter));
      renderer.distance = maxD * 9;
      renderer.pitch = 0.3;
      renderer.target = [0, 0, len / 2];
      renderer.render();
      updateSection();
      return;
    } else {
      const coresGeom = design.cores.map((c) => computeCoreGeometry(c));
      const maxCoreD = Math.max(...coresGeom.map((g) => g.coreDiameter), 10);
      const n = coresGeom.length;
      const pitchR = n <= 1 ? 0 : maxCoreD / 2 / Math.sin(Math.PI / n);
      const cabledD = n <= 1 ? maxCoreD : 2 * (pitchR + maxCoreD / 2);
      const bedding = design.outerLayers.filter((l) => l.type === 'bedding')
        .reduce((s, l) => s + l.thickness, 0);
      const armorLayer = design.outerLayers.find((l) => l.type === 'armor');
      const spec: ArmorSpec = armorLayer && armorLayer.materialId === 'steel_wire'
        ? { kind: 'wire', wireDiameter: armorLayer.thickness, wireCount: 30, layRatio: 12, direction: 'S', baseDiameter: cabledD + 2 * bedding }
        : { kind: 'tape', tapeWidth: 40, tapeThickness: armorLayer?.thickness ?? 0.8, layers: 2, overlap: 0.25, baseDiameter: cabledD + 2 * bedding };
      renderer.setScene(buildArmorScene(spec, RENDER_LEN * 2));
      clipSlider.max = String(RENDER_LEN * 2);
      renderer.distance = spec.baseDiameter * 6;
      renderer.target = [0, 0, RENDER_LEN];
      renderer.render();
      updateSection();
      return;
    }
    clipSlider.max = String(RENDER_LEN);
    renderer.render();
    updateSection();
  }

  function updateSection(): void {
    clear(infoBox);
    if (mode !== 'strand') {
      infoBox.append(h('div', {}, ['横切截面视图仅导体绞合模式可用']));
      drawCrossWires(sectionCanvas, [], 10);
      return;
    }
    const layers = currentStrandLayers();
    const z = clipCheck.checked ? parseFloat(clipSlider.value) : RENDER_LEN / 2;
    const wires = crossSectionAt(layers, z);
    const flags = detectWireFaults(wires);
    for (const w of wires) w.flag = flags.get(`${w.layer}:${w.index}`) ?? 0;
    const od = layers.length ? layers[layers.length - 1].outerDiameter : 10;
    drawCrossWires(sectionCanvas, wires, od / 2 + 1);

    const overlap = [...flags.values()].filter((f) => f === 1).length;
    const floating = [...flags.values()].filter((f) => f === 2).length;
    const total = wires.length;
    infoBox.append(
      h('div', {}, [`截面位置 z = ${fmt(z, 0)} mm`]),
      h('div', {}, [`单线根数: ${total}(设计 ${layers.reduce((s, l) => s + l.wireCount, 0)})`]),
      h('div', { className: overlap ? 'warn-text' : '' }, [`压入(红): ${overlap} 根`]),
      h('div', { className: floating ? 'warn-text' : '' }, [`悬空(黄): ${floating} 根`]),
    );
  }

  clipCheck.addEventListener('change', () => {
    renderer.clipEnabled = clipCheck.checked;
    renderer.clipZ = parseFloat(clipSlider.value);
    renderer.render();
    updateSection();
  });
  clipSlider.addEventListener('input', () => {
    renderer.clipZ = parseFloat(clipSlider.value);
    if (clipCheck.checked) renderer.render();
    updateSection();
  });

  const modeSel = select(
    [
      { value: 'strand' as ViewMode, label: '导体绞合' },
      { value: 'cabling' as ViewMode, label: '成缆' },
      { value: 'armor' as ViewMode, label: '铠装' },
    ],
    mode,
    (v) => { mode = v; rebuild(); },
  );
  const coreSel = select(
    design.cores.map((c, i) => ({ value: String(i), label: c.name })),
    String(coreIdx),
    (v) => { coreIdx = parseInt(v); rebuild(); },
  );

  root.append(
    h('div', { className: 'page-header' }, [
      h('h2', {}, ['三维校验']),
      modeSel, coreSel,
      h('label', { className: 'clip-toggle' }, [clipCheck, '横切']),
      clipSlider,
    ]),
    h('div', { className: 'page-body two-col' }, [
      h('div', { className: 'col gl-col' }, [canvas]),
      h('div', { className: 'col' }, [
        h('h3', {}, ['横切截面']),
        sectionCanvas,
        h('div', { className: 'legend' }, [
          h('span', { className: 'legend-item ok' }, ['■ 正常']),
          h('span', { className: 'legend-item bad' }, ['■ 压入']),
          h('span', { className: 'legend-item warn' }, ['■ 悬空']),
        ]),
        infoBox,
      ]),
    ]),
  );
  // 等 DOM 布局后初始化尺寸
  requestAnimationFrame(() => rebuild());
}
