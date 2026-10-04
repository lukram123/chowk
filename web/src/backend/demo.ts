// Customer-side demo backend. Codes are made up in the browser; see demoStore.ts.
import { demoAuth, freeCode, loadDemo, pause, updateDemo } from './demoStore';
import { RedeemFailed, type Backend, type Unlocked } from './types';

const CODE_TTL_MS = 10 * 60 * 1000;

export function createDemoBackend(): Backend {
  return {
    ...demoAuth,

    async getShopDeal(shopCode) {
      await pause(150);
      const state = loadDemo();
      const shop = state.shops.find((s) => s.code === shopCode);
      if (!shop) return null;
      const now = Date.now();
      const deal = state.deals.find(
        (d) => d.shopCode === shopCode && d.status === 'live' && d.startsAt <= now && d.endsAt >= now,
      );
      const { ownerUid: _ownerUid, ...publicShop } = shop;
      return {
        shop: publicShop,
        deal: deal
          ? {
              id: deal.id,
              shopCode,
              headline: deal.headline,
              tag: deal.tag,
              terms: deal.terms,
              endsAt: deal.endsAt,
              oneUsePerCustomer: deal.oneUsePerCustomer,
            }
          : null,
      };
    },

    async redeem(shopCode): Promise<Unlocked> {
      await pause(300);
      return updateDemo((state) => {
        const uid = state.uid;
        if (!uid) throw new RedeemFailed('not-signed-in');
        if (!state.shops.some((s) => s.code === shopCode)) throw new RedeemFailed('shop-not-found');

        const now = Date.now();
        const deal = state.deals.find((d) => d.shopCode === shopCode && d.status === 'live' && d.startsAt <= now);
        if (!deal) throw new RedeemFailed('no-live-deal');
        if (deal.endsAt < now) throw new RedeemFailed('deal-ended');

        const id = `${deal.id}_${uid}`;
        const existing = state.redemptions.find((r) => r.id === id);
        if (existing?.status === 'unlocked' && existing.expiresAt > now) {
          return { code: existing.code, expiresAt: existing.expiresAt };
        }
        if (existing?.status === 'used' && deal.oneUsePerCustomer) throw new RedeemFailed('already-used');

        const renewal = existing?.status === 'unlocked';
        if (!renewal && deal.maxRedemptions !== null && deal.unlockedCount >= deal.maxRedemptions) {
          throw new RedeemFailed('sold-out');
        }

        const firstVisit = !state.redemptions.some(
          (r) => r.shopCode === shopCode && r.uid === uid && r.status === 'used',
        );
        const fresh = {
          id,
          dealId: deal.id,
          shopCode,
          uid,
          code: freeCode(state, shopCode, now),
          createdAt: now,
          expiresAt: now + CODE_TTL_MS,
          status: 'unlocked' as const,
          firstVisit,
          usedAt: null,
          billAmount: null,
        };
        state.redemptions = state.redemptions.filter((r) => r.id !== id).concat(fresh);
        if (!renewal) deal.unlockedCount += 1;
        return { code: fresh.code, expiresAt: fresh.expiresAt };
      });
    },
  };
}
