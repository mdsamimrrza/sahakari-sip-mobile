// ============================================================
// SahakariSIP — Settings "Go Cloud" card
// ============================================================
// The ONLY path to merging. Nothing is uploaded unless the user
// comes here and agrees:
//   • Device-mode user → "Go Cloud" row opens a sign-in / create-
//     account sheet; on success the merge confirm dialog appears
//     (MergePromptDialog, root-mounted) and the session is now cloud.
//   • Cloud-mode user with unmerged phone data → "Move phone data
//     to cloud" row; tapping it raises the same confirm dialog.
// ============================================================

import React, { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Cloud } from "lucide-react-native";

import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme, spacing, fontSize } from "@/theme";
import { Text, Input, Button } from "@/components/ui/primitives";
import { Modal, useToast } from "@/components/ui/overlays";
import { SettingsGroup, SettingsRow } from "@/components/settings/menu";

const ROW_ICON_SIZE = 18;
const ROW_ICON_STROKE = 2;

export function GoCloudCard() {
  const {
    cloudAvailable,
    dataMode,
    hasUnmergedLocalData,
    offerMerge,
    refreshLocalDataCheck,
    signIn,
    signUp,
    signInWithGoogle,
  } = useAuth();
  const { colors } = useTheme();
  const { toast } = useToast();

  // ---- Go Cloud sheet state ----
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the row honest whenever Settings comes into focus (e.g. after a
  // merge or a mode change elsewhere).
  useFocusEffect(
    useCallback(() => {
      refreshLocalDataCheck();
    }, [refreshLocalDataCheck])
  );

  if (!cloudAvailable) return null;

  function openSheet() {
    setError(null);
    setCreateMode(false);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setSheetOpen(true);
  }

  async function handleSubmit() {
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (createMode && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const res = createMode
      ? await signUp(email, password, confirmPassword, "cloud")
      : await signIn(email, password, "cloud");
    setSubmitting(false);

    if (!res.success) {
      setError(res.error ?? "Something went wrong. Please try again.");
      return;
    }
    if (res.needsEmailConfirmation) {
      setSheetOpen(false);
      toast({
        title: "Confirm your email",
        description:
          "We sent you a confirmation link. Confirm, then sign in here to move your data.",
      });
      return;
    }
    // Session is now cloud — ask before moving anything.
    setSheetOpen(false);
    await offerMerge();
  }

  async function handleGoogle() {
    setError(null);
    setGoogleSubmitting(true);
    const res = await signInWithGoogle("cloud");
    setGoogleSubmitting(false);
    if (!res.success) {
      setError(res.error ?? "Google sign-in failed. Please try again.");
      return;
    }
    setSheetOpen(false);
    await offerMerge();
  }

  // ---- Cloud mode: only show the row when there is something to move ----
  if (dataMode === "cloud") {
    if (hasUnmergedLocalData !== true) return null;
    return (
      <SettingsGroup title="Data">
        <SettingsRow
          tint={colors.info}
          icon={<Cloud size={ROW_ICON_SIZE} color={colors.info} strokeWidth={ROW_ICON_STROKE} />}
          label="Move phone data to cloud"
          subtitle="This phone has entries that aren't in your cloud account yet."
          badge="New"
          last
          onPress={() => {
            void offerMerge();
          }}
        />
      </SettingsGroup>
    );
  }

  // ---- Device mode: the Go Cloud entry point ----
  return (
    <>
      <SettingsGroup title="Data">
        <SettingsRow
          tint={colors.info}
          icon={<Cloud size={ROW_ICON_SIZE} color={colors.info} strokeWidth={ROW_ICON_STROKE} />}
          label="Go Cloud"
          subtitle={
            hasUnmergedLocalData
              ? "Create a cloud account and bring this phone's data with you."
              : "Back up your portfolio to a cloud account."
          }
          last
          onPress={openSheet}
        />
      </SettingsGroup>

      <Modal
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Go Cloud"
        description="Sign in to a cloud account or create one. Your data stays on this phone until you agree to merge it."
      >
        <View style={{ gap: spacing.md }}>
          <Button
            variant="outline"
            fullWidth
            loading={googleSubmitting}
            onPress={handleGoogle}
          >
            Continue with Google
          </Button>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder={createMode ? "At least 8 characters" : "Enter your password"}
            secureTextEntry
            autoCapitalize="none"
            textContentType={createMode ? "newPassword" : "password"}
          />
          {createMode ? (
            <Input
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat your password"
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
            />
          ) : null}

          {error ? (
            <Text color={colors.destructive} style={{ fontSize: fontSize.sm }}>
              {error}
            </Text>
          ) : null}

          <Button fullWidth size="lg" loading={submitting} onPress={handleSubmit}>
            {createMode ? "Create account" : "Sign in"}
          </Button>

          <Pressable
            onPress={() => {
              setCreateMode((v) => !v);
              setError(null);
            }}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text
              align="center"
              color={colors.primary}
              style={{ fontWeight: "700", fontSize: fontSize.sm }}
            >
              {createMode
                ? "Already have an account? Sign in"
                : "New to cloud? Create an account"}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}
