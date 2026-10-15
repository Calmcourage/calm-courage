/**
 * Subscription paywall shown before premium activities.
 *
 * Activity 1 in each game is free. Activities 2+ require an
 * active subscription entitlement on the parent profile.
 *
 * The purchase sheet still uses a Face ID preview control for
 * QA. On success it writes the founding-member trial to Firestore
 * so premium levels unlock. Replace that step with real Store
 * receipt validation before App Store release.
 */

import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors } from "@/constants/colors";
import StorePaywall from "@/components/StorePaywall";
import { storePurchasesAvailable } from "@/services/storePurchases";
import { QA_PURCHASE_ENABLED } from "@/constants/featureFlags";
import { useAuth } from "@/contexts/AuthContext";
import { activateSubscription } from "@/services/subscription";
import { x, y } from "@/utils/scaling";

import FaceIdIcon from "../../assets/icons/lock.svg";

const PAGE_BACKGROUND = "#F1F3F5";
const PRIMARY = "#2F448B";
const LIGHT_BLUE = "#DDEAEC";
const TRIAL_BUTTON = "#E7D5EA";

const LOGO = require(
  "../../assets/images/logo.png",
);

type BenefitRowProps = {
  top: number;
  text: string;
};

function BenefitRow({
  top,
  text,
}: BenefitRowProps) {
  return (
    <View
      style={[
        styles.benefitRow,
        {
          top: y(top),
        },
      ]}
    >
      <View style={styles.checkCircle}>
        <Text style={styles.checkMark}>
          ✓
        </Text>
      </View>

      <Text style={styles.benefitText}>
        {text}
      </Text>
    </View>
  );
}

type PurchasePreviewSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPaymentSuccess: () => void;
};

function PurchasePreviewSheet({
  visible,
  onClose,
  onPaymentSuccess,
}: PurchasePreviewSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close purchase preview"
        />

        <View style={styles.purchaseSheet}>
          <Text style={styles.purchaseAppName}>
            Calm Courage Co.
          </Text>

          <View style={styles.purchaseTopLine} />

          <Text style={styles.purchasePlan}>
            Founding Member Monthly Plan
          </Text>

          <Text style={styles.purchaseDescription}>
            7-Day Free Trial, then $7.99/month
          </Text>

          <View style={styles.purchaseBottomLine} />

          {/*
           * TEMPORARY FRONTEND DEMO:
           * Tapping the Face ID area simulates a successful
           * store purchase so the Figma success modal can
           * be reviewed before real billing is connected.
           */}
          <Pressable
            style={styles.paymentConfirmationArea}
            onPress={onPaymentSuccess}
            accessibilityRole="button"
            accessibilityLabel="Simulate successful subscription purchase"
          >
            <View style={styles.faceIdContainer}>
              <FaceIdIcon
                width={x(82)}
                height={x(82)}
              />
            </View>

            <Text style={styles.purchaseInstruction}>
              Double Click{"\n"}
              Side Button to Pay
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

type SubscriptionSuccessModalProps = {
  visible: boolean;
  firstBillingDate: string;
  onStartExploring: () => void;
};

function SubscriptionSuccessModal({
  visible,
  firstBillingDate,
  onStartExploring,
}: SubscriptionSuccessModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <View style={styles.successOverlay}>
        <View style={styles.successCard}>
          <Image
            source={LOGO}
            style={styles.successLogo}
            resizeMode="contain"
          />

          <Text style={styles.successTitle}>
            Welcome to the{"\n"}
            Founding Member{"\n"}
            Family! 🎉
          </Text>

          <Text style={styles.successMessage}>
            Your 7-day free trial is{"\n"}
            now active. Your special{"\n"}
            price is permanently{"\n"}
            locked at $7.99/month.
          </Text>

          <View style={styles.billingDateCard}>
            <Text style={styles.billingDateLabel}>
              First Billing Date
            </Text>

            <Text style={styles.billingDateValue}>
              {firstBillingDate}
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.startExploringButton,
              pressed &&
                styles.startExploringButtonPressed,
            ]}
            onPress={onStartExploring}
            accessibilityRole="button"
            accessibilityLabel="Start Exploring"
          >
            <Text style={styles.startExploringText}>
              Start Exploring
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function getFirstBillingDate(): string {
  const billingDate = new Date();

  billingDate.setDate(
    billingDate.getDate() + 7,
  );

  return billingDate.toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
    },
  );
}

export default function PaywallScreen() {
  return storePurchasesAvailable() ? <StorePaywall /> : <PreviewPaywallScreen />;
}

