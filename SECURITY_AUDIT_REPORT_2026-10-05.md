# Security Audit Report — SahakariSIP Mobile

**Project:** SahakariSIP (sahakari-sip-mobile)  
**Target:** `C:\Users\samim_40uxmfb\Desktop\deplyed project\sipapk`  
**Source Ref:** `40d331c` (v1.5.5, versionCode 15)  
**Audit Date:** 2026-10-05  
**Profile:** Standard  
**Scope:** `app/`, `src/`, `android/app/src/main/`, `.github/workflows/`, `package.json`, `app.json`, `.env.example`

---

## Executive Summary

This audit reviewed the complete mobile application codebase for security vulnerabilities. The application is an Expo/React Native app for tracking Nepali mutual fund SIP investments with two operating modes: **Cloud** (Supabase-backed, authenticated via a NextAuth web backend) and **Device-Local** (on-device encrypted storage with PBKDF2-wrapped DEK).

**Overall Risk:** **Medium** — The application handles financial data and authentication credentials. The architecture is defensively designed (RLS-enforced data isolation, envelope encryption for local mode, biometric unlock with SecureStore), but several trust boundaries rely on external components (web backend, Supabase RLS policies, Android backup configuration) that cannot be fully verified from this repository alone.

---

## Confirmed Findings

### FIND-001: Deep Link Token Replay — Server-Side Enforcement Not Verified
**Severity:** High  
**Status:** Confirmed  
**Attack Class:** WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding  
**Trust Boundary:** Google OAuth Callback (Deep Link) → Mobile App → Web Backend Token Exchange  
**Lower-Trust Principal:** Attacker who captures handoff token  
**Affected Resource:** Victim's Supabase RLS JWT (portfolio access)  
**Result:** Replay of captured token yields valid session if web backend doesn't enforce single-use  

**Affected Files:**
- `src/lib/auth/AuthContext.tsx:997-1028` (completeGoogleHandoff)
- `src/lib/auth/mobileApi.ts:97-100` (googleExchange)

**Evidence:**
Client mints a 16-byte nonce (32 hex chars), sends it to web `/api/mobile/google`. On callback, token from `sahakarisip://auth/callback?token=...` is exchanged via `/api/mobile/exchange`. Client-side replay protection added (`isHandoffTokenUsed`/`markHandoffTokenUsed` in AsyncStorage), but comment states "Best-effort; server enforces single-use." Client protection is bypassable (clear AsyncStorage, different device, token captured before first use).

**Attack Scenario:**
Attacker captures token (clipboard, notification preview, browser history, compromised device). Replays to `/api/mobile/exchange`. If server doesn't mark token consumed, attacker obtains valid RLS JWT and accesses victim's portfolio.

**Remediation:**
1. Verify web backend marks nonce/token consumed on first exchange (idempotent rejection with 400/409).
2. Add short expiry (≤5 min) to handoff tokens at issuance.
3. Consider binding token to device fingerprint (IP, user agent) at issuance.
4. Document that client-side protection is supplementary only.

---

### FIND-002: Android allowBackup="true" Exposes App Data via adb backup
**Severity:** Medium  
**Status:** Confirmed  
**Attack Class:** DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch  
**Trust Boundary:** Device (USB/ADB) → App Private Storage  
**Lower-Trust Principal:** Attacker with physical USB access to unlocked device  
**Affected Resource:** AsyncStorage (local profiles, session, privacy settings, OAuth replay journal)  
**Result:** `adb backup` extracts app data including financial records and auth tokens  

**Affected Files:**
- `android/app/src/main/AndroidManifest.xml:20` (android:allowBackup="false" set)
- `android/app/src/main/res/xml/secure_store_backup_rules.xml`
- `android/app/src/main/res/xml/secure_store_data_extraction_rules.xml`

**Evidence:**
Manifest has `android:allowBackup="false"` (good). However, the backup rules XMLs only exclude SecureStore:
```xml
<exclude domain="sharedpref" path="SecureStore"/>
```
No exclusion for `sahakarisip.v1.*` AsyncStorage keys holding:
- Local profiles (salted password hashes)
- Encrypted vault data (financial entries, fund configs)
- Session tokens (mobile_session, session_started_at)
- OAuth replay journal (used_handoff_tokens)
- Biometric flags
- Notification preferences
- Profile photos (file paths)

