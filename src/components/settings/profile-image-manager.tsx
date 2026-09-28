// ============================================================
// SahakariSIP — Profile Image Manager (mobile)
// ============================================================
// Ported from web app (src/components/settings/profile-image-manager.tsx).
// Uses expo-image-picker for selection, expo-file-system for local handling.
// ============================================================

import React, { useRef, useState } from "react";
import { View, Pressable, Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Camera, Loader2, Trash2 } from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme, spacing, radius, fontSize } from "@/theme";
import { Text, Card, Button, Image } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/overlays";

interface Props {
  userName: string;
  userEmail: string;
  initialImage: string | null;
  fundCount: number;
}

export function ProfileImageManager({
  userName,
  userEmail,
  initialImage,
  fundCount,
}: Props) {
  const { colors } = useTheme();
  const { store } = useAuth();
  const { toast } = useToast();

  const [image, setImage] = useState<string | null>(initialImage);
  const [isWorking, setIsWorking] = useState(false);

  const displayName = userName || userEmail || "User";

  async function pickImage() {
    if (isWorking) return;

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission needed", "Please allow access to your photos to upload a profile image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    await uploadImage(result.assets[0]);
  }

  async function uploadImage(asset: ImagePicker.ImagePickerAsset) {
    if (!store) return;
    setIsWorking(true);

    try {
      const mimeType = asset.mimeType || "image/jpeg";
      const result = await store.updateProfileImage(asset.uri, mimeType);

      if (result.success && result.data?.image) {
        setImage(result.data.image);
        toast({ title: "Profile photo updated", variant: "success" });
      } else {
        toast({ title: "Upload failed", description: result.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRemove() {
    if (!store || isWorking) return;

    Alert.alert(
      "Remove profile photo?",
      "Your current profile photo will be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setIsWorking(true);
            try {
              const result = await store.removeProfileImage();
              if (result.success) {
                setImage(null);
                toast({ title: "Profile photo removed", variant: "success" });
              } else {
                toast({ title: "Remove failed", description: result.error, variant: "destructive" });
              }
            } catch (err) {
              toast({ title: "Remove failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
            } finally {
              setIsWorking(false);
            }
          },
        },
      ]
    );
  }

  return (
    <Card
      style={{
        borderWidth: 0,
        ...(Platform.OS === "android"
          ? {
              shadowColor: "#000",
              shadowOpacity: 0.07,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }
          : {}),
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.lg,
          padding: spacing.xl,
        }}
      >
        <View style={{ position: "relative", flexShrink: 0 }}>
          <Image uri={image} initial={displayName[0].toUpperCase()} size={64} />
          <Pressable
            onPress={pickImage}
            disabled={isWorking}
            accessibilityLabel={image ? "Change profile photo" : "Add profile photo"}
            style={{
              position: "absolute",
              bottom: -4,
              right: -4,
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: colors.card,
            }}
          >
            {isWorking ? (
              <Loader2 size={14} color={colors.primaryForeground} />
            ) : (
              <Camera size={14} color={colors.primaryForeground} />
            )}
          </Pressable>
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
          <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
            {displayName}
          </Text>
          <Text variant="caption" color={colors.mutedForeground} numberOfLines={1}>
            {userEmail}
          </Text>

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" }}>
            <Button
              variant="outline"
              size="sm"
              disabled={isWorking}
              onPress={pickImage}
            >
              <Camera size={14} color={colors.foreground} />
              <Text variant="label" style={{ marginLeft: spacing.xs }}>
                {image ? "Change photo" : "Add photo"}
              </Text>
            </Button>
            {image && (
              <Button
                variant="ghost"
                size="sm"
                disabled={isWorking}
                onPress={handleRemove}
                textColor={colors.rose}
              >
                <Trash2 size={14} color={colors.rose} />
                <Text variant="label" style={{ marginLeft: spacing.xs, color: colors.rose }}>
                  Remove
                </Text>
              </Button>
            )}
          </View>
        </View>

        <View
          style={{
            flexShrink: 0,
            alignItems: "center",
            gap: 2,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            borderRadius: radius.xl,
            backgroundColor: `${colors.primary}10`,
          }}
        >
          <Text variant="title" style={{ fontWeight: "900", color: colors.primary, fontVariant: ["tabular-nums"] }}>
            {fundCount}
          </Text>
          <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>
            {fundCount === 1 ? "Fund" : "Funds"}
          </Text>
        </View>
      </View>
    </Card>
  );
}