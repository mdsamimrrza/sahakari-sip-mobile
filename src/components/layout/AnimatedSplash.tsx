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
  const { colors, isDark } = useTheme();
  const [hidden, setHidden] = useState(false);

  const overlayOpacity = useRef(new Animated.Value(1)).current;
  // Opens at ~the native splash icon size (~200dp) on the same #EDEAE0
  // background, then settles down to the 84dp mark — so the handoff from
  // the OS / Expo static splash looks like one continuous splash.
  const logoScale = useRef(new Animated.Value(2.4)).current;
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordY = useRef(new Animated.Value(10)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const barProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sequence = Animated.sequence([
      // Logo settles from the static-splash size down to the mark size
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 7,
        tension: 70,
        useNativeDriver: true,
      }),
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
          duration: 600,
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
        duration: 300,
        delay: 100,
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
        // Hardcoded pair matching the native splash backgrounds in app.json
        // (light #EDEAE0 / dark #0B0F19) so the static → animated handoff
        // is invisible in both modes.
        backgroundColor: isDark ? "#0B0F19" : "#EDEAE0",
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