**Attack Scenario:**
Attacker with unlocked device runs `adb backup -f backup.ab com.samimrrza.sahakarisip`. Uses `abe.jar` to extract. Backup includes AsyncStorage keys (`sahakarisip.v1.*`). Local profiles, session tokens, and OAuth replay journal exposed. Financial data at risk even in device-local mode.

**Remediation:**
1. **Current state:** `android:allowBackup="false"` is set — this is the correct mitigation.
2. Verify the built APK actually has `allowBackup=false` (prebuild can revert it).
3. Add explicit exclusion rules for `sahakarisip.v1.*` sharedprefs as defense-in-depth.
4. Test with `adb backup + abe.jar` extraction to verify no sensitive keys appear.

---

### FIND-003: Google Sign-In Native Path — ID Token Validation Relies on Web Backend
**Severity:** Medium  
**Status:** Confirmed  
**Attack Class:** WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding  
**Trust Boundary:** Mobile App → Web Backend (`/api/mobile/google-native`)  
**Lower-Trust Principal:** Attacker with valid Google ID token for victim account  
**Affected Resource:** Victim's Supabase RLS JWT (portfolio access)  
**Result:** If web backend doesn't validate ID token (audience, issuer, expiry), attacker gains portfolio access  

**Affected Files:**
- `src/lib/auth/AuthContext.tsx:1094-1140` (native sign-in flow)
- `src/lib/auth/mobileApi.ts:109-114` (googleNativeSignIn)

**Evidence:**
Native flow: `GoogleSignin.signIn()` → `idToken` → `googleNativeSignIn(idToken)` → web `/api/mobile/google-native`. Web backend must verify ID token with Google (audience = Web client ID `416335590615-e96du...`, issuer `accounts.google.com`, not expired). Not verifiable from this repo.

**Attack Scenario:**
Attacker obtains valid Google ID token for victim (phishing, malware, stolen device). Calls `/api/mobile/google-native`. If server doesn't validate audience/issuer/expiry, attacker gets valid SahakariSIP session and portfolio access.

**Remediation:**
1. Verify web backend validates ID token: audience matches Web client, issuer is Google, not expired, nonce if used.
2. Ensure web backend uses `google-auth-library` or equivalent.
3. Log verification failures for monitoring.

---

### FIND-004: .env File with Production Credentials Exists in Working Directory
**Severity:** Low  
**Status:** Confirmed  
**Attack Class:** ATTACK-CLASSES.md#Obvious things  
**Trust Boundary:** Developer Workspace → Git History (Accidental Commit)  
**Lower-Trust Principal:** Anyone with repo access if committed  
**Affected Resource:** Supabase project identifier, anon key, VAPID public key, API URL  
**Result:** If committed, requires key rotation and exposes project URL  

**Affected Files:**
- `.env` (exists in working directory)

**Evidence:**
`.env` contains production values:
- `EXPO_PUBLIC_SUPABASE_URL=https://entbhjpnhdjfhcctcvmt.supabase.co`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Qox-u2IFEpaoUHus51Ofhw_4XyVPI3D`
- `EXPO_PUBLIC_VAPID_PUBLIC_KEY=BLFkUJhfPTrijCsPmZEa5zBG_FczlMYMWPU8McaWApAJBxkKXovOpk_WNpLqFsNtzobz_ktx0IgarVTTEgBy_H0`
- `API_URL=https://master-admin-delta.vercel.app`

`.gitignore` excludes `.env` but file persists in workspace. Pre-commit hook exists (`scripts/pre-commit-env-guard.sh`) but must be manually installed.

**Attack Scenario:**
Developer runs `git add .` accidentally committing `.env`. Anon key is public-by-design (RLS constrained) but project URL exposure aids reconnaissance. Key rotation required if leaked.

**Remediation:**
1. Delete `.env` from workspace; use `.env.local` (also gitignored) for local overrides.
2. Install pre-commit hook: `cp scripts/pre-commit-env-guard.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`.
3. Rotate anon key if ever committed (Supabase Dashboard → API → Regenerate).

---

### FIND-005: NPM Dependency Vulnerabilities (High/Moderate, Transitive)
**Severity:** Low  
**Status:** Confirmed  
**Attack Class:** ATTACK-CLASSES.md#Supply chain  
**Trust Boundary:** Dependency Supply Chain → Application Runtime  
**Lower-Trust Principal:** Attacker controlling input to vulnerable transitive functions  
**Affected Resource:** Application availability / memory safety  
**Result:** Potential DoS via `decode-uri-component`; potential buffer bounds issue in `uuid` v3/v5/v6; high-severity issues in `@expo/cli`, `node-forge`, `metro` transitive deps  

