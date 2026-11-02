/* Live checks only; never deploys configuration or enables billing. Node >=22. */
/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");
const { parseEnv, isDeepStrictEqual } = require("node:util");
const { randomBytes, randomUUID, createHash } = require("node:crypto");
const { createRequire } = require("node:module");
const { initializeApp, deleteApp } = require("firebase/app");
const { initializeAuth, inMemoryPersistence, signInWithEmailAndPassword, signOut } = require("firebase/auth");
const { getFunctions, httpsCallable } = require("firebase/functions");
const { getFirestore, doc, getDoc, updateDoc, setDoc, terminate, setLogLevel } = require("firebase/firestore/lite");
const adminRequire = createRequire(path.resolve(__dirname, "../functions/package.json"));
const { initializeApp: initializeAdmin, applicationDefault, deleteApp: deleteAdmin } = adminRequire("firebase-admin/app");
const { getAuth } = adminRequire("firebase-admin/auth");
const { getFirestore: getAdminFirestore } = adminRequire("firebase-admin/firestore");
const { fetchSubscriber } = require("../functions/revenuecat.js");

const ROOT = path.resolve(__dirname, "..");
const LOCAL = path.join(ROOT, ".billing-verification");
const MANIFEST = path.join(LOCAL, "accounts.json");
const REGION = "us-central1";
// Mutations remain inactive even if a rule incorrectly allows a write.
const INACTIVE = Object.freeze({
  subscription: "trial", foundingMember: false, subscriptionPriceLabel: null,
  subscriptionTrialEndsAt: null, trialEndsAt: null, subscriptionRenewsAt: null,
  nextBillingDate: null, subscriptionSource: null, subscriptionActivatedAt: null,
  subscriptionCancelledAt: null, subscriptionReceiptId: null, subscriptionPlatform: null,
});

