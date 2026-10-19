import type { SubscriptionEntitlement } from "@/services/subscription";

/** Use the purchase's store even when the parent changes device platforms. */
export function getSubscriptionStore(
  purchasePlatform: SubscriptionEntitlement["platform"],
  devicePlatform: string,
) {
  const platform = purchasePlatform ?? devicePlatform;
  if (platform === "ios") {
    return { name: "App Store", url: "https://apps.apple.com/account/subscriptions" };
  }
  if (platform === "android") {
    return { name: "Google Play", url: "https://play.google.com/store/account/subscriptions" };
  }
  return { name: "your app store", url: null };
}

export function getSubscriptionPresentation(
  entitlement: SubscriptionEntitlement,
  devicePlatform: string,
  now = Date.now(),
) {
  const store = getSubscriptionStore(entitlement.platform, devicePlatform);
  const hasPlan = entitlement.plan === "monthly" || entitlement.plan === "yearly";
  // Recheck cached dates so an expired record never displays as active.
  const isActive = hasPlan && entitlement.isActive &&
    entitlement.renewsAt !== null && entitlement.renewsAt.getTime() > now;
  const trialActive = isActive && entitlement.trialEndsAt !== null &&
    entitlement.trialEndsAt.getTime() > now;
  const status = !isActive
    ? "No active subscription"
    : entitlement.cancelledAt
      ? "Active\nRenewal canceled"
      : trialActive ? "Free trial active" : "Active subscription";

  return {
    store,
    hasPlan,
    isActive,
    status,
    title: `Calm Courage\n${entitlement.plan === "yearly" ? "Yearly" : "Monthly"} Plan`,
    // A legacy QA price is not evidence of the customer's current store price.
    priceDescription: `View billing in\n${store.name}`,
    dateLabel: isActive ? "Access until" : "Access ended",
    date: entitlement.renewsAt,
    managementLabel: store.url ? `Manage in ${store.name}` : "Manage subscription",
  };
}
