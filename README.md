# Chowk

Local shop deals for one pincode. A shop puts a Chowk QR on its counter; a customer scans it,
verifies their mobile number once, and gets a short-lived code to show the shopkeeper. The
shopkeeper types the code into the shop app and marks it used.

## What is in this repository

| Folder           | What it is                                                                     | Status        |
| ---------------- | ------------------------------------------------------------------------------ | ------------- |
| `web/`           | The site. TypeScript + Vite, no UI framework.                                  |               |
| `web/src/`       | Customer pages: a pincode's offers at `/p/<pincode>`, and the redemption page a shop's QR opens at `/s/<shop code>`. | First version |
| `web/src/shop/`  | Shop app at `/shop`: list the shop, run an offer, check codes, print the QR.   | First version |
| `functions/`     | Firebase Cloud Functions: code issuing and every shop operation.               | First version |
| `app/`           | Flutter customer app for Android and iOS.                                      | Not started   |

`firestore.rules`, `firestore.indexes.json` and `firebase.json` at the top level configure the
Firebase project.

## Try it with sample data

No Firebase project needed.

```sh
cd web
npm install
npm run dev
```

A dark banner marks demo mode. The verification code is always `123456`. Demo data lives in the
browser's local storage, so the customer page and the shop app share it.

- **Customer:** open `http://localhost:5173/p/560102` for the feed of offers, pick one (or go
  straight to `/s/MS2041`), redeem with any mobile number, and note the code. Other sample
  shops: `AB1007`, and `FB3300` (no offer).
- **Shop owner:** open `http://localhost:5173/shop` and sign in with `98765 43210` to run the
  sample shop MS2041. Check the customer's code there. Any other number lets you list a new shop.

To start the demo over, clear the site's local storage.

## Connect it to Firebase

1. Create a Firebase project. Pick `asia-south1` (Mumbai) for Firestore.
2. In Authentication, enable the Phone sign-in provider, and add your site's domain to the
   authorised domains.
3. Create the Firestore database.
4. Move the project to the pay-as-you-go (Blaze) plan. Cloud Functions requires it. Check
   Firebase's current pricing for phone-verification SMS before launch.
5. Register a Web app in the project settings and copy its values into `web/.env.local`
   (see `web/.env.example`). Set `VITE_SITE_URL` to the address customers will open; it goes
   into every shop's QR code. Set `VITE_DEFAULT_PINCODE` to your launch pincode so the front
   page shows its offers.
6. Install the CLI and select the project:
   ```sh
   npm install -g firebase-tools
   firebase login
   firebase use --add
   ```
7. Build and deploy:
   ```sh
   (cd functions && npm install && npm test)
   (cd web && npm install && npm test && npm run build)
   firebase deploy --only firestore,functions,hosting
   ```
8. Open `/shop` on your site, sign in with the shop owner's number, list the shop and publish an
   offer. Print the standee from **My QR**.

`cd functions && npm run seed` adds a sample shop and offer instead (needs
`gcloud auth application-default login`). No owner is attached to it, so it can be redeemed but
not managed from the shop app.

## How it works

### Pages

| Address              | What it shows                                                                  |
| -------------------- | ------------------------------------------------------------------------------ |
| `/`                  | The launch pincode's offers if `VITE_DEFAULT_PINCODE` is set, else the entry page. |
| `/p/<pincode>`       | Offers running in that pincode, newest first, with search and categories.      |
| `/s/<shop code>`     | One shop's offer and the redemption flow. This is what a shop's QR opens.      |
| `/pincode`, `/code`  | Entry page: type a pincode or a shop code.                                     |
| `/shop`              | The shop app.                                                                  |

### Customer

The feed is one Firestore query: live deals where `pincode` matches. Each deal carries a copy of
its shop's pincode, name and category for this.

1. The offer page reads `shops/<code>` and that shop's live deal straight from Firestore.
2. "Redeem now" signs the customer in with a one-time code sent to their mobile (first time only).
3. The page calls `redeemDeal`, which in one transaction:
   - checks the shop has a live deal that has started and not ended,
   - returns the customer's existing code if it is still valid,
   - refuses a second use of a one-use deal, and refuses once the deal's limit is reached,
   - otherwise issues a 4-digit code, unique among the shop's unexpired codes, valid for 10 minutes.
4. A code that expires unused can be renewed, up to 3 codes per customer per deal.

### Shop owner

The shop app never touches Firestore directly; each action is a function call.

| Function           | What it does                                                                        |
| ------------------ | ----------------------------------------------------------------------------------- |
| `registerShop`     | Lists the shop and gives it a code such as `MS2041`. One shop per mobile number.    |
| `getShopDashboard` | The shop, its current offer with totals, and today's unlocks and redemptions.       |
| `createDeal`       | Publishes an offer. A shop has one offer at a time.                                 |
| `updateDeal`       | Edits, extends, pauses, resumes or ends the offer. An ended offer stays ended.      |
| `checkCode`        | Says whether a customer's code is valid at this shop, expired, or already used.     |
| `markCodeUsed`     | Marks the code used, with an optional bill amount, and updates the offer's totals.  |

The rules behind these are plain functions in `functions/src/redeem.ts` and
`functions/src/shop.ts`, tested without Firebase.

### Data model

All times are epoch milliseconds. "Today" on the dashboard is the day in India.

- `shops/{shopCode}`: `name`, `category`, `pincode`, `address`, `ownerUid`, `createdAt`
- `deals/{dealId}`: `shopCode`, `shopName`, `shopCategory`, `pincode` (copied from the shop),
  `headline`, `tag`, `terms[]`, `status` (`live` | `paused` | `ended`),
  `startsAt`, `endsAt`, `oneUsePerCustomer`, `maxRedemptions` (number or null), `unlockedCount`,
  `usedCount`, `firstVisitCount`, `billTotal`, `createdAt`, `updatedAt`
- `redemptions/{dealId}_{uid}`: `dealId`, `shopCode`, `uid`, `code`, `createdAt`, `expiresAt`,
  `status` (`unlocked` | `used`), `firstVisit`, `issueCount`, `usedAt`, `billAmount`
- `users/{uid}`: `phone`, `whatsappOptIn`, `updatedAt`

## Tests

```sh
(cd functions && npm test)   # redemption and shop rules
(cd web && npm test)         # formatting, feed filtering, offer state, QR encoder
```

## Before a public launch

- Write the terms and privacy policy, and set `VITE_TERMS_URL` and `VITE_PRIVACY_URL`. The pages
  collect mobile numbers, so people need to see these before they verify.
- Turn on Firebase App Check for the web app and enforce it on the functions.
- Decide whether new shops should need approval. Today anyone with a verified mobile number can
  list a shop, and it is reachable at once by its code.
- Only the owner's mobile number can check codes. Staff logins are not built.
- The pages are built in the browser, so search engines and link previews see little of an
  offer's text. Pre-rendering the feed and offer pages would fix that.
