const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const {
  assertDisabled, validateManifest, newManifest, normalizeRules,
  expectDenied, expectCallable, deniedWriteWithRestore, safeFailure, cliAdc, resolveEnvFile, resolveSecretFile, ProbeError,
} = require("../scripts/verify-billing-online.cjs");

test("online preflight refuses enabled, missing or ambiguous billing configuration", () => {
  const disabled = { BILLING_ENABLED: "false", REVENUECAT_ALLOW_SANDBOX: "false", REVENUECAT_PRODUCT_PLANS: "{}" };
  assert.doesNotThrow(() => assertDisabled(disabled));
  for (const env of [
    undefined, {}, { ...disabled, BILLING_ENABLED: "true" },
    { ...disabled, REVENUECAT_ALLOW_SANDBOX: "true" },
    { ...disabled, BILLING_ENABLED: undefined },
    ...[undefined, "null", "[]", '""', "bad-json", '{"app_store:test":"monthly"}'].map(REVENUECAT_PRODUCT_PLANS => ({ ...disabled, REVENUECAT_PRODUCT_PLANS })),
  ]) assert.throws(() => assertDisabled(env), ProbeError);
});

test("environment profiles cannot read arbitrary paths or credential files", () => {
  assert.match(resolveEnvFile(), /[\\/]\.env$/);
  assert.match(resolveEnvFile(".env.billing-test.local"), /[\\/]\.env\.billing-test\.local$/);
  for (const filename of ["../.env", "C:/secret.json", ".env/../../secret", "functions/.secret.local", ".env.production"]) {
    assert.throws(() => resolveEnvFile(filename), ProbeError);
  }
});

test("an explicit test profile cannot fall back to the original project's webhook secret", () => {
  const testEnv = resolveEnvFile(".env.billing-test.local");
  assert.throws(() => resolveSecretFile("calm-courage-test", testEnv, () => false), /requires its own/);
  assert.match(resolveSecretFile("calm-courage-test", testEnv, () => true), /\.secret\.calm-courage-test\.local$/);
  assert.match(resolveSecretFile("calm-courage-co", resolveEnvFile(), () => false), /[\\/]\.secret\.local$/);
  assert.throws(() => resolveSecretFile("../other-project", testEnv, () => true), ProbeError);
});

test("dedicated account manifest cannot target another project, identity or document path", () => {
  const valid = newManifest("calm-courage-co");
  assert.equal(validateManifest(valid, "calm-courage-co"), valid);
  assert.notEqual(valid.accounts[0].password, valid.accounts[1].password);
  const modifications = [
    m => { m.projectId = "another-project"; },
    m => { m.runId = "../arbitrary"; },
    m => { m.accounts[0].uid = "real-parent"; },
    m => { m.accounts[0].uid += "/nested/doc"; },
    m => { m.accounts[1].email = "real@example.com"; },
    m => { m.accounts.reverse(); },
    m => { m.accounts.pop(); },
  ];
  for (const modify of modifications) {
    const tampered = structuredClone(valid);
    modify(tampered);
    assert.throws(() => validateManifest(tampered, "calm-courage-co"), ProbeError);
  }
});

test("Firestore denial requires the exact client permission error, never a network failure", async () => {
  await expectDenied(async () => { throw { code: "permission-denied" }; });
  await assert.rejects(() => expectDenied(async () => {}), /unexpectedly succeeded/);
  for (const code of ["unavailable", "unauthenticated", "not-found", "deadline-exceeded", "functions/permission-denied"]) {
    await assert.rejects(() => expectDenied(async () => { throw { code }; }), /different SDK error/);
  }
});

test("callable success and unrelated failures cannot pass the disabled-state check", async () => {
  await expectCallable(async () => { throw { code: "functions/failed-precondition" }; }, "failed-precondition");
  await assert.rejects(() => expectCallable(async () => ({ active: true }), "failed-precondition"), /unexpectedly succeeded/);
  await assert.rejects(() => expectCallable(async () => { throw { code: "functions/unavailable" }; }, "failed-precondition"), /expected failed-precondition/);
  await assert.rejects(() => expectCallable(async () => { throw { code: "functions/unauthenticated", message: "DO-NOT-PRINT-TOKEN" }; }, "failed-precondition"), error => {
    assert.match(error.message, /received functions\/unauthenticated/);
    assert.ok(!error.message.includes("DO-NOT-PRINT-TOKEN"));
    return true;
  });
});

test("remote errors and HTTP bodies are redacted; locally authored diagnostics survive", () => {
  const password = "DO-NOT-PRINT-SECRET";
  for (const error of [new Error(password), { message: password, code: password }, password]) {
    assert.ok(!safeFailure(error).includes(password));
  }
  assert.equal(safeFailure(new ProbeError("RevenueCat query failed (HTTP 401).")), "RevenueCat query failed (HTTP 401).");
  assert.equal(safeFailure(new Error(`OAuth invalid_grant ${password}`)), "Google OAuth rejected the cached login (invalid_grant). Run npx firebase-tools login --reauth locally.");
});

test("rules comparison tolerates Windows line endings but preserves semantic changes", () => {
  assert.equal(normalizeRules("rules_version = '2';\r\n\r\n"), normalizeRules("rules_version = '2';\n"));
  assert.notEqual(normalizeRules("allow write: if false;"), normalizeRules("allow write: if true;"));
});

test("unexpectedly allowed writes restore fixtures and still fail verification", async () => {
  const baseline = { subscription: "trial", subscriptionRenewsAt: null };
  let stored = structuredClone(baseline);
  let restores = 0;
  const ref = {
    async get() { return { data: () => stored }; },
    async set(value) { stored = structuredClone(value); restores++; },
  };
  await assert.rejects(() => deniedWriteWithRestore(async () => {
    stored.subscription = null;
  }, ref, baseline), /unexpectedly succeeded/);
  assert.deepEqual(stored, baseline);
  assert.equal(restores, 1);
  await deniedWriteWithRestore(async () => { throw { code: "permission-denied" }; }, ref, baseline);
  assert.equal(restores, 1, "legitimately denied requests do not cause Admin writes");
  await assert.rejects(() => deniedWriteWithRestore(async () => {
    stored.subscription = null;
    throw { code: "unavailable" }; // ambiguous network result must also restore
  }, ref, baseline), /different SDK error/);
  assert.deepEqual(stored, baseline);
  assert.equal(restores, 2);
});

test("a failed fixture restoration cannot be reported as a permission pass", async () => {
  await assert.rejects(() => deniedWriteWithRestore(async () => {}, {
    async get() { return { data: () => ({ subscription: null }) }; },
    async set() { throw new Error("restore failed"); },
  }, { subscription: "trial" }), /restore failed/);
});

test("CLI credentials initialize Admin Firestore as ADC and temporary credentials are removed", async () => {
  const r = createRequire(require.resolve("../functions/package.json"));
  const { initializeApp, deleteApp } = r("firebase-admin/app");
  const { getFirestore } = r("firebase-admin/firestore");
  const previous = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const credentials = { type: "authorized_user", client_id: "unit-test-client", client_secret: "unit-test-secret", refresh_token: "unit-test-refresh" };
  const session = cliAdc(credentials);
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let app;
  try {
    assert.notEqual(file, previous);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), credentials);
    app = initializeApp({ projectId: "billing-unit-test", credential: session.credential }, "billing-cli-unit-test");
    const db = getFirestore(app); // The former custom getAccessToken object fails here.
    await db.terminate(); // No requests or real credentials are involved.
  } finally {
    if (app) await deleteApp(app);
    session.dispose();
  }
  assert.equal(fs.existsSync(file), false);
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, previous);
});
