import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FeedItem } from './backend/types';
import { endsLabel, feedCategories, filterFeed, parsePincode, sortFeed } from './feed';

const NOW = Date.UTC(2026, 9, 4, 10, 0); // 4 Oct 2026, 3:30 pm in India
const DAY = 24 * 60 * 60 * 1000;

function item(partial: Partial<FeedItem>): FeedItem {
  return {
    shopCode: 'MS2041',
    shopName: 'Meera Salon',
    category: 'Salon',
    headline: 'Flat 30% off haircut and styling',
    tag: '30% off',
    endsAt: NOW + 5 * DAY,
    createdAt: NOW - DAY,
    ...partial,
  };
}

const salon = item({});
const bakery = item({ shopCode: 'AB1007', shopName: 'Anand Bakery', category: 'Food', headline: 'Buy 1 kg cake, get 6 cupcakes free', tag: 'Free cupcakes', createdAt: NOW });
const grocer = item({ shopCode: 'FB3300', shopName: 'Fresh Basket', category: 'Grocery', headline: '₹100 off on bills above ₹999', tag: '₹100 off', createdAt: NOW - DAY });

describe('parsePincode', () => {
  it('accepts six digits, with spaces', () => {
    assert.equal(parsePincode('560102'), '560102');
    assert.equal(parsePincode(' 560 102 '), '560102');
  });

  it('rejects anything else', () => {
    assert.equal(parsePincode('56010'), null);
    assert.equal(parsePincode('5601022'), null);
    assert.equal(parsePincode('056010'), null);
    assert.equal(parsePincode('abcdef'), null);
  });
});

describe('sortFeed', () => {
  it('puts the newest offer first, then orders by shop name', () => {
    assert.deepEqual(
      sortFeed([salon, grocer, bakery]).map((i) => i.shopName),
      ['Anand Bakery', 'Fresh Basket', 'Meera Salon'],
    );
  });

  it('does not change the list it was given', () => {
    const list = [salon, bakery];
    sortFeed(list);
    assert.deepEqual(list, [salon, bakery]);
  });
});

describe('feedCategories', () => {
  it('lists each category once, alphabetically', () => {
    assert.deepEqual(feedCategories([salon, bakery, grocer, item({ shopName: 'Second Salon' })]), ['Food', 'Grocery', 'Salon']);
    assert.deepEqual(feedCategories([]), []);
  });
});

describe('filterFeed', () => {
  const all = [salon, bakery, grocer];

  it('filters by category', () => {
    assert.deepEqual(filterFeed(all, 'Food', ''), [bakery]);
    assert.deepEqual(filterFeed(all, null, ''), all);
  });

  it('searches shop name, offer, category and badge, ignoring case', () => {
    assert.deepEqual(filterFeed(all, null, 'CAKE'), [bakery]);
    assert.deepEqual(filterFeed(all, null, 'meera'), [salon]);
    assert.deepEqual(filterFeed(all, null, 'grocery'), [grocer]);
    assert.deepEqual(filterFeed(all, null, '₹100'), [grocer]);
    assert.deepEqual(filterFeed(all, null, '  off  '), [salon, grocer]);
  });

  it('needs every word to match, and combines with the category', () => {
    assert.deepEqual(filterFeed(all, null, 'free cake'), [bakery]);
    assert.deepEqual(filterFeed(all, null, 'free haircut'), []);
    assert.deepEqual(filterFeed(all, 'Salon', 'cake'), []);
  });
});

describe('endsLabel', () => {
  const endOf = (day: number) => Date.UTC(2026, 9, day, 18, 30) - 1; // end of that October day in India

  it('names today and tomorrow, and gives the date otherwise', () => {
    assert.equal(endsLabel(endOf(4), NOW), 'Ends today');
    assert.equal(endsLabel(NOW + 60_000, NOW), 'Ends today');
    assert.equal(endsLabel(endOf(5), NOW), 'Ends tomorrow');
    assert.equal(endsLabel(endOf(12), NOW), 'Valid till 12 Oct');
  });

  it('goes by the day in India, not UTC', () => {
    // 19:00 UTC on 4 Oct is already 5 Oct in India.
    assert.equal(endsLabel(Date.UTC(2026, 9, 4, 19, 0), NOW), 'Ends tomorrow');
  });
});
