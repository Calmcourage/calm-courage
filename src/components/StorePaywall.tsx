import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { auth } from "@/config/firebase";
import { consentDocuments } from "@/constants/consent";
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from "@/constants/legalUrls";
import { useAuth } from "@/contexts/AuthContext";
import { useParentAccess } from "@/contexts/ParentAccessContext";
import { getSubscriptionEntitlement, type SubscriptionEntitlement } from "@/services/subscription";
import { loadStorePlans, purchaseStorePlan, purchaseWasCancelled, restoreStorePurchases, storePurchasesAvailable, type StorePlan } from "@/services/storePurchases";
import { getSubscriptionPresentation, getSubscriptionStore } from "@/utils/subscriptionPresentation";

export default function StorePaywall() {
  const { user } = useAuth();
  const { parentAccessGranted } = useParentAccess();
  const [plans, setPlans] = useState<StorePlan[]>([]);
  const [entitlement, setEntitlement] = useState<SubscriptionEntitlement | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [termsVisible, setTermsVisible] = useState(false);
  const refreshCurrent = useRef<(() => Promise<void>) | null>(null);
  const operationRunning = useRef(false);
  const screenVersion = useRef(0);
  const canManage = Boolean(user?.emailVerified && parentAccessGranted);
  const available = storePurchasesAvailable();
  const subscription = entitlement ? getSubscriptionPresentation(entitlement, Platform.OS) : null;
  const store = subscription?.store ?? getSubscriptionStore(null, Platform.OS);

  useFocusEffect(useCallback(() => {
    const version = ++screenVersion.current;
    let active = true;
    let requestVersion = 0;
    setPlans([]);
    setEntitlement(null);
    setMessage("");
    if (!canManage || !user) return;
    const uid = user.uid;
    const isCurrent = (request: number) => active && version === screenVersion.current &&
      request === requestVersion && auth.currentUser?.uid === uid;

    async function refresh() {
      if (operationRunning.current) return;
      const request = ++requestVersion;
      setLoading(true);
      setMessage("");
      try {
        // Existing members can still view/manage billing when checkout is off.
        const current = await getSubscriptionEntitlement(uid);
        if (!isCurrent(request)) return;
        setEntitlement(current);
        if (!available) return;
        const items = await loadStorePlans(uid);
        const confirmed = await getSubscriptionEntitlement(uid);
        if (!isCurrent(request)) return;
        setEntitlement(confirmed);
        setPlans(items);
        if (!items.length && !confirmed.isActive) {
          setMessage("No subscription plans are available right now. Please try again later.");
        }
      } catch {
        if (isCurrent(request)) setMessage("We couldn’t refresh subscription details. Please try again.");
      } finally {
        if (isCurrent(request)) setLoading(false);
      }
    }

    refreshCurrent.current = refresh;
    void refresh();
    const listener = AppState.addEventListener("change", state => {
      if (state === "active") void refresh();
    });
    return () => {
      active = false;
      screenVersion.current++;
      refreshCurrent.current = null;
      listener.remove();
    };
  }, [available, canManage, user]));

  async function complete(plan?: StorePlan) {
    if (!user || !canManage || !available || loading || operationRunning.current ||
      (plan && subscription?.isActive)) return;
    const uid = user.uid;
    const version = screenVersion.current;
    operationRunning.current = true;
    setBusy(true);
    setMessage("");
    try {
      const confirmed = plan
        ? await purchaseStorePlan(uid, plan)
        : await restoreStorePurchases(uid);
      if (auth.currentUser?.uid !== uid || screenVersion.current !== version) return;
      setEntitlement(confirmed);
      if (confirmed.isActive) {
        Alert.alert("Subscription active", "Your premium activities are now available.", [
          { text: "Continue", onPress: () => router.back() },
        ]);
      } else {
        setMessage(plan
          ? "Your subscription is not active yet. If your purchase completed, use Restore Purchases to check again."
          : "No active subscription was found for this account.");
      }
    } catch (error) {
      if (auth.currentUser?.uid === uid && screenVersion.current === version && !purchaseWasCancelled(error)) {
        setMessage("We couldn’t confirm your subscription. If the store charged you, use Restore Purchases before trying to buy again.");
      }
    } finally {
      operationRunning.current = false;
      setBusy(false);
    }
  }

  async function openUrl(url: string) {
    try { await Linking.openURL(url); }
    catch { Alert.alert("Unable to open link", "Please try again later."); }
  }

  const disabled = busy || loading;
  return (
    <>
      <ScrollView contentContainerStyle={styles.screen}>
        <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>Back</Text></Pressable>
        <Text style={styles.title}>Unlock Unlimited Family Moments</Text>
        <Image source={require("../../assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.benefits}>Access to the activity library{"\n\n"}Progress tracking and reports{"\n\n"}Personalized recommendations</Text>
        {!available && <Text style={styles.body}>Subscriptions are currently unavailable. Please check back later. Existing subscriptions can still be managed through your store account.</Text>}
        {!canManage ? (
          <>
            <Text style={styles.body}>A verified parent account is required to manage subscriptions.</Text>
            <Pressable style={styles.button} onPress={() => {
              if (!user) router.push("/login");
              else if (!user.emailVerified) router.push("/verify-email");
              else router.push({ pathname: "/parent-verification", params: { returnTo: "/paywall" } });
            }} accessibilityRole="button"><Text style={styles.buttonText}>Continue as parent</Text></Pressable>
          </>
        ) : (
          <>
            {loading && <ActivityIndicator color="#2F448B" accessibilityLabel="Loading subscriptions" />}
            {subscription?.hasPlan && (
              <View style={styles.card}>
                <Text style={styles.planTitle}>{subscription.title}</Text>
                <Text style={styles.body}>{subscription.status}</Text>
                {!!subscription.date && <Text style={styles.body}>{subscription.dateLabel}: {subscription.date.toLocaleDateString()}</Text>}
              </View>
            )}
            {available && !subscription?.isActive && plans.map(plan => (
              <View key={plan.id} style={styles.card}>
                <Text style={styles.planTitle}>{plan.title}</Text>
                <Text style={styles.price}>{plan.price} / {plan.period}</Text>
                <Pressable style={[styles.button, disabled && styles.disabled]} disabled={disabled} onPress={() => void complete(plan)} accessibilityRole="button" accessibilityLabel={`Subscribe to ${plan.title}, ${plan.price} per ${plan.period}`}>
                  <Text style={styles.buttonText}>Subscribe</Text>
                </Pressable>
              </View>
            ))}
            {busy && <ActivityIndicator color="#2F448B" accessibilityLabel="Confirming subscription" />}
            {available && <Pressable disabled={disabled} onPress={() => void complete()} accessibilityRole="button" style={disabled && styles.disabled}><Text style={styles.link}>Restore Purchases</Text></Pressable>}
            {!!store.url && <Pressable disabled={disabled} onPress={() => void openUrl(store.url!)} accessibilityRole="link" style={disabled && styles.disabled}><Text style={styles.link}>Manage in {store.name}</Text></Pressable>}
            {available && <Text style={styles.body}>The store will confirm the price and any eligible trial before payment. Subscriptions renew automatically unless you cancel renewal in the store account used to subscribe.</Text>}
            {!!message && <Text style={styles.body} accessibilityLiveRegion="polite">{message}</Text>}
            {!!message && !disabled && <Pressable onPress={() => void refreshCurrent.current?.()} accessibilityRole="button"><Text style={styles.link}>Try Again</Text></Pressable>}
          </>
        )}
        <Pressable onPress={() => PRIVACY_POLICY_URL ? void openUrl(PRIVACY_POLICY_URL) : router.push("/privacy-policy")} accessibilityRole="link"><Text style={styles.link}>Privacy Policy</Text></Pressable>
        <Pressable onPress={() => TERMS_OF_USE_URL ? void openUrl(TERMS_OF_USE_URL) : setTermsVisible(true)} accessibilityRole="link"><Text style={styles.link}>Terms of Use</Text></Pressable>
      </ScrollView>
      <Modal visible={termsVisible} animationType="slide" onRequestClose={() => setTermsVisible(false)}>
        <ScrollView contentContainerStyle={styles.screen}>
          <Pressable onPress={() => setTermsVisible(false)} accessibilityRole="button"><Text style={styles.link}>Close</Text></Pressable>
          <Text style={styles.planTitle}>{consentDocuments.termsOfUse.title}</Text>
          <Text style={styles.terms}>{consentDocuments.termsOfUse.body}</Text>
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 28, paddingTop: 64, paddingBottom: 48, backgroundColor: "#F1F3F5", gap: 24 },
  title: { fontFamily: "Outfit", fontSize: 30, color: "#2F448B", textAlign: "center" },
  logo: { width: 177, height: 61, alignSelf: "center" },
  benefits: { fontFamily: "Literata", fontSize: 18, color: "#2F448B", lineHeight: 26 },
  card: { padding: 20, borderWidth: 2, borderColor: "#2F448B", borderRadius: 20, backgroundColor: "white", gap: 16 },
  planTitle: { fontFamily: "Outfit", fontSize: 20, color: "#2F448B", textAlign: "center" },
  price: { fontFamily: "OutfitBold", fontSize: 26, color: "#2F448B", textAlign: "center" },
  button: { padding: 18, borderRadius: 20, backgroundColor: "#E7D5EA" },
  buttonText: { fontFamily: "Outfit", fontSize: 20, color: "#2F448B", textAlign: "center" },
  body: { fontFamily: "Literata", color: "#2F448B", fontSize: 14, lineHeight: 22, textAlign: "center" },
  terms: { fontFamily: "Literata", color: "#2F448B", fontSize: 14, lineHeight: 22 },
  link: { color: "#2F448B", textDecorationLine: "underline", textAlign: "center", padding: 8 },
  disabled: { opacity: 0.5 },
});
