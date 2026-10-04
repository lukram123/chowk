// What the shop app needs from a backend. Implemented by firebase.ts and demo.ts.
import type { AuthBackend } from '../backend/types';

export const CATEGORIES = ['Food', 'Grocery', 'Fashion', 'Salon', 'Electronics', 'Fitness', 'Other'] as const;

export interface ShopProfile {
  code: string;
  name: string;
  category: string;
  pincode: string;
  address: string;
}

export type DealStatus = 'live' | 'paused' | 'ended';

export interface ShopDealDetail {
  id: string;
  headline: string;
  tag: string;
  terms: string[];
  status: DealStatus;
  startsAt: number;
  endsAt: number;
  oneUsePerCustomer: boolean;
  maxRedemptions: number | null;
  /** Customers who unlocked a code. */
  unlockedCount: number;
  /** Codes marked as used. */
  usedCount: number;
  /** Of those, customers visiting for the first time. */
  firstVisitCount: number;
  /** Sum of bill amounts entered, in rupees. */
  billTotal: number;
}

export interface RedemptionRow {
  code: string;
  usedAt: number;
  firstVisit: boolean;
  billAmount: number | null;
}

export interface Dashboard {
  shop: ShopProfile;
  /** The running or paused offer; otherwise the most recent ended one; null if there has never been one. */
  deal: ShopDealDetail | null;
  today: { unlocked: number; used: number; firstVisits: number };
  todaysRedemptions: RedemptionRow[];
}

export interface ShopInput {
  name: string;
  category: string;
  pincode: string;
  address: string;
}

export interface DealInput {
  headline: string;
  tag: string;
  terms: string[];
  startsAt: number;
  endsAt: number;
  oneUsePerCustomer: boolean;
  maxRedemptions: number | null;
}

export type DealPatch = Partial<Omit<DealInput, 'startsAt'>> & { status?: DealStatus };

export interface CodeCheck {
  code: string;
  headline: string;
  firstVisit: boolean;
  expiresAt: number;
}

export type ShopFailure =
  | 'not-signed-in'
  | 'no-shop'
  | 'already-registered'
  | 'invalid-input'
  | 'has-open-deal'
  | 'deal-not-found'
  | 'deal-ended'
  | 'code-not-found'
  | 'code-expired'
  | 'code-used'
  | 'unknown';

export const SHOP_FAILURES: readonly ShopFailure[] = [
  'no-shop',
  'already-registered',
  'invalid-input',
  'has-open-deal',
  'deal-not-found',
  'deal-ended',
  'code-not-found',
  'code-expired',
  'code-used',
];

export class ShopFailed extends Error {
  /** `field` names the input at fault for 'invalid-input'. */
  constructor(
    public readonly reason: ShopFailure,
    public readonly field: string | null = null,
  ) {
    super(field ? `${reason}: ${field}` : reason);
    this.name = 'ShopFailed';
  }
}

/** Every method except the sign-in ones throws ShopFailed. */
export interface ShopBackend extends AuthBackend {
  /** Throws 'no-shop' when the signed-in person has not listed a shop yet. */
  getDashboard(): Promise<Dashboard>;
  registerShop(input: ShopInput): Promise<void>;
  createDeal(input: DealInput): Promise<void>;
  updateDeal(dealId: string, patch: DealPatch): Promise<void>;
  checkCode(code: string): Promise<CodeCheck>;
  markCodeUsed(code: string, billAmount: number | null): Promise<void>;
}
