// Shop-side Firebase backend. Every operation is a Cloud Function call
// (functions/src/index.ts); the shop app never reads or writes Firestore directly.
import { callFailure, firebaseHandle } from '../backend/firebaseApp';
import type { FirebaseConfig } from '../config';
import {
  SHOP_FAILURES,
  ShopFailed,
  type CodeCheck,
  type Dashboard,
  type ShopBackend,
  type ShopFailure,
} from './types';

export function createFirebaseShopBackend(firebaseConfig: FirebaseConfig, functionsRegion: string): ShopBackend {
  const firebase = firebaseHandle(firebaseConfig, functionsRegion);

  async function call<Res>(name: string, data: Record<string, unknown>): Promise<Res> {
    if (!(await firebase.isSignedIn())) throw new ShopFailed('not-signed-in');
    try {
      return await firebase.call<Record<string, unknown>, Res>(name, data);
    } catch (err) {
      const failure = callFailure(err);
      if (failure.unauthenticated) throw new ShopFailed('not-signed-in');
      const known = (SHOP_FAILURES as readonly string[]).includes(failure.reason ?? '');
      throw new ShopFailed(known ? (failure.reason as ShopFailure) : 'unknown', failure.field);
    }
  }

  return {
    isDemo: false,
    isSignedIn: firebase.isSignedIn,
    sendOtp: firebase.sendOtp,
    signOut: firebase.signOut,

    getDashboard: () => call<Dashboard>('getShopDashboard', {}),

    async registerShop(input) {
      await call('registerShop', { shop: input });
    },

    async createDeal(input) {
      await call('createDeal', { deal: input });
    },

    async updateDeal(dealId, patch) {
      await call('updateDeal', { dealId, patch });
    },

    checkCode: (code) => call<CodeCheck>('checkCode', { code }),

    async markCodeUsed(code, billAmount) {
      await call('markCodeUsed', { code, billAmount });
    },
  };
}
