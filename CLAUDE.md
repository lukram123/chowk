# Chowk: project notes for Claude sessions

## Product

Chowk is a hyperlocal deals product, launching in a single pincode first. Shops offer a deal;
customers redeem it in the shop by scanning the shop's QR and showing a short-lived code.
"Chowk" is the working name.

Pieces, in build order:

1. Customer pages (built), in `web/src/`: the feed of a pincode's offers at `/p/<pincode>` (and
   at `/` when `VITE_DEFAULT_PINCODE` is set), and the redemption page at `/s/<shop code>`,
   which a shop's QR opens so customers without the app can redeem.
2. Shop app (built): `web/src/shop/`, served at `/shop` from the same site. Shop owners list
   their shop, run an offer, check and mark customer codes, and print the counter standee.
3. `app/`: Flutter customer app covering Android and iOS. Not started.
4. A WhatsApp channel for announcing deals. Posts are made by hand (WhatsApp has no official
   API for channels); the shop app's My QR screen gives ready-to-paste post text.

## Decisions already made

- Backend is Firebase: phone sign-in, Firestore, Cloud Functions, Hosting.
- Functions region `asia-south1`.
- Customers can browse without signing in. Mobile verification happens only at redemption.
- The WhatsApp opt-in checkbox is unticked by default.
- Shops confirm a redemption by typing the customer's code and marking it used.
- One site and one deploy for customers and shops; the shop app is a lazily loaded part of
  `web/`, not a separate project.
- A shop has one offer at a time, and one shop per owner mobile number.
- The Flutter app waits until the web version is live and shops are renewing offers.

## Design

Design canvas with the logo, customer screens, shop owner screens and the counter standee:
https://claude.ai/artifact/NEv3zwdXmt371iQhQaH3Ee

Tokens (see `web/src/styles.css`): green `#0F4C43`, marigold `#FFC633`, ink `#10231F`,
ground `#F3F5F1`. Display font Bricolage Grotesque, body font Instrument Sans.
The mark is a map pin holding a QR corner square (`logoMark` in `web/src/ui.ts`).

## Conventions

- All timestamps are epoch milliseconds, in Firestore and in code. Days are India days
  (`startOfIndiaDay`, `fromIndiaDateInput`), whatever the device's time zone.
- Shop codes are stored as uppercase letters and digits (`MS2041`); normalise any input with
  `normalizeShopCode`. They are printed with a space (`MS 2041`).
- Redemption codes are 4 digits, displayed as `CH 4827`.
- Clients never write to Firestore. Add a Cloud Function for any new write. The shop app does
  not read Firestore either; it goes through functions only.
- Business rules live in pure modules with an injected store (`functions/src/redeem.ts`,
  `functions/src/shop.ts`) so they can be unit tested without Firebase. `functions/src/index.ts`
  only wires them to Firestore.
- Tests use Node's built-in runner through tsx: `npm test` in `web/` and `functions/`.
- End-to-end testing against the Firebase emulators: `npm run emulators` in `functions/` and
  `npm run dev:emulator` in `web/` (reads `web/.env.emulator`, stand-in project `demo-chowk`).
  `config.emulators` switches the SDK connections in `firebaseApp.ts` and `firebase.ts`.
- `web/` uses no UI framework on purpose: the customer page must open fast on a phone at a shop
  counter. Build DOM with the `h` helper in `web/src/ui.ts`; never put network data into
  `innerHTML`.
- Pages talk to `Backend` (`web/src/backend/types.ts`) and `ShopBackend`
  (`web/src/shop/types.ts`). Each has a Firebase and a demo implementation. Keep the demo ones
  working when an interface changes; they are how the UI is tested without a Firebase project.
  Demo state is shared through `web/src/backend/demoStore.ts`.
- Each deal carries a copy of its shop's `pincode`, `shopName` and `shopCategory`, set in
  `createDeal`, so the feed is a single query. Shops cannot be edited yet; when that is added,
  it must update the shop's open deal too.
- The feed page widens on large screens (`#root.wide`); every other page stays phone-width.
- Shop screens are addressed by hash (`/shop#check`), so the phone's back button works.
- `web/src/qr.ts` is our own QR encoder (versions 1 to 6, level M). Its output was checked by
  decoding with OpenCV; `qr.test.ts` pins two verified codes. Re-verify with a real decoder
  before changing it.
- The standee is sized in container units (`cqw`) so the same markup previews on a phone and
  prints on A5.
- User-facing copy is plain Indian English: "mobile number", "pincode", "offer".

## Not verified yet

Everything so far was written in sessions that could not install npm packages. The UI was
tested end to end in demo mode in a headless browser and the unit tests pass, but these have
never been run:

- `npm install` and `vite build` in `web/` (dependency versions in the package.json files
  were written from memory and there is no lockfile yet),
- `web/src/backend/firebaseApp.ts`, `web/src/backend/firebase.ts` and
  `web/src/shop/firebase.ts` against the real Firebase SDK,
- `functions/src/index.ts` and `functions/src/seed.ts` against firebase-admin and
  firebase-functions (they type-check only against stand-in types),
- the emulator setup (`npm run emulators`, `npm run dev:emulator`) and the emulator connections in
  `firebaseApp.ts` and `firebase.ts`,
- `firestore.rules` and the two composite indexes in `firestore.indexes.json` against the
  emulator or a real project. The dashboard's "today" queries need those indexes.

Run those first in any session that has package access, fix what breaks, commit the lockfiles,
and then delete this section.
