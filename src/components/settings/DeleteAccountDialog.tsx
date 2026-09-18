// ============================================================
// SahakariSIP — Danger Zone: delete account & data
// ============================================================
// Mobile port of `src/components/settings/delete-account-dialog.tsx`.
// The web app requires the user to type DELETE to arm the button; that
// guard is preserved exactly.
//
// Difference from the web app: there is no server-side RPC to purge an
// auth row, so the mobile app deletes every row the user owns through
// the active DataStore (RLS-scoped on cloud, key-scoped on device) and
// then clears the session.
// ============================================================

import React, { useState } from "react";
import { View } from "react-native";
import { AlertTriangle } from "lucide-react-native";

import { useTheme, spacing, fontSize } from "../../theme";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  Text,
  Card,
  CardHeader,
  CardTitle,
  Button,
  Input,
} from "../ui/primitives";
import { Modal, useToast } from "../ui/overlays";

export function DeleteAccountDialog() {
  const { colors } = useTheme();
  const { deleteAccount } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleDeleteAccount() {
    if (confirmText !== "DELETE") return;
    setIsLoading(true);

    try {
      const result = await deleteAccount();

      if (!result.success) {
        toast({
          title: "Deletion failed",
          description: result.error ?? "An unexpected error occurred.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Account deleted",
          description: "Your account and portfolio data have been removed.",
          variant: "success",
        });
        setOpen(false);
      }
    } catch {
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    }

    setIsLoading(false);
    setConfirmText("");
  }

  return (
    <>
      <Card
        style={{
          borderColor: colors.destructive,
          backgroundColor: `${colors.destructive}0D`,
        }}
      >
        <CardHeader>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <AlertTriangle size={17} color={colors.destructive} />
            <CardTitle style={{ color: colors.destructive, fontWeight: "900" }}>
              Danger Zone
            </CardTitle>
          </View>
          <Text
            variant="caption"
            color={colors.mutedForeground}
            style={{ marginTop: 4, fontSize: fontSize.sm }}
          >
            Permanently delete your account and remove all fund configurations and SIP
            entries.
          </Text>
        </CardHeader>

        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}>
          <Button
            variant="destructive"
            size="sm"
            onPress={() => {
              setConfirmText("");
              setOpen(true);
            }}
          >
            Delete Account
          </Button>
        </View>
      </Card>

      <Modal
        visible={open}
        onClose={() => setOpen(false)}
        title="Delete Account & Data"
        description="This action is irreversible. All your tracked funds, purchase entries, and performance calculations will be permanently purged."
        footer={
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button variant="outline" style={{ flex: 1 }} onPress={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              style={{ flex: 1 }}
              disabled={confirmText !== "DELETE"}
              loading={isLoading}
              onPress={handleDeleteAccount}
            >
              Delete Permanently
            </Button>
          </View>
        }
      >
        <View style={{ gap: spacing.sm }}>
          <Input
            label='Type "DELETE" to confirm'
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder="DELETE"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }}>
            This cannot be undone. Export anything you want to keep before continuing.
          </Text>
        </View>
      </Modal>
    </>
  );
}
