/* global __dirname */
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { entitlementFromSubscriber, fetchSubscriber, syncSubscriber } = require("../functions/revenuecat");

const uid = "parent_test_uid";
const now = Date.now();
const future = new Date(now + 86400000).toISOString();
const past = new Date(now - 86400000).toISOString();
const config = { apiKey: "test-secret", entitlementId: "premium", productPlans: { "app_store:monthly": "monthly", "play_store:annual:base": "yearly" }, allowSandbox: false };
function payload() {
  return {
    request_date_ms: now,
    subscriber: {
      original_app_user_id: uid,
      entitlements: { premium: { product_identifier: "monthly", expires_date: future } },
      subscriptions: { monthly: { store: "app_store", is_sandbox: false, expires_date: future, period_type: "normal" } },
    },
  };
}

test("verified store subscription maps to finite entitlement", () => {
  const update = entitlementFromSubscriber(payload(), uid, config, now);
  assert.equal(update.subscription, "monthly");
  assert.equal(update.subscriptionRenewsAt, future);
  assert.equal(update.subscriptionPlatform, "ios");
  assert.equal(update.foundingMember, false);
});

for (const [name, change] of [
  ["wrong account", p => { p.subscriber.original_app_user_id = "someone_else"; }],
  ["missing entitlement", p => { p.subscriber.entitlements = {}; }],
  ["unknown product", p => { p.subscriber.entitlements.premium.product_identifier = "other"; }],
  ["sandbox in production", p => { p.subscriber.subscriptions.monthly.is_sandbox = true; }],
  ["missing environment", p => { delete p.subscriber.subscriptions.monthly.is_sandbox; }],
  ["promotional store", p => { p.subscriber.subscriptions.monthly.store = "promotional"; }],
  ["refund before expiry", p => { p.subscriber.subscriptions.monthly.refunded_at = past; }],
  ["missing expiry", p => { p.subscriber.entitlements.premium.expires_date = null; }],
  ["invalid expiry", p => { p.subscriber.subscriptions.monthly.expires_date = "invalid"; }],
  ["expired subscription", p => { p.subscriber.subscriptions.monthly.expires_date = past; }],
]) {
  test(`${name} cannot grant premium`, () => {
    const data = payload(); change(data);
    const update = entitlementFromSubscriber(data, uid, config, now);
    assert.equal(update.subscription, "trial");
    assert.equal(update.subscriptionRenewsAt, null);
  });
}

test("cancellation preserves paid access until expiry", () => {
  const data = payload();
  data.subscriber.subscriptions.monthly.unsubscribe_detected_at = past;
  assert.equal(entitlementFromSubscriber(data, uid, config, now).subscription, "monthly");
});
test("sandbox only works with explicit backend opt-in", () => {
  const data = payload(); data.subscriber.subscriptions.monthly.is_sandbox = true;
  assert.equal(entitlementFromSubscriber(data, uid, { ...config, allowSandbox: true }, now).subscription, "monthly");
});
test("grace period extends access only using provider dates", () => {
  const data = payload();
  for (const item of [data.subscriber.entitlements.premium, data.subscriber.subscriptions.monthly]) {
    item.expires_date = past;
    item.grace_period_expires_date = future;
  }
  assert.equal(entitlementFromSubscriber(data, uid, config, now).subscriptionRenewsAt, future);
});
test("Google base-plan identifiers map exactly", () => {
  const data = payload();
  data.subscriber.entitlements.premium.product_identifier = "annual:base";
  data.subscriber.subscriptions["annual:base"] = { ...data.subscriber.subscriptions.monthly, store: "play_store" };
  const update = entitlementFromSubscriber(data, uid, config, now);
  assert.equal(update.subscription, "yearly");
  assert.equal(update.subscriptionPlatform, "android");
});
test("malformed provider response is an error, not a grant or a destructive update", () => {
  assert.throws(() => entitlementFromSubscriber({}, uid, config));
});
test("server GET encodes identity and uses secret authorization", async () => {
  await fetchSubscriber("id/with space", "test-key", async (url, options) => {
    assert.equal(url, "https://api.revenuecat.com/v1/subscribers/id%2Fwith%20space");
    assert.equal(options.headers.Authorization, "Bearer test-key");
    return { ok: true, json: async () => payload() };
  });
});

