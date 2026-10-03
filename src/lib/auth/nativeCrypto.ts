// ============================================================
// SahakariSIP - crypto primitives shim (native)
// ============================================================
// Uses expo-crypto (bundled with Expo SDK) so this works in both
// Expo Go and production/development builds without requiring a
// custom native binary. On web, Metro resolves nativeCrypto.web.ts
// instead (WebCrypto), so this file is never loaded there.
// ============================================================

import * as ExpoCrypto from "expo-crypto";

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

export async function pbkdf2Bytes(
  password: string,
  salt: string,
  iterations: number,
  keyBytes: number
): Promise<Uint8Array> {
  // expo-crypto does not expose PBKDF2 directly; fall back to
  // the Web Crypto API which is available on both iOS and Android
  // in React Native's Hermes runtime (v0.71+).
  const subtle = (globalThis.crypto as Crypto).subtle;
  const keyMaterial = await subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations,
    },
    keyMaterial,
    keyBytes * 8
  );
  return new Uint8Array(bits);
}
