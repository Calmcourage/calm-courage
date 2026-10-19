/**
 * Parent subscription entitlement service.
 *
 * Reads remain client-side. Writes go through Cloud Functions because
 * Firestore rules block clients from granting themselves a subscription.
 */

import {
  doc,
  getDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "@/config/firebase";

export type SubscriptionPlan =
  | "trial"
  | "monthly"
  | "yearly";

export type SubscriptionEntitlement = {
  plan: SubscriptionPlan;
  foundingMember: boolean;
  priceLabel: string | null;
  renewsAt: Date | null;
  trialEndsAt: Date | null;
  isActive: boolean;
  platform: "ios" | "android" | null;
  cancelledAt: Date | null;
};

const DEFAULT_ENTITLEMENT: SubscriptionEntitlement = {
  plan: "trial",
  foundingMember: false,
  priceLabel: null,
  renewsAt: null,
  trialEndsAt: null,
  isActive: false,
  platform: null,
  cancelledAt: null,
};

function parentRef(parentUid: string) {
  return doc(db, "parents", parentUid);
}

function parseDateValue(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function computeIsActive(
  plan: SubscriptionPlan,
  renewsAt: Date | null,
): boolean {
  // The existing schema uses renewsAt as the entitlement expiry, including
  // trials. A missing/expired value must not be bypassed by a trial date.
  return (
    (plan === "monthly" || plan === "yearly") &&
    renewsAt !== null &&
    renewsAt.getTime() > Date.now()
  );
}

export async function getSubscriptionEntitlement(
  parentUid: string,
): Promise<SubscriptionEntitlement> {
  const snapshot = await getDoc(parentRef(parentUid));

  if (!snapshot.exists()) {
    return { ...DEFAULT_ENTITLEMENT };
  }

  const data = snapshot.data() as Record<string, unknown>;

  const plan: SubscriptionPlan =
    data.subscription === "monthly" ||
    data.subscription === "yearly"
      ? data.subscription
      : "trial";

  const renewsAt = parseDateValue(
    data.subscriptionRenewsAt ?? data.nextBillingDate,
  );
  const trialEndsAt = parseDateValue(
    data.subscriptionTrialEndsAt ?? data.trialEndsAt,
  );

  return {
    plan,
    foundingMember: data.foundingMember === true,
    priceLabel:
      typeof data.subscriptionPriceLabel === "string"
        ? data.subscriptionPriceLabel.trim()
        : null,
    renewsAt,
    trialEndsAt,
    isActive: computeIsActive(plan, renewsAt),
    platform:
      data.subscriptionPlatform === "ios" || data.subscriptionPlatform === "android"
        ? data.subscriptionPlatform
        : null,
    cancelledAt: parseDateValue(data.subscriptionCancelledAt),
  };
}

export type ActivateSubscriptionInput = {
  plan?: "monthly" | "yearly";
  foundingMember?: boolean;
  priceLabel?: string;
  trialDays?: number;
  source?: string;
  platform?: "ios" | "android" | "web" | string;
  receiptId?: string;
};

/**
 * Activates subscription via Cloud Function (Admin SDK write).
 */
export async function activateSubscription(
  _parentUid: string,
  input: ActivateSubscriptionInput = {},
): Promise<SubscriptionEntitlement> {
  const callable = httpsCallable(
    functions,
    "activateSubscription",
  );

  await callable({
    plan: input.plan ?? "monthly",
    foundingMember: input.foundingMember !== false,
    priceLabel: input.priceLabel,
    trialDays: input.trialDays ?? 7,
    source: input.source ?? "paywall",
    platform: input.platform ?? null,
    receiptId: input.receiptId ?? null,
  });

  const userUid = _parentUid;
  return getSubscriptionEntitlement(userUid);
}

export async function clearSubscription(
  parentUid: string,
): Promise<void> {
  const callable = httpsCallable(
    functions,
    "clearSubscription",
  );

  await callable({});
  await getSubscriptionEntitlement(parentUid);
}
