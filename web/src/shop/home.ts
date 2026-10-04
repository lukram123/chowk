// Home: the code-check shortcut, today's numbers, the current offer and today's redemptions.
import { daysLeft, formatCode, formatDay, formatRupees, formatTime } from '../format';
import { h, icon, setBusy } from '../ui';
import { failureMessage, shell, type ShopContext, type View } from './shell';
import { dealPhase, type DealPhase } from './deal';
import type { DealStatus, ShopDealDetail } from './types';

function tile(label: string, value: number): HTMLElement {
  return h('div', { class: 'tile' }, h('p', { class: 'tile-label' }, label), h('p', { class: 'tile-value' }, String(value)));
}

export function phasePill(deal: ShopDealDetail, phase: DealPhase): HTMLElement {
  switch (phase) {
    case 'live':
      return h('span', { class: 'status is-live' }, h('span', { class: 'dot' }), 'Live');
    case 'paused':
      return h('span', { class: 'status' }, 'Paused');
    case 'scheduled':
      return h('span', { class: 'status' }, `Starts ${formatDay(deal.startsAt)}`);
    case 'expired':
      return h('span', { class: 'status' }, `Ended ${formatDay(deal.endsAt)}`);
    default:
      return h('span', { class: 'status' }, 'Ended');
  }
}

export function endsLine(deal: ShopDealDetail, now: number): string {
  const days = daysLeft(deal.endsAt, now);
  return `Ends ${formatDay(deal.endsAt)} · ${days === 1 ? 'last day' : `${days} days left`}`;
}

function dealCard(ctx: ShopContext, error: HTMLElement): HTMLElement {
  const { deal } = ctx.dashboard;
  if (!deal) {
    return h(
      'section',
      { class: 'card' },
      h('h2', { class: 'card-title' }, 'No offer yet'),
      h('p', { class: 'muted' }, 'Create your first offer. Customers can redeem it as soon as you publish.'),
      h('a', { class: 'button primary', href: '#offer' }, 'Create an offer'),
    );
  }

  const now = Date.now();
  const phase = dealPhase(deal, now);
  const running = phase === 'live' || phase === 'paused' || phase === 'scheduled';

  const actions: HTMLElement[] = [];
  if (running) {
    actions.push(h('a', { class: 'button small tint', href: '#results' }, 'Results'));
    actions.push(h('a', { class: 'button small secondary', href: '#offer' }, 'Edit'));
    if (phase !== 'scheduled') {
      const next: DealStatus = phase === 'paused' ? 'live' : 'paused';
      const toggle = h('button', { class: 'button small secondary', type: 'button' }, phase === 'paused' ? 'Resume' : 'Pause');
      toggle.addEventListener('click', () => {
        void (async () => {
          error.textContent = '';
          setBusy(toggle, true, '…');
          try {
            await ctx.backend.updateDeal(deal.id, { status: next });
            await ctx.reload();
          } catch (err) {
            setBusy(toggle, false);
            error.textContent = failureMessage(err);
          }
        })();
      });
      actions.push(toggle);
    }
  } else {
    actions.push(h('a', { class: 'button small tint', href: '#results' }, phase === 'expired' ? 'Extend' : 'Results'));
    actions.push(h('a', { class: 'button small secondary', href: '#offer' }, 'New offer'));
  }

  return h(
    'section',
    { class: 'card' },
    h(
      'div',
      { class: 'card-row' },
      phasePill(deal, phase),
      running ? h('span', { class: 'muted small-text' }, endsLine(deal, now)) : null,
    ),
    h('p', { class: 'ticket-offer' }, deal.headline),
    h('div', { class: 'button-row' }, ...actions),
    error,
  );
}

export function homeView(ctx: ShopContext): View {
  const { shop, today, todaysRedemptions } = ctx.dashboard;
  const error = h('p', { class: 'field-error', role: 'alert' });

  const redemptions =
    todaysRedemptions.length > 0
      ? h(
          'ul',
          { class: 'rows' },
          ...todaysRedemptions.map((r) =>
            h(
              'li',
              {},
              h('span', { class: 'row-code' }, formatCode(r.code)),
              h(
                'span',
                { class: 'muted' },
                [formatTime(r.usedAt), r.firstVisit ? 'First visit' : 'Returning', r.billAmount ? formatRupees(r.billAmount) : null]
                  .filter(Boolean)
                  .join(' · '),
              ),
            ),
          ),
        )
      : h('p', { class: 'muted' }, 'No codes used yet today.');

  const signOut = h('button', { class: 'link-button center', type: 'button' }, 'Sign out');
  signOut.addEventListener('click', () => void ctx.signOut());

  return {
    el: shell(
      'home',
      shop.name,
      `${shop.category} · ${shop.pincode}`,
      h('a', { class: 'button primary', href: '#check' }, icon('check', 22, 2.5), 'Check a customer\'s code'),
      h(
        'section',
        { class: 'block' },
        h('h2', { class: 'section-title' }, 'Today'),
        h(
          'div',
          { class: 'tiles three' },
          tile('Codes unlocked', today.unlocked),
          tile('Redeemed', today.used),
          tile('First visits', today.firstVisits),
        ),
      ),
      dealCard(ctx, error),
      h('section', { class: 'block' }, h('h2', { class: 'section-title' }, 'Today\'s redemptions'), redemptions),
      signOut,
    ),
  };
}
