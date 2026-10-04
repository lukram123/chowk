import { randomInt } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentData, type Query, type Transaction } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import {
  RedeemError,
  redeem,
  type DealDoc,
  type RedeemStore,
  type RedemptionDoc,
  type ShopDoc,
} from './redeem';
import * as shopRules from './shop';
import { ShopError, type DashboardReader, type DealRecord, type ShopRecord, type ShopStore } from './shop';

initializeApp();
const db = getFirestore();

const REGION = 'asia-south1';

type Data = DocumentData;

// ---------- customer: redeem ----------

function txStore(tx: Transaction): RedeemStore {
  return {
    async getShop(shopCode) {
      const snap = await tx.get(db.doc(`shops/${shopCode}`));
      if (!snap.exists) return null;
      return { code: shopCode, name: String(snap.get('name') ?? '') } satisfies ShopDoc;
    },
    async getLiveDeal(shopCode) {
      const snap = await tx.get(
        db.collection('deals').where('shopCode', '==', shopCode).where('status', '==', 'live').limit(1),
      );
      const doc = snap.docs[0];
      if (!doc) return null;
      const d = doc.data();
      return {
        id: doc.id,
        shopCode,
        headline: String(d.headline ?? ''),
        status: 'live',
        startsAt: Number(d.startsAt ?? 0),
        endsAt: Number(d.endsAt ?? 0),
        oneUsePerCustomer: d.oneUsePerCustomer !== false,
        maxRedemptions: typeof d.maxRedemptions === 'number' ? d.maxRedemptions : null,
        unlockedCount: Number(d.unlockedCount ?? 0),
      } satisfies DealDoc;
    },
    async getRedemption(id) {
      const snap = await tx.get(db.doc(`redemptions/${id}`));
      return snap.exists ? toRedemption(id, snap.data() ?? {}) : null;
    },
    async isCodeActive(shopCode, code, now) {
      // Equality-only query, so no composite index is needed; expiry is filtered here.
      const snap = await tx.get(
        db.collection('redemptions').where('shopCode', '==', shopCode).where('code', '==', code),
      );
      return snap.docs.some((d) => d.get('status') === 'unlocked' && Number(d.get('expiresAt')) > now);
    },
    async hasUsedOfferAtShop(shopCode, uid) {
      const snap = await tx.get(
        db
          .collection('redemptions')
          .where('shopCode', '==', shopCode)
          .where('uid', '==', uid)
          .where('status', '==', 'used')
          .limit(1),
      );
      return !snap.empty;
    },
    saveRedemption(redemption, opts) {
      const { id, ...data } = redemption;
      tx.set(db.doc(`redemptions/${id}`), data);
      if (opts.countsTowardLimit) {
        tx.update(db.doc(`deals/${redemption.dealId}`), { unlockedCount: FieldValue.increment(1) });
      }
    },
  };
}

/**
 * Called by the web redemption page and the customer app once the customer has
 * verified their phone number. Returns the code to show to the shopkeeper.
 */
export const redeemDeal = onCall({ region: REGION }, async (request) => {
  const { uid, phone } = requirePhoneUser(request);

  const data = (request.data ?? {}) as { shopCode?: unknown; whatsappOptIn?: unknown };
  if (typeof data.shopCode !== 'string' || data.shopCode.length > 40) {
    throw new HttpsError('invalid-argument', 'shopCode is required.');
  }
  const shopCode = data.shopCode;

  try {
    const result = await db.runTransaction((tx) =>
      redeem(txStore(tx), {
        shopCode,
        uid,
        now: Date.now(),
        randomCode: fourDigits,
      }),
    );

    const profile: Record<string, unknown> = { phone, updatedAt: Date.now() };
    if (typeof data.whatsappOptIn === 'boolean') profile.whatsappOptIn = data.whatsappOptIn;
    await db.doc(`users/${uid}`).set(profile, { merge: true });

    return {
      code: result.redemption.code,
      expiresAt: result.redemption.expiresAt,
      reused: result.reused,
    };
  } catch (err) {
    if (err instanceof RedeemError) {
      throw new HttpsError('failed-precondition', err.reason, { reason: err.reason });
    }
    logger.error('redeemDeal failed', { shopCode, uid, err });
    throw new HttpsError('internal', 'Could not unlock the offer.');
  }
});

