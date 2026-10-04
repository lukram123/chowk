import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dealPhase, extendedEnd, shareText } from './deal';

const NOW = Date.UTC(2026, 9, 4, 10, 0); // 4 Oct 2026, 3:30 pm in India
const DAY = 24 * 60 * 60 * 1000;
const endOf = (day: number) => Date.UTC(2026, 9, day, 18, 30) - 1; // end of that October day in India

describe('dealPhase', () => {
  const base = { startsAt: NOW - DAY, endsAt: NOW + DAY };

  it('follows status and dates', () => {
    assert.equal(dealPhase({ ...base, status: 'live' }, NOW), 'live');
    assert.equal(dealPhase({ ...base, status: 'paused' }, NOW), 'paused');
    assert.equal(dealPhase({ ...base, status: 'live', startsAt: NOW + 1 }, NOW), 'scheduled');
    assert.equal(dealPhase({ ...base, status: 'live', endsAt: NOW - 1 }, NOW), 'expired');
    assert.equal(dealPhase({ ...base, status: 'paused', endsAt: NOW - 1 }, NOW), 'expired');
    assert.equal(dealPhase({ ...base, status: 'ended' }, NOW), 'ended');
  });
});

describe('extendedEnd', () => {
  it('adds days to the current end date', () => {
    assert.equal(extendedEnd(endOf(12), NOW, 7), endOf(19));
    assert.equal(extendedEnd(endOf(12), NOW, 14), endOf(26));
  });

  it('counts from today when the end date has passed', () => {
    assert.equal(extendedEnd(endOf(1), NOW, 7), endOf(11));
  });
});

describe('shareText', () => {
  it('builds a post with the offer, validity and link', () => {
    const shop = { code: 'MS2041', name: 'Meera Salon', category: 'Salon', pincode: '560102', address: '' };
    const text = shareText(shop, { headline: 'Flat 30% off haircut and styling', endsAt: endOf(12) }, 'https://chowk.example/s/MS2041');
    assert.equal(
      text,
      'Flat 30% off haircut and styling at Meera Salon, 560102.\n' +
        'Valid till 12 Oct.\n' +
        'Scan the Chowk QR at the shop counter, or open https://chowk.example/s/MS2041',
    );
  });
});
