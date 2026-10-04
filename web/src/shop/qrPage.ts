// My QR: the counter standee with the shop's QR code, ready to print, and
// ready-to-paste text for sharing the offer on WhatsApp.
import { config } from '../config';
import { encodeQr, qrPath } from '../qr';
import { h, logoMark } from '../ui';
import { shell, type ShopContext, type View } from './shell';
import { dealPhase, shareText } from './deal';

const SVG_NS = 'http://www.w3.org/2000/svg';

function qrSvg(text: string): SVGSVGElement {
  const { path, viewBoxSize } = qrPath(encodeQr(text));
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${viewBoxSize} ${viewBoxSize}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code for your shop');
  svg.setAttribute('shape-rendering', 'crispEdges');
  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('width', String(viewBoxSize));
  background.setAttribute('height', String(viewBoxSize));
  background.setAttribute('fill', '#ffffff');
  const modules = document.createElementNS(SVG_NS, 'path');
  modules.setAttribute('d', path);
  modules.setAttribute('fill', '#10231f');
  svg.append(background, modules);
  return svg;
}

function step(n: number, text: string): HTMLElement {
  return h('div', { class: 'standee-step' }, h('span', {}, String(n)), h('p', {}, text));
}

export function qrView(ctx: ShopContext): View {
  const { shop, deal } = ctx.dashboard;
  const site = config.siteUrl ?? window.location.origin;
  const link = `${site}/s/${shop.code}`;
  const printedCode = `${shop.code.slice(0, 2)} ${shop.code.slice(2)}`;

  const standee = h(
    'section',
    { class: 'standee', 'aria-label': 'Counter standee' },
    h(
      'div',
      { class: 'standee-page' },
      h('div', { class: 'standee-brand' }, logoMark(28), h('span', {}, 'Chowk')),
      h('p', { class: 'standee-title' }, 'Scan for today\'s offer'),
      h('div', { class: 'standee-qr' }, qrSvg(link)),
      h('div', {}, h('p', { class: 'standee-shop' }, shop.name), h('p', { class: 'standee-code' }, `Shop code ${printedCode}`)),
      h(
        'div',
        { class: 'standee-steps' },
        step(1, 'Scan with your phone camera'),
        step(2, 'Verify your number once'),
        step(3, 'Show the code before billing'),
      ),
      h('p', { class: 'standee-foot' }, `No app needed · ${site.replace(/^https?:\/\//, '')}`),
    ),
  );

  const printButton = h('button', { class: 'button primary no-print', type: 'button' }, 'Print standee');
  printButton.addEventListener('click', () => window.print());

  let share: HTMLElement | null = null;
  if (deal) {
    const phase = dealPhase(deal, Date.now());
    if (phase === 'live' || phase === 'scheduled') {
      const text = h('textarea', { id: 'share-text', class: 'share-text', readonly: true, rows: 6 });
      text.value = shareText(shop, deal, link);
      const copy = h('button', { class: 'button secondary', type: 'button' }, 'Copy text');
      copy.addEventListener('click', () => {
        void (async () => {
          try {
            await navigator.clipboard.writeText(text.value);
          } catch {
            text.select();
            document.execCommand('copy');
          }
          copy.textContent = 'Copied';
          setTimeout(() => {
            copy.textContent = 'Copy text';
          }, 2000);
        })();
      });
      share = h(
        'section',
        { class: 'card no-print' },
        h('h2', { class: 'card-title' }, 'Share your offer'),
        h('label', { for: 'share-text' }, 'Paste this in WhatsApp'),
        text,
        copy,
      );
    }
  }

  return {
    el: shell(
      'qr',
      'My QR',
      shop.name,
      h('p', { class: 'muted no-print' }, 'Print this on A5 paper and keep it on your counter. It stays the same when your offer changes.'),
      standee,
      printButton,
      share,
    ),
  };
}
