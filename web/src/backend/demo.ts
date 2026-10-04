// Sample data for development and demos. Nothing here touches a server:
// codes are made up in the browser and no shop can verify them.
import { DEMO_OTP } from './demo-info';
import {
  OtpFailed,
  RedeemFailed,
  type Backend,
  type OtpChallenge,
  type ShopDeal,
  type Unlocked,
} from './types';

const CODE_TTL_MS = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function sampleShops(now: number): Record<string, ShopDeal> {
  return {
    MS2041: {
      shop: { code: 'MS2041', name: 'Meera Salon', category: 'Salon', pincode: '560102', address: '' },
      deal: {
        id: 'demo-ms2041',
        shopCode: 'MS2041',
        headline: 'Flat 30% off haircut and styling',
        tag: '30% off',
        terms: ['Weekdays, 11 am to 7 pm', 'Not valid with other offers', 'Show the unlocked code before billing'],
        endsAt: now + 9 * DAY,
        oneUsePerCustomer: true,
      },
    },
    AB1007: {
      shop: { code: 'AB1007', name: 'Anand Bakery', category: 'Food', pincode: '560102', address: '' },
      deal: {
        id: 'demo-ab1007',
        shopCode: 'AB1007',
        headline: 'Buy 1 kg cake, get 6 cupcakes free',
        tag: 'Free cupcakes',
        terms: ['One offer per bill', 'Show the unlocked code before billing'],
        endsAt: now + 1 * DAY,
        oneUsePerCustomer: true,
      },
    },
    FB3300: {
      shop: { code: 'FB3300', name: 'Fresh Basket', category: 'Grocery', pincode: '560102', address: '' },
      deal: null,
    },
  };
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createDemoBackend(): Backend {
  const shops = sampleShops(Date.now());
  const unlocked = new Map<string, Unlocked>();
  let signedIn = false;

  return {
    isDemo: true,

    async getShopDeal(shopCode) {
      await pause(150);
      return shops[shopCode] ?? null;
    },

    async isSignedIn() {
      return signedIn;
    },

    async sendOtp(): Promise<OtpChallenge> {
      await pause(300);
      return {
        async confirm(code) {
          await pause(300);
          if (code !== DEMO_OTP) throw new OtpFailed('wrong-code');
          signedIn = true;
        },
      };
    },

    async redeem(shopCode) {
      await pause(300);
      if (!signedIn) throw new RedeemFailed('not-signed-in');
      const entry = shops[shopCode];
      if (!entry) throw new RedeemFailed('shop-not-found');
      if (!entry.deal) throw new RedeemFailed('no-live-deal');

      const existing = unlocked.get(shopCode);
      if (existing && existing.expiresAt > Date.now()) return existing;

      const fresh: Unlocked = {
        code: String(1000 + Math.floor(Math.random() * 9000)),
        expiresAt: Date.now() + CODE_TTL_MS,
      };
      unlocked.set(shopCode, fresh);
      return fresh;
    },
  };
}