function database({ previous = null, exists = true } = {}) {
  const writes = [];
  return {
    writes,
    collection: name => ({ doc: id => ({ name, id, get: async () => ({ exists }) }) }),
    runTransaction: async operation => operation({
      get: async ref => ref.name === "parents" ? { exists } : { exists: previous !== null, data: () => ({ requestDateMs: previous }) },
      update: (ref, data) => writes.push({ ref, data }),
      set: (ref, data) => writes.push({ ref, data }),
    }),
  };
}
test("sync writes only verified provider fields and private ordering state", async () => {
  const db = database();
  await syncSubscriber(db, uid, config, () => "timestamp", async () => ({ ok: true, json: async () => payload() }));
  assert.equal(db.writes.length, 2);
  assert.equal(db.writes[0].ref.id, uid);
  assert.equal(db.writes[0].data.subscription, "monthly");
  assert.equal(db.writes[1].ref.name, "billingSyncState");
});
for (const previous of [now, now + 1000]) {
  test(`duplicate/older snapshot cannot overwrite newer state (${previous - now})`, async () => {
    const db = database({ previous });
    await syncSubscriber(db, uid, config, () => "timestamp", async () => ({ ok: true, json: async () => payload() }));
    assert.equal(db.writes.length, 0);
  });
}
test("provider failure preserves existing database state", async () => {
  const db = database();
  await assert.rejects(syncSubscriber(db, uid, config, () => "timestamp", async () => ({ ok: false })));
  assert.equal(db.writes.length, 0);
});
test("missing/deleted account is not recreated or sent to provider", async () => {
  const db = database({ exists: false });
  await syncSubscriber(db, uid, config, () => "timestamp", () => { throw new Error("Must not call provider"); });
  assert.equal(db.writes.length, 0);
});

function loadHandlers(env = {}, sync = async () => ({ active: false })) {
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../functions/billing.js"), "utf8"), {
    module, exports: module.exports, process: { env },
    require(name) {
      if (name.startsWith("node:")) return require(name);
      if (name === "firebase-functions/v2/https") return { onCall: (_options, handler) => handler, onRequest: (_options, handler) => handler, HttpsError };
      if (name === "firebase-functions/params") return { defineSecret: key => ({ value: () => key === "REVENUECAT_WEBHOOK_SECRET" ? "webhook-test" : "api-test" }) };
      if (name === "firebase-admin/firestore") return { FieldValue: { serverTimestamp: () => "timestamp" } };
      if (name === "./revenuecat") return { syncSubscriber: (_db, id) => sync(id) };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { ...module.exports, ...module.exports.registerBilling({}) };
}
const enabledEnv = { BILLING_ENABLED: "true", REVENUECAT_ENTITLEMENT_ID: "premium", REVENUECAT_PRODUCT_PLANS: JSON.stringify(config.productPlans) };
test("new sync endpoint is disabled unless configured and enabled", async () => {
  const handlers = loadHandlers();
  await assert.rejects(handlers.syncSubscription({ auth: { uid, token: { email_verified: true } } }), { code: "failed-precondition" });
});
test("sync endpoint requires authenticated verified identity", async () => {
  const handlers = loadHandlers(enabledEnv);
  await assert.rejects(handlers.syncSubscription({}), { code: "unauthenticated" });
  await assert.rejects(handlers.syncSubscription({ auth: { uid, token: {} } }), { code: "permission-denied" });
});
test("client cannot choose another UID or supply entitlement fields", async () => {
  const ids = [];
  const handlers = loadHandlers(enabledEnv, async id => { ids.push(id); return { active: false }; });
  const result = await handlers.syncSubscription({ auth: { uid, token: { email_verified: true } }, data: { uid: "victim", subscription: "yearly", receiptId: "fake" } });
  assert.deepEqual(ids, [uid]);
  assert.equal(result.active, false);
  assert.equal(result.productIds.ios[0], "monthly");
});
function response() { return { code: null, status(code) { this.code = code; return this; }, send() {} }; }
test("webhook rejects missing or incorrect authorization before syncing", async () => {
  const handlers = loadHandlers(enabledEnv, () => { throw new Error("Must not sync"); });
  for (const header of [undefined, "Bearer wrong", "webhook-test"]) {
    const res = response();
    await handlers.revenueCatWebhook({ method: "POST", get: () => header }, res);
    assert.equal(res.code, 401);
  }
});
test("webhook reconciles both sides of transfers and removes duplicate IDs", async () => {
  const ids = [];
  const handlers = loadHandlers(enabledEnv, async id => { ids.push(id); });
  const res = response();
  await handlers.revenueCatWebhook({ method: "POST", get: () => "Bearer webhook-test", body: { event: {
    id: "event-1", type: "TRANSFER", transferred_from: [uid], transferred_to: ["new_parent"], aliases: [uid, "$RCAnonymousID:fake"],
  } } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(ids.sort(), ["new_parent", uid].sort());
});
test("webhook returns retryable failure when provider/database sync fails", async () => {
  const handlers = loadHandlers(enabledEnv, async () => { throw new Error("Unavailable"); });
  const res = response();
  await handlers.revenueCatWebhook({ method: "POST", get: () => "Bearer webhook-test", body: { event: { id: "event", type: "RENEWAL", app_user_id: uid } } }, res);
  assert.equal(res.code, 503);
});
