// Shared pieces of the shop screens: the frame with the bottom bar, and common types.
import { h, icon, lockup } from '../ui';
import { ShopFailed, type Dashboard, type ShopBackend } from './types';

export interface View {
  el: HTMLElement;
  /** Stops timers when the view is replaced. */
  dispose?: () => void;
}

export type Tab = 'home' | 'offer' | 'check' | 'qr';

export interface ShopContext {
  backend: ShopBackend;
  dashboard: Dashboard;
  /** Shows another screen, e.g. go('#check'). */
  go(hash: string): void;
  /** Fetches fresh data, then shows `hash` (or redraws the current screen). */
  reload(hash?: string): Promise<void>;
  signOut(): Promise<void>;
}

/** What to tell the owner when a backend call fails for a reason no screen handles itself. */
export function failureMessage(err: unknown): string {
  const reason = err instanceof ShopFailed ? err.reason : 'unknown';
  switch (reason) {
    case 'not-signed-in':
      return 'You have been signed out. Open this page again and sign in.';
    case 'has-open-deal':
      return 'You already have an offer running. End it before creating a new one.';
    case 'deal-ended':
      return 'This offer has already ended.';
    case 'deal-not-found':
      return 'We could not find this offer. Go back to Home and try again.';
    default:
      return 'Something went wrong. Check your connection and try again.';
  }
}

const TABS: Array<{ tab: Tab; hash: string; label: string; iconName: 'home' | 'tag' | 'check' | 'qr' }> = [
  { tab: 'home', hash: '#home', label: 'Home', iconName: 'home' },
  { tab: 'offer', hash: '#offer', label: 'Offer', iconName: 'tag' },
  { tab: 'check', hash: '#check', label: 'Check code', iconName: 'check' },
  { tab: 'qr', hash: '#qr', label: 'My QR', iconName: 'qr' },
];

/** The frame every signed-in screen sits in: title bar, content, bottom bar. */
export function shell(active: Tab, title: string, subtitle: string | null, ...content: Array<Node | null>): HTMLElement {
  return h(
    'div',
    { class: 'screen shop' },
    h(
      'header',
      { class: 'topbar shop-head' },
      h('div', {}, h('p', { class: 'shop-title' }, title), subtitle ? h('p', { class: 'topbar-note' }, subtitle) : null),
      lockup('#home', 'Chowk, shop home'),
    ),
    h('main', { class: 'content' }, ...content),
    h(
      'nav',
      { class: 'shop-nav', 'aria-label': 'Shop' },
      ...TABS.map(({ tab, hash, label, iconName }) =>
        h(
          'a',
          { href: hash, class: tab === active ? 'is-active' : undefined, 'aria-current': tab === active ? 'page' : undefined },
          icon(iconName, 24),
          label,
        ),
      ),
    ),
  );
}
