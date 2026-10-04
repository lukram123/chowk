// The pages talk to these interfaces only, so the Firebase backend and the demo
// backend are interchangeable. All times are epoch milliseconds.

export interface Shop {
  code: string;
  name: string;
  category: string;
  pincode: string;
  address: string;
}

export interface Deal {
  id: string;
  shopCode: string;
  /** "Flat 30% off haircut and styling" */
  headline: string;
  /** Short badge text, e.g. "30% off". */
  tag: string;
  terms: string[];
  endsAt: number;
  oneUsePerCustomer: boolean;
}

export interface ShopDeal {
  shop: Shop;
  /** null when the shop has no offer running. */
  deal: Deal | null;
}

/** One live offer in a pincode's feed. */
export interface FeedItem {
  shopCode: string;
  shopName: string;
  category: string;
  headline: string;
  tag: string;
  endsAt: number;
  createdAt: number;
}

export interface Unlocked {
  /** Four digits; shown as "CH 4827". */
  code: string;
  expiresAt: number;
}

export type RedeemFailure =
  | 'shop-not-found'
  | 'no-live-deal'
  | 'deal-ended'
  | 'sold-out'
  | 'already-used'
  | 'not-signed-in'
  | 'unknown';

export class RedeemFailed extends Error {
  constructor(public readonly reason: RedeemFailure) {
    super(reason);
    this.name = 'RedeemFailed';
  }
}

export type OtpFailure = 'invalid-number' | 'wrong-code' | 'too-many' | 'unknown';

export class OtpFailed extends Error {
  constructor(public readonly reason: OtpFailure) {
    super(reason);
    this.name = 'OtpFailed';
  }
}

export interface OtpChallenge {
  /** Resolves once the person is signed in; throws OtpFailed otherwise. */
  confirm(code: string): Promise<void>;
}

/** Sign-in by mobile number, shared by the customer page and the shop app. */
export interface AuthBackend {
  /** True for the built-in sample data, so the page can say so. */
  readonly isDemo: boolean;
  isSignedIn(): Promise<boolean>;
  /** `mobile` is a 10-digit Indian number. `recaptchaContainerId` must be an element on the page. */
  sendOtp(mobile: string, recaptchaContainerId: string): Promise<OtpChallenge>;
  signOut(): Promise<void>;
}

export interface Backend extends AuthBackend {
  /** null when no shop has this code. */
  getShopDeal(shopCode: string): Promise<ShopDeal | null>;
  /** Offers running right now at shops in the pincode, in no particular order. */
  listOffers(pincode: string): Promise<FeedItem[]>;
  /** Throws RedeemFailed. `whatsappOptIn` is null when the customer was not asked. */
  redeem(shopCode: string, whatsappOptIn: boolean | null): Promise<Unlocked>;
}
