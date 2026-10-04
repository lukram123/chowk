# Chowk

Local shop deals for one pincode. A shop puts a Chowk QR on its counter; a customer scans it,
verifies their mobile number once, and gets a short-lived code to show the shopkeeper.

## What is in this repository

| Folder       | What it is                                                                 | Status      |
| ------------ | -------------------------------------------------------------------------- | ----------- |
| `web/`       | The web redemption page a QR opens (`/s/<shop code>`). TypeScript + Vite.   | First version |
| `functions/` | Firebase Cloud Functions. `redeemDeal` issues the code.                    | First version |
| `shop-web/`  | Web app for shop owners: list the shop, create deals, check codes.         | Not started |
| `app/`       | Flutter customer app for Android and iOS.                                  | Not started |

`firestore.rules` and `firebase.json` at the top level configure the Firebase project.

## Try the page with sample data

No Firebase project needed.

```sh
cd web
npm install
npm run dev
```

Open `http://localhost:5173/s/MS2041`. Sample shop codes are `MS2041`, `AB1007` and `FB3300`
(a shop with no offer). The verification code is `123456`. A dark banner marks demo mode.

## Connect it to Firebase

1. Create a Firebase project. Pick `asia-south1` (Mumbai) for Firestore.
2. In Authentication, enable the Phone sign-in provider, and add your site's domain to the
   authorised domains.
3. Create the Firestore database.
4. Move the project to the pay-as-you-go (Blaze) plan. Cloud Functions requires it. Check
   Firebase's current pricing for phone-verification SMS before launch.
5. Register a Web app in the project settings and copy its values into `web/.env.local`
   (see `web/.env.example`).
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
   firebase deploy --only firestore:rules,functions,hosting
   ```
8. Add a sample shop and deal: `cd functions && npm run seed`
   (needs `gcloud auth application-default login` first), then open `/s/MS2041` on your site.

A shop's QR code should point to `https://<your domain>/s/<SHOP CODE>`.

## How redemption works

1. The page reads `shops/<code>` and that shop's live deal straight from Firestore.
2. "Redeem now" signs the customer in with a one-time code sent to their mobile (first time only).
3. The page calls the `redeemDeal` function, which in one transaction:
   - checks the shop has a live deal that has started and not ended,
   - returns the customer's existing code if it is still valid,
   - refuses a second use of a one-use deal, and refuses once the deal's limit is reached,
   - otherwise issues a 4-digit code, unique among the shop's unexpired codes, valid for 10 minutes.
4. A code that expires unused can be renewed, up to 3 codes per customer per deal.
5. The shop marks the code as used. That is part of the shop web app and is not built yet.

Clients cannot write to Firestore at all; every write goes through a function.

### Data model

All times are epoch milliseconds.

- `shops/{shopCode}`: `name`, `category`, `pincode`, `address`
- `deals/{dealId}`: `shopCode`, `headline`, `tag`, `terms[]`, `status` (`live` | `paused` | `ended`),
  `startsAt`, `endsAt`, `oneUsePerCustomer`, `maxRedemptions` (number or null), `unlockedCount`
- `redemptions/{dealId}_{uid}`: `dealId`, `shopCode`, `uid`, `code`, `createdAt`, `expiresAt`,
  `status` (`unlocked` | `used`), `firstVisit`, `issueCount`
- `users/{uid}`: `phone`, `whatsappOptIn`, `updatedAt`

## Tests

```sh
(cd functions && npm test)   # redemption rules
(cd web && npm test)         # formatting and input parsing
```

## Before a public launch

- Write the terms and privacy policy, and set `VITE_TERMS_URL` and `VITE_PRIVACY_URL`. The page
  collects mobile numbers, so customers need to see these before they verify.
- Turn on Firebase App Check for the web app and enforce it on `redeemDeal`.
- Build the shop side, so codes can be marked as used.
