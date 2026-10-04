import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RedemptionDoc } from './redeem';
import {
  MAX_DEAL_DAYS,
  ShopError,
  checkCode,
  createDeal,
  getDashboard,
  markCodeUsed,
  registerShop,
  shopCodePrefix,
  startOfIndiaDay,
  updateDeal,
  validateDealInput,
  validateShopInput,
  type DealRecord,
  type ShopRecord,
  type ShopStore,
} from './shop';

const NOW = Date.UTC(2026, 9, 4, 10, 0); // 4 Oct 2026, 3:30 pm in India
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function makeStore(seed: { shops?: ShopRecord[]; deals?: DealRecord[]; redemptions?: RedemptionDoc[] } = {}) {
  const shops = new Map((seed.shops ?? []).map((s) => [s.code, s]));
  const deals = new Map((seed.deals ?? []).map((d) => [d.id, d]));
  const redemptions = new Map((seed.redemptions ?? []).map((r) => [r.id, r]));
  let nextId = 1;

  const store: ShopStore = {
    async getShopByOwner(uid) {
      return [...shops.values()].find((s) => s.ownerUid === uid) ?? null;
    },
    async shopExists(code) {
      return shops.has(code);
    },
    async listDeals(shopCode) {
      return [...deals.values()].filter((d) => d.shopCode === shopCode);
    },
    async getDeal(id) {
      return deals.get(id) ?? null;
    },
    async findRedemptionsByCode(shopCode, code) {
      return [...redemptions.values()].filter((r) => r.shopCode === shopCode && r.code === code);
    },
    newDealId: () => `new${nextId++}`,
    putShop(shop) {
      shops.set(shop.code, shop);
    },
    putDeal(deal) {
      deals.set(deal.id, deal);
    },
    patchDeal(id, patch) {
      deals.set(id, { ...(deals.get(id) as DealRecord), ...patch });
    },
    markUsed(r, used) {
      redemptions.set(r.id, { ...r, status: 'used', ...used });
      const deal = deals.get(r.dealId) as DealRecord;
      deals.set(r.dealId, {
        ...deal,
        usedCount: deal.usedCount + 1,
        firstVisitCount: deal.firstVisitCount + (r.firstVisit ? 1 : 0),
        billTotal: deal.billTotal + (used.billAmount ?? 0),
      });
    },
  };
  return { store, shops, deals, redemptions };
}

const meera: ShopRecord = {
  code: 'MS2041',
  name: 'Meera Salon',
  category: 'Salon',
  pincode: '560102',
  address: '14, 5th Main, Sector 6',
  ownerUid: 'owner1',
  createdAt: NOW - 30 * DAY,
};

function deal(partial: Partial<DealRecord> = {}): DealRecord {
  return {
    id: 'deal1',
    shopCode: 'MS2041',
    shopName: 'Meera Salon',
    shopCategory: 'Salon',
    pincode: '560102',
    headline: 'Flat 30% off haircut and styling',
    tag: '30% off',
    terms: [],
    status: 'live',
    startsAt: NOW - DAY,
    endsAt: NOW + 8 * DAY,
    oneUsePerCustomer: true,
    maxRedemptions: null,
    unlockedCount: 3,
    usedCount: 1,
    firstVisitCount: 1,
    billTotal: 500,
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    ...partial,
  };
}

function redemption(partial: Partial<RedemptionDoc> = {}): RedemptionDoc {
  return {
    id: 'deal1_u1',
    dealId: 'deal1',
    shopCode: 'MS2041',
    uid: 'u1',
    code: '4827',
    createdAt: NOW - 2 * MINUTE,
    expiresAt: NOW + 8 * MINUTE,
    status: 'unlocked',
    firstVisit: true,
    issueCount: 1,
    ...partial,
  };
}

const dealInput = {
  headline: '  Buy 1 kg cake,   get 6 cupcakes free ',
  tag: 'Free cupcakes',
  terms: ['One offer per bill', '  ', 'Show the code before billing'],
  startsAt: startOfIndiaDay(NOW),
  endsAt: NOW + 7 * DAY,
  oneUsePerCustomer: true,
  maxRedemptions: 50,
};

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ShopError) return e.field ? `${e.reason}:${e.field}` : e.reason;
    throw e;
  }
  throw new Error('expected a ShopError');
}

