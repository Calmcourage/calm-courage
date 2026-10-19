# Calm Courage In-App Purchases (Local Integration Preparation)

## Approach and Current Status

The local implementation follows the recommended approach: **RevenueCat + Apple/Google in-app purchases + Firebase entitlement storage**.
No RevenueCat project has been created, store products configured, keys entered, native builds produced, or Firebase functions deployed during this work.
Both client and backend billing are disabled by default. Installing the SDK does not activate a service account or enable subscription charges.

RevenueCat unifies purchase verification, subscription status, and notifications across both stores, reducing the work of maintaining two separate integrations.
The tradeoff is an additional service dependency and its fees; review https://www.revenuecat.com/pricing before signing up.
Apple and Google still process payments. Firebase accepts subscription results retrieved by the backend.

This document supersedes the instructions in HANDOVER.md / PRODUCTION.md about directly activating QA trials and using the legacy entitlement switch.
The legacy `activateSubscription` endpoint continues to reject grants; the new implementation uses a separate `syncSubscription` endpoint.

## Prepared Code

- `src/services/storePurchases.ts`: lazy SDK loading, Firebase UID binding, store product retrieval, purchases, and purchase restoration.
- `src/components/StorePaywall.tsx`: store pricing, parent verification, restore and store-management entry points, retry, and feedback for cancellation, failure, and pending confirmation. Active subscribers are directed to management rather than another checkout.
- `src/app/paywall.tsx`: always displays the official subscription page. When checkout is disabled or unsupported, it shows an unavailable message without loading the purchase SDK. The simulated Face ID purchase interface has been removed; the legacy QA flag no longer enables it.
- `src/app/settings.tsx`: uses the shared entitlement reader, refreshes after returning from store management, and shows access expiry and renewal cancellation without promising a future billing date or a hardcoded price.
- `src/utils/subscriptionPresentation.ts`: selects the original purchase store (falling back to the device platform for legacy records) and formats confirmed subscription status. Settings directs users to that store for current billing information.
- `functions/billing.js`: authentication checks, backend configuration gates, the synchronization callable, and an authenticated webhook.
- `functions/revenuecat.js`: reads RevenueCat REST API v1 and maps its response to the existing Firestore subscription fields.
- `billingSyncState/{uid}`: private backend synchronization timestamps. Transactions prevent duplicate or older API snapshots from overwriting newer state.
  The current Firestore rules do not expose this collection; clients cannot read or write it.
- `src/utils/premiumAccess.ts`: refreshes entitlements when returning to an activity screen or bringing the app to the foreground, avoiding stale access state after a purchase.

Flow: check backend readiness before loading products -> native store purchase -> Firebase queries RevenueCat -> Firestore update -> app reads entitlements.
Clients cannot unlock access by submitting a plan, expiry date, or "verified" flag. SDK purchase success alone does not unlock access either.
Canceling renewal preserves access for the paid period; expired or refunded subscriptions, incorrect products, and mismatched accounts do not grant access.
The webhook retrieves current state after receiving a notification instead of granting access directly from event dates. Failures return a non-2xx response to request a retry.

## Required Accounts and Dashboard Configuration

1. Appropriate access to Apple Developer / App Store Connect, Google Play Console, Firebase, and Expo/EAS.
2. A RevenueCat project connected to both stores, with store verification credentials and server notifications configured.
3. Real auto-renewing subscription products in the stores. Monthly billing is the current product direction; the code supports annual billing, but offering it remains a product decision.
   Do not treat the legacy screen's price, seven-day trial, or "permanently locked" price as configured store offers.
4. A `premium` entitlement in RevenueCat with the appropriate products attached, plus a current offering containing monthly/annual packages.
5. An account policy that uses only verified parents' Firebase UIDs, not email addresses, child information, or anonymous IDs.
   Set restore behavior to **Keep with original App User ID** and do not use a policy that shares purchases across accounts.
   The backend strictly requires `original_app_user_id` to match the Firebase UID; existing anonymous or merged accounts need a separate migration.
   Transferring purchases between Firebase accounts is outside this version's supported scope; do not manually enable that policy.
6. Webhook Authorization set to `Bearer <random-secret>`, covering renewals, expiration, refunds, cancellation, billing issues, and related events.
   Use separate webhook configurations and Firebase projects for testing and production so test entitlements do not enter production user data.

## Client Configuration

