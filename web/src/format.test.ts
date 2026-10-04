import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  daysLeft,
  formatCode,
  formatCountdown,
  formatDay,
  formatRupees,
  formatTime,
  fromIndiaDateInput,
  normalizeShopCode,
  parseIndianMobile,
  toIndiaDateInput,
} from './format';

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

describe('India dates for date inputs', () => {
  it('converts a day to its start and end in India time', () => {
    assert.equal(fromIndiaDateInput('2026-10-12', false), Date.UTC(2026, 9, 11, 18, 30));
    assert.equal(fromIndiaDateInput('2026-10-12', true), Date.UTC(2026, 9, 12, 18, 30) - 1);
  });

  it('round-trips through the input format', () => {
    const end = fromIndiaDateInput('2026-10-12', true) as number;
    assert.equal(toIndiaDateInput(end), '2026-10-12');
    assert.equal(toIndiaDateInput(Date.UTC(2026, 9, 11, 18, 30)), '2026-10-12');
    assert.equal(toIndiaDateInput(Date.UTC(2026, 9, 11, 18, 29)), '2026-10-11');
  });

  it('rejects text that is not a real date', () => {
    assert.equal(fromIndiaDateInput('', false), null);
    assert.equal(fromIndiaDateInput('12/10/2026', false), null);
    assert.equal(fromIndiaDateInput('2026-02-31', false), null);
  });
});

describe('daysLeft', () => {
  it('counts a part day as a day', () => {
    const now = Date.UTC(2026, 9, 4, 10, 0);
    assert.equal(daysLeft(now + 1000, now), 1);
    assert.equal(daysLeft(now + 2 * 24 * 60 * 60 * 1000, now), 2);
    assert.equal(daysLeft(now - 1000, now), 0);
  });
});

describe('formatTime and formatRupees', () => {
  it('formats for India', () => {
    assert.equal(formatTime(Date.UTC(2026, 9, 4, 14, 12)), '7:42 pm');
    assert.equal(formatRupees(125000), '₹1,25,000');
    assert.equal(formatRupees(0), '₹0');
  });
});