function invalid(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ShopError) return `${e.reason}:${e.field}`;
    throw e;
  }
  throw new Error('expected a ShopError');
}

describe('validateShopInput', () => {
  const good = { name: ' Meera  Salon ', category: 'Salon', pincode: '560102', address: '14, 5th Main, Sector 6' };

  it('trims and collapses spaces', () => {
    assert.deepEqual(validateShopInput(good), { ...good, name: 'Meera Salon' });
  });

  it('names the field that is wrong', () => {
    assert.equal(invalid(() => validateShopInput({ ...good, name: 'M' })), 'invalid-input:name');
    assert.equal(invalid(() => validateShopInput({ ...good, category: 'Casino' })), 'invalid-input:category');
    assert.equal(invalid(() => validateShopInput({ ...good, pincode: '056010' })), 'invalid-input:pincode');
    assert.equal(invalid(() => validateShopInput({ ...good, pincode: '5601' })), 'invalid-input:pincode');
    assert.equal(invalid(() => validateShopInput({ ...good, address: '' })), 'invalid-input:address');
    assert.equal(invalid(() => validateShopInput(null)), 'invalid-input:input');
  });
});

describe('validateDealInput', () => {
  it('cleans text and drops blank terms', () => {
    const result = validateDealInput(dealInput, NOW);
    assert.equal(result.headline, 'Buy 1 kg cake, get 6 cupcakes free');
    assert.deepEqual(result.terms, ['One offer per bill', 'Show the code before billing']);
    assert.equal(result.maxRedemptions, 50);
  });

  it('defaults to one use per customer, no badge, no terms and no limit', () => {
    const { headline, startsAt, endsAt } = dealInput;
    assert.deepEqual(validateDealInput({ headline, startsAt, endsAt }, NOW), {
      headline: 'Buy 1 kg cake, get 6 cupcakes free',
      tag: '',
      terms: [],
      startsAt,
      endsAt,
      oneUsePerCustomer: true,
      maxRedemptions: null,
    });
  });

  it('rejects bad dates and limits', () => {
    const check = (patch: object) => invalid(() => validateDealInput({ ...dealInput, ...patch }, NOW));
    assert.equal(check({ endsAt: NOW - 1 }), 'invalid-input:endsAt');
    assert.equal(check({ startsAt: NOW + 2 * DAY, endsAt: NOW + DAY }), 'invalid-input:endsAt');
    assert.equal(check({ endsAt: dealInput.startsAt + (MAX_DEAL_DAYS + 1) * DAY }), 'invalid-input:endsAt');
    assert.equal(check({ startsAt: NOW - 3 * DAY }), 'invalid-input:startsAt');
    assert.equal(check({ maxRedemptions: 0 }), 'invalid-input:maxRedemptions');
    assert.equal(check({ maxRedemptions: 2.5 }), 'invalid-input:maxRedemptions');
    assert.equal(check({ headline: 'Sale' }), 'invalid-input:headline');
    assert.equal(check({ tag: 'A badge that is far too long' }), 'invalid-input:tag');
    assert.equal(check({ terms: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }), 'invalid-input:terms');
  });
});

describe('shopCodePrefix', () => {
  it('uses initials of the first two words, else the first two letters', () => {
    assert.equal(shopCodePrefix('Meera Salon'), 'MS');
    assert.equal(shopCodePrefix('anand bakery & sweets'), 'AB');
    assert.equal(shopCodePrefix('FitYard'), 'FI');
    assert.equal(shopCodePrefix('7'), 'SH');
    assert.equal(shopCodePrefix('Q'), 'QS');
  });
});