The following fields have been appended to `.env.example`. The actual `.env` file has not been modified:

```dotenv
EXPO_PUBLIC_ENABLE_STORE_PURCHASES=false
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=
```

Use each platform's public SDK key (`appl_` / `goog_`). Do not enter a secret API key or webhook secret here.
RevenueCat Test Store keys are rejected; this implementation targets Apple/Google sandbox testing.
`scripts/sync-eas-env.mjs` does not synchronize purchase enable flags; internal environments must enable them deliberately.
Both purchase flags are explicitly false in the production profile in `eas.json`. Change the real-purchase flag separately after integration testing passes.

Expo Go does not load the native purchase SDK, preventing its Preview API Mode from being mistaken for a real purchase.
`react-native-purchases` and the SDK 57 version of `expo-dev-client` are installed, and a `development-device` profile has been added.
Link the EAS project and configure signing before building. No build was run during this phase.

## Firebase Configuration (Deployment Deferred)

Non-sensitive parameters are documented in `functions/.env.example`:

- `BILLING_ENABLED=false`: keep disabled until configuration and testing are complete.
- `REVENUECAT_ENTITLEMENT_ID=premium`: must match the RevenueCat entitlement ID.
- `REVENUECAT_PRODUCT_PLANS`: a JSON mapping with keys of `app_store:<actual-product-id>` or `play_store:<actual-product-id>` and values of `monthly` / `yearly`.
  Google product identifiers may include a base-plan suffix; use the full identifier returned by RevenueCat.
- `REVENUECAT_ALLOW_SANDBOX=false`: enable only in a separate testing project. TestFlight purchases are also sandbox purchases.

Configure the following through Firebase Secret Manager. Do not commit them to Git or put them in `EXPO_PUBLIC_*` variables:

- `REVENUECAT_SECRET_API_KEY`: a REST API v1 secret key.
- `REVENUECAT_WEBHOOK_SECRET`: the random secret matching the webhook Authorization header.

The local Functions configuration targets Node 22. Once access is available, confirm the target project before deploying the new functions and configuring the webhook. The deployed runtime does not change until deployment.
The legacy entitlement vulnerability remains in the deployed backend: local changes do not deploy automatically.
Deploying only `activateSubscription` closes the legacy grant vulnerability. Enabling in-app purchases also requires deploying `syncSubscription` and `revenueCatWebhook` and completing the dashboard configuration.

## Validation and Remaining Release Work

Run locally:

```powershell
node --test tests/subscription-safety.test.cjs tests/revenuecat.test.cjs tests/store-purchases.test.cjs
node --test tests/subscription-presentation.test.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Tests use in-memory SDK/Firebase/HTTP mocks and do not connect to live services. They do not replace sandbox integration testing on physical devices.
Before enabling purchases publicly, verify:

- Product pricing, purchases, payment cancellation, pending/deferred payments, network interruptions, and restoration on physical iOS and Android devices.
- Restoration on another device using the same account, prevention of entitlement inheritance by a different Firebase account, and isolation of purchase results when signing out during checkout.
- Trial eligibility and actual billing copy, duplicate transactions, renewals, cancellation of renewal, expiration, refunds, grace periods, and billing failures.
- Webhook authorization, retries after failed delivery, out-of-order notifications, and Firestore rules denying client changes to entitlement fields and the private synchronization collection.
- Public privacy policy and terms, updated data disclosures for RevenueCat, and completed store review materials.
- Native build compatibility, App Check integration, endpoint usage limits, and a cleanup plan for historical QA entitlements.

Current limitations: historical QA entitlements are not automatically removed; existing entitlement reads still use device time; no scheduled reconciliation job is implemented.
If webhook delivery fails repeatedly, replay notifications or have the user restore purchases to synchronize again. Do not rely solely on an SDK callback to confirm success.
`clearSubscription` still clears only the app's entitlement record; it cannot cancel automatic store billing. The current purchase interface does not call it.
The parent verification screen has a pre-existing `react-hooks/set-state-in-effect` lint error that was left outside the scope of this work.

References:

- https://docs.expo.dev/guides/in-app-purchases/
- https://www.revenuecat.com/docs/getting-started/installation/expo
- https://www.revenuecat.com/docs/customers/identifying-customers
- https://www.revenuecat.com/docs/integrations/webhooks
- https://www.revenuecat.com/docs/api-v1/customer-info-model
