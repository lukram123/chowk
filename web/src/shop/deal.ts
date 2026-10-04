// Small pure helpers about an offer's state, shared by the shop screens.
import { formatDay, fromIndiaDateInput, toIndiaDateInput } from '../format';
import type { ShopDealDetail, ShopProfile } from './types';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Where an offer stands right now. 'expired' means its end date has passed but
 * nobody ended it, so it can still be extended.
 */
export type DealPhase = 'scheduled' | 'live' | 'paused' | 'expired' | 'ended';

export function dealPhase(deal: Pick<ShopDealDetail, 'status' | 'startsAt' | 'endsAt'>, now: number): DealPhase {
  if (deal.status === 'ended') return 'ended';
  if (deal.endsAt < now) return 'expired';
  if (deal.status === 'paused') return 'paused';
  return deal.startsAt > now ? 'scheduled' : 'live';
}

/** The new end when an offer is extended by `days`: counted from its end date, or from today if that has passed. */
export function extendedEnd(endsAt: number, now: number, days: number): number {
  const base = Math.max(endsAt, now);
  return fromIndiaDateInput(toIndiaDateInput(base + days * DAY), true) as number;
}

/** Ready-to-paste text for a WhatsApp post about the offer. */
export function shareText(shop: ShopProfile, deal: Pick<ShopDealDetail, 'headline' | 'endsAt'>, link: string): string {
  return [
    `${deal.headline} at ${shop.name}, ${shop.pincode}.`,
    `Valid till ${formatDay(deal.endsAt)}.`,
    `Scan the Chowk QR at the shop counter, or open ${link}`,
  ].join('\n');
}