// ---------- shared helpers ----------

function fourDigits(): string {
  return String(randomInt(1000, 10000));
}

function requirePhoneUser(request: CallableRequest<unknown>): { uid: string; phone: string } {
  const uid = request.auth?.uid;
  const phone = request.auth?.token.phone_number;
  if (!uid || typeof phone !== 'string') {
    throw new HttpsError('unauthenticated', 'Verify your mobile number first.');
  }
  return { uid, phone };
}

function toRedemption(id: string, d: Data): RedemptionDoc {
  return {
    id,
    dealId: String(d.dealId ?? ''),
    shopCode: String(d.shopCode ?? ''),
    uid: String(d.uid ?? ''),
    code: String(d.code ?? ''),
    createdAt: Number(d.createdAt ?? 0),
    expiresAt: Number(d.expiresAt ?? 0),
    status: d.status === 'used' ? 'used' : 'unlocked',
    firstVisit: d.firstVisit === true,
    issueCount: Number(d.issueCount ?? 1),
    usedAt: typeof d.usedAt === 'number' ? d.usedAt : undefined,
    billAmount: typeof d.billAmount === 'number' ? d.billAmount : null,
  };
}

function toShop(code: string, d: Data): ShopRecord {
  return {
    code,
    name: String(d.name ?? ''),
    category: String(d.category ?? ''),
    pincode: String(d.pincode ?? ''),
    address: String(d.address ?? ''),
    ownerUid: String(d.ownerUid ?? ''),
    createdAt: Number(d.createdAt ?? 0),
  };
}

function toDeal(id: string, d: Data): DealRecord {
  return {
    id,
    shopCode: String(d.shopCode ?? ''),
    headline: String(d.headline ?? ''),
    tag: String(d.tag ?? ''),
    terms: Array.isArray(d.terms) ? d.terms.map(String) : [],
    status: d.status === 'paused' || d.status === 'ended' ? d.status : 'live',
    startsAt: Number(d.startsAt ?? 0),
    endsAt: Number(d.endsAt ?? 0),
    oneUsePerCustomer: d.oneUsePerCustomer !== false,
    maxRedemptions: typeof d.maxRedemptions === 'number' ? d.maxRedemptions : null,
    unlockedCount: Number(d.unlockedCount ?? 0),
    usedCount: Number(d.usedCount ?? 0),
    firstVisitCount: Number(d.firstVisitCount ?? 0),
    billTotal: Number(d.billTotal ?? 0),
    createdAt: Number(d.createdAt ?? 0),
    updatedAt: Number(d.updatedAt ?? 0),
  };
}

// ---------- shop owner ----------

