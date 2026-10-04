// Shop-side rules: listing a shop, running a deal, and checking customer codes.
// Pure and independent of Firestore, like redeem.ts. All times are epoch milliseconds.
import type { DealStatus, RedemptionDoc } from './redeem';

export const CATEGORIES = ['Food', 'Grocery', 'Fashion', 'Salon', 'Electronics', 'Fitness', 'Other'] as const;

const DAY = 24 * 60 * 60 * 1000;
const INDIA_OFFSET = 5.5 * 60 * 60 * 1000;
/** A deal can run for at most this long from its start. */
export const MAX_DEAL_DAYS = 92;

export type ShopFailure =
  | 'invalid-input'
  | 'already-registered'
  | 'no-shop'
  | 'has-open-deal'
  | 'deal-not-found'
  | 'deal-ended'
  | 'code-not-found'
  | 'code-expired'
  | 'code-used';

export class ShopError extends Error {
  /** `field` names the offending input for 'invalid-input'. */
  constructor(
    public readonly reason: ShopFailure,
    public readonly field?: string,
  ) {
    super(field ? `${reason}: ${field}` : reason);
    this.name = 'ShopError';
  }
}

export interface ShopRecord {
  code: string;
  name: string;
  category: string;
  pincode: string;
  address: string;
  ownerUid: string;
  createdAt: number;
}

export interface DealRecord {
  id: string;
  shopCode: string;
  /** Copied from the shop when the deal is created, so the pincode feed needs only the deals. */
  shopName: string;
  shopCategory: string;
  pincode: string;
  headline: string;
  /** Short badge, e.g. "30% off". May be empty. */
  tag: string;
  terms: string[];
  status: DealStatus;
  startsAt: number;
  endsAt: number;
  oneUsePerCustomer: boolean;
  maxRedemptions: number | null;
  /** Customers who unlocked a code. */
  unlockedCount: number;
  /** Codes the shop marked as used. */
  usedCount: number;
  /** Of those, customers with no earlier used offer at this shop. */
  firstVisitCount: number;
  /** Sum of the bill amounts the shop entered, in rupees. */
  billTotal: number;
  createdAt: number;
  updatedAt: number;
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

/** Reads and writes used inside one transaction. Every read must come before any write. */
export interface ShopStore {
  getShopByOwner(uid: string): Promise<ShopRecord | null>;
  shopExists(code: string): Promise<boolean>;
  listDeals(shopCode: string): Promise<DealRecord[]>;
  getDeal(id: string): Promise<DealRecord | null>;
  findRedemptionsByCode(shopCode: string, code: string): Promise<RedemptionDoc[]>;
  newDealId(): string;
  putShop(shop: ShopRecord): void;
  putDeal(deal: DealRecord): void;
  patchDeal(id: string, patch: Partial<DealRecord>): void;
  markUsed(redemption: RedemptionDoc, used: { usedAt: number; billAmount: number | null }): void;
}

// ---------- validation ----------

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new ShopError('invalid-input', field);
  const clean = value.trim().replace(/\s+/g, ' ');
  if (clean.length < min || clean.length > max) throw new ShopError('invalid-input', field);
  return clean;
}

function record(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ShopError('invalid-input', 'input');
  return raw as Record<string, unknown>;
}

export function validateShopInput(raw: unknown): ShopInput {
  const input = record(raw);
  const category = text(input.category, 'category', 1, 30);
  if (!(CATEGORIES as readonly string[]).includes(category)) throw new ShopError('invalid-input', 'category');
  const pincode = text(input.pincode, 'pincode', 6, 6);
  if (!/^[1-9]\d{5}$/.test(pincode)) throw new ShopError('invalid-input', 'pincode');
  return {
    name: text(input.name, 'name', 2, 60),
    category,
    pincode,
    address: text(input.address, 'address', 5, 160),
  };
}

function headline(value: unknown): string {
  return text(value, 'headline', 5, 80);
}

function tag(value: unknown): string {
  return value === undefined || value === null ? '' : text(value, 'tag', 0, 16);
}

function terms(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ShopError('invalid-input', 'terms');
  const lines = value.map((line) => (typeof line === 'string' ? line.trim() : line)).filter((line) => line !== '');
  if (lines.length > 6) throw new ShopError('invalid-input', 'terms');
  return lines.map((line) => text(line, 'terms', 1, 100));
}

function timestamp(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ShopError('invalid-input', field);
  return Math.floor(value);
}

function maxRedemptions(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100_000) {
    throw new ShopError('invalid-input', 'maxRedemptions');
  }
  return value;
}

function flag(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new ShopError('invalid-input', field);
  return value;
}