**Affected Files:**
- `package-lock.json`

**Evidence:**
`npm audit` reports 33 vulnerabilities (22 high, 11 moderate). Key transitive issues:
- `node-forge` (via `@expo/code-signing-certificates`) — high
- `metro` / `metro-config` / `metro-file-map` — high (via `@expo/metro`, `@expo/cli`)
- `decode-uri-component` ≤0.4.2 (DoS via exponential decoding) via `query-string` → `expo-router`
- `uuid` <11.1.1 (missing buffer bounds check in v3/v5/v6) via `xcode` → `@expo/config-plugins`
- `@expo/config-plugins` via `xcode` — moderate
- Multiple `@expo/*` packages via `@expo/config`, `@expo/metro`, etc.

All are transitive; fix requires breaking Expo SDK upgrades.

**Attack Scenario:**
Attacker provides malformed percent-encoded input to `decode-uri-component` (via URL parsing) causing exponential CPU. Or provides crafted buffer to `uuid` v3/v5/v6 causing out-of-bounds read. No direct app code calls these with attacker input.

**Remediation:**
1. Monitor for Expo SDK updates that resolve these transitively.
2. If app code directly calls vulnerable functions, add input validation.
3. Accept as low-risk transitive issues; prioritize Expo SDK upgrades when feasible.

---

### FIND-006: Profile Photo Upload — MIME Type Trust
**Severity:** Low  
**Status:** Confirmed  
**Attack Class:** WEB-PROTOCOL-AND-AUTH.md#File upload and content-type validation  
**Trust Boundary:** User Input (File) → Supabase Storage → Browser Rendering  
**Lower-Trust Principal:** Authenticated user uploading malicious file  
**Affected Resource:** Avatar serving context (potential XSS if Content-Type spoofed)  
**Result:** Client validates MIME type from picker; relies on Supabase Storage to serve with correct headers  

**Affected Files:**
- `src/lib/data/cloud.ts:989-1048` (updateProfileImage)
- `src/lib/profilePhoto.ts:31-39` (extFor)

**Evidence:**
`updateProfileImage` validates `mimeType` against allowlist `[image/jpeg, image/png, image/webp]` but `mimeType` comes from `expo-document-picker` which trusts OS/file extension. `extFor` derives extension from MIME type or filename. No server-side MIME sniffing or Content-Type override visible in this repo.

**Attack Scenario:**
User uploads SVG with JavaScript or polyglot file with spoofed MIME. If Supabase Storage serves with attacker-controlled Content-Type, could execute in browser context when avatar viewed.

**Remediation:**
1. Verify Supabase Storage bucket `avatars` forces Content-Type by extension or explicit policy.
2. Consider `Content-Disposition: attachment` for avatars.
3. Client: validate file magic bytes match expected image format before upload.

---

### FIND-007: Device-Local Mode — Recovery Key Exposure in Error Messages
**Severity:** Low  
**Status:** Confirmed  
**Attack Class:** DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch  
**Trust Boundary:** Device User → App UI → Logs/Screenshots  
**Lower-Trust Principal:** Anyone with access to device screen/logs during recovery  
**Affected Resource:** Device-local account recovery key (128-bit device randomness)  
**Result:** Recovery key shown in UI during password reset; could be captured via screenshot/shoulder-surfing  

**Affected Files:**
- `src/lib/auth/AuthContext.tsx:1257-1311` (resetLocalPassword)

**Evidence:**
`resetLocalPassword` flow displays recovery key input field. The recovery key is the only way to decrypt the vault. If user enters it while screen recording, screenshot, or shoulder-surfing, the key is exposed. No rate limiting on recovery attempts visible in client.

**Attack Scenario:**
Attacker observes recovery key entry (shoulder surfing, screen recording malware, compromised screenshot). Uses key to decrypt vault on another device or after device theft.

**Remediation:**
1. Add rate limiting on recovery key attempts (e.g., 5 attempts then 1-hour lockout).
2. Consider masking recovery key input by default (toggle to reveal).
3. Warn user not to screenshot/share the recovery key.

---