/** Reads go through the transaction when there is one, so writes in the same call stay consistent. */
function shopStore(tx?: Transaction): ShopStore & DashboardReader {
  const run = (query: Query) => (tx ? tx.get(query) : query.get());
  const read = (path: string) => (tx ? tx.get(db.doc(path)) : db.doc(path).get());
  const writer = (): Transaction => {
    if (!tx) throw new Error('Writes need a transaction');
    return tx;
  };

  return {
    async getShopByOwner(uid) {
      const snap = await run(db.collection('shops').where('ownerUid', '==', uid).limit(1));
      const doc = snap.docs[0];
      return doc ? toShop(doc.id, doc.data()) : null;
    },
    async shopExists(code) {
      return (await read(`shops/${code}`)).exists;
    },
    async listDeals(shopCode) {
      const snap = await run(db.collection('deals').where('shopCode', '==', shopCode));
      return snap.docs.map((doc) => toDeal(doc.id, doc.data()));
    },
    async getDeal(id) {
      const snap = await read(`deals/${id}`);
      return snap.exists ? toDeal(id, snap.data() ?? {}) : null;
    },
    async findRedemptionsByCode(shopCode, code) {
      const snap = await run(
        db.collection('redemptions').where('shopCode', '==', shopCode).where('code', '==', code),
      );
      return snap.docs.map((doc) => toRedemption(doc.id, doc.data()));
    },
    async countUnlockedSince(shopCode, since) {
      // Needs the (shopCode, createdAt) index in firestore.indexes.json.
      const snap = await db
        .collection('redemptions')
        .where('shopCode', '==', shopCode)
        .where('createdAt', '>=', since)
        .count()
        .get();
      return snap.data().count;
    },
    async listUsedSince(shopCode, since) {
      // Needs the (shopCode, usedAt) index in firestore.indexes.json.
      const snap = await db
        .collection('redemptions')
        .where('shopCode', '==', shopCode)
        .where('usedAt', '>=', since)
        .orderBy('usedAt', 'desc')
        .get();
      return snap.docs.map((doc) => toRedemption(doc.id, doc.data()));
    },
    newDealId() {
      return db.collection('deals').doc().id;
    },
    putShop(shop) {
      const { code, ...data } = shop;
      writer().create(db.doc(`shops/${code}`), data);
    },
    putDeal(deal) {
      const { id, ...data } = deal;
      writer().create(db.doc(`deals/${id}`), data);
    },
    patchDeal(id, patch) {
      writer().update(db.doc(`deals/${id}`), patch);
    },
    markUsed(redemption, used) {
      writer().update(db.doc(`redemptions/${redemption.id}`), {
        status: 'used',
        usedAt: used.usedAt,
        billAmount: used.billAmount,
      });
      writer().update(db.doc(`deals/${redemption.dealId}`), {
        usedCount: FieldValue.increment(1),
        firstVisitCount: FieldValue.increment(redemption.firstVisit ? 1 : 0),
        billTotal: FieldValue.increment(used.billAmount ?? 0),
      });
    },
  };
}

/** Wraps a shop-owner function: requires a verified phone and maps rule failures to client errors. */
function shopCall<T>(name: string, handler: (uid: string, data: Record<string, unknown>) => Promise<T>) {
  return onCall({ region: REGION }, async (request) => {
    const { uid } = requirePhoneUser(request);
    const data = (typeof request.data === 'object' && request.data !== null ? request.data : {}) as Record<
      string,
      unknown
    >;
    try {
      return await handler(uid, data);
    } catch (err) {
      if (err instanceof ShopError) {
        throw new HttpsError('failed-precondition', err.message, { reason: err.reason, field: err.field ?? null });
      }
      logger.error(`${name} failed`, { uid, err });
      throw new HttpsError('internal', 'Something went wrong.');
    }
  });
}

export const registerShop = shopCall('registerShop', async (uid, data) => {
  const shop = await db.runTransaction((tx) =>
    shopRules.registerShop(shopStore(tx), { uid, input: data.shop, now: Date.now(), randomDigits: fourDigits }),
  );
  return { code: shop.code };
});

export const getShopDashboard = shopCall('getShopDashboard', (uid) =>
  shopRules.getDashboard(shopStore(), { uid, now: Date.now() }),
);

export const createDeal = shopCall('createDeal', async (uid, data) => {
  const deal = await db.runTransaction((tx) =>
    shopRules.createDeal(shopStore(tx), { uid, input: data.deal, now: Date.now() }),
  );
  return { id: deal.id };
});

export const updateDeal = shopCall('updateDeal', async (uid, data) => {
  await db.runTransaction((tx) =>
    shopRules.updateDeal(shopStore(tx), { uid, dealId: data.dealId, patch: data.patch, now: Date.now() }),
  );
  return { ok: true };
});

export const checkCode = shopCall('checkCode', (uid, data) =>
  shopRules.checkCode(shopStore(), { uid, code: data.code, now: Date.now() }),
);

export const markCodeUsed = shopCall('markCodeUsed', async (uid, data) => {
  await db.runTransaction((tx) =>
    shopRules.markCodeUsed(shopStore(tx), { uid, code: data.code, billAmount: data.billAmount, now: Date.now() }),
  );
  return { ok: true };
});
