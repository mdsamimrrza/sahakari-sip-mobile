// ============================================================
// SahakariSIP - crypto primitives shim (native)
// ============================================================
// Uses expo-crypto (bundled with Expo SDK) so this works in both
// Expo Go and production/development builds without requiring a
// custom native binary. On web, Metro resolves nativeCrypto.web.ts
// instead (WebCrypto), so this file is never loaded there.
// ============================================================

import * as ExpoCrypto from "expo-crypto";
// PBKDF2 MUST use react-native-quick-crypto: Hermes has no global
// WebCrypto (crypto.subtle is undefined on Android), so a WebCrypto
// fallback throws at runtime on native. See AuthContext.tsx history.
import QuickCrypto from "react-native-quick-crypto";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function toB64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromB64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function utf8ToBytes(input: string): Uint8Array {
  return encoder.encode(input);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export async function sha256Hex(input: string): Promise<string> {
  return ExpoCrypto.digestStringAsync(
    ExpoCrypto.CryptoDigestAlgorithm.SHA256,
    input,
    { encoding: ExpoCrypto.CryptoEncoding.HEX }
  );
}

export async function sha256Bytes(input: string): Promise<Uint8Array> {
  const hex = await sha256Hex(input);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function pbkdf2Bytes(
  password: string,
  salt: string,
  iterations: number,
  keyBytes: number
): Uint8Array {
  // Same derivation as the previous inline QuickCrypto call sites:
  // string salt is treated as UTF-8 bytes, matching Node's pbkdf2Sync.
  return new Uint8Array(
    QuickCrypto.pbkdf2Sync(password, salt, iterations, keyBytes, "sha256")
  );
}