describe('registerShop', () => {
  const input = { name: 'Anand Bakery', category: 'Food', pincode: '560102', address: '2, 14th Cross' };

  it('creates the shop with a code built from its name', async () => {
    const { store, shops } = makeStore();
    const shop = await registerShop(store, { uid: 'owner2', input, now: NOW, randomDigits: () => '1007' });
    assert.equal(shop.code, 'AB1007');
    assert.deepEqual(shops.get('AB1007'), { code: 'AB1007', ...input, ownerUid: 'owner2', createdAt: NOW });
  });

  it('tries again when the code is taken', async () => {
    const taken: ShopRecord = { ...meera, code: 'AB1007', ownerUid: 'someone' };
    const { store } = makeStore({ shops: [taken] });
    const digits = ['1007', '1008'];
    const shop = await registerShop(store, { uid: 'owner2', input, now: NOW, randomDigits: () => digits.shift() ?? '9999' });
    assert.equal(shop.code, 'AB1008');
  });

  it('allows one shop per owner', async () => {
    const { store } = makeStore({ shops: [meera] });
    assert.equal(
      await failure(registerShop(store, { uid: 'owner1', input, now: NOW, randomDigits: () => '1007' })),
      'already-registered',
    );
  });
});

describe('createDeal', () => {
  it('creates a live deal with zeroed counters', async () => {
    const { store, deals } = makeStore({ shops: [meera] });
    const created = await createDeal(store, { uid: 'owner1', input: dealInput, now: NOW });
    assert.equal(created.status, 'live');
    assert.equal(created.shopCode, 'MS2041');
    // The shop's details are copied on, for the pincode feed.
    assert.deepEqual([created.shopName, created.shopCategory, created.pincode], ['Meera Salon', 'Salon', '560102']);
    assert.deepEqual(
      [created.unlockedCount, created.usedCount, created.firstVisitCount, created.billTotal],
      [0, 0, 0, 0],
    );
    assert.equal(deals.get(created.id)?.headline, 'Buy 1 kg cake, get 6 cupcakes free');
  });

  it('needs a shop', async () => {
    const { store } = makeStore();
    assert.equal(await failure(createDeal(store, { uid: 'nobody', input: dealInput, now: NOW })), 'no-shop');
  });

  it('refuses while another deal is running or paused', async () => {
    for (const status of ['live', 'paused'] as const) {
      const { store } = makeStore({ shops: [meera], deals: [deal({ status })] });
      assert.equal(await failure(createDeal(store, { uid: 'owner1', input: dealInput, now: NOW })), 'has-open-deal');
    }
  });

  it('ends a deal whose date has passed and creates the new one', async () => {
    const { store, deals } = makeStore({ shops: [meera], deals: [deal({ endsAt: NOW - 1 })] });
    const created = await createDeal(store, { uid: 'owner1', input: dealInput, now: NOW });
    assert.equal(deals.get('deal1')?.status, 'ended');
    assert.equal(deals.get(created.id)?.status, 'live');
  });
});

describe('updateDeal', () => {
  it('extends, pauses and edits the owner\'s deal', async () => {
    const { store, deals } = makeStore({ shops: [meera], deals: [deal()] });
    await updateDeal(store, { uid: 'owner1', dealId: 'deal1', patch: { endsAt: NOW + 15 * DAY }, now: NOW });
    assert.equal(deals.get('deal1')?.endsAt, NOW + 15 * DAY);
    await updateDeal(store, { uid: 'owner1', dealId: 'deal1', patch: { status: 'paused' }, now: NOW });
    assert.equal(deals.get('deal1')?.status, 'paused');
    await updateDeal(store, { uid: 'owner1', dealId: 'deal1', patch: { headline: 'Flat 40% off haircut', maxRedemptions: 10 }, now: NOW });
    assert.equal(deals.get('deal1')?.headline, 'Flat 40% off haircut');
    assert.equal(deals.get('deal1')?.maxRedemptions, 10);
    assert.equal(deals.get('deal1')?.updatedAt, NOW);
    // Counters are never touched by an edit.
    assert.equal(deals.get('deal1')?.usedCount, 1);
  });

  it('revives a deal whose date passed when it is extended', async () => {
    const { store, deals } = makeStore({ shops: [meera], deals: [deal({ endsAt: NOW - DAY })] });
    await updateDeal(store, { uid: 'owner1', dealId: 'deal1', patch: { endsAt: NOW + 7 * DAY }, now: NOW });
    assert.equal(deals.get('deal1')?.endsAt, NOW + 7 * DAY);
  });

  it('rejects another shop\'s deal, ended deals and bad values', async () => {
    const other = makeStore({ shops: [meera], deals: [deal({ shopCode: 'ZZ0001' })] });
    assert.equal(
      await failure(updateDeal(other.store, { uid: 'owner1', dealId: 'deal1', patch: { status: 'ended' }, now: NOW })),
      'deal-not-found',
    );
    const ended = makeStore({ shops: [meera], deals: [deal({ status: 'ended' })] });
    assert.equal(
      await failure(updateDeal(ended.store, { uid: 'owner1', dealId: 'deal1', patch: { status: 'live' }, now: NOW })),
      'deal-ended',
    );
    const { store } = makeStore({ shops: [meera], deals: [deal()] });
    assert.equal(
      await failure(updateDeal(store, { uid: 'owner1', dealId: 'deal1', patch: { endsAt: NOW - 1 }, now: NOW })),
      'invalid-input:endsAt',
    );
    assert.equal(
      await failure(updateDeal(store, { uid: 'owner1', dealId: 'deal1', patch: { status: 'deleted' }, now: NOW })),
      'invalid-input:status',
    );
    assert.equal(
      await failure(updateDeal(store, { uid: 'owner1', dealId: 'missing', patch: {}, now: NOW })),
      'deal-not-found',
    );
  });
});

