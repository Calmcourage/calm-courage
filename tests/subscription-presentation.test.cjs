/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const moduleUnderTest = { exports: {} };
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/utils/subscriptionPresentation.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(source, { module: moduleUnderTest, exports: moduleUnderTest.exports });
const { getSubscriptionPresentation: present, getSubscriptionStore: store } = moduleUnderTest.exports;
const now = Date.parse("2026-10-20T12:00:00Z");
const future = new Date(now + 86400000);
const past = new Date(now - 86400000);
const active = {
  plan: "monthly", isActive: true, renewsAt: future, trialEndsAt: null,
  platform: "ios", cancelledAt: null, foundingMember: false, priceLabel: null,
};

test("a canceled renewal retains access and displays cancellation rather than a billing promise", () => {
  const result = present({ ...active, cancelledAt: past }, "ios", now);
  assert.equal(result.isActive, true);
  assert.match(result.status, /Renewal canceled/);
  assert.equal(result.dateLabel, "Access until");
  assert.equal(result.date, future);
});

test("expired, missing, and invalid expiry dates never display cached access as active", () => {
  for (const renewsAt of [past, new Date(now), null, new Date("invalid")]) {
    const result = present({ ...active, renewsAt }, "ios", now);
    assert.equal(result.isActive, false);
    assert.equal(result.status, "No active subscription");
    assert.equal(result.hasPlan, true); // Management must remain available.
  }
});

test("a future date cannot override an inactive server entitlement or an unpaid plan", () => {
  for (const fields of [{ isActive: false }, { plan: "trial" }]) {
    assert.equal(present({ ...active, ...fields }, "ios", now).isActive, false);
  }
});

test("a free trial is shown only while confirmed access and the trial are both current", () => {
  assert.equal(present({ ...active, trialEndsAt: future }, "ios", now).status, "Free trial active");
  assert.equal(present({ ...active, trialEndsAt: past }, "ios", now).status, "Active subscription");
  assert.equal(present({ ...active, trialEndsAt: future, renewsAt: past }, "ios", now).status, "No active subscription");
});

test("Apple subscribers on Android still manage the original Apple subscription", () => {
  const result = present(active, "android", now);
  assert.equal(result.store.url, "https://apps.apple.com/account/subscriptions");
  assert.equal(result.managementLabel, "Manage in App Store");
});

test("Google subscribers on iOS are directed to Google Play", () => {
  const result = present({ ...active, platform: "android" }, "ios", now);
  assert.equal(result.store.url, "https://play.google.com/store/account/subscriptions");
  assert.equal(result.managementLabel, "Manage in Google Play");
});

test("legacy records fall back to the native device store, and unknown web records have no assumed store", () => {
  assert.equal(store(null, "ios").name, "App Store");
  assert.equal(store(null, "android").name, "Google Play");
  assert.equal(store(null, "web").url, null);
});

test("legacy founding member prices are never advertised as current store pricing", () => {
  const result = present({ ...active, foundingMember: true, priceLabel: "$7.99 forever" }, "ios", now);
  assert.equal(result.title, "Calm Courage\nMonthly Plan");
  assert.equal(result.priceDescription, "View billing in\nApp Store");
});
