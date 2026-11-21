/**
 * 页面5:截面分析 —— 最薄点/偏心度/外径公差/挤偏风险/实测照片叠加。
 */

import { h, clear, numberInput, fmt } from '../ui/dom';
import { appState } from '../app/state';
import { computeCoreGeometry, computeCableGeometry } from '../core/cableModel';
import { computeStrandLayers, conductorWeightPerKm } from '../core/stranding';
import { MATERIALS, outerDiameterTolerance } from '../core/materials';
import {
  analyzeThicknesses, checkOuterDiameter, insulationShiftRiskZones,
  designWirePositions, compareMeasured,
} from '../core/analysis';
import { db, MeasurementRecord } from '../db/db';
import { newId } from '../core/cableModel';

export function renderAnalysisPage(root: HTMLElement): void {
  clear(root);
  const design = appState.design;
  let coreIdx = 0;

  const resultBox = h('div', {});
  const overlayCanvas = h('canvas', { width: 480, height: 480, className: 'section-canvas' });
  let measurement: MeasurementRecord | null = null;
  let overlayImg: HTMLImageElement | null = null;

  async function loadMeasurements(): Promise<void> {
    const list = await db.listMeasurements(design.id);
    measurement = list[0] ?? null;
    if (measurement?.imageDataUrl) {
      overlayImg = new Image();
      overlayImg.src = measurement.imageDataUrl;
      overlayImg.onload = () => renderOverlay();
    }
    renderResults();
    renderOverlay();
  }

  function renderResults(): void {
    clear(resultBox);
    const core = design.cores[coreIdx];
    const geom = computeCoreGeometry(core);

    // 1) 各层厚度:默认标称=实测(无实测时提示),有实测则算最薄点/偏心
    resultBox.append(h('h3', {}, [`${core.name} 各层厚度分析`]));
    const samples = measurement?.thicknessSamples ?? {};
    for (const g of geom.layerGeometries) {
      const s = samples[g.layer.id];
      if (s && s.length >= 4) {
        const { issue, ecc } = analyzeThicknesses(g.layer.name, g.layer.thickness, s);
        resultBox.append(h('div', { className: issue.pass ? '' : 'warn-text' }, [
          `${g.layer.name}: 最薄点 ${fmt(issue.minThickness, 2)} / 标称 ${fmt(issue.nominalThickness, 2)} mm,` +
          `偏心度 ${fmt(ecc.eccentricity * 100, 1)}% ${issue.pass ? '' : '❌ 不合格'}`,
        ]));
      } else {
        resultBox.append(h('div', { className: 'dim' }, [
          `${g.layer.name}: 标称 ${fmt(g.layer.thickness, 2)} mm(未录入实测)`,
        ]));
      }
    }

    // 2) 外径公差
    const coreMetalWeights = design.cores.map((c) =>
      conductorWeightPerKm(computeStrandLayers(c.conductor.layers), MATERIALS.cu.density));
    const cableGeom = computeCableGeometry(design, coreMetalWeights);
    const tol = outerDiameterTolerance(cableGeom.outerDiameter);
    const measuredOd = measurement?.measuredOd;
    resultBox.append(h('h3', {}, ['外径公差']));
    resultBox.append(h('div', {}, [
      `设计外径 ${fmt(cableGeom.outerDiameter, 2)} mm,公差 ±${fmt(tol, 2)} mm`,
    ]));
    if (measuredOd != null) {
      const chk = checkOuterDiameter(measuredOd, cableGeom.outerDiameter);
      resultBox.append(h('div', { className: chk.pass ? '' : 'error-text' }, [
        `实测 ${fmt(measuredOd, 2)} mm,偏差 ${fmt(chk.deviation, 2)} mm ${chk.pass ? '✓' : '❌ 超差'}`,
      ]));
    }

    // 3) 挤偏风险(扇形 + 不退扭)
    const isSector = core.conductor.compact?.shape === 'sector';
    const backTwist = design.cabling?.backTwist ?? true;
    if (isSector && !backTwist) {
      const zones = insulationShiftRiskZones(design.cabling!.layLength, 5000, false);
      resultBox.append(h('h3', {}, ['绝缘挤偏风险区(线芯翻身)']));
      resultBox.append(h('div', { className: 'warn-text' }, [
        `不退扭绞合,每节距内存在挤偏风险区,前 5 米共 ${zones.length} 段:`,
      ]));
      zones.slice(0, 5).forEach((z) => {
        resultBox.append(h('div', { className: 'warn-text' }, [
          `  z = ${fmt(z.zStart, 0)} ~ ${fmt(z.zEnd, 0)} mm`,
        ]));
      });
    }

    // 4) 实测对比统计
    if (measurement && measurement.measuredWireCount != null) {
      const wires = designWirePositions(geom);
      const cmp = compareMeasured(wires, measurement.measuredWireCount, measurement.measuredOd ?? geom.conductorDiameter, geom.conductorDiameter);
      resultBox.append(h('h3', {}, ['实测对比']));
      resultBox.append(
        h('div', {}, [`单线根数: 设计 ${wires.length} / 实测 ${measurement.measuredWireCount}(差 ${cmp.countDiff})`]),
        h('div', { className: Math.abs(cmp.odDeviationPct) > 1 ? 'error-text' : '' }, [
          `导体外径偏差: ${fmt(cmp.odDeviation, 2)} mm(${fmt(cmp.odDeviationPct, 2)}%)`,
        ]),
      );
    }
  }

  function renderOverlay(): void {
    const ctx = overlayCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    const geom = computeCoreGeometry(design.cores[coreIdx]);
    const scale = (overlayCanvas.width / 2 - 20) / (geom.coreDiameter / 2);
    const cx = overlayCanvas.width / 2, cy = overlayCanvas.height / 2;

    // 实测照片(按导体中心对齐)
    if (overlayImg && measurement) {
      const a = measurement.align;
      ctx.save();
      ctx.globalAlpha = 0.5;
      const iw = overlayImg.width * a.scale, ih = overlayImg.height * a.scale;
      ctx.drawImage(overlayImg, cx + a.dx - iw / 2, cy + a.dy - ih / 2, iw, ih);
      ctx.restore();
    }
    // 设计截面(单线)
    ctx.strokeStyle = '#e33';
    ctx.lineWidth = 1.5;
    for (const w of designWirePositions(geom)) {
      ctx.beginPath();
      ctx.arc(cx + w.x * scale, cy - w.y * scale, (w.diameter / 2) * scale, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.strokeStyle = '#2f6db3';
    ctx.beginPath();
    ctx.arc(cx, cy, (geom.conductorDiameter / 2) * scale, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // 照片导入
  const fileInput = h('input', { type: 'file', accept: 'image/*' }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const m: MeasurementRecord = measurement ?? {
        id: newId('meas'), cableId: design.id, name: f.name,
        imageDataUrl: null, align: { dx: 0, dy: 0, scale: 1 },
        measuredWireCount: null, measuredOd: null, thicknessSamples: {}, createdAt: Date.now(),
      };
      m.imageDataUrl = String(reader.result);
      measurement = m;
      await db.saveMeasurement(m);
      overlayImg = new Image();
      overlayImg.src = m.imageDataUrl!;
      overlayImg.onload = () => renderOverlay();
    };
    reader.readAsDataURL(f);
  });

  // 对齐与实测录入
  const alignBox = h('div', { className: 'form-grid' });
  function renderAlign(): void {
    clear(alignBox);
    const m = measurement;
    if (!m) { alignBox.append(h('div', { className: 'dim' }, ['导入实测照片后可对齐与录入数据'])); return; }
    alignBox.append(
      h('label', {}, ['对齐 dx', numberInput(m.align.dx, async (v) => { m.align.dx = v; await db.saveMeasurement(m); renderOverlay(); }, { step: 1 })]),
      h('label', {}, ['对齐 dy', numberInput(m.align.dy, async (v) => { m.align.dy = v; await db.saveMeasurement(m); renderOverlay(); }, { step: 1 })]),
      h('label', {}, ['缩放', numberInput(m.align.scale, async (v) => { m.align.scale = v; await db.saveMeasurement(m); renderOverlay(); }, { step: 0.01, min: 0.01 })]),
      h('label', {}, ['实测根数', numberInput(m.measuredWireCount ?? 0, async (v) => { m.measuredWireCount = Math.round(v); await db.saveMeasurement(m); renderResults(); }, { step: 1, min: 0 })]),
      h('label', {}, ['实测外径 mm', numberInput(m.measuredOd ?? 0, async (v) => { m.measuredOd = v; await db.saveMeasurement(m); renderResults(); }, { step: 0.01, min: 0 })]),
    );
    // 每层 8 方向厚度录入
    const core = design.cores[coreIdx];
    for (const layer of core.layers) {
      const cur = m.thicknessSamples[layer.id] ?? Array(8).fill(layer.thickness);
      const row = h('div', { className: 'thickness-row' }, [h('span', {}, [`${layer.name} 8向厚度:`])]);
      cur.forEach((t, i) => {
        row.append(numberInput(t, async (v) => {
          cur[i] = v;
          m.thicknessSamples[layer.id] = cur;
          await db.saveMeasurement(m);
          renderResults();
        }, { step: 0.01, min: 0 }));
      });
      alignBox.append(row);
    }
  }

  const coreTabs = h('div', { className: 'tabs' });
  design.cores.forEach((c, i) => {
    coreTabs.append(h('button', {
      className: i === coreIdx ? 'tab active' : 'tab',
      onclick: () => { coreIdx = i; renderResults(); renderOverlay(); renderAlign(); },
    }, [c.name]));
  });

  root.append(
    h('div', { className: 'page-header' }, [h('h2', {}, ['截面分析']), coreTabs, fileInput]),
    h('div', { className: 'page-body two-col' }, [
      h('div', { className: 'col' }, [resultBox]),
      h('div', { className: 'col' }, [
        h('h3', {}, ['实测照片叠加(红圈=设计单线)']),
        overlayCanvas,
        alignBox,
      ]),
    ]),
  );
  renderAlign();
  loadMeasurements();
}
