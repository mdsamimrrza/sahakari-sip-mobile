// ============================================================
// SahakariSIP — Local Vault (envelope encryption for device mode)
// ============================================================
// A random 256-bit data-encryption key (DEK) encrypts every local
// store payload at rest (AES-256-GCM). The DEK is wrapped twice:
//   • under the login password (PBKDF2-HMAC-SHA256, 100k rounds)
//   • under the recovery key (SHA-256 — the key is already 128 bits
//     of device randomness, no KDF needed)
// The recovery key is generated on-device, shown exactly once at
// signup, and never stored in plaintext. Cloud mode never touches
// any of this.
// ============================================================

import * as Crypto from "expo-crypto";
import { AESEncryptionKey, AESSealedData } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import {
  bytesToUtf8,
  fromB64,
  pbkdf2Bytes,
  sha256Bytes,
  sha256Hex,
  toB64,
  toHex,
  utf8ToBytes,
} from "./nativeCrypto";
import { log } from "../logger";

const WRAP_ITERATIONS = 100_000;
const DEK_BYTES = 32; // 256 bits
const RECOVERY_BYTES = 16; // 128 bits
const SECURESTORE_PREFIX = "sahakarisip.v1.dek.";

export interface LocalVaultData {
  /** hex salt for the password-wrap PBKDF2 */
  wrap_salt: string;
  /** base64(iv+ct+tag) — DEK encrypted under the password wrap key */
  wrapped_dek_password: string;
  /** base64(iv+ct+tag) — DEK encrypted under the recovery key */
  wrapped_dek_recovery: string;
  /** sha256 hex of the normalized recovery key (verify without GCM round-trips) */
  recovery_key_hash: string;
}

/** The in-memory DEK for the signed-in local profile. Null = locked. */
let activeDek: Uint8Array | null = null;
/** Cached AESEncryptionKey for the active DEK — one native import per
 *  session instead of per encrypt/decrypt call. */
let activeAesKey: AESEncryptionKey | null = null;

async function activeKey(): Promise<AESEncryptionKey> {
  if (!activeDek) throw new Error("Vault is locked.");
  if (!activeAesKey) activeAesKey = await AESEncryptionKey.import(activeDek);
  return activeAesKey;
}

function randomBytes(n: number): Uint8Array {
  return Crypto.getRandomBytes(n);
}

