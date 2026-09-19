// ============================================================
// SahakariSIP — Animated splash
// ============================================================
// A JS-driven splash that plays on every cold start, right after the
// native splash hides: the logo mark springs in, the wordmark fades up,
// a thin progress bar fills, then the whole overlay fades out and the
// app takes over.
// ============================================================

import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { useTheme, fontSize } from "@/theme";
import { LogoMark } from "./AppLogo";
import { Text } from "../ui/primitives";

export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(false);

  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.55)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordY = useRef(new Animated.Value(10)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const barProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sequence = Animated.sequence([
      // Logo springs in
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 90,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]),
      // Wordmark fades up
      Animated.parallel([
        Animated.timing(wordOpacity, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(wordY, {
          toValue: 0,
          duration: 320,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      // Tagline + progress bar fill
      Animated.parallel([
        Animated.timing(tagOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(barProgress, {
          toValue: 1,
          duration: 850,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    ]);

    sequence.start(({ finished }) => {
      if (!finished) return;
      // Hold a beat, then fade the whole overlay away
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 320,
        delay: 200,
        useNativeDriver: true,
      }).start(({ finished: fadeFinished }) => {
        if (fadeFinished) {
          setHidden(true);
          onDone();
        }
      });
    });

    return () => sequence.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hidden) return null;

  return (
    <Animated.View
      pointerEvents="auto"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        elevation: 100,
        backgroundColor: colors.background,
        alignItems: "center",
        justifyContent: "center",
        opacity: overlayOpacity,
      }}
    >
      <Animated.View
        style={{
          alignItems: "center",
          opacity: logoOpacity,
          transform: [{ scale: logoScale }],
        }}
      >
        <LogoMark size={84} />
      </Animated.View>

      <Animated.View
        style={{
          alignItems: "center",
          marginTop: 14,
          opacity: wordOpacity,
          transform: [{ translateY: wordY }],
        }}
      >
        <Text
          style={{
            fontSize: fontSize.xxl,
            fontWeight: "900",
            letterSpacing: -0.5,
          }}
        >
          Sahakari
          <Text
            style={{
              fontSize: fontSize.xxl,
              fontWeight: "900",
              letterSpacing: -0.5,
            }}
            color={colors.secondary}
          >
            SIP
          </Text>
        </Text>
      </Animated.View>

      <Animated.View style={{ opacity: tagOpacity, marginTop: 6 }}>
        <Text
          variant="micro"
          color={colors.mutedForeground}
          style={{ letterSpacing: 2 }}
        >
          MUTUAL FUND PORTFOLIO LEDGER
        </Text>
      </Animated.View>

      <View
        style={{
          marginTop: 28,
          height: 3,
          width: 132,
          borderRadius: 2,
          backgroundColor: colors.muted,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={{
            height: 3,
            borderRadius: 2,
            backgroundColor: colors.primary,
            width: barProgress.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
          }}
        />
      </View>
    </Animated.View>
  );
}
