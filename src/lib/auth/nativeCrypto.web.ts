// ============================================================
// SahakariSIP - crypto primitives shim (web)
// ============================================================
// Browser stand-in for nativeCrypto.ts: WebCrypto (async only) plus
// btoa/atob. Metro resolves this file for the web platform, so
// react-native-quick-crypto never enters the web bundle. Outputs are
// byte-compatible with the native shim (utf8 string inputs, SHA-256,
// PBKDF2-HMAC-SHA256).
// ============================================================

const subtle = globalThis.crypto.subtle;
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

async function sha256(input: string): Promise<Uint8Array> {
  return new Uint8Array(await subtle.digest("SHA-256", encoder.encode(input)));
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await sha256(input));
}

export async function sha256Bytes(input: string): Promise<Uint8Array> {
  return sha256(input);
}

export async function pbkdf2Bytes(
  password: string,
  salt: string,
  iterations: number,
  keyBytes: number
): Promise<Uint8Array> {
  const key = await subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations },
    key,
    keyBytes * 8
  );
  return new Uint8Array(bits);
}