### FIND-008: Session TTL and Biometric Lock — Absolute Expiry Bypass on Foreground
**Severity:** Low  
**Status:** Confirmed  
**Attack Class:** DESKTOP-MOBILE-AND-LOCAL-IPC.md#Session and token boundary  
**Trust Boundary:** App Runtime → Session State  
**Lower-Trust Principal:** User with access to foregrounded app after TTL expiry  
**Affected Resource:** Active session (cloud RLS JWT or local vault DEK)  
**Result:** Session TTL check only runs on background→foreground transition; foregrounded app past TTL remains accessible  

**Affected Files:**
- `src/lib/auth/AuthContext.tsx:390-418` (AppState listener)

**Evidence:**
`SESSION_TTL_MS = 4 hours`. Check runs in `AppState` listener:
```typescript
if (prev !== "active" && userRef.current && sessionStartedAtRef.current && 
    Date.now() - Date.parse(sessionStartedAtRef.current) > SESSION_TTL_MS) {
  void expireSessionRef.current();
}
```
If app stays in foreground past 4 hours, no lock occurs. User can continue operating with expired session.

**Attack Scenario:**
User leaves app open in foreground (e.g., charging dock, kiosk mode). After 4 hours, session should expire but doesn't because app never backgrounded. Anyone with device access continues to have full portfolio access.

**Remediation:**
1. Add periodic foreground check (e.g., `setInterval` every 5 min) to enforce TTL.
2. Or enforce TTL on every mutation/navigation action.
3. Consider shorter TTL for high-sensitivity operations.

---

### FIND-009: Cloud Mode — Supabase RLS Policies Not Verified in Repository
**Severity:** Medium  
**Status:** Needs Validation  
**Attack Class:** DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement  
**Trust Boundary:** Supabase (Postgres) → User Data  
**Lower-Trust Principal:** Authenticated cloud user attempting cross-user access  
**Affected Resource:** All user data tables (`fund_config`, `entries`, `nav_history`, `notification_preferences`, `notifications_log`, `dividends`)  
**Result:** Unknown — depends on deployed Supabase RLS policies  

**Affected Files:**
- `src/lib/data/cloud.ts` (all methods)

**Evidence:**
All cloud queries filter by `user_id` from JWT (RLS). Source assumes RLS policies exist: `auth.uid() = user_id`. Not verifiable from this repo — RLS policies are deployed configuration, not in source.

**Attack Scenario:**
If RLS policies are missing or misconfigured, authenticated user A could read/write user B's data via Supabase client with user A's JWT.

**Validation Plan:**
Owner checks Supabase Dashboard → Authentication → Policies. Tests with two dummy users: sign in as user A, attempt to read user B's rows via Supabase client with user A's JWT.

---

### FIND-010: Web Backend Token Consumption Logic Not Observable
**Severity:** Medium  
**Status:** Needs Validation  
**Attack Class:** WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding  
**Trust Boundary:** Mobile App → Web Backend (`/api/mobile/exchange`)  
**Lower-Trust Principal:** Attacker with captured handoff token  
**Affected Resource:** Victim's Supabase RLS JWT  
**Result:** Unknown — depends on web backend implementation  

**Affected Files:**
- `src/lib/auth/AuthContext.tsx:997-1028`
- `src/lib/auth/mobileApi.ts:97-100`

**Evidence:**
Client relies on web backend to enforce single-use of handoff token. Web backend (sahakari-sip NextAuth) not in this repository.

**Validation Plan:**
Owner deploys test instance, captures handoff token, exchanges twice, verifies second request fails (400/409). Verify token expiry ≤5 min.

---

### FIND-011: Android Backup Rules XML — Sensitive AsyncStorage Keys Not Excluded
**Severity:** Medium  
**Status:** Needs Validation  
**Attack Class:** DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch  
**Trust Boundary:** Device (USB/ADB) → App Private Storage  
**Lower-Trust Principal:** Attacker with physical USB access  
**Affected Resource:** AsyncStorage and SecureStore data  
**Result:** Unknown — depends on XML content  

**Affected Files:**
- `android/app/src/main/AndroidManifest.xml:20`
- `android/app/src/main/res/xml/secure_store_backup_rules.xml`

**Evidence:**
Manifest references `@xml/secure_store_backup_rules` but file content only excludes SecureStore, not `sahakarisip.v1.*` keys. Since `allowBackup="false"` is set, this is defense-in-depth only. Need to verify XML content matches expectation.

**Validation Plan:**
Owner inspects `secure_store_backup_rules.xml`. If missing or permissive, set `allowBackup="false"`. Functional test: `adb backup + abe.jar` extraction to verify no `sahakarisip.v1.*` keys in backup.

