/**
 * 应用入口:导航 + 哈希路由。
 */

import { h, clear } from './ui/dom';
import { renderStructurePage } from './pages/structurePage';
import { renderStrandingPage } from './pages/strandingPage';
import { renderCablingPage } from './pages/cablingPage';
import { renderViewer3DPage } from './pages/viewer3dPage';
import { renderAnalysisPage } from './pages/analysisPage';
import { renderProcessSheetPage } from './pages/processSheetPage';
import { appState, defaultDesign } from './app/state';
import { db } from './db/db';

const PAGES: { hash: string; label: string; render: (el: HTMLElement) => void }[] = [
  { hash: 'structure', label: '电缆结构', render: renderStructurePage },
  { hash: 'stranding', label: '导体绞合', render: renderStrandingPage },
  { hash: 'cabling', label: '成缆排布', render: renderCablingPage },
  { hash: 'viewer3d', label: '三维校验', render: renderViewer3DPage },
  { hash: 'analysis', label: '截面分析', render: renderAnalysisPage },
  { hash: 'process', label: '工艺单', render: renderProcessSheetPage },
];

function currentHash(): string {
  const hh = location.hash.replace(/^#\/?/, '');
  return PAGES.some((p) => p.hash === hh) ? hh : 'structure';
}

function renderApp(): void {
  const app = document.getElementById('app')!;
  clear(app);

  const nav = h('nav', { className: 'nav' });
  for (const p of PAGES) {
    nav.append(h('a', {
      href: `#/${p.hash}`,
      className: p.hash === currentHash() ? 'nav-item active' : 'nav-item',
    }, [p.label]));
  }
  // 电缆选择(从 IndexedDB 加载)
  const cableSel = h('select', { className: 'select' }) as HTMLSelectElement;
  db.listCables().then((list) => {
    for (const c of list) {
      const opt = h('option', { value: c.id }, [c.name]);
      if (c.id === appState.design.id) opt.selected = true;
      cableSel.append(opt);
    }
  });
  cableSel.addEventListener('change', async () => {
    const c = await db.getCable(cableSel.value);
    if (c) {
      appState.design = c;
      appState.emit();
      renderApp();
    }
  });
  const newBtn = h('button', {
    className: 'btn small',
    onclick: () => {
      appState.design = defaultDesign();
      appState.emit();
      renderApp();
    },
  }, ['新建电缆']);

  const pageEl = h('main', { className: 'page' });
  app.append(h('header', { className: 'topbar' }, [nav, cableSel, newBtn]), pageEl);

  const page = PAGES.find((p) => p.hash === currentHash())!;
  page.render(pageEl);
}

window.addEventListener('hashchange', renderApp);
renderApp();
