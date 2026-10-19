/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/services/storePurchases.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const uid = "parent_test";
const product = { identifier: "monthly", title: "Premium", priceString: "CA$9.99", subscriptionPeriod: "P1M" };
const storePackage = { identifier: "$rc_monthly", product };

function setup(options = {}) {
  const events = [];
  let sdkUid = options.sdkUid;
  const auth = { currentUser: { uid, emailVerified: true } };
  const sdk = {
    isConfigured: async () => Boolean(sdkUid),
    configure: ({ appUserID }) => { sdkUid = appUserID; events.push("configure"); },
    getAppUserID: async () => sdkUid,
    logIn: async id => { sdkUid = id; events.push(`login:${id}`); },
    getOfferings: async () => ({ current: { availablePackages: [storePackage, { ...storePackage, identifier: "unknown", product: { ...product, identifier: "unapproved" } }] } }),
    purchasePackage: async () => { events.push("purchase"); if (options.purchase) await options.purchase(auth); return { customerInfo: { entitlements: { active: { premium: {} } } } }; },
    restorePurchases: async () => { events.push("restore"); return {}; },
  };
  let sdkImports = 0;
  const module = { exports: {} };
  const dependencies = {
    "expo-constants": { __esModule: true, default: { executionEnvironment: options.expoGo ? "storeClient" : "standalone" }, ExecutionEnvironment: { StoreClient: "storeClient" } },
    "react-native": { Platform: { OS: options.platform || "ios" } },
    "firebase/functions": { httpsCallable: (_functions, name) => async body => {
      assert.equal(name, "syncSubscription");
      assert.equal(Object.keys(body).length, 0);
      events.push("server-sync");
      if (options.serverFails) throw new Error("Backend unavailable");
      return { data: { productIds: { ios: ["monthly"], android: ["monthly"] } } };
    } },
    "@/config/firebase": { auth, functions: {} },
    "@/services/subscription": { getSubscriptionEntitlement: async () => ({ isActive: options.active === true }) },
    "react-native-purchases": { __esModule: true, default: sdk },
  };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    process: { env: {
      EXPO_PUBLIC_ENABLE_STORE_PURCHASES: options.enabled === false ? "false" : "true",
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: options.apiKey ?? "appl_test",
      EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: "goog_test",
    } },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), name);
      if (name === "react-native-purchases") sdkImports++;
      return dependencies[name];
    },
  });
  return { service: module.exports, auth, events, sdkImports: () => sdkImports };
}

for (const [label, options] of [
  ["disabled feature", { enabled: false }],
  ["Expo Go", { expoGo: true }],
  ["web", { platform: "web" }],
  ["missing public key", { apiKey: "" }],
  ["secret key in public slot", { apiKey: "sk_not_allowed" }],
  ["RevenueCat test store key", { apiKey: "test_not_allowed" }],
]) {
  test(`${label} never loads native billing or calls backend`, async () => {
    const ctx = setup(options);
    assert.equal(ctx.service.storePurchasesAvailable(), false);
    await assert.rejects(ctx.service.loadStorePlans(uid));
    assert.equal(ctx.sdkImports(), 0);
    assert.equal(ctx.events.length, 0);
  });
}
test("offerings show store price and only backend-approved subscription products", async () => {
  const ctx = setup();
  const plans = await ctx.service.loadStorePlans(uid);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].price, "CA$9.99");
  assert.equal(plans[0].period, "month");
});
test("backend unavailable prevents charge and restore", async () => {
  const ctx = setup({ serverFails: true });
  await assert.rejects(ctx.service.purchaseStorePlan(uid, { package: storePackage }));
  await assert.rejects(ctx.service.restoreStorePurchases(uid));
  assert.ok(!ctx.events.includes("purchase"));
  assert.ok(!ctx.events.includes("restore"));
});
test("unapproved product never reaches store purchase", async () => {
  const ctx = setup();
  await assert.rejects(ctx.service.purchaseStorePlan(uid, { package: { ...storePackage, product: { identifier: "unknown" } } }));
  assert.ok(!ctx.events.includes("purchase"));
});
test("SDK success cannot grant access without server entitlement", async () => {
  const ctx = setup();
  const result = await ctx.service.purchaseStorePlan(uid, { package: storePackage });
  assert.equal(result.isActive, false);
  assert.deepEqual(ctx.events, ["configure", "server-sync", "purchase", "server-sync"]);
});
test("restore returns server-confirmed access", async () => {
  const ctx = setup({ active: true });
  const result = await ctx.service.restoreStorePurchases(uid);
  assert.equal(result.isActive, true);
  assert.deepEqual(ctx.events, ["configure", "server-sync", "restore", "server-sync"]);
});

test("access activated since opening the paywall prevents a second checkout", async () => {
  const ctx = setup({ active: true });
  const result = await ctx.service.purchaseStorePlan(uid, { package: storePackage });
  assert.equal(result.isActive, true);
  assert.deepEqual(ctx.events, ["configure", "server-sync"]);
});
test("account switching re-identifies SDK before operating", async () => {
  const ctx = setup({ sdkUid: "previous_parent" });
  await ctx.service.loadStorePlans(uid);
  assert.equal(ctx.events[0], `login:${uid}`);
});
test("unverified or mismatched user cannot purchase", async () => {
  const ctx = setup();
  await assert.rejects(ctx.service.loadStorePlans("different_parent"));
  ctx.auth.currentUser.emailVerified = false;
  await assert.rejects(ctx.service.loadStorePlans(uid));
  assert.equal(ctx.sdkImports(), 0);
});
test("sign-out during checkout cannot sync the result to another user", async () => {
  const ctx = setup({ purchase: async auth => { auth.currentUser = null; } });
  await assert.rejects(ctx.service.purchaseStorePlan(uid, { package: storePackage }));
  assert.equal(ctx.events.filter(event => event === "server-sync").length, 1);
});
test("store cancellation is recognized without granting access", async () => {
  const ctx = setup({ purchase: async () => { throw { userCancelled: true }; } });
  let cancelled;
  try { await ctx.service.purchaseStorePlan(uid, { package: storePackage }); }
  catch (error) { cancelled = ctx.service.purchaseWasCancelled(error); }
  assert.equal(cancelled, true);
  assert.equal(ctx.events.filter(event => event === "server-sync").length, 1);
});
