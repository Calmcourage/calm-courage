/** Native billing only. Firestore entitlements are granted by the server. */
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import { httpsCallable } from "firebase/functions";
import type { PurchasesPackage } from "react-native-purchases";

import { auth, functions } from "@/config/firebase";
import { getSubscriptionEntitlement } from "@/services/subscription";

export type StorePlan = {
  id: string;
  title: string;
  price: string;
  period: "month" | "year";
  package: PurchasesPackage;
};

const enabled = process.env.EXPO_PUBLIC_ENABLE_STORE_PURCHASES === "true";
const apiKey = Platform.OS === "ios"
  ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim()
  : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim();

export function storePurchasesAvailable(): boolean {
  return enabled &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
    (Platform.OS === "ios" || Platform.OS === "android") &&
    Boolean(apiKey?.startsWith(Platform.OS === "ios" ? "appl_" : "goog_"));
}

function assertUser(uid: string) {
  if (!uid || auth.currentUser?.uid !== uid || !auth.currentUser.emailVerified) {
    throw new Error("Please sign in with your verified parent account.");
  }
}

// Serialize SDK identity changes and purchases across screen mounts/accounts.
let queue: Promise<unknown> = Promise.resolve();
function withStore<T>(uid: string, operation: (sdk: typeof import("react-native-purchases").default) => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    assertUser(uid);
    if (!storePurchasesAvailable()) {
      throw new Error("Subscriptions are not available yet. Please check back later.");
    }
    // Do not load the SDK's Expo Go mock or touch native modules when disabled.
    const sdk = (await import("react-native-purchases")).default;
    if (!(await sdk.isConfigured())) {
      sdk.configure({ apiKey: apiKey!, appUserID: uid });
    } else if (await sdk.getAppUserID() !== uid) {
      await sdk.logIn(uid);
    }
    assertUser(uid);
    const result = await operation(sdk);
    assertUser(uid);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

async function sync(uid: string) {
  assertUser(uid);
  // The server uses request.auth.uid; no client receipt/plan/expiry is trusted.
  const response = await httpsCallable<Record<string, never>, { productIds: { ios: string[]; android: string[] } }>(functions, "syncSubscription")({});
  assertUser(uid);
  return {
    entitlement: await getSubscriptionEntitlement(uid),
    productIds: response.data.productIds?.[Platform.OS === "ios" ? "ios" : "android"] ?? [],
  };
}

export async function loadStorePlans(uid: string): Promise<StorePlan[]> {
  return withStore(uid, async sdk => {
    // A missing/disabled backend stops checkout before any money can be spent.
    const { productIds } = await sync(uid);
    const offerings = await sdk.getOfferings();
    return (offerings.current?.availablePackages ?? [])
      .filter(item => productIds.includes(item.product.identifier) && ["P1M", "P1Y"].includes(item.product.subscriptionPeriod ?? ""))
      .map(item => ({
        id: item.identifier,
        title: item.product.title,
        price: item.product.priceString,
        period: item.product.subscriptionPeriod === "P1Y" ? "year" : "month",
        package: item,
      }));
  });
}

export async function purchaseStorePlan(uid: string, plan: StorePlan) {
  return withStore(uid, async sdk => {
    const { productIds, entitlement } = await sync(uid);
    // Another device or a delayed renewal may have activated access meanwhile.
    // Plan changes belong in store management, not a second checkout here.
    if (entitlement.isActive) return entitlement;
    if (!productIds.includes(plan.package.product.identifier)) {
      throw new Error("This subscription is not available. Please reload the offers.");
    }
    assertUser(uid);
    await sdk.purchasePackage(plan.package);
    // Never grant access from CustomerInfo or the purchase result on the device.
    return (await sync(uid)).entitlement;
  });
}

export async function restoreStorePurchases(uid: string) {
  return withStore(uid, async sdk => {
    await sync(uid);
    assertUser(uid);
    await sdk.restorePurchases();
    return (await sync(uid)).entitlement;
  });
}

export function purchaseWasCancelled(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "userCancelled" in error && error.userCancelled === true;
}
