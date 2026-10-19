/**
 * Parent settings. Subscription details share the entitlement reader used by
 * premium activities; billing changes happen in the original purchase store.
 */

import {
  router,
  type Href,
  useFocusEffect,
} from "expo-router";
import {
  useCallback,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import ParentBottomNav from "@/components/dashboard/ParentBottomNav";
import TermsModal from "@/components/modals/TermsModal";
import AppButton from "@/components/ui/AppButton";
import Logo from "@/components/ui/Logo";
import {
  type ConsentDocumentKind,
} from "@/constants/consent";
import { colors } from "@/constants/colors";
import { useActiveChild } from "@/contexts/ActiveChildContext";
import { useAuth } from "@/contexts/AuthContext";
import { useParentAccess } from "@/contexts/ParentAccessContext";
import {
  getParentPreferences,
  updateParentPreferences,
} from "@/services/preferences";
import { enableParentPushNotifications } from "@/services/pushRegistration";
import { getSubscriptionEntitlement, type SubscriptionEntitlement } from "@/services/subscription";
import { getSubscriptionPresentation } from "@/utils/subscriptionPresentation";
import { x, y } from "@/utils/scaling";

import AudioOffIcon from "../../assets/icons/audio-off.svg";
import AudioOnIcon from "../../assets/icons/audio-on.svg";
import ArrowIcon from "../../assets/icons/arrow.svg";

const FIGMA_CONTENT_HEIGHT = 1435;

const FIXED_FOOTER_HEIGHT = 105;
const FIXED_FOOTER_BOTTOM = 20;
const FOOTER_SCROLL_SPACE = 125;

const TRIAL_LAYOUT = {
  supportDividerTop: 737,
  supportTitleTop: 763,
  helpRowTop: 813,
  legalRowTop: 890,
  accountDividerTop: 1010,
  accountTitleTop: 1036,
  changePasswordTop: 1086,
  logoutTop: 1162,
  deleteAccountTop: 1238,
} as const;

const SUBSCRIBED_LAYOUT = {
  supportDividerTop: 846,
  supportTitleTop: 872,
  helpRowTop: 922,
  legalRowTop: 999,
  accountDividerTop: 1119,
  accountTitleTop: 1145,
  changePasswordTop: 1195,
  logoutTop: 1271,
  deleteAccountTop: 1347,
} as const;

type SubscriptionDetails = SubscriptionEntitlement;

type SettingsCacheEntry = {
  audioEnabled: boolean;
  pushNotifications: boolean;
  weeklyEmailReports: boolean;
  subscriptionDetails: SubscriptionDetails;
};

const settingsScreenCache =
  new Map<string, SettingsCacheEntry>();

type SettingsToggleProps = {
  enabled: boolean;
  onChange: () => void;
  accessibilityLabel: string;
};

type SettingsRowProps = {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  top: number;
  height?: number;
  multiline?: boolean;
  disabled?: boolean;
};

function formatBillingDate(value: Date | null): string {
  return value
    ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(value)
    : "Not available";
}

function SettingsToggle({
  enabled,
  onChange,
  accessibilityLabel,
}: SettingsToggleProps) {
  return (
    <Pressable
      style={[
        styles.toggle,
        enabled
          ? styles.toggleEnabled
          : styles.toggleDisabled,
      ]}
      onPress={onChange}
      accessibilityRole="switch"
      accessibilityLabel={
        accessibilityLabel
      }
      accessibilityState={{
        checked: enabled,
      }}
      hitSlop={8}
    >
      <View
        style={[
          styles.toggleThumb,
          enabled
            ? styles.toggleThumbEnabled
            : styles.toggleThumbDisabled,
        ]}
      />
    </Pressable>
  );
}

function ChevronRight() {
  return (
    <View
      style={styles.chevronRight}
    />
  );
}

function ExternalArrow() {
  return (
    <View
      style={styles.externalArrowWrapper}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <ArrowIcon
        width={x(18)}
        height={x(18)}
      />
    </View>
  );
}

function SettingsRow({
  label,
  onPress,
  accessibilityLabel,
  top,
  height = 62,
  multiline = false,
  disabled = false,
}: SettingsRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.settingsRow,
        {
          top: y(top),
          height: y(height),
        },
        pressed &&
          !disabled &&
          styles.controlPressed,
        disabled &&
          styles.disabledControl,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel
      }
      accessibilityState={{
        disabled,
      }}
    >
      <Text
        style={[
          styles.settingsRowText,
          multiline &&
            styles.settingsRowTextMultiline,
        ]}
      >
        {label}
      </Text>

      <View
        style={styles.chevronWrapper}
      >
        <ChevronRight />
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { height: viewportHeight } =
    useWindowDimensions();

  const {
    user,
    signOut: signOutUser,
  } = useAuth();

  const {
    clearActiveChild,
  } = useActiveChild();

  const {
    lockAccess,
  } = useParentAccess();

  const cachedSettings =
    user?.uid
      ? settingsScreenCache.get(
          user.uid,
        )
      : undefined;

  const [
    audioEnabled,
    setAudioEnabled,
  ] = useState(
    cachedSettings?.audioEnabled ??
      false,
  );

  const [
    pushNotifications,
    setPushNotifications,
  ] = useState(
    cachedSettings?.pushNotifications ??
      false,
  );

  const [
    weeklyEmailReports,
    setWeeklyEmailReports,
  ] = useState(
    cachedSettings?.weeklyEmailReports ??
      false,
  );

  const [
    subscriptionDetails,
    setSubscriptionDetails,
  ] =
    useState<SubscriptionDetails>(
      cachedSettings?.subscriptionDetails ??
        {
          plan: "trial",
          foundingMember: false,
          priceLabel: null,
          renewsAt: null,
          trialEndsAt: null,
          isActive: false,
          platform: null,
          cancelledAt: null,
        },
    );

  const [
    legalModalDocument,
    setLegalModalDocument,
  ] =
    useState<ConsentDocumentKind | null>(
      null,
    );

  const [
    logoutModalVisible,
    setLogoutModalVisible,
  ] = useState(false);

  const [
    signingOut,
    setSigningOut,
  ] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      let requestVersion = 0;

      async function loadSettings() {
        const version = ++requestVersion;
        if (!user?.uid) {
          return;
        }

        try {
          const [
            nextSubscriptionDetails,
            preferences,
          ] = await Promise.all([
            getSubscriptionEntitlement(user.uid),

            getParentPreferences(
              user.uid,
            ),
          ]);

          if (!isMounted || version !== requestVersion) {
            return;
          }

          /*
           * Update the visible screen only after both reads finish.
           * Until then, cached/current values stay on screen.
           */
          setAudioEnabled(
            preferences.audioEnabled,
          );

          setPushNotifications(
            preferences.pushNotifications,
          );

          setWeeklyEmailReports(
            preferences.weeklyEmailReports,
          );

          setSubscriptionDetails(
            nextSubscriptionDetails,
          );

          settingsScreenCache.set(
            user.uid,
            {
              audioEnabled:
                preferences.audioEnabled,

              pushNotifications:
                preferences.pushNotifications,

              weeklyEmailReports:
                preferences.weeklyEmailReports,

              subscriptionDetails:
                nextSubscriptionDetails,
            },
          );
        } catch (error) {
          console.error(
            "Unable to refresh settings:",
            error,
          );
        }
      }

      void loadSettings();
      const listener = AppState.addEventListener("change", state => {
        if (state === "active") void loadSettings();
      });

      return () => {
        isMounted = false;
        listener.remove();
      };
    }, [user]),
  );

  async function persistPreference(
    patch: {
      audioEnabled?: boolean;
      pushNotifications?: boolean;
      weeklyEmailReports?: boolean;
    },
  ) {
    if (!user?.uid) {
      return;
    }

    /*
     * Keep the runtime cache aligned with the optimistic UI state
     * so navigating away and back does not restore stale toggles.
     */
    const cached =
      settingsScreenCache.get(
        user.uid,
      ) ?? {
        audioEnabled,
        pushNotifications,
        weeklyEmailReports,
        subscriptionDetails,
      };

    settingsScreenCache.set(
      user.uid,
      {
        ...cached,
        ...patch,
        subscriptionDetails:
          cached.subscriptionDetails,
      },
    );

    try {
      await updateParentPreferences(
        user.uid,
        patch,
      );
    } catch (error) {
      console.error(
        "Unable to save parent preferences:",
        error,
      );

      Alert.alert(
        "Could not save",
        "Your preference could not be saved. Please try again.",
      );
    }
  }

  const termsModalTranslateY =
    (viewportHeight -
      y(570)) /
      2 -
    y(258);

  const subscription = getSubscriptionPresentation(subscriptionDetails, Platform.OS);
  // Keep expired subscription details and the store management entry accessible.
  const isSubscribed = subscription.hasPlan;
  const activeLayout = isSubscribed ? SUBSCRIBED_LAYOUT : TRIAL_LAYOUT;
  const nextBillingDate = formatBillingDate(subscription.date);

  function handleSubscribe() {
    router.push("/paywall" as Href);
  }

  async function handleManageSubscription() {
    if (!subscription.store.url) {
      Alert.alert("Manage subscription", "Open the App Store or Google Play account used for your purchase to manage or cancel renewal.");
      return;
    }
    try {
      await Linking.openURL(subscription.store.url);
    } catch {
      Alert.alert("Unable to open store", "Please open your store account's subscription settings to manage or cancel renewal.");
    }
  }

  function handleHelpSupport() {
    router.push(
      "/help-support" as Href,
    );
  }

  function handleLegalDocuments() {
    router.push("/privacy-policy" as Href);
  }

  function handleChangePassword() {
    router.push(
      "/forgot-password" as Href,
    );
  }

  function handleSwitchToChildMode() {
    router.replace(
      "/switch-to-child" as Href,
    );
  }

  function handleLogoutPress() {
    if (signingOut) {
      return;
    }

    setLogoutModalVisible(true);
  }

  function closeLogoutModal() {
    if (signingOut) {
      return;
    }

    setLogoutModalVisible(false);
  }

  async function confirmLogout() {
    setSigningOut(true);

    try {
      lockAccess();
      clearActiveChild();

      await signOutUser();

      setLogoutModalVisible(false);

      router.replace(
        "/login" as Href,
      );
    } catch (error) {
      console.error(
        "Unable to log out:",
        error,
      );

      Alert.alert(
        "Unable to Log Out",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  function handleDeleteAccount() {
    router.push(
      "/delete-account" as Href,
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={
          false
        }
        bounces={false}
        alwaysBounceVertical={
          false
        }
        overScrollMode="never"
        contentInsetAdjustmentBehavior="never"
      >
        <View
          style={styles.figmaFrame}
        >
          <Pressable
            style={({ pressed }) => [
              styles.audioButton,
              pressed &&
                styles.controlPressed,
            ]}
            onPress={() => {
              setAudioEnabled((current) => {
                const next = !current;
                void persistPreference({
                  audioEnabled: next,
                });
                return next;
              });
            }}
            accessibilityRole="button"
            accessibilityLabel={
              audioEnabled
                ? "Turn audio off"
                : "Turn audio on"
            }
            accessibilityState={{
              selected:
                audioEnabled,
            }}
            hitSlop={8}
          >
            {audioEnabled ? (
              <AudioOnIcon
                width={x(35)}
                height={x(35)}
              />
            ) : (
              <AudioOffIcon
                width={x(35)}
                height={x(35)}
              />
            )}
          </Pressable>

          <Text style={styles.title}>
            Settings
          </Text>

          <View
            style={styles.topDivider}
          />

          <Text
            style={
              styles.notificationsTitle
            }
          >
            Notifications
          </Text>

          <Text
            style={
              styles.pushNotificationsText
            }
          >
            Push Notifications
          </Text>

          <View
            style={
              styles.pushNotificationsToggle
            }
          >
            <SettingsToggle
              enabled={
                pushNotifications
              }
              onChange={() => {
                setPushNotifications(
                  (current) => {
                    const next = !current;

                    if (next && user?.uid) {
                      void enableParentPushNotifications(
                        user.uid,
                      ).catch((error) => {
                        console.warn(
                          "Unable to register push token:",
                          error,
                        );
                      });
                    } else {
                      void persistPreference({
                        pushNotifications: next,
                      });
                    }

                    return next;
                  },
                );
              }}
              accessibilityLabel="Push notifications"
            />
          </View>

          <Text
            style={
              styles.weeklyReportsText
            }
          >
            Weekly Email Reports
          </Text>

          <View
            style={
              styles.weeklyReportsToggle
            }
          >
            <SettingsToggle
              enabled={
                weeklyEmailReports
              }
              onChange={() => {
                setWeeklyEmailReports(
                  (current) => {
                    const next = !current;
                    void persistPreference({
                      weeklyEmailReports: next,
                    });
                    return next;
                  },
                );
              }}
              accessibilityLabel="Weekly email reports"
            />
          </View>

          <View
            style={
              styles.notificationsDivider
            }
          />

          {isSubscribed ? (
            <>
              <Text
                style={
                  styles.manageSubscriptionTitle
                }
              >
                Manage Subscription
              </Text>

              <View
                style={
                  styles.subscribedCard
                }
              >
                <Text
                  style={
                    styles.subscribedPlanTitle
                  }
                >
                  {subscription.title}
                </Text>

                <Text
                  style={
                    styles.subscribedPrice
                  }
                >
                  {subscription.priceDescription}
                </Text>

                <View
                  style={
                    styles.subscribedCardDivider
                  }
                />

                <Text
                  style={
                    styles.nextBillingLabel
                  }
                >
                  {subscription.dateLabel}
                </Text>

                <Text
                  style={
                    styles.nextBillingDate
                  }
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {nextBillingDate}
                </Text>

                <View
                  style={
                    styles.subscriptionStatusBadge
                  }
                >
                  <Text
                    style={
                      styles.subscriptionStatusText
                    }
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {subscription.status}
                  </Text>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.manageStoreButton,
                  pressed &&
                    styles.controlPressed,
                ]}
                onPress={
                  () => { void handleManageSubscription(); }
                }
                accessibilityRole="button"
                accessibilityLabel={subscription.managementLabel}
              >
                <Text
                  style={
                    styles.manageStoreButtonText
                  }
                >
                  {subscription.managementLabel}
                </Text>

                <ExternalArrow />
              </Pressable>
            </>
          ) : (
            <>
              <Text
                style={
                  styles.membershipTitle
                }
              >
                Membership Plan
              </Text>

              <View
                style={
                  styles.membershipCard
                }
              >
                <Text
                  style={
                    styles.membershipDescription
                  }
                >
                  Unlock all 20 scenario cards
                  &amp;{"\n"}
                  parent insights!
                </Text>

                <Text
                  style={
                    styles.membershipPrice
                  }
                >
                  View available plans and
                  {"\n"}
                  prices before subscribing
                </Text>

                <View
                  style={
                    styles.subscribeButtonWrapper
                  }
                >
                  <AppButton
                    title="View Plans"
                    onPress={
                      handleSubscribe
                    }
                    style={
                      styles.subscribeButton
                    }
                  />
                </View>
              </View>
            </>
          )}

          <View
            style={[
              styles.supportDivider,
              {
                top: y(
                  activeLayout.supportDividerTop,
                ),
              },
            ]}
          />

          <Text
            style={[
              styles.supportTitle,
              {
                top: y(
                  activeLayout.supportTitleTop,
                ),
              },
            ]}
          >
            Support &amp; Legal
          </Text>

          <SettingsRow
            label="Help & Support"
            onPress={
              handleHelpSupport
            }
            accessibilityLabel="Open Help and Support"
            top={
              activeLayout.helpRowTop
            }
          />

          <SettingsRow
            label={
              "Privacy Policy"
            }
            onPress={
              handleLegalDocuments
            }
            accessibilityLabel="Open Privacy Policy"
            top={
              activeLayout.legalRowTop
            }
            height={83}
            multiline
          />

          <View
            style={[
              styles.accountDivider,
              {
                top: y(
                  activeLayout.accountDividerTop,
                ),
              },
            ]}
          />

          <Text
            style={[
              styles.accountSettingsTitle,
              {
                top: y(
                  activeLayout.accountTitleTop,
                ),
              },
            ]}
          >
            Account Settings
          </Text>

          <SettingsRow
            label="Change Password"
            onPress={
              handleChangePassword
            }
            accessibilityLabel="Change password"
            top={
              activeLayout.changePasswordTop
            }
          />

          <SettingsRow
            label={
              signingOut
                ? "Logging Out..."
                : "Log Out"
            }
            onPress={
              handleLogoutPress
            }
            accessibilityLabel="Log out"
            top={
              activeLayout.logoutTop
            }
            disabled={signingOut}
          />

          <SettingsRow
            label="Delete Account"
            onPress={
              handleDeleteAccount
            }
            accessibilityLabel="Open delete account page"
            top={
              activeLayout.deleteAccountTop
            }
          />
        </View>
      </ScrollView>

      <View
        style={styles.fixedFooter}
      >
        <Pressable
          style={({ pressed }) => [
            styles.switchToChildWrapper,
            pressed &&
              styles.controlPressed,
          ]}
          onPress={
            handleSwitchToChildMode
          }
          accessibilityRole="button"
          accessibilityLabel="Switch to child mode"
        >
          <Text
            style={
              styles.switchToChildText
            }
          >
            Switch to Child Mode
          </Text>
        </Pressable>

        <View
          style={
            styles.bottomNavWrapper
          }
        >
          <ParentBottomNav
            activeTab="settings"
          />
        </View>
      </View>

      <Modal
        visible={
          logoutModalVisible
        }
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={
          closeLogoutModal
        }
      >
        <View
          style={
            styles.logoutModalBackdrop
          }
        >
          <View
            style={
              styles.logoutModalCard
            }
          >
            <View
              style={
                styles.logoutLogoWrapper
              }
            >
              <Logo
                width={x(177.3)}
                height={y(61)}
                shadow
              />
            </View>

            <Text
              style={
                styles.logoutModalTitle
              }
            >
              Log Out?
            </Text>

            <Text
              style={
                styles.logoutModalText
              }
            >
              Are you sure you want to log
              {"\n"}
              out? You will need to sign in
              {"\n"}
              again to access parent settings
              {"\n"}
              and progress tracking.
            </Text>

            <View
              style={
                styles.logoutModalActions
              }
            >
              <Pressable
                style={({ pressed }) => [
                  styles.logoutConfirmButton,
                  pressed &&
                    styles.controlPressed,
                  signingOut &&
                    styles.disabledControl,
                ]}
                onPress={() => {
                  void confirmLogout();
                }}
                disabled={signingOut}
                accessibilityRole="button"
                accessibilityLabel="Confirm log out"
              >
                {signingOut ? (
                  <ActivityIndicator
                    size="small"
                    color={
                      colors.primary
                    }
                  />
                ) : (
                  <Text
                    style={
                      styles.logoutConfirmButtonText
                    }
                  >
                    Log out
                  </Text>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.logoutCancelButton,
                  pressed &&
                    styles.controlPressed,
                  signingOut &&
                    styles.disabledControl,
                ]}
                onPress={
                  closeLogoutModal
                }
                disabled={signingOut}
                accessibilityRole="button"
                accessibilityLabel="Cancel log out"
              >
                <Text
                  style={
                    styles.logoutCancelButtonText
                  }
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={
          legalModalDocument !==
          null
        }
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() =>
          setLegalModalDocument(
            null,
          )
        }
      >
        <View
          style={
            styles.termsModalBackdrop
          }
        >
          <View
            style={[
              styles.termsModalPositioner,
              {
                transform: [
                  {
                    translateY:
                      termsModalTranslateY,
                  },
                ],
              },
            ]}
          >
            <TermsModal
              visible={
                legalModalDocument !==
                null
              }
              document={
                legalModalDocument
              }
              onClose={() =>
                setLegalModalDocument(
                  null,
                )
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      position: "relative",
      backgroundColor:
        colors.background,
    },

    scrollView: {
      flex: 1,
      backgroundColor:
        colors.background,
    },

    scrollContent: {
      flexGrow: 1,
      minHeight: y(
        FIGMA_CONTENT_HEIGHT +
          FOOTER_SCROLL_SPACE,
      ),
      paddingBottom: y(
        FOOTER_SCROLL_SPACE,
      ),
      backgroundColor:
        colors.background,
    },

    figmaFrame: {
      position: "relative",
      width: "100%",
      height: y(
        FIGMA_CONTENT_HEIGHT,
      ),
      backgroundColor:
        colors.background,
    },

    audioButton: {
      position: "absolute",
      left: x(347),
      top: y(48),
      width: x(35),
      height: x(35),
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10,
    },

    title: {
      position: "absolute",
      left: x(20),
      top: y(123),
      width: x(362),
      height: y(39),
      color: colors.primary,
      fontFamily: "Outfit",
      fontSize: x(30),
      lineHeight: y(39),
      textAlign: "center",
      includeFontPadding: false,
    },

    topDivider: {
      position: "absolute",
      left: x(20),
      top: y(188),
      width: x(362),
      height:
        StyleSheet.hairlineWidth,
      backgroundColor:
        colors.primary,
    },

    notificationsTitle: {
      position: "absolute",
      left: x(20),
      top: y(217),
      width: x(285),
      height: y(24),
      color: colors.primary,
      fontFamily:
        "LiterataBold",
      fontSize: x(20),
      lineHeight: y(24),
      includeFontPadding: false,
    },

    pushNotificationsText: {
      position: "absolute",
      left: x(20),
      top: y(262),
      width: x(285),
      height: y(24),
      color: colors.primary,
      fontFamily: "Literata",
      fontSize: x(20),
      lineHeight: y(24),
      includeFontPadding: false,
    },

    pushNotificationsToggle: {
      position: "absolute",
      left: x(326),
      top: y(262),
      width: x(56),
      height: y(30),
    },

    weeklyReportsText: {
      position: "absolute",
      left: x(20),
      top: y(307),
      width: x(285),
      height: y(24),
      color: colors.primary,
      fontFamily: "Literata",
      fontSize: x(20),
      lineHeight: y(24),
      includeFontPadding: false,
    },

    weeklyReportsToggle: {
      position: "absolute",
      left: x(326),
      top: y(307),
      width: x(56),
      height: y(30),
    },

    toggle: {
      width: x(56),
      height: y(30),
      borderRadius: x(20),
      justifyContent: "center",
    },

    toggleDisabled: {
      backgroundColor: "#D9D9D9",
    },

    toggleEnabled: {
      backgroundColor:
        colors.primary,
    },

    toggleThumb: {
      position: "absolute",
      top: y(5),
      width: x(20),
      height: x(20),
      borderRadius: x(20),
    },

    toggleThumbDisabled: {
      left: x(6),
      backgroundColor:
        colors.primary,
    },

    toggleThumbEnabled: {
      right: x(6),
      backgroundColor:
        "#D9D9D9",
    },

    notificationsDivider: {
      position: "absolute",
      left: x(20),
      top: y(366),
      width: x(362),
      height:
        StyleSheet.hairlineWidth,
      backgroundColor:
        colors.primary,
    },

    membershipTitle: {
      position: "absolute",
      left: x(20),
      top: y(392),
      width: x(285),
      height: y(24),
      color: colors.primary,
      fontFamily:
        "LiterataBold",
      fontSize: x(20),
      lineHeight: y(24),
      includeFontPadding: false,
    },

    membershipCard: {
      position: "absolute",
      left: x(20),
      top: y(437),
      width: x(362),
      height: y(271),
      borderWidth: 1,
      borderColor:
        colors.primary,
      borderRadius: x(20),
      backgroundColor:
        colors.background,
    },

    membershipDescription: {
      position: "absolute",
      left: x(31),
      top: y(21),
      width: x(300),
      minHeight: y(50),
      color: colors.primary,
      fontFamily: "Literata",
      fontSize: x(20),
      lineHeight: y(25),
    },

    membershipPrice: {
      position: "absolute",
      left: x(31),
      top: y(106),
      width: x(300),
      minHeight: y(50),
      color: colors.primary,
      fontFamily: "Literata",
      fontSize: x(20),
      lineHeight: y(25),
    },

    subscribeButtonWrapper: {
      position: "absolute",
      left: x(76.5),
      top: y(188),
      width: x(209),
      height: y(52),
    },

    subscribeButton: {
      width: x(209),
      height: y(52),
      borderRadius: x(20),

      shadowColor:
        colors.black,
      shadowOffset: {
        width: 0,
        height: y(4),
      },
      shadowOpacity: 0.25,
      shadowRadius: x(4),
      elevation: 5,
    },

    manageSubscriptionTitle: {
      position: "absolute",
      left: x(20),
      top: y(392),
      width: x(285),
      height: y(24),
      color: colors.primary,
      fontFamily:
        "LiterataBold",
      fontSize: x(20),
      lineHeight: y(24),
      includeFontPadding: false,
    },

    subscribedCard: {
      position: "absolute",
      left: x(20),
      top: y(442),
      width: x(362),
      height: y(271),
      borderWidth: 1,
      borderColor:
        colors.primary,
      borderRadius: x(20),
      backgroundColor:
        colors.background,
    },

    subscribedPlanTitle: {
      position: "absolute",
      left: x(81.5),
      top: y(26),
      width: x(199),
      minHeight: y(50),
      color: colors.primary,
      fontFamily:
        "LiterataBold",
      fontSize: x(20),
      lineHeight: y(25),
      textAlign: "center",
      includeFontPadding: false,
    },

    subscribedPrice: {
      position: "absolute",
      left: x(81.5),
      top: y(101),
      width: x(199),
      minHeight: y(50),
      color: colors.primary,
      fontFamily: "Literata",
      fontSize: x(20),
      lineHeight: y(25),
      textAlign: "center",
      includeFontPadding: false,
    },

    subscribedCardDivider: {
      position: "absolute",
      left: x(21),
      top: y(171),
      width: x(318),
      height:
        StyleSheet.hairlineWidth,
      backgroundColor:
        colors.primary,
    },

    nextBillingLabel: {
      position: "absolute",
      left: x(21),
      top: y(196),
      width: x(199),
      height: y(25),
      color: colors.primary,
      fontFamily: "Literata",
      fontSize: x(20),
      lineHeight: y(25),
      includeFontPadding: false,
    },

    nextBillingDate: {
      position: "absolute",
      left: x(21),
      top: y(221),
      width: x(199),
      height: y(25),
      color: colors.primary,
      fontFamily:
        "LiterataBold",
      fontSize: x(20),
      lineHeight: y(25),
      includeFontPadding: false,
    },

    subscriptionStatusBadge: {
      position: "absolute",
      left: x(221),
      top: y(199),
      width: x(118),
      height: y(45),
      borderRadius: x(10),
      backgroundColor:
        "#DDEAEC",
      paddingHorizontal: x(5),
      alignItems: "center",
      justifyContent: "center",
    },

    subscriptionStatusText: {
      width: "100%",
      color: colors.primary,
      fontFamily: "Outfit",
      fontSize: x(12),
      lineHeight: y(15),
      textAlign: "center",
      includeFontPadding: false,
    },

    manageStoreButton: {
      position: "absolute",
      left: x(20),
      top: y(756),
      width: x(362),
      height: y(52),
      borderRadius: x(20),
      backgroundColor:
        "#E6D8EB",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",

      shadowColor:
        colors.black,
      shadowOffset: {
        width: 0,
        height: y(4),
      },
      shadowOpacity: 0.25,
      shadowRadius: x(4),
      elevation: 5,
    },

    manageStoreButtonText: {
      color: colors.primary,
      fontFamily: "Outfit",
      fontSize: x(20),
      lineHeight: y(25),
      textAlign: "center",
      includeFontPadding: false,
    },

    externalArrowWrapper: {
      width: x(18),
      height: x(18),
      marginLeft: x(12),
      alignItems: "center",
      justifyContent: "center",
    },

    supportDivider: {
      position: "absolute",
      left: x(20),
      width: x(362),
      height:
        StyleSheet.hairlineWidth,
      backgroundColor:
        colors.primary,
    },

    supportTitle: {
      position: "absolute",
      left: x(20),
      width: x(285),
      height: y(24),
      color: colors.primary,
      fontFamily:
        "LiterataBold",
      fontSize: x(20),
      lineHeight: y(24),
      includeFontPadding: false,
    },

    settingsRow: {
      position: "absolute",
      left: x(20),
      width: x(362),
      borderWidth: 1,
      borderColor:
        colors.primary,
      borderRadius: x(20),
      backgroundColor:
        colors.background,
      justifyContent: "center",

      shadowColor:
        colors.black,
      shadowOffset: {
        width: 0,
        height: y(4),
      },
      shadowOpacity: 0.25,
      shadowRadius: x(4),
      elevation: 4,
    },

    settingsRowText: {
      width: x(319),
      marginLeft: x(21),
      color: colors.primary,
      fontFamily: "Literata",
      fontSize: x(20),
      lineHeight: y(24),
    },

    settingsRowTextMultiline: {
      lineHeight: y(24),
    },

    chevronWrapper: {
      position: "absolute",
      right: x(18),
      top: "50%",
      width: x(18),
      height: y(18),
      marginTop: y(-9),
      alignItems: "center",
      justifyContent: "center",
    },

    chevronRight: {
      width: x(10),
      height: x(10),
      borderTopWidth: x(2),
      borderRightWidth: x(2),
      borderColor:
        colors.primary,
      transform: [
        {
          rotate: "45deg",
        },
      ],
    },

    accountDivider: {
      position: "absolute",
      left: x(20),
      width: x(362),
      height:
        StyleSheet.hairlineWidth,
      backgroundColor:
        colors.primary,
    },

    accountSettingsTitle: {
      position: "absolute",
      left: x(20),
      width: x(285),
      height: y(24),
      color: colors.primary,
      fontFamily:
        "LiterataBold",
      fontSize: x(20),
      lineHeight: y(24),
      includeFontPadding: false,
    },

    fixedFooter: {
      position: "absolute",
      left: x(20),
      bottom: y(
        FIXED_FOOTER_BOTTOM,
      ),
      width: x(362),
      height: y(
        FIXED_FOOTER_HEIGHT,
      ),
      backgroundColor:
        "transparent",
      zIndex: 50,
    },

    switchToChildWrapper: {
      position: "absolute",
      left: 0,
      top: 0,
      minWidth: x(226),
      height: y(28),
      justifyContent: "center",
      backgroundColor:
        "transparent",
    },

    switchToChildText: {
      color: colors.primary,
      fontFamily: "Literata",
      fontSize: x(20),
      lineHeight: y(24),
      textDecorationLine:
        "underline",
      includeFontPadding: false,
    },

    bottomNavWrapper: {
      position: "absolute",
      left: 0,
      top: y(33),
      width: x(362),
      height: y(72),
      borderRadius: x(50),
      backgroundColor:
        "transparent",
      overflow: "visible",
      zIndex: 50,
    },

    logoutModalBackdrop: {
      flex: 1,
      backgroundColor:
        "rgba(0, 0, 0, 0.50)",
      alignItems: "center",
      justifyContent: "center",
    },

    logoutModalCard: {
      position: "relative",
      width: x(331),
      height: y(500),
      borderRadius: x(20),
      backgroundColor:
        "#F1F3F5",
      overflow: "visible",

      shadowColor:
        colors.black,
      shadowOffset: {
        width: 0,
        height: y(4),
      },
      shadowOpacity: 0.25,
      shadowRadius: x(4),
      elevation: 10,
    },

    logoutLogoWrapper: {
      position: "absolute",
      left: x(76.85),
      top: y(63),
      width: x(177.3),
      height: y(61),
      alignItems: "center",
      justifyContent: "center",
    },

    logoutModalTitle: {
      position: "absolute",
      left: x(89.59),
      top: y(165),
      width: x(151.82),
      height: y(38),
      color: colors.primary,
      fontFamily:
        "OutfitBold",
      fontSize: x(30),
      lineHeight: y(38),
      textAlign: "center",
    },

    logoutModalText: {
      position: "absolute",
      left: x(15),
      top: y(224),
      width: x(300),
      height: y(120),
      color: colors.primary,
      fontFamily: "Literata",
      fontSize: x(20),
      lineHeight: y(20),
      textAlign: "center",
      textAlignVertical:
        "center",
    },

    logoutModalActions: {
      position: "absolute",
      left: x(41),
      top: y(385),
      width: x(249),
      height: y(52),
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
    },

    logoutConfirmButton: {
      width: x(117),
      height: y(52),
      borderRadius: x(20),
      backgroundColor:
        "#D9D9D9",
      alignItems: "center",
      justifyContent: "center",

      shadowColor:
        colors.black,
      shadowOffset: {
        width: 0,
        height: y(4),
      },
      shadowOpacity: 0.25,
      shadowRadius: x(4),
      elevation: 5,
    },

    logoutCancelButton: {
      width: x(117),
      height: y(52),
      borderRadius: x(20),
      backgroundColor:
        "#E8D8F1",
      alignItems: "center",
      justifyContent: "center",

      shadowColor:
        colors.black,
      shadowOffset: {
        width: 0,
        height: y(4),
      },
      shadowOpacity: 0.25,
      shadowRadius: x(4),
      elevation: 5,
    },

    logoutConfirmButtonText: {
      color: colors.primary,
      fontFamily: "Literata",
      fontSize: x(16),
      lineHeight: y(20),
      textAlign: "center",
    },

    logoutCancelButtonText: {
      color: colors.primary,
      fontFamily: "Literata",
      fontSize: x(16),
      lineHeight: y(20),
      textAlign: "center",
    },

    termsModalBackdrop: {
      flex: 1,
      position: "relative",
      backgroundColor:
        "transparent",
    },

    termsModalPositioner: {
      flex: 1,
      position: "relative",
    },

    controlPressed: {
      opacity: 0.65,
    },

    disabledControl: {
      opacity: 0.55,
    },
  });
