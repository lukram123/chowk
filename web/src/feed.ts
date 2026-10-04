// Pure helpers for the pincode feed.
import type { FeedItem } from './backend/types';
import { formatDay, toIndiaDateInput } from './format';

const DAY = 24 * 60 * 60 * 1000;

/** Returns the 6-digit pincode, or null if the text is not one. */
export function parsePincode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return /^[1-9]\d{5}$/.test(digits) ? digits : null;
}

/** Newest offers first; ties broken by shop name so the order is stable. */
export function sortFeed(items: FeedItem[]): FeedItem[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt || a.shopName.localeCompare(b.shopName));
}

/** The categories that have at least one offer, alphabetically. */
export function feedCategories(items: FeedItem[]): string[] {
  return [...new Set(items.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** `category` null means all. `search` matches the shop name, the offer and the category. */
export function filterFeed(items: FeedItem[], category: string | null, search: string): FeedItem[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (category !== null && item.category !== category) return false;
    const haystack = `${item.shopName} ${item.headline} ${item.category} ${item.tag}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** "Ends today", "Ends tomorrow" or "Valid till 12 Oct", by the calendar day in India. */
export function endsLabel(endsAt: number, now: number): string {
  const end = toIndiaDateInput(endsAt);
  if (end === toIndiaDateInput(now)) return 'Ends today';
  if (end === toIndiaDateInput(now + DAY)) return 'Ends tomorrow';
  return `Valid till ${formatDay(endsAt)}`;
}