function checkDates(startsAt: number, endsAt: number, now: number): void {
  if (endsAt <= now || endsAt <= startsAt) throw new ShopError('invalid-input', 'endsAt');
  if (endsAt - startsAt > MAX_DEAL_DAYS * DAY) throw new ShopError('invalid-input', 'endsAt');
}

export function validateDealInput(raw: unknown, now: number): DealInput {
  const input = record(raw);
  const startsAt = timestamp(input.startsAt, 'startsAt');
  const endsAt = timestamp(input.endsAt, 'endsAt');
  // "Today" is sent as the start of the day, so allow a start up to a day in the past.
  if (startsAt < now - DAY) throw new ShopError('invalid-input', 'startsAt');
  checkDates(startsAt, endsAt, now);
  return {
    headline: headline(input.headline),
    tag: tag(input.tag),
    terms: terms(input.terms),
    startsAt,
    endsAt,
    oneUsePerCustomer: input.oneUsePerCustomer === undefined ? true : flag(input.oneUsePerCustomer, 'oneUsePerCustomer'),
    maxRedemptions: maxRedemptions(input.maxRedemptions),
  };
}

function validateDealPatch(raw: unknown, current: DealRecord, now: number): Partial<DealRecord> {
  const input = record(raw);
  const patch: Partial<DealRecord> = {};
  if (input.headline !== undefined) patch.headline = headline(input.headline);
  if (input.tag !== undefined) patch.tag = tag(input.tag);
  if (input.terms !== undefined) patch.terms = terms(input.terms);
  if (input.oneUsePerCustomer !== undefined) patch.oneUsePerCustomer = flag(input.oneUsePerCustomer, 'oneUsePerCustomer');
  if (input.maxRedemptions !== undefined) patch.maxRedemptions = maxRedemptions(input.maxRedemptions);
  if (input.endsAt !== undefined) {
    patch.endsAt = timestamp(input.endsAt, 'endsAt');
    checkDates(current.startsAt, patch.endsAt, now);
  }
  if (input.status !== undefined) {
    if (input.status !== 'live' && input.status !== 'paused' && input.status !== 'ended') {
      throw new ShopError('invalid-input', 'status');
    }
    patch.status = input.status;
  }
  return patch;
}

// ---------- shops ----------

/** Two letters from the shop name: initials of the first two words, or the first two letters. */
export function shopCodePrefix(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2);
  return (letters + 'SH').slice(0, 2);
}

export async function registerShop(
  store: ShopStore,
  args: { uid: string; input: unknown; now: number; randomDigits: () => string },
): Promise<ShopRecord> {
  const input = validateShopInput(args.input);
  if (await store.getShopByOwner(args.uid)) throw new ShopError('already-registered');

  const prefix = shopCodePrefix(input.name);
  let code = '';
  for (let attempt = 0; attempt < 25 && !code; attempt++) {
    const digits = args.randomDigits();
    if (!/^\d{4}$/.test(digits)) throw new Error(`randomDigits returned "${digits}", expected 4 digits`);
    if (!(await store.shopExists(prefix + digits))) code = prefix + digits;
  }
  if (!code) throw new Error(`Could not find a free shop code with prefix ${prefix}`);

  const shop: ShopRecord = { code, ...input, ownerUid: args.uid, createdAt: args.now };
  store.putShop(shop);
  return shop;
}

async function requireShop(store: Pick<ShopStore, 'getShopByOwner'>, uid: string): Promise<ShopRecord> {
  const shop = await store.getShopByOwner(uid);
  if (!shop) throw new ShopError('no-shop');
  return shop;
}

// ---------- deals ----------

/** The shop's deal that is not ended, if any. The rules below keep it to at most one. */
export function openDeal(deals: DealRecord[]): DealRecord | null {
  const open = deals.filter((d) => d.status !== 'ended').sort((a, b) => b.createdAt - a.createdAt);
  return open[0] ?? null;
}

export async function createDeal(
  store: ShopStore,
  args: { uid: string; input: unknown; now: number },
): Promise<DealRecord> {
  const { now } = args;
  const input = validateDealInput(args.input, now);
  const shop = await requireShop(store, args.uid);

  const current = openDeal(await store.listDeals(shop.code));
  if (current) {
    // A deal whose end date has passed makes way for the new one; a running or paused one does not.
    if (current.endsAt > now) throw new ShopError('has-open-deal');
    store.patchDeal(current.id, { status: 'ended', updatedAt: now });
  }

  const deal: DealRecord = {
    id: store.newDealId(),
    shopCode: shop.code,
    shopName: shop.name,
    shopCategory: shop.category,
    pincode: shop.pincode,
    ...input,
    status: 'live',
    unlockedCount: 0,
    usedCount: 0,
    firstVisitCount: 0,
    billTotal: 0,
    createdAt: now,
    updatedAt: now,
  };
  store.putDeal(deal);
  return deal;
}

