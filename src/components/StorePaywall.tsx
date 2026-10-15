import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from "@/constants/legalUrls";
import { useAuth } from "@/contexts/AuthContext";
import { useParentAccess } from "@/contexts/ParentAccessContext";
import { loadStorePlans, purchaseStorePlan, purchaseWasCancelled, restoreStorePurchases, type StorePlan } from "@/services/storePurchases";
import { auth } from "@/config/firebase";

export default function StorePaywall() {
  const { user } = useAuth();
  const { parentAccessGranted } = useParentAccess();
  const [plans, setPlans] = useState<StorePlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const operationRunning = useRef(false);
  const canPurchase = Boolean(user?.emailVerified && parentAccessGranted);

  useFocusEffect(useCallback(() => {
    let active = true;
    setPlans([]);
    setMessage("");
    if (!canPurchase || !user) return;
    setLoading(true);
    void loadStorePlans(user.uid).then(items => {
      if (!active) return;
      setPlans(items);
      if (!items.length) setMessage("Subscriptions are not available yet. Please check back later.");
    }).catch(() => {
      if (active) setMessage("Subscriptions are currently unavailable. Please try again later.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canPurchase, user]));

  async function complete(plan?: StorePlan) {
    if (!user || !canPurchase || operationRunning.current) return;
    const uid = user.uid;
    operationRunning.current = true;
    setBusy(true);
    setMessage("");
    try {
      const entitlement = plan
        ? await purchaseStorePlan(uid, plan)
        : await restoreStorePurchases(uid);
      if (auth.currentUser?.uid !== uid) return;
      if (entitlement.isActive) {
        Alert.alert("Subscription active", "Your premium activities are now available.", [
          { text: "Continue", onPress: () => router.back() },
        ]);
      } else {
        setMessage(plan
          ? "Your subscription is not active yet. If your purchase completed, use Restore Purchases to check again."
          : "No active subscription was found for this account.");
      }
    } catch (error) {
      if (auth.currentUser?.uid === uid && !purchaseWasCancelled(error)) {
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

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>Back</Text></Pressable>
      <Text style={styles.title}>Unlock Unlimited Family Moments</Text>
      <Image source={require("../../assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.benefits}>Access to the activity library{"\n\n"}Progress tracking and reports{"\n\n"}Personalized recommendations</Text>
      {!canPurchase ? (
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
          {loading && <ActivityIndicator color="#2F448B" />}
          {plans.map(plan => (
            <View key={plan.id} style={styles.card}>
              <Text style={styles.planTitle}>{plan.title}</Text>
              <Text style={styles.price}>{plan.price} / {plan.period}</Text>
              <Pressable style={[styles.button, (busy || loading) && styles.disabled]} disabled={busy || loading} onPress={() => void complete(plan)} accessibilityRole="button">
                <Text style={styles.buttonText}>Subscribe</Text>
              </Pressable>
            </View>
          ))}
          {busy && <ActivityIndicator color="#2F448B" />}
          <Pressable disabled={busy || loading} onPress={() => void complete()} accessibilityRole="button"><Text style={styles.link}>Restore Purchases</Text></Pressable>
          <Text style={styles.body}>Payment and any eligible trial will be confirmed by the store. Subscriptions renew automatically unless canceled through your App Store or Google Play account.</Text>
        </>
      )}
      {!!message && <Text style={styles.body} accessibilityLiveRegion="polite">{message}</Text>}
      <Pressable onPress={() => PRIVACY_POLICY_URL ? void openUrl(PRIVACY_POLICY_URL) : router.push("/privacy-policy")} accessibilityRole="link"><Text style={styles.link}>Privacy Policy</Text></Pressable>
      {!!TERMS_OF_USE_URL && <Pressable onPress={() => void openUrl(TERMS_OF_USE_URL)} accessibilityRole="link"><Text style={styles.link}>Terms of Use</Text></Pressable>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 28, paddingTop: 64, paddingBottom: 48, backgroundColor: "#F1F3F5", gap: 24 },
  title: { fontFamily: "Outfit", fontSize: 30, color: "#2F448B", textAlign: "center" },
  logo: { width: 177, height: 61, alignSelf: "center" },
  benefits: { fontFamily: "Literata", fontSize: 18, lineHeight: 26, color: "#2F448B" },
  card: { padding: 20, borderWidth: 2, borderColor: "#2F448B", borderRadius: 20, backgroundColor: "white", gap: 16 },
  planTitle: { fontFamily: "Outfit", fontSize: 20, color: "#2F448B", textAlign: "center" },
  price: { fontFamily: "OutfitBold", fontSize: 26, color: "#2F448B", textAlign: "center" },
  button: { padding: 18, borderRadius: 20, backgroundColor: "#E7D5EA" },
  buttonText: { fontFamily: "Outfit", fontSize: 20, color: "#2F448B", textAlign: "center" },
  body: { fontFamily: "Literata", color: "#2F448B", fontSize: 14, lineHeight: 22, textAlign: "center" },
  link: { color: "#2F448B", textDecorationLine: "underline", textAlign: "center", padding: 8 },
  disabled: { opacity: 0.5 },
});
