// Pure redemption rules, independent of Firestore so they can be unit tested.
// All times are epoch milliseconds.

export type DealStatus = 'live' | 'paused' | 'ended';
export type RedemptionStatus = 'unlocked' | 'used';

export interface ShopDoc {
  code: string;
  name: string;
}

export interface DealDoc {
  id: string;
  shopCode: string;
  headline: string;
  status: DealStatus;
  startsAt: number;
  endsAt: number;
  oneUsePerCustomer: boolean;
  /** Stop issuing codes once this many customers have unlocked the deal. null = no limit. */
  maxRedemptions: number | null;
  /** Number of distinct unlocks counted against maxRedemptions. */
  unlockedCount: number;
}

export interface RedemptionDoc {
  /** `${dealId}_${uid}`: one document per customer per deal. */
  id: string;
  dealId: string;
  shopCode: string;
  uid: string;
  /** Four digits, shown to the customer as "CH 1234". Unique among a shop's unexpired codes. */
  code: string;
  createdAt: number;
  expiresAt: number;
  /** 'used' is set by the shop when it marks the code as used. */
  status: RedemptionStatus;
  /** True when the customer had no earlier used offer at this shop. */
  firstVisit: boolean;
  /** How many codes have been issued for the current unlock (expired codes can be renewed). */
  issueCount: number;
}

export type RedeemFailure =
  | 'shop-not-found'
  | 'no-live-deal'
  | 'deal-ended'
  | 'sold-out'
  | 'already-used';

export class RedeemError extends Error {
  constructor(public readonly reason: RedeemFailure) {
    super(reason);
    this.name = 'RedeemError';
  }
}

export interface RedeemStore {
  getShop(shopCode: string): Promise<ShopDoc | null>;
  getLiveDeal(shopCode: string): Promise<DealDoc | null>;
  getRedemption(id: string): Promise<RedemptionDoc | null>;
  /** Is this code currently held by an unexpired, unused redemption at the shop? */
  isCodeActive(shopCode: string, code: string, now: number): Promise<boolean>;
  hasUsedOfferAtShop(shopCode: string, uid: string): Promise<boolean>;
  /** Must be the only write, and must come after every read (Firestore transaction rule). */
  saveRedemption(redemption: RedemptionDoc, opts: { countsTowardLimit: boolean }): void;
}

export interface RedeemInput {
  shopCode: string;
  uid: string;
  now: number;
  /** Returns a 4-digit string. Injected so tests are deterministic. */
  randomCode: () => string;
}

export interface RedeemResult {
  shop: ShopDoc;
  deal: DealDoc;
  redemption: RedemptionDoc;
  /** True when an existing unexpired code was returned instead of a new one. */
  reused: boolean;
}

/** How long a code stays valid on the customer's screen. */
export const CODE_TTL_MS = 10 * 60 * 1000;
/** A customer whose code expired unused can get a fresh one this many times in total. */
export const MAX_ISSUES = 3;
const CODE_ATTEMPTS = 25;

export function normalizeShopCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function redeem(store: RedeemStore, input: RedeemInput): Promise<RedeemResult> {
  const { uid, now } = input;
  const shopCode = normalizeShopCode(input.shopCode);

  const shop = shopCode ? await store.getShop(shopCode) : null;
  if (!shop) throw new RedeemError('shop-not-found');

  const deal = await store.getLiveDeal(shopCode);
  if (!deal || deal.status !== 'live' || now < deal.startsAt) throw new RedeemError('no-live-deal');
  if (now > deal.endsAt) throw new RedeemError('deal-ended');

  const id = `${deal.id}_${uid}`;
  const existing = await store.getRedemption(id);

  if (existing) {
    if (existing.status === 'unlocked' && existing.expiresAt > now) {
      return { shop, deal, redemption: existing, reused: true };
    }
    if (existing.status === 'used' && deal.oneUsePerCustomer) {
      throw new RedeemError('already-used');
    }
    if (existing.status === 'unlocked' && existing.issueCount >= MAX_ISSUES) {
      throw new RedeemError('already-used');
    }
  }

  // A renewal of an expired, unused code does not take another slot from the deal's limit.
  const isRenewal = existing !== null && existing.status === 'unlocked';
  if (!isRenewal && deal.maxRedemptions !== null && deal.unlockedCount >= deal.maxRedemptions) {
    throw new RedeemError('sold-out');
  }

  const code = await pickCode(store, shopCode, now, input.randomCode);
  const firstVisit = !(await store.hasUsedOfferAtShop(shopCode, uid));

  const redemption: RedemptionDoc = {
    id,
    dealId: deal.id,
    shopCode,
    uid,
    code,
    createdAt: now,
    expiresAt: now + CODE_TTL_MS,
    status: 'unlocked',
    firstVisit,
    issueCount: isRenewal ? existing.issueCount + 1 : 1,
  };
  store.saveRedemption(redemption, { countsTowardLimit: !isRenewal });

  return { shop, deal, redemption, reused: false };
}

async function pickCode(
  store: RedeemStore,
  shopCode: string,
  now: number,
  randomCode: () => string,
): Promise<string> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = randomCode();
    if (!/^\d{4}$/.test(code)) throw new Error(`randomCode returned "${code}", expected 4 digits`);
    if (!(await store.isCodeActive(shopCode, code, now))) return code;
  }
  throw new Error(`Could not find a free code for shop ${shopCode}`);
}
