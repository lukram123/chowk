// The page talks to this interface only, so the Firebase backend and the demo
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
  /** Resolves once the customer is signed in; throws OtpFailed otherwise. */
  confirm(code: string): Promise<void>;
}

export interface Backend {
  /** True for the built-in sample data, so the page can say so. */
  readonly isDemo: boolean;
  /** null when no shop has this code. */
  getShopDeal(shopCode: string): Promise<ShopDeal | null>;
  isSignedIn(): Promise<boolean>;
  /** `mobile` is a 10-digit Indian number. `recaptchaContainerId` must be an element on the page. */
  sendOtp(mobile: string, recaptchaContainerId: string): Promise<OtpChallenge>;
  /** Throws RedeemFailed. `whatsappOptIn` is null when the customer was not asked. */
  redeem(shopCode: string, whatsappOptIn: boolean | null): Promise<Unlocked>;
}
