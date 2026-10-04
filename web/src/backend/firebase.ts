// Firebase backend: Firestore for the shop and deal, phone sign-in for the
// one-time code, and the redeemDeal Cloud Function to issue the redemption code.
import { initializeApp } from 'firebase/app';
import { collection, doc, getDoc, getDocs, getFirestore, limit, query, where } from 'firebase/firestore/lite';
import type { FirebaseConfig } from '../config';
import {
  OtpFailed,
  RedeemFailed,
  type Backend,
  type Deal,
  type OtpFailure,
  type RedeemFailure,
  type Shop,
  type Unlocked,
} from './types';

const KNOWN_FAILURES: readonly RedeemFailure[] = [
  'shop-not-found',
  'no-live-deal',
  'deal-ended',
  'sold-out',
  'already-used',
];

function otpFailure(err: unknown): OtpFailure {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (code === 'auth/invalid-phone-number') return 'invalid-number';
  if (code === 'auth/invalid-verification-code' || code === 'auth/code-expired') return 'wrong-code';
  if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') return 'too-many';
  return 'unknown';
}

export function createFirebaseBackend(firebaseConfig: FirebaseConfig, functionsRegion: string): Backend {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  // Auth and Functions are loaded only when the customer taps "Redeem now",
  // so the deal itself appears as fast as possible on a slow connection.
  const loadAuth = async () => {
    const authModule = await import('firebase/auth');
    const auth = authModule.getAuth(app);
    await auth.authStateReady();
    return { authModule, auth };
  };
  let recaptcha: { clear(): void } | null = null;

  return {
    isDemo: false,

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

    async isSignedIn() {
      const { auth } = await loadAuth();
      return auth.currentUser !== null;
    },

    async sendOtp(mobile, recaptchaContainerId) {
      const { authModule, auth } = await loadAuth();
      try {
        recaptcha?.clear();
        const verifier = new authModule.RecaptchaVerifier(auth, recaptchaContainerId, { size: 'invisible' });
        recaptcha = verifier;
        const confirmation = await authModule.signInWithPhoneNumber(auth, `+91${mobile}`, verifier);
        return {
          async confirm(code) {
            try {
              await confirmation.confirm(code);
            } catch (err) {
              throw new OtpFailed(otpFailure(err));
            }
          },
        };
      } catch (err) {
        throw new OtpFailed(otpFailure(err));
      }
    },

    async redeem(shopCode, whatsappOptIn) {
      const { auth } = await loadAuth();
      if (!auth.currentUser) throw new RedeemFailed('not-signed-in');

      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const redeemDeal = httpsCallable<{ shopCode: string; whatsappOptIn?: boolean }, Unlocked>(
        getFunctions(app, functionsRegion),
        'redeemDeal',
      );
      try {
        const result = await redeemDeal(whatsappOptIn === null ? { shopCode } : { shopCode, whatsappOptIn });
        return { code: String(result.data.code), expiresAt: Number(result.data.expiresAt) };
      } catch (err) {
        const e = err as { code?: string; details?: { reason?: string } } | null;
        if (e?.code === 'functions/unauthenticated') throw new RedeemFailed('not-signed-in');
        const reason = e?.details?.reason as RedeemFailure | undefined;
        throw new RedeemFailed(reason && KNOWN_FAILURES.includes(reason) ? reason : 'unknown');
      }
    },
  };
}
