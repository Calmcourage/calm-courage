/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

// Exercise the actual handlers/service with in-memory Firebase boundaries.
// No Firebase initialization, credentials, network, or writes are needed.
function loadModule(source, filename, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(source, {
    ...globals,
    exports: module.exports,
    module,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected import: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

const backendSource = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");

function loadBackend(flag) {
  let databaseAccesses = 0;
  class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  const handlers = loadModule(backendSource, "functions/index.js", {
    "./billing": { registerBilling: () => ({}) },
    "firebase-admin/app": { initializeApp() {} },
    "firebase-admin/firestore": {
      getFirestore: () => ({
        collection() {
          databaseAccesses++;
          throw new Error("Rejected activation must not access Firestore");
        },
      }),
      FieldValue: {},
    },
    "firebase-functions/v2/https": {
      onCall: (_options, handler) => handler,
      HttpsError,
    },
    "firebase-functions/v2": { setGlobalOptions() {} },
  }, {
    process: { env: flag === undefined ? {} : { ALLOW_UNVERIFIED_SUBSCRIPTION_GRANT: flag } },
  });
  return { ...handlers, databaseAccesses: () => databaseAccesses };
}

test("activation rejects unauthenticated requests without database access", async () => {
  const backend = loadBackend("true");
  await assert.rejects(backend.activateSubscription({ data: {} }), { code: "unauthenticated" });
  assert.equal(backend.databaseAccesses(), 0);
});

for (const flag of [undefined, "false", "true", "TRUE", ""]) {
  test(`activation rejects unverified requests with legacy flag ${JSON.stringify(flag)}`, async () => {
    const backend = loadBackend(flag);
    for (const data of [
      undefined,
      null,
      {},
      { receiptId: "" },
      { receiptId: "   " },
      { receiptId: "fake-apple-transaction", platform: "ios" },
      { receiptId: "fake-google-token", platform: "android" },
      { receiptId: "fake", plan: "yearly", trialDays: 30, verified: true, subscriptionRenewsAt: "2099-01-01" },
    ]) {
      await assert.rejects(
        backend.activateSubscription({ auth: { uid: "test-parent" }, data }),
        { code: "failed-precondition" },
      );
    }
    assert.equal(backend.databaseAccesses(), 0);
  });
}

const now = Date.parse("2026-10-14T12:00:00Z");
class FixedDate extends Date {
  static now() { return now; }
}
const past = new Date(now - 1).toISOString();
const present = new Date(now).toISOString();
const future = new Date(now + 86400000).toISOString();
const clientSource = ts.transpileModule(
  fs.readFileSync(path.join(root, "src/services/subscription.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;

async function readEntitlement(data) {
  const service = loadModule(clientSource, "src/services/subscription.ts", {
    "firebase/firestore": {
      doc: (_db, collection, uid) => ({ collection, uid }),
      getDoc: async (ref) => {
        assert.equal(ref.collection, "parents");
        assert.equal(ref.uid, "test-parent");
        return { exists: () => data !== null, data: () => data };
      },
    },
    "firebase/functions": {
      httpsCallable() { throw new Error("Reading an entitlement must not activate it"); },
    },
    "@/config/firebase": { db: {}, functions: {} },
  }, { Date: FixedDate });
  return service.getSubscriptionEntitlement("test-parent");
}

for (const plan of ["monthly", "yearly"]) {
  for (const [label, fields, active] of [
    ["missing expiry", {}, false],
    ["null expiry", { subscriptionRenewsAt: null }, false],
    ["invalid expiry", { subscriptionRenewsAt: "not-a-date" }, false],
    ["expired", { subscriptionRenewsAt: past }, false],
    ["exact expiry boundary", { subscriptionRenewsAt: present }, false],
    ["future trial without expiry", { subscriptionTrialEndsAt: future }, false],
    ["future trial with expired entitlement", { subscriptionTrialEndsAt: future, subscriptionRenewsAt: past }, false],
    ["valid ISO expiry", { subscriptionRenewsAt: future }, true],
    ["valid timestamp expiry", { subscriptionRenewsAt: { toDate: () => new FixedDate(future) } }, true],
    ["legacy expiry", { nextBillingDate: future }, true],
    ["primary expiry overrides legacy date", { subscriptionRenewsAt: past, nextBillingDate: future }, false],
    ["invalid primary expiry cannot use legacy date", { subscriptionRenewsAt: "invalid", nextBillingDate: future }, false],
  ]) {
    test(`${plan}: ${label}`, async () => {
      const entitlement = await readEntitlement({ subscription: plan, ...fields });
      assert.equal(entitlement.isActive, active);
    });
  }
}

test("missing parent and unpaid/unknown plans never unlock premium", async () => {
  for (const data of [null, {}, ...["trial", "unknown"].map(subscription => ({
    subscription,
    subscriptionRenewsAt: future,
    subscriptionTrialEndsAt: future,
  }))]) {
    assert.equal((await readEntitlement(data)).isActive, false);
  }
});
