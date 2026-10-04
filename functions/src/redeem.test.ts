import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CODE_TTL_MS,
  MAX_ISSUES,
  RedeemError,
  normalizeShopCode,
  redeem,
  type DealDoc,
  type RedeemStore,
  type RedemptionDoc,
  type ShopDoc,
} from './redeem';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function makeStore(overrides: { deal?: Partial<DealDoc> | null; redemptions?: RedemptionDoc[] } = {}) {
  const shop: ShopDoc = { code: 'MS2041', name: 'Meera Salon' };
  const deal: DealDoc | null =
    overrides.deal === null
      ? null
      : {
          id: 'deal1',
          shopCode: 'MS2041',
          headline: 'Flat 30% off haircut and styling',
          status: 'live',
          startsAt: NOW - DAY,
          endsAt: NOW + DAY,
          oneUsePerCustomer: true,
          maxRedemptions: null,
          unlockedCount: 0,
          ...overrides.deal,
        };
  const redemptions = new Map<string, RedemptionDoc>((overrides.redemptions ?? []).map((r) => [r.id, r]));
  let counted = 0;

  const store: RedeemStore = {
    async getShop(code) {
      return code === shop.code ? shop : null;
    },
    async getLiveDeal(code) {
      return deal && deal.shopCode === code && deal.status === 'live' ? deal : null;
    },
    async getRedemption(id) {
      return redemptions.get(id) ?? null;
    },
    async isCodeActive(shopCode, code, now) {
      return [...redemptions.values()].some(
        (r) => r.shopCode === shopCode && r.code === code && r.status === 'unlocked' && r.expiresAt > now,
      );
    },
    async hasUsedOfferAtShop(shopCode, uid) {
      return [...redemptions.values()].some(
        (r) => r.shopCode === shopCode && r.uid === uid && r.status === 'used',
      );
    },
    saveRedemption(r, opts) {
      redemptions.set(r.id, r);
      if (opts.countsTowardLimit) counted++;
    },
  };
  return { store, redemptions, counted: () => counted };
}

/** Returns the listed codes in order, repeating the last one. */
function codes(...list: string[]) {
  let i = 0;
  return () => list[Math.min(i++, list.length - 1)];
}

function redemption(partial: Partial<RedemptionDoc>): RedemptionDoc {
  return {
    id: 'deal1_u1',
    dealId: 'deal1',
    shopCode: 'MS2041',
    uid: 'u1',
    code: '1111',
    createdAt: NOW - 60_000,
    expiresAt: NOW - 60_000 + CODE_TTL_MS,
    status: 'unlocked',
    firstVisit: true,
    issueCount: 1,
    ...partial,
  };
}

function attempt(store: RedeemStore, code = '1234', shopCode = 'MS2041') {
  return redeem(store, { shopCode, uid: 'u1', now: NOW, randomCode: codes(code) });
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (e) {
    if (e instanceof RedeemError) return e.reason;
    throw e;
  }
  throw new Error('expected redeem to fail');
}

describe('normalizeShopCode', () => {
  it('uppercases and strips separators', () => {
    assert.equal(normalizeShopCode(' ms-20 41 '), 'MS2041');
  });
});

describe('redeem', () => {
  it('issues a 10-minute code for a first-time customer', async () => {
    const { store, counted } = makeStore();
    const result = await attempt(store, '4827', 'ms 2041');
    assert.equal(result.reused, false);
    assert.deepEqual(result.redemption, {
      id: 'deal1_u1',
      dealId: 'deal1',
      shopCode: 'MS2041',
      uid: 'u1',
      code: '4827',
      createdAt: NOW,
      expiresAt: NOW + CODE_TTL_MS,
      status: 'unlocked',
      firstVisit: true,
      issueCount: 1,
    });
    assert.equal(counted(), 1);
  });

  it('returns the same code while it is still valid', async () => {
    const { store, counted } = makeStore({ redemptions: [redemption({ code: '2222' })] });
    const result = await attempt(store, '9999');
    assert.equal(result.reused, true);
    assert.equal(result.redemption.code, '2222');
    assert.equal(counted(), 0);
  });

  it('renews an expired unused code without taking another slot', async () => {
    const expired = redemption({ expiresAt: NOW - 1, issueCount: 1 });
    const { store, counted } = makeStore({ redemptions: [expired], deal: { maxRedemptions: 1, unlockedCount: 1 } });
    const result = await attempt(store, '3333');
    assert.equal(result.redemption.code, '3333');
    assert.equal(result.redemption.issueCount, 2);
    assert.equal(counted(), 0);
  });

  it('stops renewing after the issue limit', async () => {
    const expired = redemption({ expiresAt: NOW - 1, issueCount: MAX_ISSUES });
    const { store } = makeStore({ redemptions: [expired] });
    assert.equal(await failure(attempt(store)), 'already-used');
  });

  it('refuses a second use of a one-use deal', async () => {
    const { store } = makeStore({ redemptions: [redemption({ status: 'used' })] });
    assert.equal(await failure(attempt(store)), 'already-used');
  });

  it('allows another unlock when the deal is not one-use, and marks it as a return visit', async () => {
    const { store, counted } = makeStore({
      deal: { oneUsePerCustomer: false },
      redemptions: [redemption({ status: 'used' })],
    });
    const result = await attempt(store, '3333');
    assert.equal(result.redemption.code, '3333');
    assert.equal(result.redemption.issueCount, 1);
    assert.equal(result.redemption.firstVisit, false);
    assert.equal(counted(), 1);
  });

  it('skips a code another customer is currently holding', async () => {
    const other = redemption({ id: 'deal1_u2', uid: 'u2', code: '4827', expiresAt: NOW + 1000 });
    const { store } = makeStore({ redemptions: [other] });
    const result = await redeem(store, {
      shopCode: 'MS2041',
      uid: 'u1',
      now: NOW,
      randomCode: codes('4827', '5555'),
    });
    assert.equal(result.redemption.code, '5555');
  });

  it('reports an unknown shop', async () => {
    const { store } = makeStore();
    assert.equal(await failure(attempt(store, '1234', 'ZZ0000')), 'shop-not-found');
    assert.equal(await failure(attempt(store, '1234', '--')), 'shop-not-found');
  });

  it('reports no live deal when there is none, or it has not started', async () => {
    assert.equal(await failure(attempt(makeStore({ deal: null }).store)), 'no-live-deal');
    assert.equal(await failure(attempt(makeStore({ deal: { status: 'paused' } }).store)), 'no-live-deal');
    assert.equal(await failure(attempt(makeStore({ deal: { startsAt: NOW + 1 } }).store)), 'no-live-deal');
  });

  it('reports a deal that has ended', async () => {
    const { store } = makeStore({ deal: { endsAt: NOW - 1 } });
    assert.equal(await failure(attempt(store)), 'deal-ended');
  });

  it('reports a deal that has reached its limit', async () => {
    const { store } = makeStore({ deal: { maxRedemptions: 5, unlockedCount: 5 } });
    assert.equal(await failure(attempt(store)), 'sold-out');
  });
});
