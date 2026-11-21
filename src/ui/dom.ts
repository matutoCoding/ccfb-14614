/** 极简 DOM 构建辅助 */

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'className') {
      el.className = String(v);
    } else if (k === 'value') {
      (el as HTMLInputElement).value = String(v);
    } else if (k === 'checked') {
      (el as HTMLInputElement).checked = Boolean(v);
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function numberInput(
  value: number,
  onChange: (v: number) => void,
  opts: { step?: number; min?: number; max?: number } = {},
): HTMLInputElement {
  const input = h('input', {
    type: 'number',
    value: String(value),
    step: String(opts.step ?? 0.1),
    min: opts.min !== undefined ? String(opts.min) : undefined,
    max: opts.max !== undefined ? String(opts.max) : undefined,
    className: 'num-input',
  });
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (!Number.isNaN(v)) onChange(v);
  });
  return input;
}

export function select<T extends string>(
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): HTMLSelectElement {
  const sel = h('select', { className: 'select' });
  for (const o of options) {
    const opt = h('option', { value: o.value }, [o.label]);
    if (o.value === value) opt.selected = true;
    sel.append(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value as T));
  return sel;
}

export function labeled(label: string, control: HTMLElement): HTMLElement {
  return h('label', { className: 'field' }, [h('span', { className: 'field-label' }, [label]), control]);
}

export function fmt(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return '-';
  return x.toFixed(digits);
}