function PreviewPaywallScreen() {
  const { user } = useAuth();

  const [
    purchaseSheetVisible,
    setPurchaseSheetVisible,
  ] = useState(false);

  const [
    successModalVisible,
    setSuccessModalVisible,
  ] = useState(false);

  const [activating, setActivating] =
    useState(false);

  const [
    firstBillingDate,
  ] = useState(
    getFirstBillingDate,
  );

  function handleStartTrial() {
    if (!QA_PURCHASE_ENABLED) {
      Alert.alert(
        "Subscriptions coming soon",
        "Subscriptions are not available yet. Please check back later.",
      );
      return;
    }

    setPurchaseSheetVisible(true);
  }

  async function handlePaymentSuccess() {
    if (!QA_PURCHASE_ENABLED || !user?.uid || activating) {
      return;
    }

    setActivating(true);

    try {
      await activateSubscription(user.uid, {
        plan: "monthly",
        foundingMember: true,
        trialDays: 7,
        source: "paywall_soft_launch",
        platform: Platform.OS,
      });

      setPurchaseSheetVisible(false);

      setTimeout(() => {
        setSuccessModalVisible(true);
      }, 150);
    } catch (error) {
      console.error(
        "Unable to activate subscription:",
        error,
      );

      const message =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string" &&
        (error as { code: string }).code.includes("functions/")
          ? "Subscription service is temporarily unavailable. Confirm Cloud Functions are deployed, then try again."
          : "We couldn’t activate your trial. Please try again.";

      Alert.alert(
        "Subscription unavailable",
        message,
      );
    } finally {
      setActivating(false);
    }
  }

  function handleStartExploring() {
    setSuccessModalVisible(false);
    router.back();
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>
        Unlock Unlimited{"\n"}
        Family Moments
      </Text>

      <Image
        source={LOGO}
        style={styles.logo}
        resizeMode="contain"
      />

      <View style={styles.benefits}>
        <BenefitRow
          top={0}
          text={
            "Access to comprehensive\nactivity library"
          }
        />

        <BenefitRow
          top={62}
          text="Progress tracking and reports"
        />

        <BenefitRow
          top={114}
          text="Personalized recommendations"
        />
      </View>

      <View style={styles.priceCard}>
        <Text style={styles.price}>
          $7.99
          <Text style={styles.priceMonth}>
            {" "}/month
          </Text>
        </Text>

        <View style={styles.specialPrice}>
          <Text style={styles.specialPriceText}>
            Founding Member Special Price -
            {"\n"}
            Locked Permanently
          </Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.trialButton,
          pressed &&
            styles.trialButtonPressed,
        ]}
        onPress={handleStartTrial}
        accessibilityRole="button"
        accessibilityLabel="Start My 7-Day Free Trial"
      >
        <Text style={styles.trialButtonText}>
          Start My 7-Day{"\n"}
          Free Trial
        </Text>
      </Pressable>

      <PurchasePreviewSheet
        visible={purchaseSheetVisible}
        onClose={() =>
          setPurchaseSheetVisible(false)
        }
        onPaymentSuccess={() => {
          void handlePaymentSuccess();
        }}
      />

      {activating ? (
        <View style={styles.activatingOverlay}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />
        </View>
      ) : null}
      <SubscriptionSuccessModal
        visible={successModalVisible}
        firstBillingDate={
          firstBillingDate
        }
        onStartExploring={
          handleStartExploring
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    position: "relative",
    backgroundColor:
      PAGE_BACKGROUND,
  },

  activatingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(241,243,245,0.72)",
    zIndex: 20,
  },

  title: {
    position: "absolute",
    left: x(89),
    top: y(124),
    width: x(224),
    height: y(76),
    color: PRIMARY,
    fontFamily: "Outfit",
    fontSize: x(30),
    lineHeight: y(38),
    textAlign: "center",
    textAlignVertical: "center",
  },

  logo: {
    position: "absolute",
    left: x(112),
    top: y(237),
    width: x(177.3),
    height: y(61),
  },

  benefits: {
    position: "absolute",
    left: x(29),
    top: y(335),
    width: x(344),
    height: y(144),
  },

  benefitRow: {
    position: "absolute",
    left: 0,
    width: x(344),
    flexDirection: "row",
    alignItems: "center",
  },

  checkCircle: {
    width: x(24),
    height: x(24),
    borderRadius: x(12),
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    marginRight: x(14),
  },

  checkMark: {
    color: "#FFFFFF",
    fontFamily: "OutfitBold",
    fontSize: x(16),
    lineHeight: x(19),
    textAlign: "center",
  },

  benefitText: {
    width: x(306),
    color: PRIMARY,
    fontFamily: "Literata",
    fontSize: x(20),
    lineHeight: y(24),
  },

  priceCard: {
    position: "absolute",
    left: x(20),
    top: y(514),
    width: x(362),
    height: y(184),
    borderWidth: x(2),
    borderColor: PRIMARY,
    borderRadius: x(20),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },

  price: {
    position: "absolute",
    top: y(18),
    color: PRIMARY,
    fontFamily: "OutfitBlack",
    fontSize: x(30),
    lineHeight: y(38),
    textAlign: "center",
  },

  priceMonth: {
    fontFamily: "OutfitBlack",
    fontSize: x(20),
  },

  specialPrice: {
    position: "absolute",
    left: x(20),
    top: y(92),
    width: x(322),
    height: y(58),
    borderRadius: x(20),
    backgroundColor: LIGHT_BLUE,
    alignItems: "center",
    justifyContent: "center",
  },

  specialPriceText: {
    width: x(259),
    color: PRIMARY,
    fontFamily: "Literata",
    fontSize: x(15),
    lineHeight: y(18),
    textAlign: "center",
  },

  trialButton: {
    position: "absolute",
    left: x(97),
    top: y(733),
    width: x(210),
    height: y(84),
    borderRadius: x(20),
    backgroundColor:
      TRIAL_BUTTON,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: y(4),
    },
    shadowOpacity: 0.25,
    shadowRadius: x(4),
    elevation: 5,
  },

  trialButtonPressed: {
    opacity: 0.72,
  },

  trialButtonText: {
    width: x(209),
    color: PRIMARY,
    fontFamily: "Outfit",
    fontSize: x(20),
    lineHeight: y(26),
    textAlign: "center",
  },

  modalRoot: {
    flex: 1,
    justifyContent:
      "flex-end",
    backgroundColor:
      "rgba(0, 0, 0, 0.48)",
  },

  purchaseSheet: {
    position: "relative",
    width: "100%",
    height: y(230),
    borderTopLeftRadius:
      x(20),
    borderTopRightRadius:
      x(20),
    backgroundColor:
      "#FFFFFF",
  },

  purchaseAppName: {
    position: "absolute",
    left: x(94),
    top: y(14),
    width: x(214),
    height: y(30),
    color: PRIMARY,
    fontFamily: "Literata",
    fontSize: x(25),
    lineHeight: y(30),
    textAlign: "center",
  },

  purchaseTopLine: {
    position: "absolute",
    left: x(20),
    top: y(51),
    width: x(362),
    height:
      StyleSheet.hairlineWidth,
    backgroundColor: PRIMARY,
  },

  purchasePlan: {
    position: "absolute",
    left: x(19),
    top: y(76),
    width: x(237),
    height: y(18),
    color: PRIMARY,
    fontFamily:
      "LiterataBold",
    fontSize: x(15),
    lineHeight: y(18),
  },

  purchaseDescription: {
    position: "absolute",
    left: x(19),
    top: y(117),
    width: x(270),
    height: y(18),
    color: PRIMARY,
    fontFamily: "Literata",
    fontSize: x(15),
    lineHeight: y(18),
  },

  purchaseBottomLine: {
    position: "absolute",
    left: x(19),
    top: y(155),
    width: x(257),
    height:
      StyleSheet.hairlineWidth,
    backgroundColor: PRIMARY,
  },

  paymentConfirmationArea: {
    position: "absolute",
    right: 0,
    top: y(69),
    width: x(145),
    height: y(150),
  },

  faceIdContainer: {
    position: "absolute",
    right: x(17),
    top: y(7),
    width: x(82),
    height: x(82),
    alignItems: "center",
    justifyContent: "center",
  },

  purchaseInstruction: {
    position: "absolute",
    right: x(16),
    bottom: 0,
    width: x(130),
    height: y(36),
    color: PRIMARY,
    fontFamily: "Literata",
    fontSize: x(15),
    lineHeight: y(18),
    textAlign: "right",
  },

  successOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(0, 0, 0, 0.48)",
  },

  successCard: {
    position: "relative",
    width: x(331),
    height: y(589),
    borderRadius: x(20),
    backgroundColor:
      PAGE_BACKGROUND,
    overflow: "hidden",
  },

  successLogo: {
    position: "absolute",
    left: x(76),
    top: y(34),
    width: x(177.3),
    height: y(61),
  },

  successTitle: {
    position: "absolute",
    left: x(32),
    top: y(124),
    width: x(267),
    height: y(117),
    color: PRIMARY,
    fontFamily: "Literata",
    fontSize: x(30),
    lineHeight: y(39),
    textAlign: "center",
    textAlignVertical: "center",
  },

  successMessage: {
    position: "absolute",
    left: x(42),
    top: y(269),
    width: x(247),
    height: y(96),
    color: PRIMARY,
    fontFamily: "Literata",
    fontSize: x(20),
    lineHeight: y(24),
    textAlign: "center",
  },

  billingDateCard: {
    position: "absolute",
    left: x(41),
    top: y(393),
    width: x(249),
    height: y(73),
    borderWidth: x(5),
    borderColor: "#FFFFFF",
    backgroundColor:
      LIGHT_BLUE,
    alignItems: "center",
    justifyContent: "center",
  },

  billingDateLabel: {
    color: PRIMARY,
    fontFamily: "Literata",
    fontSize: x(15),
    lineHeight: y(18),
    textAlign: "center",
  },

  billingDateValue: {
    color: PRIMARY,
    fontFamily:
      "LiterataBold",
    fontSize: x(20),
    lineHeight: y(24),
    textAlign: "center",
  },

  startExploringButton: {
    position: "absolute",
    left: x(40),
    top: y(494),
    width: x(250),
    height: y(52),
    borderRadius: x(20),
    backgroundColor:
      TRIAL_BUTTON,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: y(4),
    },
    shadowOpacity: 0.25,
    shadowRadius: x(4),
    elevation: 5,
  },

  startExploringButtonPressed: {
    opacity: 0.72,
  },

  startExploringText: {
    color: PRIMARY,
    fontFamily: "Outfit",
    fontSize: x(20),
    lineHeight: y(26),
    textAlign: "center",
  },
});