export async function updateDeal(
  store: ShopStore,
  args: { uid: string; dealId: unknown; patch: unknown; now: number },
): Promise<void> {
  if (typeof args.dealId !== 'string' || !args.dealId) throw new ShopError('deal-not-found');
  const shop = await requireShop(store, args.uid);
  const deal = await store.getDeal(args.dealId);
  if (!deal || deal.shopCode !== shop.code) throw new ShopError('deal-not-found');
  if (deal.status === 'ended') throw new ShopError('deal-ended');

  const patch = validateDealPatch(args.patch, deal, args.now);
  store.patchDeal(deal.id, { ...patch, updatedAt: args.now });
}

// ---------- codes ----------

export interface CodeCheck {
  code: string;
  headline: string;
  firstVisit: boolean;
  expiresAt: number;
}

async function findUsableCode(
  store: ShopStore,
  shopCode: string,
  rawCode: unknown,
  now: number,
): Promise<RedemptionDoc> {
  const code = typeof rawCode === 'string' ? rawCode.replace(/\D/g, '') : '';
  if (code.length !== 4) throw new ShopError('code-not-found');

  const matches = await store.findRedemptionsByCode(shopCode, code);
  const usable = matches.find((r) => r.status === 'unlocked' && r.expiresAt > now);
  if (usable) return usable;

  const latest = [...matches].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!latest) throw new ShopError('code-not-found');
  throw new ShopError(latest.status === 'used' ? 'code-used' : 'code-expired');
}

export async function checkCode(
  store: ShopStore,
  args: { uid: string; code: unknown; now: number },
): Promise<CodeCheck> {
  const shop = await requireShop(store, args.uid);
  const redemption = await findUsableCode(store, shop.code, args.code, args.now);
  const deal = await store.getDeal(redemption.dealId);
  return {
    code: redemption.code,
    headline: deal?.headline ?? '',
    firstVisit: redemption.firstVisit,
    expiresAt: redemption.expiresAt,
  };
}

export async function markCodeUsed(
  store: ShopStore,
  args: { uid: string; code: unknown; billAmount: unknown; now: number },
): Promise<void> {
  let billAmount: number | null = null;
  if (args.billAmount !== undefined && args.billAmount !== null) {
    const amount = args.billAmount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
      throw new ShopError('invalid-input', 'billAmount');
    }
    billAmount = Math.round(amount);
  }
  const shop = await requireShop(store, args.uid);
  const redemption = await findUsableCode(store, shop.code, args.code, args.now);
  store.markUsed(redemption, { usedAt: args.now, billAmount });
}

// ---------- dashboard ----------

/** Midnight in India at or before `now`. India has no daylight saving, so a fixed offset is exact. */
export function startOfIndiaDay(now: number): number {
  return Math.floor((now + INDIA_OFFSET) / DAY) * DAY - INDIA_OFFSET;
}

export interface DashboardReader {
  getShopByOwner(uid: string): Promise<ShopRecord | null>;
  listDeals(shopCode: string): Promise<DealRecord[]>;
  countUnlockedSince(shopCode: string, since: number): Promise<number>;
  /** Codes marked used since `since`, newest first. */
  listUsedSince(shopCode: string, since: number): Promise<RedemptionDoc[]>;
}

export interface Dashboard {
  shop: Omit<ShopRecord, 'ownerUid' | 'createdAt'>;
  /** The running or paused deal; otherwise the most recent ended one; null if the shop never had one. */
  deal: DealRecord | null;
  today: { unlocked: number; used: number; firstVisits: number };
  todaysRedemptions: Array<{ code: string; usedAt: number; firstVisit: boolean; billAmount: number | null }>;
}

export async function getDashboard(reader: DashboardReader, args: { uid: string; now: number }): Promise<Dashboard> {
  const shop = await requireShop(reader, args.uid);
  const since = startOfIndiaDay(args.now);
  const [deals, unlocked, used] = await Promise.all([
    reader.listDeals(shop.code),
    reader.countUnlockedSince(shop.code, since),
    reader.listUsedSince(shop.code, since),
  ]);
  const latest = [...deals].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

  return {
    shop: { code: shop.code, name: shop.name, category: shop.category, pincode: shop.pincode, address: shop.address },
    deal: openDeal(deals) ?? latest,
    today: { unlocked, used: used.length, firstVisits: used.filter((r) => r.firstVisit).length },
    todaysRedemptions: used.map((r) => ({
      code: r.code,
      usedAt: r.usedAt ?? 0,
      firstVisit: r.firstVisit,
      billAmount: r.billAmount ?? null,
    })),
  };
}