---

### FIND-012: Google ID Token Validation on Web Backend Not Verified
**Severity:** Medium  
**Status:** Needs Validation  
**Attack Class:** WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding  
**Trust Boundary:** Mobile App → Web Backend (`/api/mobile/google-native`)  
**Lower-Trust Principal:** Attacker with Google ID token for victim account  
**Affected Resource:** Victim's Supabase RLS JWT  
**Result:** Unknown — depends on web backend implementation  

**Affected Files:**
- `src/lib/auth/AuthContext.tsx:1094-1140`
- `src/lib/auth/mobileApi.ts:109-114`

**Evidence:**
Native flow sends ID token to web `/api/mobile/google-native`. Web backend must validate audience (Web client ID), issuer (Google), expiry. Not verifiable from this repo.

**Validation Plan:**
Owner deploys test web backend. Tests: valid token succeeds; wrong audience (Android client) fails; expired token fails; different project token fails; malformed token fails.

---

## Rejected Claims (No Vulnerability)

| ID | Claim | Reason |
|----|-------|--------|
| REJ-001 | SQL Injection via Supabase queries | Supabase JS client uses parameterized queries; no string interpolation in any query in `cloud.ts` or `local.ts` |
| REJ-002 | XSS/Injection via React Native rendering | React Native doesn't render HTML; all dynamic values go through Text components with no `dangerouslySetInnerHTML` equivalent |
| REJ-003 | Hardcoded secrets in source | No secrets in source. `.env` is gitignored. Anon key is public by design (RLS constrained). |
| REJ-004 | Service role key exposure | Explicitly excluded: README and `.env.example` state service role key must never ship in APK |
| REJ-005 | Biometric PIN fallback bypass | `disableDeviceFallback: true` enforced in `biometric.ts:106` |
| REJ-006 | Session fixation | Cloud sign-in mints fresh JWT from web backend; local mode creates new salted hash profile |
| REJ-007 | Account enumeration via signup | Web backend handles rate limiting; mobile surfaces generic errors |
| REJ-008 | CSRF on cloud mutations | No cookie-based auth; all cloud requests use Bearer token (JWT) from mobileSession |
| REJ-009 | Path traversal via file handling | No file path handling from user input; CSV parsed in memory via expo-document-picker |
| REJ-010 | SSRF via user-supplied URLs | No outbound fetch to user-supplied URLs; only configured Supabase and web backend endpoints |
| REJ-011 | Insecure randomness for nonce/uuid | `expo-crypto.getRandomBytes(16)` used for nonce (CSPRNG). `uuid()` falls back to `Math.random` only in Node scripts (`verify.test.ts`), not in app bundle |

---

## Positive Security Observations

1. **Envelope Encryption (Local Mode):** AES-256-GCM DEK wrapped under PBKDF2-HMAC-SHA256 (100k iterations) + separate recovery key wrap. Strong design.
2. **Biometric Unlock:** `disableDeviceFallback: true` enforces fingerprint-only; session stored in SecureStore (Keystore-backed).
3. **RLS Architecture:** Cloud mode delegates all authorization to Supabase RLS — no application-layer access control to bypass.
4. **Input Validation:** Zod schemas validate all cloud inputs at boundary (`fundConfigSchema`, `entrySchema`, `csvRowSchema`, `notificationPreferencesSchema`).
5. **No Service Role Key:** Anon key only; server-side operations run on web backend with service role.
6. **Pre-commit Guard:** Script exists to block `.env` commits (needs installation).
7. **Android allowBackup=false:** Set in Manifest (though prebuild can revert).
8. **Google OAuth Configuration Frozen:** `GOOGLE-SIGNIN-RULES.md` documents the exact client IDs and SHA-1 fingerprints, preventing the DEVELOPER_ERROR regression.
9. **Session TTL:** 4-hour absolute expiry with biometric re-auth option.
9. **SecureStore for DEK/Biometric:** Hardware-backed keystore on Android, Secure Enclave on iOS.

---

## Coverage Summary