describe('checkCode and markCodeUsed', () => {
  it('accepts the code as typed, with or without the CH prefix', async () => {
    const { store } = makeStore({ shops: [meera], deals: [deal()], redemptions: [redemption()] });
    for (const typed of ['4827', 'CH 4827', 'ch4827']) {
      assert.deepEqual(await checkCode(store, { uid: 'owner1', code: typed, now: NOW }), {
        code: '4827',
        headline: 'Flat 30% off haircut and styling',
        firstVisit: true,
        expiresAt: NOW + 8 * MINUTE,
      });
    }
  });

  it('marks the code used and updates the deal totals', async () => {
    const { store, deals, redemptions } = makeStore({ shops: [meera], deals: [deal()], redemptions: [redemption()] });
    await markCodeUsed(store, { uid: 'owner1', code: '4827', billAmount: 1250.4, now: NOW });
    assert.deepEqual(
      { status: redemptions.get('deal1_u1')?.status, usedAt: redemptions.get('deal1_u1')?.usedAt, bill: redemptions.get('deal1_u1')?.billAmount },
      { status: 'used', usedAt: NOW, bill: 1250 },
    );
    const d = deals.get('deal1') as DealRecord;
    assert.deepEqual([d.usedCount, d.firstVisitCount, d.billTotal], [2, 2, 1750]);
    // The same code cannot be used twice.
    assert.equal(await failure(markCodeUsed(store, { uid: 'owner1', code: '4827', billAmount: null, now: NOW })), 'code-used');
    assert.equal(await failure(checkCode(store, { uid: 'owner1', code: '4827', now: NOW })), 'code-used');
  });

  it('works without a bill amount and for a returning customer', async () => {
    const { store, deals } = makeStore({
      shops: [meera],
      deals: [deal()],
      redemptions: [redemption({ firstVisit: false })],
    });
    await markCodeUsed(store, { uid: 'owner1', code: '4827', billAmount: null, now: NOW });
    const d = deals.get('deal1') as DealRecord;
    assert.deepEqual([d.usedCount, d.firstVisitCount, d.billTotal], [2, 1, 500]);
  });

  it('reports unknown, expired and other shops\' codes', async () => {
    const { store } = makeStore({
      shops: [meera],
      deals: [deal()],
      redemptions: [
        redemption({ expiresAt: NOW - 1 }),
        redemption({ id: 'x_u9', shopCode: 'ZZ0001', code: '7777' }),
      ],
    });
    assert.equal(await failure(checkCode(store, { uid: 'owner1', code: '4827', now: NOW })), 'code-expired');
    assert.equal(await failure(checkCode(store, { uid: 'owner1', code: '7777', now: NOW })), 'code-not-found');
    assert.equal(await failure(checkCode(store, { uid: 'owner1', code: '12', now: NOW })), 'code-not-found');
    assert.equal(await failure(checkCode(store, { uid: 'owner1', code: 4827, now: NOW })), 'code-not-found');
    assert.equal(await failure(checkCode(store, { uid: 'stranger', code: '4827', now: NOW })), 'no-shop');
  });

  it('prefers a live code over an older one with the same digits', async () => {
    const { store } = makeStore({
      shops: [meera],
      deals: [deal()],
      redemptions: [
        redemption({ id: 'old_u7', uid: 'u7', status: 'used', createdAt: NOW - 20 * DAY, expiresAt: NOW - 20 * DAY }),
        redemption({ firstVisit: false }),
      ],
    });
    assert.equal((await checkCode(store, { uid: 'owner1', code: '4827', now: NOW })).firstVisit, false);
  });

  it('rejects a bad bill amount', async () => {
    const { store } = makeStore({ shops: [meera], deals: [deal()], redemptions: [redemption()] });
    for (const billAmount of [0, -5, Number.NaN, '500', 20_000_000]) {
      assert.equal(
        await failure(markCodeUsed(store, { uid: 'owner1', code: '4827', billAmount, now: NOW })),
        'invalid-input:billAmount',
      );
    }
  });
});

