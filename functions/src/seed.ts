// Adds one sample shop and one live deal so the redemption page has something to show.
// Run with `npm run seed` after `gcloud auth application-default login`, or against the
// emulator with FIRESTORE_EMULATOR_HOST set. Safe to run again: it overwrites the same documents.
// The sample shop has no owner, so it can be redeemed but not managed from the shop app.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  initializeApp();
  const db = getFirestore();
  const now = Date.now();

  await db.doc('shops/MS2041').set({
    name: 'Meera Salon',
    category: 'Salon',
    pincode: '560102',
    address: '',
    ownerUid: '',
    createdAt: now,
  });

  await db.doc('deals/sample-ms2041').set({
    shopCode: 'MS2041',
    headline: 'Flat 30% off haircut and styling',
    tag: '30% off',
    terms: ['Weekdays, 11 am to 7 pm', 'Not valid with other offers', 'Show the unlocked code before billing'],
    status: 'live',
    startsAt: now,
    endsAt: now + 10 * DAY,
    oneUsePerCustomer: true,
    maxRedemptions: null,
    unlockedCount: 0,
    usedCount: 0,
    firstVisitCount: 0,
    billTotal: 0,
    createdAt: now,
    updatedAt: now,
  });

  console.log('Seeded shop MS2041 with one live deal. Open /s/MS2041 on the web page.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
