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

interface DeleteAccountDialogProps {
  fundCount?: number;
  entryCount?: number;
}

export function DeleteAccountDialog({
  fundCount,
  entryCount,
}: DeleteAccountDialogProps) {
  const { colors } = useTheme();
  const { deleteAccount } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const hasCounts = fundCount !== undefined || entryCount !== undefined;

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
          borderWidth: 0,
          borderLeftWidth: 3,
          borderLeftColor: colors.destructive,
          backgroundColor: `${colors.destructive}0F`,
          shadowColor: "#000",
          shadowOpacity: 0.07,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <CardHeader>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View
              style={{
                height: 32,
                width: 32,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${colors.destructive}1F`,
              }}
            >
              <AlertTriangle size={16} color={colors.destructive} />
            </View>
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
          {hasCounts && (
            <Text
              variant="caption"
              color={colors.foreground}
              style={{ marginTop: 4, fontSize: fontSize.sm, fontWeight: "700" }}
            >
              This will erase{" "}
              <Text style={{ fontVariant: ["tabular-nums"] }}>{fundCount ?? 0}</Text>{" "}
              {fundCount === 1 ? "fund" : "funds"} and{" "}
              <Text style={{ fontVariant: ["tabular-nums"] }}>{entryCount ?? 0}</Text>{" "}
              {entryCount === 1 ? "entry" : "entries"}.
            </Text>
          )}
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
