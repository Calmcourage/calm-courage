/** RevenueCat REST response -> existing server-owned entitlement fields. */
function inactiveEntitlement() {
  return {
    subscription: "trial",
    foundingMember: false,
    subscriptionPriceLabel: null,
    subscriptionTrialEndsAt: null,
    trialEndsAt: null,
    subscriptionRenewsAt: null,
    nextBillingDate: null,
    subscriptionSource: "revenuecat",
    subscriptionPlatform: null,
    subscriptionReceiptId: null,
    subscriptionCancelledAt: null,
  };
}

function dateMs(value) {
  return typeof value === "string" ? Date.parse(value) : NaN;
}

function entitlementFromSubscriber(payload, uid, config, now = Date.now()) {
  const subscriber = payload?.subscriber;
  if (!subscriber || typeof subscriber.entitlements !== "object" || !subscriber.entitlements ||
      typeof subscriber.subscriptions !== "object" || !subscriber.subscriptions ||
      !Number.isFinite(payload.request_date_ms)) {
    throw new Error("Invalid subscription provider response");
  }
  const inactive = inactiveEntitlement();
  // Custom Firebase UIDs only. Reject aliased identities instead of granting
  // the same subscription to multiple Firebase accounts.
  if (subscriber.original_app_user_id !== uid) return inactive;
  const entitlement = subscriber.entitlements[config.entitlementId];
  if (!entitlement) return inactive;
  const product = entitlement.product_identifier;
  const subscription = subscriber.subscriptions[product];
  if (!subscription || !["app_store", "play_store"].includes(subscription.store)) return inactive;
  const key = `${subscription.store}:${product}`;
  const plan = Object.hasOwn(config.productPlans, key) ? config.productPlans[key] : null;
  if (!["monthly", "yearly"].includes(plan) || subscription.refunded_at != null) return inactive;
  if (subscription.is_sandbox !== false && !(config.allowSandbox && subscription.is_sandbox === true)) return inactive;

  const expires = Math.min(dateMs(entitlement.expires_date), dateMs(subscription.expires_date));
  if (!Number.isFinite(expires)) return inactive; // No lifetime/unbounded grants.
  const grace = Math.min(dateMs(entitlement.grace_period_expires_date), dateMs(subscription.grace_period_expires_date));
  const effectiveExpiry = Number.isFinite(grace) ? Math.max(expires, grace) : expires;
  if (effectiveExpiry <= now) return inactive;
  const until = new Date(effectiveExpiry).toISOString();
  const trialUntil = subscription.period_type === "trial" ? new Date(expires).toISOString() : null;
  return {
    ...inactive,
    subscription: plan,
    subscriptionPlatform: subscription.store === "app_store" ? "ios" : "android",
    subscriptionRenewsAt: until,
    nextBillingDate: until,
    subscriptionTrialEndsAt: trialUntil,
    trialEndsAt: trialUntil,
    // Cancellation disables renewal; paid access lasts until its store expiry.
    subscriptionCancelledAt: subscription.unsubscribe_detected_at || null,
  };
}

async function fetchSubscriber(uid, apiKey, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Subscription provider unavailable");
  return response.json();
}

async function syncSubscriber(db, uid, config, serverTimestamp, fetchImpl = fetch) {
  // Check existence before calling the provider. Never recreate deleted accounts.
  const parent = db.collection("parents").doc(uid);
  if (!(await parent.get()).exists) return { active: false, missing: true };
  const payload = await fetchSubscriber(uid, config.apiKey, fetchImpl);
  const update = entitlementFromSubscriber(payload, uid, config);
  const state = db.collection("billingSyncState").doc(uid);
  return db.runTransaction(async transaction => {
    const parentSnapshot = await transaction.get(parent);
    const previous = await transaction.get(state);
    if (!parentSnapshot.exists) return { active: false, missing: true };
    // Older or repeated API snapshots must not overwrite a newer refund/renewal.
    if (previous.exists && previous.data().requestDateMs >= payload.request_date_ms) {
      return { unchanged: true };
    }
    transaction.update(parent, { ...update, updatedAt: serverTimestamp() });
    transaction.set(state, { requestDateMs: payload.request_date_ms, syncedAt: serverTimestamp() });
    return { active: update.subscription !== "trial" };
  });
}

module.exports = { entitlementFromSubscriber, fetchSubscriber, syncSubscriber };
