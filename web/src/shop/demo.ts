// Shop-side demo backend, on the same browser-stored data as the customer demo.
// It follows the server rules closely enough to show the product end to end;
// the real rules live in functions/src/shop.ts.
import { demoAuth, loadDemo, pause, updateDemo, type DemoDeal, type DemoState } from '../backend/demoStore';
import {
  CATEGORIES,
  ShopFailed,
  type Dashboard,
  type DealInput,
  type ShopBackend,
  type ShopDealDetail,
} from './types';

const DAY = 24 * 60 * 60 * 1000;
const INDIA_OFFSET = 5.5 * 60 * 60 * 1000;
const MAX_DEAL_DAYS = 92;

function owner(state: DemoState) {
  if (!state.uid) throw new ShopFailed('not-signed-in');
  const shop = state.shops.find((s) => s.ownerUid === state.uid);
  if (!shop) throw new ShopFailed('no-shop');
  return shop;
}

function openDeal(state: DemoState, shopCode: string): DemoDeal | null {
  const open = state.deals
    .filter((d) => d.shopCode === shopCode && d.status !== 'ended')
    .sort((a, b) => b.createdAt - a.createdAt);
  return open[0] ?? null;
}

function detail(deal: DemoDeal): ShopDealDetail {
  const { shopCode: _shopCode, createdAt: _createdAt, ...rest } = deal;
  return rest;
}

function checkDealText(input: Partial<DealInput>): void {
  if (input.headline !== undefined && (input.headline.trim().length < 5 || input.headline.trim().length > 80)) {
    throw new ShopFailed('invalid-input', 'headline');
  }
  if (input.tag !== undefined && input.tag.trim().length > 16) throw new ShopFailed('invalid-input', 'tag');
  if (input.terms !== undefined && (input.terms.length > 6 || input.terms.some((t) => t.length > 100))) {
    throw new ShopFailed('invalid-input', 'terms');
  }
  if (
    input.maxRedemptions !== undefined &&
    input.maxRedemptions !== null &&
    (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions < 1)
  ) {
    throw new ShopFailed('invalid-input', 'maxRedemptions');
  }
}

function checkDates(startsAt: number, endsAt: number, now: number): void {
  if (endsAt <= now || endsAt <= startsAt || endsAt - startsAt > MAX_DEAL_DAYS * DAY) {
    throw new ShopFailed('invalid-input', 'endsAt');
  }
}

function usableCode(state: DemoState, shopCode: string, rawCode: string, now: number) {
  const code = rawCode.replace(/\D/g, '');
  const matches = state.redemptions.filter((r) => r.shopCode === shopCode && r.code === code);
  const usable = matches.find((r) => r.status === 'unlocked' && r.expiresAt > now);
  if (usable) return usable;
  const latest = [...matches].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (code.length !== 4 || !latest) throw new ShopFailed('code-not-found');
  throw new ShopFailed(latest.status === 'used' ? 'code-used' : 'code-expired');
}

