/**
 * Premium / subscription access helpers.
 *
 * Activity 1 in each hub is free.
 * Activities 2+ require an active parent subscription entitlement.
 */

import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import {
  getSubscriptionEntitlement,
} from "@/services/subscription";

export const FREE_ACTIVITY_NUMBER = 1;

export function isPremiumActivity(
  activityNumber: number,
): boolean {
  return activityNumber > FREE_ACTIVITY_NUMBER;
}

/**
 * True when the activity requires paywall navigation
 * for a parent who does not have an active subscription.
 */
export function requiresPaywall(
  activityNumber: number,
  hasActiveSubscription: boolean,
): boolean {
  return (
    isPremiumActivity(activityNumber) &&
    !hasActiveSubscription
  );
}

export function usePremiumAccess() {
  const { user } = useAuth();
  const [hasPremium, setHasPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!user?.uid) {
      setHasPremium(false);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const entitlement =
        await getSubscriptionEntitlement(user.uid);
      if (version !== requestVersion.current) return;
      setHasPremium(entitlement.isActive);
    } catch (error) {
      console.warn(
        "Unable to load subscription entitlement:",
        error,
      );
      if (version === requestVersion.current) setHasPremium(false);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    void refresh();
    const listener = AppState.addEventListener("change", state => {
      if (state === "active") void refresh();
    });
    return () => {
      requestVersion.current++;
      listener.remove();
    };
  }, [refresh]));

  return {
    hasPremium,
    loading,
    refresh,
  };
}
