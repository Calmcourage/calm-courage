/**
 * Calm Courage Cloud Functions (production entitlement grants).
 *
 * Deploy:
 *   npm run functions:install
 *   npm run firebase:deploy
 *
 * Clients call activateSubscription / clearSubscription via HTTPS callable.
 * Direct client writes to subscription fields are blocked by Firestore rules.
 *
 * Legacy subscription activation is disabled. The new RevenueCat sync path
 * lives in billing.js and requires explicit backend configuration/enabling.
 * ALLOW_UNVERIFIED_SUBSCRIPTION_GRANT is no longer honored, including for QA.
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

initializeApp();
setGlobalOptions({ region: "us-central1" });

const db = getFirestore();

// New verified path is separately gated by BILLING_ENABLED (off by default).
Object.assign(exports, require("./billing").registerBilling(db));

/**
 * Keep the callable available to existing clients, but fail closed.
 * New clients use syncSubscription, which derives entitlement fields from the
 * provider's server response. Client-supplied receipts, plans, trial lengths,
 * and expiry dates are not proof of purchase.
 */
exports.activateSubscription = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in required to activate a subscription.",
      );
    }

    throw new HttpsError(
      "failed-precondition",
      "Subscriptions are not available yet. Please check back later.",
    );
  },
);

exports.clearSubscription = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const parentRef = db.collection("parents").doc(request.auth.uid);
    const snapshot = await parentRef.get();

    if (!snapshot.exists) {
      throw new HttpsError("not-found", "Parent profile not found.");
    }

    await parentRef.update({
      subscription: "trial",
      foundingMember: false,
      subscriptionPriceLabel: null,
      subscriptionTrialEndsAt: null,
      trialEndsAt: null,
      subscriptionRenewsAt: null,
      nextBillingDate: null,
      subscriptionSource: null,
      subscriptionPlatform: null,
      subscriptionReceiptId: null,
      subscriptionCancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { ok: true };
  },
);
