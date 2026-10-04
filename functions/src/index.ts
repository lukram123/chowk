import { randomInt } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Transaction } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  RedeemError,
  redeem,
  type DealDoc,
  type RedeemStore,
  type RedemptionDoc,
  type ShopDoc,
} from './redeem';

initializeApp();
const db = getFirestore();

const REGION = 'asia-south1';

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
      return snap.exists ? ({ ...snap.data(), id } as RedemptionDoc) : null;
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
  const uid = request.auth?.uid;
  const phone = request.auth?.token.phone_number;
  if (!uid || typeof phone !== 'string') {
    throw new HttpsError('unauthenticated', 'Verify your mobile number first.');
  }

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
        randomCode: () => String(randomInt(1000, 10000)),
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
