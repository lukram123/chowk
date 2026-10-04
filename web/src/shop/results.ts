// What the offer has done so far, and extending, pausing or ending it.
import { formatDay, formatRupees, fromIndiaDateInput, toIndiaDateInput } from '../format';
import { h, setBusy } from '../ui';
import { failureMessage, shell, type ShopContext, type View } from './shell';
import { dealPhase, extendedEnd } from './deal';
import { endsLine, phasePill } from './home';
import { ShopFailed, type DealPatch } from './types';

function tile(label: string, value: number): HTMLElement {
  return h('div', { class: 'tile' }, h('p', { class: 'tile-label' }, label), h('p', { class: 'tile-value' }, String(value)));
}

export function resultsView(ctx: ShopContext): View {
  const { deal, shop } = ctx.dashboard;
  if (!deal) {
    return {
      el: shell(
        'offer',
        'Results',
        shop.name,
        h('p', { class: 'muted' }, 'You have not created an offer yet.'),
        h('a', { class: 'button primary', href: '#offer' }, 'Create an offer'),
      ),
    };
  }

  const now = Date.now();
  const dealId = deal.id;
  const currentEnd = deal.endsAt;
  const phase = dealPhase(deal, now);
  const error = h('p', { class: 'field-error', role: 'alert' });

  async function apply(button: HTMLButtonElement, patch: DealPatch): Promise<void> {
    error.textContent = '';
    setBusy(button, true);
    try {
      await ctx.backend.updateDeal(dealId, patch);
      await ctx.reload();
    } catch (err) {
      setBusy(button, false);
      error.textContent =
        err instanceof ShopFailed && err.reason === 'invalid-input' && err.field === 'endsAt'
          ? 'An offer can run for at most 3 months from its start. Pick an earlier date, or create a new offer.'
          : failureMessage(err);
    }
  }

  const summary = h(
    'div',
    { class: 'headline' },
    h('div', { class: 'card-row' }, phasePill(deal, phase)),
    h('h1', { class: 'smaller' }, deal.headline),
    h(
      'p',
      { class: 'muted' },
      phase === 'ended' || phase === 'expired'
        ? `${formatDay(deal.startsAt)} to ${formatDay(deal.endsAt)}`
        : endsLine(deal, now),
    ),
  );

  const tiles = h(
    'div',
    { class: 'tiles two' },
    tile('Codes unlocked', deal.unlockedCount),
    tile('Offers redeemed', deal.usedCount),
    tile('First-time customers', deal.firstVisitCount),
    tile('Returning customers', deal.usedCount - deal.firstVisitCount),
  );
  const bills = deal.billTotal > 0 ? h('p', { class: 'muted' }, `Bills recorded: ${formatRupees(deal.billTotal)}`) : null;

  if (phase === 'ended') {
    return {
      el: shell('offer', 'Results', shop.name, summary, tiles, bills, h('a', { class: 'button primary', href: '#offer' }, 'Create a new offer')),
    };
  }

  // Extend
  let newEnd = extendedEnd(currentEnd, now, 7);
  const newEndLine = h('p', { class: 'muted' }, '');
  const picker = h('input', { id: 'extend-date', type: 'date', 'aria-label': 'New end date', hidden: true });
  const choices: HTMLButtonElement[] = [];
  const showNewEnd = () => {
    newEndLine.textContent = `New end date: ${formatDay(newEnd)}`;
  };
  const choice = (label: string, onPick: () => void): HTMLButtonElement => {
    const button = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false' }, label);
    button.addEventListener('click', () => {
      choices.forEach((c) => c.setAttribute('aria-pressed', String(c === button)));
      onPick();
      showNewEnd();
    });
    choices.push(button);
    return button;
  };
  const oneWeek = choice('1 week', () => {
    picker.hidden = true;
    newEnd = extendedEnd(currentEnd, now, 7);
  });
  const twoWeeks = choice('2 weeks', () => {
    picker.hidden = true;
    newEnd = extendedEnd(currentEnd, now, 14);
  });
  const pick = choice('Pick date', () => {
    picker.hidden = false;
    picker.value = toIndiaDateInput(newEnd);
    picker.focus();
  });
  picker.addEventListener('change', () => {
    const picked = fromIndiaDateInput(picker.value, true);
    if (picked !== null) newEnd = picked;
    showNewEnd();
  });
  oneWeek.setAttribute('aria-pressed', 'true');
  showNewEnd();

  const extendButton = h('button', { class: 'button primary', type: 'button' }, 'Extend offer');
  extendButton.addEventListener('click', () => {
    if (newEnd <= Date.now()) {
      error.textContent = 'Pick an end date from today onwards.';
      return;
    }
    // Extending an offer whose date passed also brings a paused one back to live.
    void apply(extendButton, phase === 'expired' ? { endsAt: newEnd, status: 'live' } : { endsAt: newEnd });
  });

  const extend = h(
    'section',
    { class: 'card' },
    h('h2', { class: 'card-title' }, phase === 'expired' ? 'Run this offer again' : 'Keep this offer running'),
    h('div', { class: 'chips' }, oneWeek, twoWeeks, pick),
    picker,
    newEndLine,
    extendButton,
  );

  // End: asks for a second tap, since an ended offer cannot be restarted.
  const endButton = h('button', { class: 'button secondary', type: 'button' }, 'End offer now');
  let armed = false;
  endButton.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      endButton.textContent = 'Tap again to end it for good';
      return;
    }
    void apply(endButton, { status: 'ended' });
  });

  return {
    el: shell(
      'offer',
      'Results',
      shop.name,
      summary,
      tiles,
      bills,
      extend,
      error,
      h('div', { class: 'button-row two' }, h('a', { class: 'button secondary', href: '#offer' }, phase === 'expired' ? 'New offer' : 'Edit offer'), endButton),
    ),
  };
}
