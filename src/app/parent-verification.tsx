/**
 * Parent verification screen.
 *
 * Appears when access to the parent area is requested.
 * Verifies the parent's four-digit PIN against the pinHash stored at:
 *
 * parents/{authenticatedUserUid}
 */

import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppButton from "@/components/ui/AppButton";
import ErrorMessage from "@/components/ui/ErrorMessage";
import { colors } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useParentAccess } from "@/contexts/ParentAccessContext";
import {
  completeOnboarding,
  getUserProfile,
  verifyParentPin,
} from "@/services/auth";
import { listChildren } from "@/services/children";
import { isValidPin } from "@/utils/pin";
import { x, y } from "@/utils/scaling";

import AudioOffIcon from "../../assets/icons/audio-off.svg";
import AudioOnIcon from "../../assets/icons/audio-on.svg";

const PIN_LENGTH = 4;

const numberRows = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

export default function ParentVerificationScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const {
    childModeActive,
    parentAccessGranted,
    unlockParentAccess,
  } = useParentAccess();

  const [pin, setPin] = useState("");

  const [
    audioEnabled,
    setAudioEnabled,
  ] = useState(false);

  const [
    verifying,
    setVerifying,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const [
    destinationAfterUnlock,
    setDestinationAfterUnlock,
  ] = useState<Href | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (
      parentAccessGranted &&
      destinationAfterUnlock
    ) {
      const destination =
        destinationAfterUnlock;

      setDestinationAfterUnlock(null);
      router.replace(destination);
    }
  }, [
    destinationAfterUnlock,
    parentAccessGranted,
  ]);

  function handleNumberPress(
    number: string,
  ) {
    if (
      verifying ||
      pin.length >= PIN_LENGTH
    ) {
      return;
    }

    setError(null);

    const nextPin =
      `${pin}${number}`.slice(
        0,
        PIN_LENGTH,
      );

    setPin(nextPin);

    /*
     * Auto-submit when the fourth digit is entered.
     * The Verify button remains available as a manual fallback.
     */
    if (
      nextPin.length ===
      PIN_LENGTH
    ) {
      void handleVerifyPin(
        nextPin,
      );
    }
  }

  function handleDelete() {
    if (verifying) {
      return;
    }

    setError(null);

    setPin(
      (current) =>
        current.slice(
          0,
          -1,
        ),
    );
  }

  function handleForgotPin() {
    if (verifying) {
      return;
    }

    setError(null);

    router.push(
      "./forgot-pin-math",
    );
  }

  async function handleVerifyPin(
    pinToVerify: string = pin,
  ) {
    if (verifying) {
      return;
    }

    setError(null);

    if (!user?.uid) {
      setError(
        "You must be signed in to continue.",
      );
      return;
    }

    if (
      !isValidPin(
        pinToVerify,
      )
    ) {
      setError(
        "Please enter your four-digit PIN.",
      );
      return;
    }

    setVerifying(true);

    try {
      const pinIsCorrect =
        await verifyParentPin(
          user.uid,
          pinToVerify,
        );

      if (!pinIsCorrect) {
        setPin("");

        setError(
          "The PIN you entered is incorrect.",
        );

        return;
      }

      const children =
        await listChildren(
          user.uid,
        );

      /*
       * A verified parent account without a child profile has not
       * completed onboarding yet.
       */
      if (
        children.length ===
        0
      ) {
        setDestinationAfterUnlock(
          "/child-profile-info",
        );

        unlockParentAccess();
        return;
      }

      /*
       * Repair older accounts that already have a child but still
       * contain onboardingComplete: false in Firestore.
       */
      const profile =
        await getUserProfile(
          user.uid,
        );

      if (
        profile &&
        !profile.onboardingComplete
      ) {
        await completeOnboarding(
          user.uid,
        );
      }

      setDestinationAfterUnlock(
        returnTo === "/paywall" ? "/paywall" : "/home",
      );

      unlockParentAccess();
    } catch (verificationError) {
      console.error(
        "Unable to complete parent verification:",
        verificationError,
      );

      setError(
        verificationError instanceof
          Error
          ? verificationError.message
          : "We couldn’t open the parent area. Please try again.",
      );
    } finally {
      setVerifying(false);
    }
  }

  if (authLoading) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
        <ActivityIndicator
          size="large"
          color={
            colors.primary
          }
        />
      </View>
    );
  }

  return (
    <View
      style={styles.screen}
    >
      <View
        style={
          styles.figmaFrame
        }
      >
        <Pressable
          style={({
            pressed,
          }) => [
            styles.audioButton,

            pressed &&
              styles.controlPressed,

            verifying &&
              styles.disabledButton,
          ]}
          onPress={() =>
            setAudioEnabled(
              (current) =>
                !current,
            )
          }
          disabled={verifying}
          accessibilityRole="button"
          accessibilityLabel={
            audioEnabled
              ? "Turn audio off"
              : "Turn audio on"
          }
          accessibilityState={{
            selected:
              audioEnabled,

            disabled:
              verifying,
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

        <Text
          style={styles.title}
        >
          Parent Verification
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Enter your 4-digit PIN to access
          {"\n"}
          Parent Settings.
        </Text>

        <Text
          style={
            styles.pinLabel
          }
        >
          PIN
        </Text>

        <View
          style={
            styles.pinBoxesRow
          }
        >
          {Array.from(
            {
              length:
                PIN_LENGTH,
            },
            (_, index) => (
              <View
                key={index}
                style={
                  styles.pinBox
                }
                accessibilityLabel={
                  pin[index]
                    ? `PIN digit ${
                        index +
                        1
                      } entered`
                    : `PIN digit ${
                        index +
                        1
                      } empty`
                }
              >
                <Text
                  style={
                    styles.pinDot
                  }
                >
                  {pin[index]
                    ? "•"
                    : ""}
                </Text>
              </View>
            ),
          )}
        </View>

        <View
          style={
            styles.keypad
          }
        >
          {numberRows.map(
            (
              row,
              rowIndex,
            ) => (
              <View
                key={
                  rowIndex
                }
                style={
                  styles.numberRow
                }
              >
                {row.map(
                  (number) => (
                    <Pressable
                      key={
                        number
                      }
                      style={({
                        pressed,
                      }) => [
                        styles.numberButton,

                        pressed &&
                          !verifying &&
                          styles.numberButtonPressed,

                        verifying &&
                          styles.disabledButton,
                      ]}
                      onPress={() =>
                        handleNumberPress(
                          number,
                        )
                      }
                      disabled={
                        verifying
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Enter ${number}`}
                    >
                      <Text
                        style={
                          styles.numberText
                        }
                      >
                        {
                          number
                        }
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
            ),
          )}

          <View
            style={
              styles.specialRow
            }
          >
            <Pressable
              style={({
                pressed,
              }) => [
                styles.specialButton,

                pressed &&
                  !verifying &&
                  styles.numberButtonPressed,

                verifying &&
                  styles.disabledButton,
              ]}
              onPress={
                handleForgotPin
              }
              disabled={
                verifying
              }
              accessibilityRole="button"
              accessibilityLabel="Forgot PIN"
            >
              <Text
                style={
                  styles.specialButtonText
                }
              >
                Forgot{"\n"}PIN? (Math)
              </Text>
            </Pressable>

            <Pressable
              style={({
                pressed,
              }) => [
                styles.zeroButton,

                pressed &&
                  !verifying &&
                  styles.numberButtonPressed,

                verifying &&
                  styles.disabledButton,
              ]}
              onPress={() =>
                handleNumberPress(
                  "0",
                )
              }
              disabled={
                verifying
              }
              accessibilityRole="button"
              accessibilityLabel="Enter zero"
            >
              <Text
                style={
                  styles.numberText
                }
              >
                0
              </Text>
            </Pressable>

            <Pressable
              style={({
                pressed,
              }) => [
                styles.specialButton,

                pressed &&
                  !verifying &&
                  pin.length >
                    0 &&
                  styles.numberButtonPressed,

                (
                  verifying ||
                  pin.length ===
                    0
                ) &&
                  styles.disabledButton,
              ]}
              onPress={
                handleDelete
              }
              disabled={
                verifying ||
                pin.length ===
                  0
              }
              accessibilityRole="button"
              accessibilityLabel="Delete last PIN digit"
            >
              <Text
                style={
                  styles.deleteText
                }
              >
                Delete
              </Text>
            </Pressable>
          </View>
        </View>

        <ErrorMessage
          message={error}
          style={styles.error}
        />

        <View
          style={
            styles.verifyButtonWrapper
          }
        >
          {verifying ? (
            <ActivityIndicator
              size="small"
              color={
                colors.primary
              }
            />
          ) : (
            <AppButton
              title="Verify & Enter"
              onPress={() => {
                void handleVerifyPin();
              }}
              style={
                styles.actionButton
              }
            />
          )}
        </View>

        {childModeActive ? (
          <View
            style={
              styles.backButtonWrapper
            }
          >
            <AppButton
              title="Back to Child Mode"
              onPress={() =>
                router.replace(
                  "/child-dashboard" as Href,
                )
              }
              style={
                styles.actionButton
              }
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,

      backgroundColor:
        colors.background,

      overflow:
        "hidden",
    },

    loadingScreen: {
      flex: 1,

      backgroundColor:
        colors.background,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    /*
     * The whole screen uses the original 402 x 874 Figma coordinate
     * system and therefore never needs a ScrollView.
     */
    figmaFrame: {
      flex: 1,

      width:
        "100%",

      position:
        "relative",

      backgroundColor:
        colors.background,

      overflow:
        "hidden",
    },

    audioButton: {
      position:
        "absolute",

      left:
        x(347),

      top:
        y(48),

      width:
        x(35),

      height:
        x(35),

      alignItems:
        "center",

      justifyContent:
        "center",

      zIndex: 20,
    },

    title: {
      position:
        "absolute",

      left:
        x(20),

      top:
        y(104),

      width:
        x(362),

      height:
        y(39),

      color:
        colors.primary,

      fontFamily:
        "Outfit",

      fontSize:
        x(30),

      lineHeight:
        y(39),

      textAlign:
        "center",

      includeFontPadding:
        false,
    },

    subtitle: {
      position:
        "absolute",

      left:
        x(20),

      top:
        y(158),

      width:
        x(362),

      minHeight:
        y(48),

      color:
        colors.primary,

      fontFamily:
        "Literata",

      fontSize:
        x(20),

      lineHeight:
        y(24),

      textAlign:
        "center",

      includeFontPadding:
        false,
    },

    pinLabel: {
      position:
        "absolute",

      left:
        x(40),

      top:
        y(224),

      width:
        x(322),

      height:
        y(24),

      color:
        colors.primary,

      fontFamily:
        "Literata",

      fontSize:
        x(20),

      lineHeight:
        y(24),

      includeFontPadding:
        false,
    },

    pinBoxesRow: {
      position:
        "absolute",

      left:
        x(40),

      top:
        y(258),

      width:
        x(322),

      height:
        y(62),

      flexDirection:
        "row",

      justifyContent:
        "space-between",
    },

    pinBox: {
      width:
        x(66),

      height:
        y(62),

      borderRadius:
        x(18),

      backgroundColor:
        colors.white,

      alignItems:
        "center",

      justifyContent:
        "center",

      shadowColor:
        "#000000",

      shadowOffset: {
        width: 0,
        height:
          y(3),
      },

      shadowOpacity:
        0.22,

      shadowRadius:
        x(4),

      elevation:
        4,
    },

    pinDot: {
      color:
        colors.primary,

      fontFamily:
        "Literata",

      fontSize:
        x(30),

      lineHeight:
        y(36),

      textAlign:
        "center",

      includeFontPadding:
        false,
    },

    keypad: {
      position:
        "absolute",

      left:
        x(20),

      top:
        y(352),

      width:
        x(362),
    },

    numberRow: {
      width:
        x(240),

      height:
        y(62),

      marginLeft:
        x(61),

      marginBottom:
        y(10),

      flexDirection:
        "row",

      justifyContent:
        "space-between",
    },

    numberButton: {
      width:
        x(66),

      height:
        y(62),

      borderRadius:
        x(18),

      backgroundColor:
        "#DDEAEC",

      alignItems:
        "center",

      justifyContent:
        "center",

      shadowColor:
        "#000000",

      shadowOffset: {
        width: 0,
        height:
          y(3),
      },

      shadowOpacity:
        0.22,

      shadowRadius:
        x(4),

      elevation:
        4,
    },

    numberButtonPressed: {
      opacity:
        0.7,

      transform: [
        {
          scale:
            0.97,
        },
      ],
    },

    numberText: {
      color:
        colors.primary,

      fontFamily:
        "Outfit",

      fontSize:
        x(28),

      lineHeight:
        y(36),

      textAlign:
        "center",

      includeFontPadding:
        false,
    },

    specialRow: {
      width:
        x(322),

      height:
        y(62),

      marginLeft:
        x(20),

      flexDirection:
        "row",

      justifyContent:
        "space-between",
    },

    specialButton: {
      width:
        x(112),

      height:
        y(62),

      borderRadius:
        x(18),

      backgroundColor:
        "#DDEAEC",

      alignItems:
        "center",

      justifyContent:
        "center",

      paddingHorizontal:
        x(5),

      shadowColor:
        "#000000",

      shadowOffset: {
        width: 0,
        height:
          y(3),
      },

      shadowOpacity:
        0.22,

      shadowRadius:
        x(4),

      elevation:
        4,
    },

    zeroButton: {
      width:
        x(66),

      height:
        y(62),

      borderRadius:
        x(18),

      backgroundColor:
        "#DDEAEC",

      alignItems:
        "center",

      justifyContent:
        "center",

      shadowColor:
        "#000000",

      shadowOffset: {
        width: 0,
        height:
          y(3),
      },

      shadowOpacity:
        0.22,

      shadowRadius:
        x(4),

      elevation:
        4,
    },

    disabledButton: {
      opacity:
        0.55,
    },

    specialButtonText: {
      color:
        colors.primary,

      fontFamily:
        "Outfit",

      fontSize:
        x(15),

      lineHeight:
        y(18),

      textAlign:
        "center",

      includeFontPadding:
        false,
    },

    deleteText: {
      color:
        colors.primary,

      fontFamily:
        "Outfit",

      fontSize:
        x(18),

      lineHeight:
        y(23),

      textAlign:
        "center",

      includeFontPadding:
        false,
    },

    error: {
      position:
        "absolute",

      left:
        x(20),

      top:
        y(642),

      width:
        x(362),

      minHeight:
        y(34),
    },

    verifyButtonWrapper: {
      position:
        "absolute",

      left:
        x(96),

      top:
        y(690),

      width:
        x(210),

      height:
        y(52),

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    backButtonWrapper: {
      position:
        "absolute",

      left:
        x(96),

      top:
        y(762),

      width:
        x(210),

      height:
        y(52),
    },

    actionButton: {
      width:
        x(210),

      height:
        y(52),

      borderRadius:
        x(20),

      shadowColor:
        "#000000",

      shadowOffset: {
        width: 0,
        height:
          y(4),
      },

      shadowOpacity:
        0.25,

      shadowRadius:
        x(4),

      elevation:
        5,
    },

    controlPressed: {
      opacity:
        0.65,
    },
  });
