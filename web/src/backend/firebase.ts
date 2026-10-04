// Customer-side Firebase backend: Firestore for the shop and deal, and the
// redeemDeal Cloud Function to issue the redemption code.
import { collection, doc, getDoc, getDocs, getFirestore, limit, query, where } from 'firebase/firestore/lite';
import type { FirebaseConfig } from '../config';
import { callFailure, firebaseHandle } from './firebaseApp';
import { RedeemFailed, type Backend, type Deal, type RedeemFailure, type Shop, type Unlocked } from './types';

const KNOWN_FAILURES: readonly string[] = ['shop-not-found', 'no-live-deal', 'deal-ended', 'sold-out', 'already-used'];

export function createFirebaseBackend(firebaseConfig: FirebaseConfig, functionsRegion: string): Backend {
  const firebase = firebaseHandle(firebaseConfig, functionsRegion);
  const db = getFirestore(firebase.app);

  return {
    isDemo: false,
    isSignedIn: firebase.isSignedIn,
    sendOtp: firebase.sendOtp,
    signOut: firebase.signOut,

    async getShopDeal(shopCode) {
      const shopSnap = await getDoc(doc(db, 'shops', shopCode));
      if (!shopSnap.exists()) return null;
      const s = shopSnap.data();
      const shop: Shop = {
        code: shopCode,
        name: String(s.name ?? ''),
        category: String(s.category ?? ''),
        pincode: String(s.pincode ?? ''),
        address: String(s.address ?? ''),
      };

      const dealSnap = await getDocs(
        query(collection(db, 'deals'), where('shopCode', '==', shopCode), where('status', '==', 'live'), limit(1)),
      );
      const dealDoc = dealSnap.docs[0];
      if (!dealDoc) return { shop, deal: null };

      const d = dealDoc.data();
      const now = Date.now();
      if (now < Number(d.startsAt ?? 0) || now > Number(d.endsAt ?? 0)) return { shop, deal: null };

      const deal: Deal = {
        id: dealDoc.id,
        shopCode,
        headline: String(d.headline ?? ''),
        tag: String(d.tag ?? ''),
        terms: Array.isArray(d.terms) ? d.terms.map(String) : [],
        endsAt: Number(d.endsAt),
        oneUsePerCustomer: d.oneUsePerCustomer !== false,
      };
      return { shop, deal };
    },

    async redeem(shopCode, whatsappOptIn) {
      if (!(await firebase.isSignedIn())) throw new RedeemFailed('not-signed-in');
      try {
        const result = await firebase.call<{ shopCode: string; whatsappOptIn?: boolean }, Unlocked>(
          'redeemDeal',
          whatsappOptIn === null ? { shopCode } : { shopCode, whatsappOptIn },
        );
        return { code: String(result.code), expiresAt: Number(result.expiresAt) };
      } catch (err) {
        const failure = callFailure(err);
        if (failure.unauthenticated) throw new RedeemFailed('not-signed-in');
        const known = failure.reason !== null && KNOWN_FAILURES.includes(failure.reason);
        throw new RedeemFailed(known ? (failure.reason as RedeemFailure) : 'unknown');
      }
    },
  };
}