export function createDemoShopBackend(): ShopBackend {
  return {
    ...demoAuth,

    async getDashboard(): Promise<Dashboard> {
      await pause(150);
      const state = loadDemo();
      const { ownerUid: _ownerUid, ...shop } = owner(state);
      const now = Date.now();
      const dayStart = Math.floor((now + INDIA_OFFSET) / DAY) * DAY - INDIA_OFFSET;
      const mine = state.redemptions.filter((r) => r.shopCode === shop.code);
      const usedToday = mine
        .filter((r) => r.status === 'used' && (r.usedAt ?? 0) >= dayStart)
        .sort((a, b) => (b.usedAt ?? 0) - (a.usedAt ?? 0));
      const latest = state.deals.filter((d) => d.shopCode === shop.code).sort((a, b) => b.createdAt - a.createdAt)[0];
      const deal = openDeal(state, shop.code) ?? latest ?? null;

      return {
        shop,
        deal: deal ? detail(deal) : null,
        today: {
          unlocked: mine.filter((r) => r.createdAt >= dayStart).length,
          used: usedToday.length,
          firstVisits: usedToday.filter((r) => r.firstVisit).length,
        },
        todaysRedemptions: usedToday.map((r) => ({
          code: r.code,
          usedAt: r.usedAt ?? 0,
          firstVisit: r.firstVisit,
          billAmount: r.billAmount,
        })),
      };
    },

    async registerShop(input) {
      await pause(300);
      updateDemo((state) => {
        if (!state.uid) throw new ShopFailed('not-signed-in');
        if (state.shops.some((s) => s.ownerUid === state.uid)) throw new ShopFailed('already-registered');
        const name = input.name.trim().replace(/\s+/g, ' ');
        if (name.length < 2 || name.length > 60) throw new ShopFailed('invalid-input', 'name');
        if (!(CATEGORIES as readonly string[]).includes(input.category)) throw new ShopFailed('invalid-input', 'category');
        if (!/^[1-9]\d{5}$/.test(input.pincode)) throw new ShopFailed('invalid-input', 'pincode');
        if (input.address.trim().length < 5 || input.address.trim().length > 160) {
          throw new ShopFailed('invalid-input', 'address');
        }

        const words = name.toUpperCase().replace(/[^A-Z]+/g, ' ').split(' ').filter(Boolean);
        const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2);
        const prefix = (letters + 'SH').slice(0, 2);
        let code = '';
        while (!code || state.shops.some((s) => s.code === code)) {
          code = prefix + String(1000 + Math.floor(Math.random() * 9000));
        }
        state.shops.push({
          code,
          name,
          category: input.category,
          pincode: input.pincode,
          address: input.address.trim(),
          ownerUid: state.uid,
        });
      });
    },

    async createDeal(input) {
      await pause(300);
      updateDemo((state) => {
        const shop = owner(state);
        const now = Date.now();
        checkDealText(input);
        if (input.startsAt < now - DAY) throw new ShopFailed('invalid-input', 'startsAt');
        checkDates(input.startsAt, input.endsAt, now);

        const current = openDeal(state, shop.code);
        if (current) {
          if (current.endsAt > now) throw new ShopFailed('has-open-deal');
          current.status = 'ended';
        }
        state.deals.push({
          id: `demo-${now}`,
          shopCode: shop.code,
          ...input,
          headline: input.headline.trim(),
          tag: input.tag.trim(),
          status: 'live',
          unlockedCount: 0,
          usedCount: 0,
          firstVisitCount: 0,
          billTotal: 0,
          createdAt: now,
        });
      });
    },

    async updateDeal(dealId, patch) {
      await pause(300);
      updateDemo((state) => {
        const shop = owner(state);
        const deal = state.deals.find((d) => d.id === dealId && d.shopCode === shop.code);
        if (!deal) throw new ShopFailed('deal-not-found');
        if (deal.status === 'ended') throw new ShopFailed('deal-ended');
        checkDealText(patch);
        if (patch.endsAt !== undefined) checkDates(deal.startsAt, patch.endsAt, Date.now());
        Object.assign(deal, patch);
      });
    },

    async checkCode(code) {
      await pause(200);
      const state = loadDemo();
      const shop = owner(state);
      const redemption = usableCode(state, shop.code, code, Date.now());
      const deal = state.deals.find((d) => d.id === redemption.dealId);
      return {
        code: redemption.code,
        headline: deal?.headline ?? '',
        firstVisit: redemption.firstVisit,
        expiresAt: redemption.expiresAt,
      };
    },

    async markCodeUsed(code, billAmount) {
      await pause(300);
      updateDemo((state) => {
        const shop = owner(state);
        if (billAmount !== null && (!Number.isFinite(billAmount) || billAmount <= 0)) {
          throw new ShopFailed('invalid-input', 'billAmount');
        }
        const now = Date.now();
        const redemption = usableCode(state, shop.code, code, now);
        redemption.status = 'used';
        redemption.usedAt = now;
        redemption.billAmount = billAmount === null ? null : Math.round(billAmount);
        const deal = state.deals.find((d) => d.id === redemption.dealId);
        if (deal) {
          deal.usedCount += 1;
          if (redemption.firstVisit) deal.firstVisitCount += 1;
          deal.billTotal += redemption.billAmount ?? 0;
        }
      });
    },
  };
}
