# Chowk: project notes for Claude sessions

## Product

Chowk is a hyperlocal deals product, launching in a single pincode first. Shops offer a deal;
customers redeem it in the shop by scanning the shop's QR and showing a short-lived code.
"Chowk" is the working name.

Planned pieces, in build order:

1. `web/`: web redemption page (built). A QR opens it, so customers without the app can redeem.
2. `shop-web/`: web app for shop owners to list their shop, create deals, and check and mark
   customer codes as used. Not started.
3. `app/`: Flutter customer app covering Android and iOS. Not started.
4. A WhatsApp channel for announcing deals. Posts are made by hand (WhatsApp has no official
   API for channels); the shop web app should generate ready-to-paste post text.

## Decisions already made

- Backend is Firebase: phone sign-in, Firestore, Cloud Functions, Hosting.
- Functions region `asia-south1`.
- Customers can browse without signing in. Mobile verification happens only at redemption.
- The WhatsApp opt-in checkbox is unticked by default.
- Shops confirm a redemption by typing the customer's code and marking it used.

## Design

Design canvas with the logo, customer screens, shop owner screens and the counter standee:
https://claude.ai/artifact/NEv3zwdXmt371iQhQaH3Ee

Tokens (see `web/src/styles.css`): green `#0F4C43`, marigold `#FFC633`, ink `#10231F`,
ground `#F3F5F1`. Display font Bricolage Grotesque, body font Instrument Sans.
The mark is a map pin holding a QR corner square (`logoMark` in `web/src/ui.ts`).

## Conventions

- All timestamps are epoch milliseconds, in Firestore and in code.
- Shop codes are stored as uppercase letters and digits (`MS2041`); normalise any input with
  `normalizeShopCode`. They are printed with a space (`MS 2041`).
- Redemption codes are 4 digits, displayed as `CH 4827`.
- Clients never write to Firestore. Add a Cloud Function for any new write.
- Business rules live in pure modules with an injected store (`functions/src/redeem.ts`) so
  they can be unit tested without Firebase.
- Tests use Node's built-in runner through tsx: `npm test` in `web/` and `functions/`.
- `web/` uses no UI framework on purpose: the page must open fast on a phone at a shop counter.
  Build DOM with the `h` helper in `web/src/ui.ts`; never put network data into `innerHTML`.
- The page talks to `Backend` (`web/src/backend/types.ts`). Keep the demo backend working when
  the interface changes; it is how the UI is tested without a Firebase project.
- User-facing copy is plain Indian English: "mobile number", "pincode", "offer".

## Not verified yet

The first version was written in a session that could not install npm packages. The UI and
flow were tested in demo mode and the unit tests pass, but these have never been run:

- `npm install` and `vite build` in `web/` (dependency versions in the package.json files
  were written from memory and there is no lockfile yet),
- `web/src/backend/firebase.ts` against the real Firebase SDK,
- `functions/src/index.ts` and `functions/src/seed.ts` against firebase-admin and
  firebase-functions, and `firestore.rules` against the emulator.

Run those first in any session that has package access, fix what breaks, commit the lockfiles,
and then delete this section.
