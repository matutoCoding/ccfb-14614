/**
 * 页面2:导体绞合 —— 分层排布、节距比/绞向、绞入系数、每公里用铜量、紧压。
 */

import { h, clear, numberInput, select, fmt } from '../ui/dom';
import { appState } from '../app/state';
import {
  computeStrandLayers, conductorWeightPerKm, conductorMetalArea,
  regularLayerCounts, maxWiresInLayer, alternateDirection, LayDirection,
} from '../core/stranding';
import { compactConductor } from '../core/compacting';
import { MATERIALS } from '../core/materials';

export function renderStrandingPage(root: HTMLElement): void {
  clear(root);
  const design = appState.design;
  let coreIdx = 0;
  let materialId: 'cu' | 'al' = 'cu';

  const tableBox = h('div', {});
  const resultBox = h('div', { className: 'info-panel' });
  const compactBox = h('div', {});

  function core(): typeof design.cores[0] {
    return design.cores[coreIdx];
  }

  function renderAll(): void {
    renderCoreTabs();
    renderTable();
    renderResults();
    renderCompact();
  }

  const tabs = h('div', { className: 'tabs' });
  function renderCoreTabs(): void {
    clear(tabs);
    design.cores.forEach((c, i) => {
      tabs.append(h('button', {
        className: i === coreIdx ? 'tab active' : 'tab',
        onclick: () => { coreIdx = i; renderAll(); },
      }, [c.name]));
    });
  }

  function renderTable(): void {
    clear(tableBox);
    const layers = core().conductor.layers;
    const results = computeStrandLayers(layers);

    const head = h('tr', {}, [
      h('th', {}, ['层']), h('th', {}, ['根数']), h('th', {}, ['单线⌀ mm']),
      h('th', {}, ['节距比']), h('th', {}, ['绞向']), h('th', {}, ['节圆⌀ mm']),
      h('th', {}, ['节距 mm']), h('th', {}, ['绞入系数 k']), h('th', {}, ['']),
    ]);
    const table = h('table', { className: 'data-table' }, [head]);

    results.forEach((r, li) => {
      const spec = layers[li];
      const countInput = numberInput(spec.wireCount, (v) => {
        appState.update(() => { spec.wireCount = Math.max(1, Math.round(v)); });
      }, { step: 1, min: 1 });
      const diaInput = numberInput(spec.wireDiameter, (v) => {
        appState.update(() => { spec.wireDiameter = v; });
      }, { step: 0.01, min: 0.1 });
      const ratioInput = numberInput(spec.layRatio, (v) => {
        appState.update(() => { spec.layRatio = v; });
      }, { step: 0.5, min: 1 });
      const dirSel = select(
        [{ value: 'S' as LayDirection, label: 'S(左)' }, { value: 'Z' as LayDirection, label: 'Z(右)' }],
        spec.direction,
        (v) => appState.update(() => { spec.direction = v; }),
      );
      // 可容纳校验
      const maxN = li === 0 ? 1 : maxWiresInLayer(r.innerDiameter, spec.wireDiameter);
      const over = spec.wireCount > maxN;
      table.append(h('tr', { className: over ? 'row-warn' : '' }, [
        h('td', {}, [li === 0 ? '中心' : `第${li}层`]),
        h('td', {}, [countInput]),
        h('td', {}, [diaInput]),
        h('td', {}, [li === 0 ? '-' : ratioInput]),
        h('td', {}, [li === 0 ? '-' : dirSel]),
        h('td', {}, [li === 0 ? '-' : fmt(r.meanDiameter, 2)]),
        h('td', {}, [li === 0 ? '-' : fmt(r.layLength, 1)]),
        h('td', {}, [fmt(r.layFactor, 5)]),
        h('td', {}, [h('button', {
          className: 'btn small danger',
          onclick: () => { appState.update(() => { layers.splice(li, 1); }); },
        }, ['删'])]),
      ]));
      if (over) {
        table.append(h('tr', { className: 'row-warn' }, [
          h('td', { colspan: '9' }, [`⚠ 该层最多容纳 ${maxN} 根(当前 ${spec.wireCount} 根)`]),
        ]));
      }
    });
    tableBox.append(table);

    tableBox.append(h('div', { className: 'btn-row' }, [
      h('button', {
        className: 'btn small',
        onclick: () => {
          appState.update(() => {
            const last = layers[layers.length - 1];
            const prevCount = layers.length === 1 ? 0 : layers[layers.length - 2].wireCount;
            const add = layers.length === 1 ? 6 : last.wireCount - prevCount || 6;
            layers.push({
              wireCount: last.wireCount + add,
              wireDiameter: last.wireDiameter,
              layRatio: Math.max(10, last.layRatio - 2),
              direction: alternateDirection(last.direction),
            });
          });
        },
      }, ['+ 加层(顺延根数)']),
      h('button', {
        className: 'btn small',
        onclick: () => {
          const total = layers.reduce((s, l) => s + l.wireCount, 0);
          const reg = regularLayerCounts(total);
          alert(reg ? `${total} 根 = ${reg.join('+')}(正规绞)` : `${total} 根为非正规绞合`);
        },
      }, ['正规绞判定']),
    ]));
  }

  function renderResults(): void {
    clear(resultBox);
    const layers = core().conductor.layers;
    const results = computeStrandLayers(layers);
    const rho = MATERIALS[materialId].density;
    const weight = conductorWeightPerKm(results, rho);
    const area = conductorMetalArea(layers);
    const od = results.length ? results[results.length - 1].outerDiameter : 0;

    // 手算对照:最外层绞入系数
    const outer = results[results.length - 1];
    const handK = outer.index === 0 ? 1 : Math.sqrt(1 + (Math.PI / outer.layRatio) ** 2);

    resultBox.append(
      h('h3', {}, ['绞合计算结果']),
      h('div', {}, [`金属截面积: ${fmt(area, 2)} mm²`]),
      h('div', {}, [`绞合外径(未紧压): ${fmt(od, 2)} mm`]),
      h('div', { className: 'highlight' }, [`每公里${MATERIALS[materialId].name}用量: ${fmt(weight, 1)} kg/km`]),
      h('div', {}, [`最外层绞入系数: 程序 ${fmt(outer.layFactor, 6)} / 手算 ${fmt(handK, 6)}`]),
      h('div', {}, [`各层每公里单线总长: ${results.map((r) => `${r.wireCount}×${fmt(r.layFactor * 1000, 1)}m`).join(', ')}`]),
    );
  }

  function renderCompact(): void {
    clear(compactBox);
    const c = core().conductor;
    const shapeSel = select(
      [{ value: 'round' as const, label: '圆形紧压' }, { value: 'sector' as const, label: '扇形紧压' }],
      c.compact?.shape ?? 'round',
      (v) => appState.update(() => {
        c.compact = { shape: v, targetFillFactor: c.compact?.targetFillFactor ?? 0.9, sectorCores: 3 };
      }),
    );
    const fillInput = numberInput(c.compact?.targetFillFactor ?? 0.9, (v) => {
      appState.update(() => { if (c.compact) c.compact.targetFillFactor = v; });
    }, { step: 0.01, min: 0.8, max: 0.98 });
    const enableSel = select(
      [{ value: 'yes' as const, label: '紧压' }, { value: 'no' as const, label: '不紧压' }],
      c.compact ? 'yes' : 'no',
      (v) => appState.update(() => {
        c.compact = v === 'yes' ? { shape: 'round', targetFillFactor: 0.9 } : null;
      }),
    );
    compactBox.append(h('div', { className: 'btn-row' }, [enableSel, shapeSel, fillInput]));

    if (c.compact) {
      const res = compactConductor(c.layers, c.compact);
      compactBox.append(h('div', { className: 'info-panel' }, [
        h('div', {}, [`紧压后外径: ${fmt(res.outerDiameter, 2)} mm`]),
        h('div', {}, [`填充率: ${fmt(res.fillFactor * 100, 1)} %`]),
        h('div', {}, [`变形后单线截面: ${fmt(res.wireAreaAfter, 3)} mm²`]),
        res.sectorHeight ? h('div', {}, [`扇形高度: ${fmt(res.sectorHeight, 2)} mm,成缆外径 ${fmt(res.cabledDiameter ?? 0, 2)} mm`]) : '',
      ]));
    }
  }

  const matSel = select(
    [{ value: 'cu' as const, label: '铜' }, { value: 'al' as const, label: '铝' }],
    materialId,
    (v) => { materialId = v; renderResults(); },
  );

  root.append(
    h('div', { className: 'page-header' }, [h('h2', {}, ['导体绞合']), tabs, matSel]),
    h('div', { className: 'page-body' }, [tableBox, compactBox, resultBox]),
  );
  renderAll();
  appState.subscribe(renderAll);
}
