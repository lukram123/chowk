import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatCode, formatCountdown, formatDay, normalizeShopCode, parseIndianMobile } from './format';

describe('normalizeShopCode', () => {
  it('accepts the code as printed on the standee', () => {
    assert.equal(normalizeShopCode('ms 2041'), 'MS2041');
    assert.equal(normalizeShopCode(' MS-2041 '), 'MS2041');
  });
});

describe('parseIndianMobile', () => {
  it('accepts a 10-digit mobile with spaces, +91 or a leading zero', () => {
    assert.equal(parseIndianMobile('98765 43210'), '9876543210');
    assert.equal(parseIndianMobile('+91 98765-43210'), '9876543210');
    assert.equal(parseIndianMobile('09876543210'), '9876543210');
  });

  it('rejects numbers that are not Indian mobiles', () => {
    assert.equal(parseIndianMobile('12345 67890'), null);
    assert.equal(parseIndianMobile('98765'), null);
    assert.equal(parseIndianMobile('987654321012'), null);
    assert.equal(parseIndianMobile(''), null);
  });
});

describe('formatCountdown', () => {
  it('shows minutes and seconds, rounding up so 00:00 only appears at expiry', () => {
    assert.equal(formatCountdown(10 * 60 * 1000), '10:00');
    assert.equal(formatCountdown(582_000), '09:42');
    assert.equal(formatCountdown(400), '00:01');
    assert.equal(formatCountdown(0), '00:00');
    assert.equal(formatCountdown(-5000), '00:00');
  });
});

describe('formatDay', () => {
  it('formats in India time', () => {
    // 12 Oct 2026 20:00 UTC is already 13 Oct in India.
    assert.equal(formatDay(Date.UTC(2026, 9, 12, 6, 0)), '12 Oct');
    assert.equal(formatDay(Date.UTC(2026, 9, 12, 20, 0)), '13 Oct');
  });
});

describe('formatCode', () => {
  it('adds the CH prefix', () => {
    assert.equal(formatCode('4827'), 'CH 4827');
  });
});
