// The feed of offers running in one pincode: /p/<pincode>, and the front page
// when a launch pincode is configured.
import type { Backend, FeedItem } from './backend/types';
import { config } from './config';
import { endsLabel, feedCategories, filterFeed, sortFeed } from './feed';
import { h, lockup } from './ui';

function card(item: FeedItem, now: number): HTMLElement {
  return h(
    'a',
    { class: 'offer-card', href: `/s/${encodeURIComponent(item.shopCode)}` },
    h(
      'div',
      { class: 'offer-band' },
      item.tag ? h('span', { class: 'pill small' }, item.tag) : h('span', {}),
      h('span', { class: 'offer-category' }, item.category),
    ),
    h(
      'div',
      { class: 'offer-body' },
      h('p', { class: 'eyebrow' }, item.shopName),
      h('h2', { class: 'offer-headline' }, item.headline),
      h('p', { class: 'muted small-text' }, endsLabel(item.endsAt, now)),
    ),
  );
}

export function mountFeedPage(root: HTMLElement, pincode: string, backend: Backend): void {
  document.title = `Offers in ${pincode} · Chowk`;

  const grid = h('div', { class: 'offer-grid' });
  const status = h('p', { class: 'lead', role: 'status' }, 'Loading offers…');
  const chips = h('div', { class: 'feed-chips' });
  const search = h('input', {
    id: 'feed-search',
    type: 'search',
    placeholder: 'Bakery, salon, shoes',
    autocomplete: 'off',
  });
  const tools = h(
    'div',
    { class: 'feed-tools', hidden: true },
    h('div', { class: 'form' }, h('label', { for: 'feed-search' }, 'Search shops and offers'), search),
    chips,
  );

  let items: FeedItem[] = [];
  let category: string | null = null;

  function draw(): void {
    const now = Date.now();
    const shown = filterFeed(items, category, search.value);
    grid.replaceChildren(...shown.map((item) => card(item, now)));
    if (items.length === 0) {
      status.textContent = `No offers in ${pincode} right now. Check back soon.`;
    } else if (shown.length === 0) {
      status.textContent = 'No offers match. Try a different search or category.';
    } else {
      status.textContent = '';
    }
    status.hidden = status.textContent === '';
  }

  function drawChips(): void {
    const chip = (label: string, value: string | null) => {
      const button = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(category === value) }, label);
      button.addEventListener('click', () => {
        category = value;
        drawChips();
        draw();
      });
      return button;
    };
    chips.replaceChildren(chip('All', null), ...feedCategories(items).map((c) => chip(c, c)));
  }

  search.addEventListener('input', draw);

  async function load(): Promise<void> {
    status.hidden = false;
    status.textContent = 'Loading offers…';
    retry.hidden = true;
    try {
      items = sortFeed(await backend.listOffers(pincode));
    } catch {
      status.textContent = 'We could not load the offers. Check your connection and try again.';
      retry.hidden = false;
      return;
    }
    // Search and categories only earn their space once there is something to narrow down.
    tools.hidden = items.length < 2;
    drawChips();
    draw();
  }

  const retry = h('button', { class: 'button primary feed-retry', type: 'button', hidden: true }, 'Try again');
  retry.addEventListener('click', () => void load());

  const links = h(
    'div',
    { class: 'feed-links' },
    config.whatsappUrl ? h('a', { href: config.whatsappUrl }, 'Follow new offers on WhatsApp') : null,
    config.appUrl ? h('a', { href: config.appUrl }, 'Get the app') : null,
    h('a', { href: '/code' }, 'Have a shop code? Enter it'),
    h('a', { href: '/pincode' }, 'Change pincode'),
  );

  root.replaceChildren(
    h(
      'div',
      { class: 'screen' },
      h('header', { class: 'topbar' }, lockup(), h('a', { class: 'topbar-note', href: '/pincode' }, pincode)),
      h(
        'main',
        { class: 'content feed' },
        h(
          'div',
          { class: 'headline' },
          h('h1', {}, `Offers in ${pincode}`),
          h('p', { class: 'lead' }, 'Pick an offer, walk in, and scan the Chowk QR at the counter to redeem.'),
        ),
        tools,
        status,
        retry,
        grid,
        h(
          'section',
          { class: 'feed-shop' },
          h('p', {}, `Own a shop in ${pincode}?`),
          h('a', { class: 'button accent', href: '/shop' }, 'List your offer'),
        ),
        links,
      ),
    ),
  );

  void load();
}