describe('startOfIndiaDay', () => {
  it('is midnight in India, which is 18:30 UTC the day before', () => {
    assert.equal(startOfIndiaDay(NOW), Date.UTC(2026, 9, 3, 18, 30));
    assert.equal(startOfIndiaDay(Date.UTC(2026, 9, 3, 18, 30)), Date.UTC(2026, 9, 3, 18, 30));
    assert.equal(startOfIndiaDay(Date.UTC(2026, 9, 3, 18, 29)), Date.UTC(2026, 9, 2, 18, 30));
  });
});

describe('getDashboard', () => {
  it('summarises today for the owner', async () => {
    const used = [
      redemption({ id: 'a', code: '1111', status: 'used', usedAt: NOW - MINUTE, firstVisit: true, billAmount: 800 }),
      redemption({ id: 'b', code: '2222', status: 'used', usedAt: NOW - 90 * MINUTE, firstVisit: false }),
    ];
    const seen: number[] = [];
    const dashboard = await getDashboard(
      {
        getShopByOwner: async (uid) => (uid === 'owner1' ? meera : null),
        listDeals: async () => [deal({ id: 'old', status: 'ended', createdAt: NOW - 40 * DAY }), deal()],
        countUnlockedSince: async (_code, since) => (seen.push(since), 5),
        listUsedSince: async (_code, since) => (seen.push(since), used),
      },
      { uid: 'owner1', now: NOW },
    );
    assert.deepEqual(seen, [startOfIndiaDay(NOW), startOfIndiaDay(NOW)]);
    assert.deepEqual(dashboard.shop, {
      code: 'MS2041',
      name: 'Meera Salon',
      category: 'Salon',
      pincode: '560102',
      address: '14, 5th Main, Sector 6',
    });
    assert.equal(dashboard.deal?.id, 'deal1');
    assert.deepEqual(dashboard.today, { unlocked: 5, used: 2, firstVisits: 1 });
    assert.deepEqual(dashboard.todaysRedemptions, [
      { code: '1111', usedAt: NOW - MINUTE, firstVisit: true, billAmount: 800 },
      { code: '2222', usedAt: NOW - 90 * MINUTE, firstVisit: false, billAmount: null },
    ]);
  });

  it('falls back to the most recent ended deal, and to none', async () => {
    const reader = (deals: DealRecord[]) => ({
      getShopByOwner: async () => meera,
      listDeals: async () => deals,
      countUnlockedSince: async () => 0,
      listUsedSince: async () => [],
    });
    const ended = await getDashboard(
      reader([deal({ id: 'older', status: 'ended', createdAt: NOW - 40 * DAY }), deal({ id: 'newer', status: 'ended' })]),
      { uid: 'owner1', now: NOW },
    );
    assert.equal(ended.deal?.id, 'newer');
    assert.equal((await getDashboard(reader([]), { uid: 'owner1', now: NOW })).deal, null);
  });

  it('needs a shop', async () => {
    const reader = {
      getShopByOwner: async () => null,
      listDeals: async () => [],
      countUnlockedSince: async () => 0,
      listUsedSince: async () => [],
    };
    assert.equal(await failure(getDashboard(reader, { uid: 'nobody', now: NOW })), 'no-shop');
  });
});
