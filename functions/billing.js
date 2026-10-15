const { timingSafeEqual } = require("node:crypto");
const { Buffer } = require("node:buffer");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { FieldValue } = require("firebase-admin/firestore");
const { syncSubscriber } = require("./revenuecat");

function validUid(uid) {
  return typeof uid === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(uid);
}

function getBillingConfig(apiKey) {
  if (process.env.BILLING_ENABLED !== "true" || !apiKey) {
    throw new HttpsError("failed-precondition", "Subscriptions are not available yet.");
  }
  let productPlans;
  try { productPlans = JSON.parse(process.env.REVENUECAT_PRODUCT_PLANS || "{}"); }
  catch { throw new HttpsError("failed-precondition", "Subscription products are not configured."); }
  const entitlementId = process.env.REVENUECAT_ENTITLEMENT_ID?.trim();
  if (!entitlementId || !productPlans || Array.isArray(productPlans) ||
      typeof productPlans !== "object" || !Object.keys(productPlans).length ||
      !Object.entries(productPlans).every(([key, plan]) => /^(app_store|play_store):.+/.test(key) && ["monthly", "yearly"].includes(plan))) {
    throw new HttpsError("failed-precondition", "Subscription products are not configured.");
  }
  return { apiKey, entitlementId, productPlans, allowSandbox: process.env.REVENUECAT_ALLOW_SANDBOX === "true" };
}

function authorizedWebhook(header, secret) {
  if (!secret || typeof header !== "string") return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function registerBilling(db) {
  const apiKey = defineSecret("REVENUECAT_SECRET_API_KEY");
  const webhookSecret = defineSecret("REVENUECAT_WEBHOOK_SECRET");
  const sync = (uid, config) => syncSubscriber(db, uid, config, () => FieldValue.serverTimestamp());
  return {
    syncSubscription: onCall({ region: "us-central1", secrets: [apiKey] }, async request => {
      if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
      if (!validUid(request.auth.uid) || request.auth.token.email_verified !== true) {
        throw new HttpsError("permission-denied", "A verified parent account is required.");
      }
      const config = getBillingConfig(apiKey.value());
      try {
        // Only the authenticated UID is used, never request.data or a receipt.
        const result = await sync(request.auth.uid, config);
        if (result.missing) throw new HttpsError("not-found", "Parent profile not found.");
        return {
          ...result,
          productIds: {
            ios: Object.keys(config.productPlans).filter(key => key.startsWith("app_store:")).map(key => key.slice(10)),
            android: Object.keys(config.productPlans).filter(key => key.startsWith("play_store:")).map(key => key.slice(11)),
          },
        };
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("unavailable", "Unable to confirm your subscription. Please try again.");
      }
    }),
    revenueCatWebhook: onRequest({ region: "us-central1", secrets: [apiKey, webhookSecret] }, async (request, response) => {
      if (request.method !== "POST") { response.status(405).send("Method not allowed"); return; }
      if (!authorizedWebhook(request.get("authorization"), webhookSecret.value())) {
        response.status(401).send("Unauthorized"); return;
      }
      const event = request.body?.event;
      if (!event || typeof event.id !== "string" || typeof event.type !== "string") {
        response.status(400).send("Invalid event"); return;
      }
      try {
        const config = getBillingConfig(apiKey.value());
        // Refetch current state instead of trusting event order or expiry fields.
        // Transfers reconcile both sides; unknown/anonymous IDs have no parent doc.
        const candidates = [event.app_user_id, event.original_app_user_id,
          ...(Array.isArray(event.aliases) ? event.aliases : []),
          ...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
          ...(Array.isArray(event.transferred_to) ? event.transferred_to : [])];
        const uids = [...new Set(candidates.filter(validUid))];
        if (uids.length > 20) { response.status(400).send("Too many identities"); return; }
        await Promise.all(uids.map(uid => sync(uid, config)));
        response.status(200).send("OK");
      } catch {
        // Non-2xx asks RevenueCat to retry. Never acknowledge a failed write.
        response.status(503).send("Subscription sync unavailable");
      }
    }),
  };
}

module.exports = { registerBilling, getBillingConfig, authorizedWebhook };
