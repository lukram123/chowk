// Small DOM helpers shared by the pages. No framework: this page has to open
// fast on a phone at a shop counter, and it is only a handful of screens.

type Child = Node | string | null | undefined | false;
type AttrValue = string | number | boolean | undefined | ((event: Event) => void);

/** Creates an element. `on*` attributes are event listeners; text children are never parsed as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, AttrValue> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) el.append(child);
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Static markup only; nothing from the network is ever placed in these strings.
const ICONS = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  pin: '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  home: '<path d="M4 11 12 4l8 7v9H4z"/>',
  qr:
    '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/>' +
    '<rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 19v1"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = 20, strokeWidth = 2): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name];
  return svg;
}

/** The Chowk mark: a map pin holding a QR corner square. */
export function logoMark(size: number, pin = '#0F4C43', square = '#FFC633'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    `<path d="M32 4C19.3 4 9 14.1 9 26.6 9 43 32 60 32 60s23-17 23-33.4C55 14.1 44.7 4 32 4z" fill="${pin}"/>` +
    `<rect x="21" y="16" width="22" height="22" rx="5" fill="none" stroke="${square}" stroke-width="4"/>` +
    `<rect x="28.5" y="23.5" width="7" height="7" rx="1.5" fill="${square}"/>`;
  return svg;
}

export function lockup(href = '/', label = 'Chowk home'): HTMLElement {
  return h('a', { class: 'lockup', href, 'aria-label': label }, logoMark(28), h('span', {}, 'Chowk'));
}

/** Disables a button and swaps its label while work is in progress. */
export function setBusy(button: HTMLButtonElement, busy: boolean, busyLabel = 'Please wait…'): void {
  if (busy) {
    if (!button.disabled) button.dataset.label = button.textContent ?? '';
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    if (button.dataset.label !== undefined) button.textContent = button.dataset.label;
    button.disabled = false;
  }
}

export interface MessageAction {
  label: string;
  /** Either a link target or something to run. */
  href?: string;
  run?: () => void;
}

/** A plain full-screen message: not found, no offer, errors. */
export function messageView(message: { title: string; body: string; action?: MessageAction }): HTMLElement {
  const { action } = message;
  let actionEl: HTMLElement | null = null;
  if (action?.href) {
    actionEl = h('a', { class: 'button primary', href: action.href }, action.label);
  } else if (action?.run) {
    const run = action.run;
    actionEl = h('button', { class: 'button primary', type: 'button', onclick: () => run() }, action.label);
  }
  return h(
    'div',
    { class: 'screen' },
    h('header', { class: 'topbar' }, lockup()),
    h(
      'main',
      { class: 'content message' },
      h('h1', {}, message.title),
      h('p', { class: 'lead' }, message.body),
      actionEl,
    ),
  );
}

export function loadingView(message = 'Loading the offer…'): HTMLElement {
  return h(
    'div',
    { class: 'screen' },
    h('header', { class: 'topbar' }, lockup()),
    h('main', { class: 'content message', 'aria-busy': 'true' }, h('p', { class: 'lead' }, message)),
  );
}
