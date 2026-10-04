// Create an offer, or edit the one that is running.
import { fromIndiaDateInput, toIndiaDateInput } from '../format';
import { h, setBusy } from '../ui';
import { failureMessage, shell, type ShopContext, type View } from './shell';
import { dealPhase } from './deal';
import { ShopFailed, type DealInput, type DealPatch } from './types';

const DAY = 24 * 60 * 60 * 1000;

const FIELD_MESSAGES: Record<string, string> = {
  headline: 'Write the offer in 5 to 80 characters.',
  tag: 'Keep the badge to 16 characters.',
  startsAt: 'The start date cannot be in the past.',
  endsAt: 'The end date must be after the start, not in the past, and within 3 months of the start.',
  maxRedemptions: 'Enter a whole number, or leave it empty for no limit.',
  terms: 'Use up to 6 terms, each under 100 characters.',
};

export function offerView(ctx: ShopContext): View {
  const now = Date.now();
  const current = ctx.dashboard.deal;
  const phase = current ? dealPhase(current, now) : null;
  // A running, paused or upcoming offer is edited; otherwise this form creates a new one.
  const editing = current && (phase === 'live' || phase === 'paused' || phase === 'scheduled') ? current : null;

  const headline = h('input', { id: 'offer-headline', type: 'text', maxlength: 80, placeholder: 'Flat 30% off haircut and styling' });
  const tag = h('input', { id: 'offer-tag', type: 'text', maxlength: 16, placeholder: '30% off' });
  const starts = h('input', { id: 'offer-starts', type: 'date' });
  const ends = h('input', { id: 'offer-ends', type: 'date' });
  const oneUse = h('input', { type: 'checkbox' });
  const limit = h('input', { id: 'offer-limit', type: 'text', inputmode: 'numeric', placeholder: 'No limit' });
  const terms = h('textarea', { id: 'offer-terms', rows: 3, placeholder: 'One per line' });
  const error = h('p', { class: 'field-error', role: 'alert' });
  const submit = h('button', { class: 'button primary', type: 'submit' }, editing ? 'Save changes' : 'Publish offer');
  const fields: Record<string, HTMLElement> = { headline, tag, startsAt: starts, endsAt: ends, maxRedemptions: limit, terms };

  if (editing) {
    headline.value = editing.headline;
    tag.value = editing.tag;
    starts.value = toIndiaDateInput(editing.startsAt);
    starts.disabled = true;
    ends.value = toIndiaDateInput(editing.endsAt);
    oneUse.checked = editing.oneUsePerCustomer;
    limit.value = editing.maxRedemptions === null ? '' : String(editing.maxRedemptions);
    terms.value = editing.terms.join('\n');
  } else {
    starts.value = toIndiaDateInput(now);
    ends.value = toIndiaDateInput(now + 7 * DAY);
    oneUse.checked = true;
  }

  function fail(field: string): void {
    error.textContent = FIELD_MESSAGES[field] ?? 'Check the details and try again.';
    fields[field]?.focus();
  }

  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('label', { for: 'offer-headline' }, 'Offer in one line'),
    headline,
    h('p', { class: 'help' }, 'This is the first thing customers read.'),
    h('label', { for: 'offer-tag' }, 'Badge (optional)'),
    tag,
    h('p', { class: 'help' }, 'A few words shown on the offer, like "30% off" or "Free gift".'),
    h(
      'div',
      { class: 'two-col' },
      h('div', { class: 'form' }, h('label', { for: 'offer-starts' }, 'Starts'), starts),
      h('div', { class: 'form' }, h('label', { for: 'offer-ends' }, 'Ends'), ends),
    ),
    h('label', { class: 'check' }, oneUse, h('span', {}, 'One use per customer')),
    h('label', { for: 'offer-limit' }, 'Stop after this many customers (optional)'),
    limit,
    h('label', { for: 'offer-terms' }, 'Terms (optional)'),
    terms,
    error,
    submit,
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      error.textContent = '';
      const headlineText = headline.value.trim();
      if (headlineText.length < 5) return fail('headline');

      const startsAt = editing ? editing.startsAt : fromIndiaDateInput(starts.value, false);
      if (startsAt === null) return fail('startsAt');
      const endsAt = fromIndiaDateInput(ends.value, true);
      if (endsAt === null || endsAt <= startsAt || endsAt <= Date.now()) return fail('endsAt');

      const limitText = limit.value.trim();
      const maxRedemptions = limitText === '' ? null : Number(limitText);
      if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) {
        return fail('maxRedemptions');
      }

      const details = {
        headline: headlineText,
        tag: tag.value.trim(),
        terms: terms.value
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        endsAt,
        oneUsePerCustomer: oneUse.checked,
        maxRedemptions,
      };

      setBusy(submit, true, 'Saving…');
      try {
        if (editing) await ctx.backend.updateDeal(editing.id, details satisfies DealPatch);
        else await ctx.backend.createDeal({ ...details, startsAt } satisfies DealInput);
      } catch (err) {
        setBusy(submit, false);
        if (err instanceof ShopFailed && err.reason === 'invalid-input' && err.field) fail(err.field);
        else error.textContent = failureMessage(err);
        return;
      }
      await ctx.reload('#home');
    })();
  });

  return {
    el: shell('offer', editing ? 'Edit offer' : 'New offer', ctx.dashboard.shop.name, form),
  };
}