class ProbeError extends Error {}
function requireProbe(ok, message) { if (!ok) throw new ProbeError(message); }
function readEnv(file) { return fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {}; }
function save(file, data, exclusive = false) {
  fs.mkdirSync(LOCAL, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600, flag: exclusive ? "wx" : "w" });
}
function resolveEnvFile(filename = ".env") {
  requireProbe(filename === ".env" || /^\.env\.[A-Za-z0-9_-]+\.local$/.test(filename), "Select .env or a named .env.<profile>.local file in the repository root.");
  return path.join(ROOT, filename);
}
function resolveSecretFile(projectId, envFile, exists = fs.existsSync) {
  requireProbe(typeof projectId === "string" && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId), "Invalid secret configuration project.");
  const specific = path.join(ROOT, "functions", `.secret.${projectId}.local`);
  if (exists(specific)) return specific;
  requireProbe(envFile === resolveEnvFile(), "Selected environment requires its own functions/.secret.<project-id>.local file; shared webhook secrets will not be used.");
  return path.join(ROOT, "functions/.secret.local");
}
function loadConfig(command) {
  const envFile = resolveEnvFile(process.env.BILLING_VERIFY_ENV_FILE);
  requireProbe(fs.existsSync(envFile), "Selected local environment file does not exist.");
  const env = readEnv(envFile);
  const projectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  requireProbe(typeof projectId === "string" && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId), "Missing/invalid Firebase project in .env.");
  requireProbe(env.EXPO_PUBLIC_FIREBASE_API_KEY && env.EXPO_PUBLIC_FIREBASE_APP_ID, "Missing Firebase web configuration in .env.");
  if (command !== "cleanup") {
    const backend = readEnv(path.join(ROOT, `functions/.env.${projectId}`));
    assertDisabled(backend);
    requireProbe([undefined, "false"].includes(env.EXPO_PUBLIC_ENABLE_STORE_PURCHASES) && [undefined, "false"].includes(env.EXPO_PUBLIC_ENABLE_QA_PURCHASE), "Local client purchase flags must be disabled.");
  }
  for (const key of ["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST", "FIREBASE_DATABASE_EMULATOR_HOST"]) {
    requireProbe(!process.env[key], "Emulator variables are set; refusing to label emulator results as online checks.");
  }
  return { projectId, envFile, firebase: { projectId, apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY, appId: env.EXPO_PUBLIC_FIREBASE_APP_ID, authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN } };
}
function assertDisabled(env) {
  requireProbe(env?.BILLING_ENABLED === "false" && env?.REVENUECAT_ALLOW_SANDBOX === "false", "Billing and sandbox must both be explicitly false.");
  let plans;
  try { plans = JSON.parse(env.REVENUECAT_PRODUCT_PLANS); } catch { /* fail closed below */ }
  requireProbe(plans && typeof plans === "object" && !Array.isArray(plans) && Object.keys(plans).length === 0, "Product mappings must remain empty.");
}
function validateManifest(manifest, projectId) {
  requireProbe(manifest?.version === 1 && manifest.projectId === projectId && /^[a-f0-9]{32}$/.test(manifest.runId), "Invalid test-account manifest or project mismatch.");
  requireProbe(Array.isArray(manifest.accounts) && manifest.accounts.length === 2, "Expected two dedicated test accounts.");
  manifest.accounts.forEach((account, index) => {
    const role = index === 0 ? "unverified" : "verified";
    requireProbe(account.role === role && account.uid === `billing_probe_${manifest.runId}_${index}` &&
      account.email === `${account.uid}@billing-test.invalid` && typeof account.password === "string" && account.password.length >= 24,
    "Refusing to use or clean an account outside the generated test namespace.");
  });
  return manifest;
}
function loadManifest(projectId) {
  requireProbe(fs.existsSync(MANIFEST), "Dedicated accounts are not prepared. Run billing:online:prepare first.");
  return validateManifest(JSON.parse(fs.readFileSync(MANIFEST, "utf8")), projectId);
}
function normalizeRules(source) { return source.replace(/\r\n/g, "\n").trim(); }
async function adminJson(credential, url) {
  const token = await credential.getAccessToken();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` }, redirect: "error", signal: AbortSignal.timeout(15000) });
  requireProbe(response.ok, `Management API refused the read (HTTP ${response.status}). Check login and project permissions.`);
  return response.json();
}
function localCredential() {
  // ADC is the supported default. Existing CLI login is an explicit optional adapter.
  const cliDir = process.env.BILLING_VERIFY_FIREBASE_TOOLS_DIR;
  if (!cliDir) return { credential: applicationDefault(), dispose() {} };
  try {
    const cliRequire = createRequire(path.resolve(cliDir, "package.json"));
    const { logger } = cliRequire("./lib/logger");
    logger.silent = true;
    const account = cliRequire("./lib/auth").getProjectDefaultAccount(ROOT);
    requireProbe(account?.tokens?.refresh_token, "No Firebase CLI login. Run npx firebase-tools login --reauth locally.");
    const api = cliRequire("./lib/api");
    // Firestore Admin requires real ADC/certificate credentials. A custom object
    // implementing only getAccessToken is accepted by Auth but rejected by Firestore.
    return cliAdc({ type: "authorized_user", client_id: api.clientId(), client_secret: api.clientSecret(), refresh_token: account.tokens.refresh_token });
  } catch (error) {
    if (error instanceof ProbeError) throw error;
    throw new ProbeError("Firebase CLI credential adapter failed. Check the installed CLI package path/version.");
  }
}
function cliAdc(credentials) {
  const file = path.join(LOCAL, `cli-adc-${randomUUID()}.json`);
  const previous = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const dispose = () => {
    if (previous === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    else process.env.GOOGLE_APPLICATION_CREDENTIALS = previous;
    fs.rmSync(file, { force: true });
  };
  try {
    save(file, credentials, true);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
    return { credential: applicationDefault(), dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
async function cloudPreflight(config, credential, record) {
  for (const name of ["syncSubscription", "revenueCatWebhook"]) {
    const deployed = await adminJson(credential, `https://cloudfunctions.googleapis.com/v2/projects/${config.projectId}/locations/${REGION}/functions/${name}`);
    requireProbe(deployed.state === "ACTIVE", "A billing function is not ACTIVE.");
    assertDisabled(deployed.serviceConfig?.environmentVariables);
    record(`${name}: deployed billing/sandbox disabled, mappings empty`);
  }
  const release = await adminJson(credential, `https://firebaserules.googleapis.com/v1/projects/${config.projectId}/releases/cloud.firestore`);
  requireProbe(typeof release.rulesetName === "string" && release.rulesetName.startsWith(`projects/${config.projectId}/rulesets/`), "Unexpected ruleset reference.");
  const ruleset = await adminJson(credential, `https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
  const files = ruleset.source?.files;
  const local = normalizeRules(fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8"));
  requireProbe(Array.isArray(files) && files.length === 1 && typeof files[0].content === "string" && normalizeRules(files[0].content) === local,
    "Deployed Firestore rules differ from firestore.rules. Review before preparing fixtures or attempting client writes; nothing was deployed.");
  record("deployed Firestore rules match repository", { sha256: createHash("sha256").update(local).digest("hex") });
}
function newManifest(projectId) {
  const runId = randomUUID().replaceAll("-", "");
  return { version: 1, projectId, runId, createdAt: new Date().toISOString(), accounts: ["unverified", "verified"].map((role, index) => {
    const uid = `billing_probe_${runId}_${index}`;
    return { role, uid, email: `${uid}@billing-test.invalid`, password: randomBytes(32).toString("base64url"), authCreated: false };
  }) };
}
function fixture(manifest) { return { ...INACTIVE, billingVerificationRunId: manifest.runId }; }
function stateFixture(manifest) { return { requestDateMs: 0, billingVerificationRunId: manifest.runId }; }
async function prepare(config, admin, record) {
  requireProbe(!fs.existsSync(MANIFEST), "Account manifest already exists. Run verification or cleanup; it will not be overwritten.");
  const manifest = newManifest(config.projectId);
  save(MANIFEST, manifest, true); // Persist recovery information before any remote creation.
  for (const account of manifest.accounts) {
    await getAuth(admin).createUser({ uid: account.uid, email: account.email, password: account.password, emailVerified: account.role === "verified", displayName: "Billing verification fixture" });
    account.authCreated = true;
    save(MANIFEST, manifest);
    await getAdminFirestore(admin).doc(`parents/${account.uid}`).create(fixture(manifest));
    await getAdminFirestore(admin).doc(`billingSyncState/${account.uid}`).create(stateFixture(manifest));
    record(`${account.role}: dedicated Auth account and inactive fixtures prepared`);
  }
  record("verified flag seeded by Admin; mailbox delivery/link flow remains untested");
}
async function expectDenied(operation) {
  try { await operation(); }
  catch (error) {
    if (error?.code === "permission-denied") return;
    throw new ProbeError("Expected permission-denied; received a different SDK error.");
  }
  throw new ProbeError("SECURITY FAILURE: client operation unexpectedly succeeded.");
}
async function expectCallable(operation, code) {
  try { await operation(); }
  catch (error) {
    const known = ["unauthenticated", "permission-denied", "failed-precondition", "unavailable", "internal", "not-found", "invalid-argument", "deadline-exceeded"];
    const received = known.map(value => `functions/${value}`).includes(error?.code) ? error.code : "unrecognized SDK error";
    requireProbe(error?.code === `functions/${code}`, `Callable did not return expected ${code}; received ${received}.`);
    return;
  }
  throw new ProbeError("SECURITY FAILURE: disabled callable unexpectedly succeeded. Further checks stopped.");
}
async function deniedWriteWithRestore(operation, adminRef, baseline) {
  try { await expectDenied(operation); }
  finally {
    if (!isDeepStrictEqual((await adminRef.get()).data(), baseline)) await adminRef.set(baseline);
  }
}
async function assertFixtures(db, manifest) {
  for (const account of manifest.accounts) {
    const parent = await db.doc(`parents/${account.uid}`).get();
    const state = await db.doc(`billingSyncState/${account.uid}`).get();
    requireProbe(parent.exists && isDeepStrictEqual(parent.data(), fixture(manifest)) && state.exists && isDeepStrictEqual(state.data(), stateFixture(manifest)), "Dedicated fixtures changed or are incomplete. Clean up and prepare again.");
  }
}
async function withClient(config, account, operation) {
  const app = initializeApp(config.firebase, `billing-probe-${randomUUID()}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const db = getFirestore(app);
  try {
    if (account) {
      const { user } = await signInWithEmailAndPassword(auth, account.email, account.password);
      await user.reload();
      const token = await user.getIdTokenResult(true); // Never reuse pre-verification claims.
      requireProbe(user.uid === account.uid && token.claims.email_verified === (account.role === "verified"), "Signed-in UID or refreshed email_verified claim does not match test role.");
    }
    return await operation({ db, callable: httpsCallable(getFunctions(app, REGION), "syncSubscription", { timeout: 15000 }) });
  } finally {
    await signOut(auth).catch(() => {});
    await terminate(db);
    await deleteApp(app);
  }
}
async function checkRules(config, admin, manifest, record) {
  const adminDb = getAdminFirestore(admin);
  // Admin only prepares/restores fixtures; every assertion uses the client SDK.
  await assertFixtures(adminDb, manifest);
  for (const [index, account] of manifest.accounts.entries()) {
    await withClient(config, account, async ({ db }) => {
      const own = doc(db, "parents", account.uid);
      requireProbe((await getDoc(own)).exists(), "Client could not read its own existing profile.");
      record(`${account.role}: client reads own existing profile`);
      await expectDenied(() => getDoc(doc(db, "parents", manifest.accounts[1 - index].uid)));
      record(`${account.role}: client cannot read other test profile`);
      for (const field of Object.keys(INACTIVE)) {
        // All probes actually change the value; none grants paid access.
        const value = field === "subscription" || field === "foundingMember" ? null : "2000-01-01T00:00:00.000Z";
        await deniedWriteWithRestore(() => updateDoc(own, { [field]: value }), adminDb.doc(`parents/${account.uid}`), fixture(manifest));
        record(`${account.role}: client cannot update ${field}`);
      }
      const privateDoc = doc(db, "billingSyncState", account.uid);
      await expectDenied(() => getDoc(privateDoc));
      record(`${account.role}: client cannot read existing billingSyncState`);
      await deniedWriteWithRestore(() => setDoc(privateDoc, { ...stateFixture(manifest), requestDateMs: 1 }), adminDb.doc(`billingSyncState/${account.uid}`), stateFixture(manifest));
      record(`${account.role}: client cannot write billingSyncState`);
    });
  }
  await assertFixtures(adminDb, manifest);
  record("all dedicated fixtures remain unchanged after client probes");
}
async function checkRevenueCat(config, manifest, record) {
  const secrets = readEnv(resolveSecretFile(config.projectId, config.envFile));
  requireProbe(secrets.REVENUECAT_SECRET_API_KEY, "Missing local RevenueCat secret; query not performed.");
  const uid = manifest.accounts[1].uid;
  // RevenueCat documents GET as Get or Create Customer; only use the test UID.
  const payload = await fetchSubscriber(uid, secrets.REVENUECAT_SECRET_API_KEY, async (url, options) => {
    const response = await fetch(url, { ...options, redirect: "error" });
    requireProbe(response.ok, `RevenueCat query failed (HTTP ${response.status}); no response body or secret logged.`);
    return response;
  });
  const subscriber = payload?.subscriber;
  const isMap = value => value && typeof value === "object" && !Array.isArray(value);
  requireProbe(Number.isFinite(payload?.request_date_ms) && isMap(subscriber?.entitlements) && isMap(subscriber?.subscriptions) && subscriber.original_app_user_id === uid,
    "RevenueCat response does not match the expected v1 subscriber structure/identity.");
  requireProbe(Object.keys(subscriber.entitlements).length === 0 && Object.keys(subscriber.subscriptions).length === 0, "Unexpected subscriptions on a fresh dedicated RevenueCat customer.");
  record("RevenueCat v1 authenticated response: matching test identity, empty entitlements/subscriptions");
}
async function checkWebhook(config, manifest, record) {
  const secrets = readEnv(resolveSecretFile(config.projectId, config.envFile));
  requireProbe(secrets.REVENUECAT_WEBHOOK_SECRET, "Missing local webhook secret; authenticated webhook check not performed.");
  const url = `https://${REGION}-${config.projectId}.cloudfunctions.net/revenueCatWebhook`;
  const event = { event: { id: `billing-probe-${randomUUID()}`, type: "TEST", app_user_id: manifest.accounts[1].uid } };
  for (const [label, method, authorization, body, expected] of [
    ["GET", "GET", null, undefined, 405],
    ["missing bearer", "POST", null, {}, 401],
    ["wrong bearer", "POST", "Bearer invalid-billing-probe", {}, 401],
    ["missing event", "POST", `Bearer ${secrets.REVENUECAT_WEBHOOK_SECRET}`, {}, 400],
    ["disabled TEST event", "POST", `Bearer ${secrets.REVENUECAT_WEBHOOK_SECRET}`, event, 503],
  ]) {
    const response = await fetch(url, { method, redirect: "error", headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    await response.arrayBuffer();
    requireProbe(response.status === expected, `Webhook ${label} did not return HTTP ${expected}.`);
    record(`webhook ${label}: HTTP ${expected}`);
  }
}
async function run(config, admin, manifest, record) {
  await assertFixtures(getAdminFirestore(admin), manifest);
  // Stop immediately if the verified callable doesn't reject before syncing.
  for (const account of [manifest.accounts[1], manifest.accounts[0]]) {
    const code = account.role === "verified" ? "failed-precondition" : "permission-denied";
    await withClient(config, account, async ({ callable }) => {
      await expectCallable(() => callable({}), code);
      record(`${account.role}: callable ${code} with fresh ID token`);
    });
  }
  await withClient(config, null, async ({ callable }) => {
    await expectCallable(() => callable({}), "unauthenticated");
    record("signed-out callable: unauthenticated");
  });
  const failures = [];
  for (const [label, operation] of [
    ["RevenueCat", () => checkRevenueCat(config, manifest, record)],
    ["webhook", () => checkWebhook(config, manifest, record)],
    ["Firestore", () => checkRules(config, admin, manifest, record)],
  ]) {
    try { await operation(); }
    catch (error) {
      const failure = `${label}: ${safeFailure(error)}`;
      failures.push(failure);
      record(`${label}: FAILED`, { passed: false, failure });
    }
  }
  requireProbe(failures.length === 0, failures.join(" "));
}
async function cleanup(config, admin, record) {
  const manifest = loadManifest(config.projectId);
  for (const account of manifest.accounts) {
    // Only exact generated IDs and fixture-owned documents can be removed.
    for (const collection of ["parents", "billingSyncState"]) {
      const ref = getAdminFirestore(admin).doc(`${collection}/${account.uid}`);
      await getAdminFirestore(admin).runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) {
          requireProbe(snapshot.data().billingVerificationRunId === manifest.runId, "Cleanup refused a document without the matching test marker.");
          transaction.delete(ref);
        }
      });
    }
    try {
      const user = await getAuth(admin).getUser(account.uid);
      requireProbe(user.email === account.email, "Cleanup refused an Auth identity mismatch.");
      await getAuth(admin).deleteUser(account.uid);
    } catch (error) { if (error.code !== "auth/user-not-found") throw error; }
    record(`${account.role}: dedicated Firebase fixtures/account removed`);
  }
  fs.unlinkSync(MANIFEST);
  record("local account passwords removed; cleanup does not delete RevenueCat customers");
}
async function main({ credential, command = process.argv[2] || "preflight" } = {}) {
  requireProbe(process.argv.length <= 3, "Only a command is accepted. Never pass credentials as command-line arguments.");
  requireProbe(["preflight", "prepare", "run", "cleanup"].includes(command), "Use preflight, prepare, run, or cleanup.");
  setLogLevel("silent");
  const config = loadConfig(command);
  const report = { projectId: config.projectId, startedAt: new Date().toISOString(), command, checks: [], success: false };
  const record = (name, details = {}) => { report.checks.push({ name, passed: true, ...details }); console.log(`${details.passed === false ? "FAIL" : "PASS"} ${name}`); };
  const localAuth = credential ? { credential, dispose() {} } : localCredential();
  credential = localAuth.credential;
  let admin;
  try {
    admin = initializeAdmin({ projectId: config.projectId, credential }, `billing-probe-admin-${randomUUID()}`);
    console.log(`Project: ${config.projectId}; billing remains disabled; command: ${command}`);
    // Cleanup remains possible even if cloud configuration or rules have changed.
    if (command === "cleanup") await cleanup(config, admin, record);
    else {
      await cloudPreflight(config, credential, record);
      if (command === "prepare") await prepare(config, admin, record);
      if (command === "run") await run(config, admin, loadManifest(config.projectId), record);
    }
    report.success = true;
  } catch (error) {
    report.failure = safeFailure(error);
    throw new ProbeError(report.failure);
  } finally {
    report.finishedAt = new Date().toISOString();
    try { save(path.join(LOCAL, `${command}-result.json`), report); }
    finally {
      try { if (admin) await deleteAdmin(admin); }
      finally { localAuth.dispose(); }
    }
  }
}
function safeFailure(error) {
  if (String(error?.message || "").includes("invalid_grant") || error?.response?.data?.error === "invalid_grant") {
    return "Google OAuth rejected the cached login (invalid_grant). Run npx firebase-tools login --reauth locally.";
  }
  return error instanceof ProbeError ? error.message : "Request failed. Check local credentials, network and project permissions; remote errors are intentionally redacted.";
}
if (require.main === module) {
  main().catch(error => {
    console.error(`FAIL ${error instanceof ProbeError ? error.message : "Local configuration/dependency error (details redacted)."}`);
    process.exitCode = 1;
  });
}
module.exports = { main, assertDisabled, validateManifest, newManifest, normalizeRules, expectDenied, expectCallable, deniedWriteWithRestore, safeFailure, cliAdc, resolveEnvFile, resolveSecretFile, ProbeError };