/** Normalized recovery key: uppercase hex, separators stripped. */
function normalizeRecoveryKey(key: string): string {
  return key.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

/** 128-bit recovery key, displayed as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX */
export function formatRecoveryKey(hex: string): string {
  return hex.toUpperCase().match(/.{1,4}/g)!.join("-");
}

async function aesKeyFrom(bytes: Uint8Array): Promise<AESEncryptionKey> {
  return AESEncryptionKey.import(bytes);
}

async function aesWrap(keyBytes: Uint8Array, dek: Uint8Array): Promise<string> {
  const key = await aesKeyFrom(keyBytes);
  const sealed = await Crypto.aesEncryptAsync(dek, key);
  return sealed.combined("base64");
}

async function aesUnwrap(keyBytes: Uint8Array, wrappedB64: string): Promise<Uint8Array> {
  const key = await aesKeyFrom(keyBytes);
  // fromCombined rejects strings on native - decode to bytes first.
  const sealed = AESSealedData.fromCombined(fromB64(wrappedB64));
  return (await Crypto.aesDecryptAsync(sealed, key)) as Uint8Array;
}

async function passwordWrapKeyBytes(password: string, wrapSaltHex: string): Promise<Uint8Array> {
  return pbkdf2Bytes(password, wrapSaltHex, WRAP_ITERATIONS, DEK_BYTES);
}

async function recoveryWrapKeyBytes(normalizedKey: string): Promise<Uint8Array> {
  return sha256Bytes(normalizedKey);
}

/**
 * Create a fresh vault for a new (or upgrading) local profile.
 * The DEK is returned base64 for SecureStore; the recovery key is
 * plaintext for one-time display only.
 */
export async function createVault(
  password: string
): Promise<{ vault: LocalVaultData; dek: string; recoveryKey: string }> {
  const dek = randomBytes(DEK_BYTES);
  const recoveryHex = toHex(randomBytes(RECOVERY_BYTES));
  const normalized = normalizeRecoveryKey(recoveryHex);
  const wrapSalt = randomBytes(16);

  const vault: LocalVaultData = {
    wrap_salt: toHex(wrapSalt),
    wrapped_dek_password: await aesWrap(
      await passwordWrapKeyBytes(password, toHex(wrapSalt)),
      dek
    ),
    wrapped_dek_recovery: await aesWrap(await recoveryWrapKeyBytes(normalized), dek),
    recovery_key_hash: await sha256Hex(normalized),
  };

  return { vault, dek: toB64(dek), recoveryKey: formatRecoveryKey(recoveryHex) };
}

/** Wrap-DEK copy under a (new) password — used for resets and password changes. */
export async function rewrapPassword(
  vault: LocalVaultData,
  dekB64: string,
  newPassword: string
): Promise<LocalVaultData> {
  const salt = randomBytes(16);
  return {
    ...vault,
    wrap_salt: toHex(salt),
    wrapped_dek_password: await aesWrap(
      await passwordWrapKeyBytes(newPassword, toHex(salt)),
      fromB64(dekB64)
    ),
  };
}

/** Forgot-password path: recover the DEK from the recovery key. */
export async function unwrapWithRecoveryKey(
  vault: LocalVaultData,
  recoveryKeyInput: string
): Promise<string> {
  const normalized = normalizeRecoveryKey(recoveryKeyInput);
  if ((await sha256Hex(normalized)) !== vault.recovery_key_hash) {
    log("vault.recoveryKeyMismatch");
    throw new Error("Recovery key is incorrect.");
  }
  const dek = await aesUnwrap(await recoveryWrapKeyBytes(normalized), vault.wrapped_dek_recovery);
  return toB64(dek);
}

/** Verify + recover the DEK with the login password (no SecureStore needed). */
export async function unwrapWithPassword(
  vault: LocalVaultData,
  password: string
): Promise<string> {
  const dek = await aesUnwrap(
    await passwordWrapKeyBytes(password, vault.wrap_salt),
    vault.wrapped_dek_password
  );
  return toB64(dek);
}

/** Unlock the in-memory DEK from a base64 SecureStore value. */
export function unlockVault(dekB64: string): void {
  activeDek = fromB64(dekB64);
  activeAesKey = null;
}

export function lockVault(): void {
  activeDek = null;
  activeAesKey = null;
}

// ---------- SecureStore (DEK at rest, device-keystore backed) ----------

export async function saveDek(profileId: string, dekB64: string): Promise<void> {
  await SecureStore.setItemAsync(SECURESTORE_PREFIX + profileId, dekB64);
}

export async function loadDek(profileId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURESTORE_PREFIX + profileId);
  } catch {
    return null;
  }
}

export async function deleteDek(profileId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURESTORE_PREFIX + profileId);
  } catch {
    // Nothing to delete.
  }
}

// ---------- Payload encryption used by the local data store ----------

/** Encrypt a JSON payload with the active DEK. No DEK → legacy plaintext. */
export async function encryptJson(json: string): Promise<string> {
  if (!activeDek) return json;
  const key = await activeKey();
  // Hermes has TextEncoder but NOT TextDecoder - route both directions
  // through the nativeCrypto shim so reads never hit a missing global.
  const sealed = await Crypto.aesEncryptAsync(utf8ToBytes(json), key);
  return "v1:" + (await sealed.combined("base64"));
}

/** Decrypt a payload written by encryptJson. Legacy plaintext passes through. */
export async function decryptJson(raw: string): Promise<string> {
  if (!raw.startsWith("v1:")) return raw; // legacy plaintext payload
  const key = await activeKey();
  // fromCombined rejects strings on native - hand it raw bytes.
  const sealed = AESSealedData.fromCombined(fromB64(raw.slice(3)));
  const bytes = (await Crypto.aesDecryptAsync(sealed, key)) as Uint8Array;
  return bytesToUtf8(bytes);
}