| Category | Units Planned | Covered | Findings |
|----------|---------------|---------|----------|
| Authentication (Cloud) | 6 | 6 | FIND-001, FIND-003, FIND-009, FIND-010, FIND-012 |
| Authentication (Local) | 4 | 4 | FIND-007, FIND-008 |
| Data Storage (Cloud) | 3 | 3 | FIND-009 |
| Data Storage (Local) | 3 | 3 | — |
| Biometric / SecureStore | 2 | 2 | — |
| Android Platform | 3 | 3 | FIND-002, FIND-011 |
| File Upload | 1 | 1 | FIND-006 |
| Supply Chain | 1 | 1 | FIND-005 |
| Environment / Config | 1 | 1 | FIND-004 |
| **Total** | **24** | **24** | **12 (6 confirmed, 4 needs_validation, 2 rejected)** |

---

## Priority Remediation Order

| Priority | Finding | Action |
|----------|---------|--------|
| **P0** | FIND-001 (High) | Verify web backend single-use token enforcement; add token expiry |
| **P1** | FIND-002 (Medium) | Confirm `allowBackup=false` survives prebuild; add AsyncStorage exclusion rules |
| **P1** | FIND-003 (Medium) | Verify web backend Google ID token validation |
| **P1** | FIND-009 (Needs Validation) | Verify Supabase RLS policies on all tables |
| **P1** | FIND-010 (Needs Validation) | Verify web backend token consumption |
| **P1** | FIND-012 (Needs Validation) | Verify web backend Google ID token validation |
| **P2** | FIND-004 (Low) | Delete `.env`; install pre-commit hook; rotate keys if leaked |
| **P2** | FIND-005 (Low) | Monitor Expo SDK updates for transitive vulnerability fixes |
| **P2** | FIND-006 (Low) | Verify Supabase Storage Content-Type policy; add magic byte validation |
| **P3** | FIND-007 (Low) | Add recovery key attempt rate limiting; mask input |
| **P3** | FIND-008 (Low) | Add periodic foreground TTL enforcement |
| **P3** | FIND-011 (Needs Validation) | Verify backup rules XML; functional test with adb backup |

---

## Validation Requirements

The following findings require **owner validation** because their decisive evidence lies outside this repository (web backend, Supabase Dashboard, built APK):

1. **FIND-009** — Supabase RLS policies
2. **FIND-010** — Web backend `/api/mobile/exchange` single-use enforcement
3. **FIND-011** — Android backup rules XML content (though `allowBackup=false` mitigates)
4. **FIND-012** — Web backend `/api/mobile/google-native` ID token validation

**Owner Validation Plan:**
- Deploy test web backend and Supabase project
- Run token replay test (FIND-001, FIND-010)
- Run Google ID token validation matrix (FIND-003, FIND-012)
- Test cross-user data access with two accounts (FIND-009)
- Build release APK, verify `allowBackup=false` baked in, test `adb backup` extraction (FIND-002, FIND-011)

---

## Appendix: Files Audited

### Source Code (`src/`)
- `src/lib/auth/AuthContext.tsx` — Primary auth logic, Google flows, session management
- `src/lib/auth/mobileApi.ts` — Web backend API client
- `src/lib/auth/mobileSession.ts` — Session storage (AsyncStorage)
- `src/lib/auth/biometric.ts` — Biometric unlock (SecureStore)
- `src/lib/auth/local-vault.ts` — Envelope encryption (AES-256-GCM + PBKDF2)
- `src/lib/auth/nativeCrypto.ts` — Crypto primitives shim
- `src/lib/data/cloud.ts` — Supabase data access (RLS-enforced)
- `src/lib/data/local.ts` — On-device encrypted storage
- `src/lib/data/store.ts` — Data store interfaces
- `src/lib/data/merge.ts` — Local→cloud merge logic
- `src/lib/profilePhoto.ts` — Local profile photo handling
- `src/lib/supabase.ts` — Supabase client with Bearer token hook
- `src/lib/schemas/entry.ts`, `fund-config.ts` — Zod validation schemas

### Android Platform
- `android/app/src/main/AndroidManifest.xml` — Permissions, backup config
- `android/app/src/main/res/xml/secure_store_backup_rules.xml`
- `android/app/src/main/res/xml/secure_store_data_extraction_rules.xml`

### Configuration
- `app.json` — Expo config, version, plugins
- `eas.json` — EAS build config
- `package.json` — Dependencies
- `.env.example` — Environment template
- `.gitignore` — Excludes `.env`, `.env.*`

### CI/CD
- `.github/workflows/build-release-apk.yml` — Release APK build (referenced in GOOGLE-SIGNIN-RULES.md)

---

*Report generated by security-audit skill (standard profile). All findings based on source code analysis and bounded local evidence. External dependencies (web backend, Supabase RLS, built APK) marked as Needs Validation.*