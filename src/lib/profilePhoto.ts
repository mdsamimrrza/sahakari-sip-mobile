// ============================================================
// SahakariSIP — On-device profile photos
// ============================================================
// Lets the user attach a photo to their profile without any server:
// the picked image is copied into the app's document directory (safe
// from OS cache eviction) and the path is remembered per user id in
// AsyncStorage. Works for cloud and on-device profiles alike — the
// photo itself never leaves the phone.
// ============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { Paths, copyAsync, deleteAsync, makeDirectoryAsync } from "expo-file-system";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

const PHOTOS_KEY = "sahakarisip.v1.profile_photos";
const PHOTO_DIR = "profile-photos";

type PhotoMap = Record<string, { uri: string; updatedAt: string }>;

async function readMap(): Promise<PhotoMap> {
  try {
    const raw = await AsyncStorage.getItem(PHOTOS_KEY);
    return raw ? (JSON.parse(raw) as PhotoMap) : {};
  } catch {
    return {};
  }
}

function extFor(asset: { name?: string; mimeType?: string }): string {
  const fromName = asset.name?.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  const fromMime = asset.mimeType?.split("/").pop()?.toLowerCase();
  if (fromMime && /^[a-z0-9+.-]{2,10}$/.test(fromMime)) {
    return fromMime === "jpeg" ? "jpg" : fromMime;
  }
  return "jpg";
}

/** Locally stored photo URI for this user, if they set one. */
export async function getProfilePhoto(userId: string): Promise<string | null> {
  const map = await readMap();
  return map[userId]?.uri ?? null;
}

/**
 * Opens the system picker for an image and stores it for this user.
 * Returns the stored URI, or null when the user cancelled.
 * Throws with a friendly message when the pick/store fails.
 */
export async function pickAndStoreProfilePhoto(userId: string): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: "image/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled) return null;

  const asset = res.assets[0];
  const mime = asset.mimeType ?? "";
  const looksImage =
    mime === "" || mime.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(asset.name ?? "");
  if (!looksImage) {
    throw new Error("Please choose an image file (JPG or PNG).");
  }

  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const destUri = `${Paths.document.uri}${PHOTO_DIR}/profile-${safeId}.${extFor(asset)}`;

  try {
    await makeDirectoryAsync(`${Paths.document.uri}${PHOTO_DIR}`, { intermediates: true });
    // Remove the previous photo first so stale extensions don't pile up.
    const map = await readMap();
    const prev = map[userId]?.uri;
    if (prev && prev !== destUri) {
      try {
        await deleteAsync(prev, { idempotent: true });
      } catch {
        // non-fatal — the old file just lingers
      }
    }
    await copyAsync({ from: asset.uri, to: destUri });
    await AsyncStorage.setItem(
      PHOTOS_KEY,
      JSON.stringify({ ...map, [userId]: { uri: destUri, updatedAt: new Date().toISOString() } })
    );
    return destUri;
  } catch {
    // Storage copy failed (e.g. web) — fall back to the picked URI itself.
    const map = await readMap();
    await AsyncStorage.setItem(
      PHOTOS_KEY,
      JSON.stringify({ ...map, [userId]: { uri: asset.uri, updatedAt: new Date().toISOString() } })
    );
    return asset.uri;
  }
}

/** Removes this user's local photo (reveals the provider avatar or initial). */
export async function removeProfilePhoto(userId: string): Promise<void> {
  const map = await readMap();
  const prev = map[userId]?.uri;
  if (prev) {
    try {
      await deleteAsync(prev, { idempotent: true });
    } catch {
      // ignore — mapping cleanup below is what matters
    }
  }
  const { [userId]: _dropped, ...rest } = map;
  await AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify(rest));
}

/**
 * Shared photo resolution for every avatar in the app (header icon,
 * menus, profile hero): local pick wins, then the web/provider photo,
 * then null (caller shows the initial). Refreshes on screen focus and
 * falls back to null if the URL fails to load.
 */
export function useProfilePhotoUri(
  userId?: string,
  remoteUrl?: string | null
): {
  uri: string | null;
  hasCustom: boolean;
  onError: () => void;
  reload: () => Promise<void>;
} {
  const [custom, setCustom] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setCustom(null);
      return;
    }
    setCustom(await getProfilePhoto(userId));
    setFailed(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!active) return;
        await reload();
      })();
      return () => {
        active = false;
      };
    }, [reload, remoteUrl])
  );

  const raw = custom ?? remoteUrl ?? null;
  return {
    uri: failed ? null : raw,
    hasCustom: custom !== null,
    onError: () => setFailed(true),
    reload,
  };
}
