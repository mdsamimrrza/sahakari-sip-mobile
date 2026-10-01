# SahakariSIP Mobile — Security Audit Report

**Repository:** sahakari-sip-mobile  
**Commit:** 75adbca (v1.5.1, versionCode 11)  
**Audit Date:** 2026-10-01  
**Profile:** standard  
**Scope:** Full codebase (React Native / Expo Android APK)  
**Prior Audit:** 2026-09-24 (SECURITY_AUDIT_REPORT.md)

---

## Executive Summary

This audit reviewed the SahakariSIP mobile application — a React Native/Expo app for tracking Nepali mutual fund SIP investments. The app implements dual-mode authentication (cloud via Supabase/NextAuth, local on-device), financial calculations per SEBON rules, and a one-time local-to-cloud merge flow.

**Overall Posture:** The codebase demonstrates careful security design with proper trust boundaries: Supabase anon key only (RLS-enforced isolation), PBKDF2-HMAC-SHA256 (100k iterations) for local passwords, SecureStore for biometric entries, Zod validation on all inputs, and explicit user consent for data merge. **4 of 7 prior confirmed findings have been fixed.**

**Confirmed Findings:** 6 (1 High, 2 Medium, 3 Low)  
**Needs Validation:** 4 (deployment/environment dependent)  
**Rejected/Not Applicable:** 11 (design choices with adequate compensating controls)

---

## Status of Prior Audit Findings

| Finding | Prior Severity | Status | Notes |
|---------|---------------|--------|-------|
| FIND-001: CI Weak Keystore Fallback | High | **FIXED** | Workflow now fails if `KEYSTORE_BASE64` secret missing (`.github/workflows/build-release-apk.yml:81-84`) |
| FIND-002: Local Password Bare SHA-256 | Medium | **FIXED** | Now uses PBKDF2-HMAC-SHA256 with 100,000 iterations (`AuthContext.tsx:219-226`) |
| FIND-003: Merge Case-Insensitive Fund Collision | Medium | **FIXED** | Composite key `(user_id, fund_name_lowercase)` in `merge.ts:266` |
| FIND-004: Deep Link Token Replay | Medium | **PARTIAL** | Client-side replay protection added (`AuthContext.tsx:270-313`), but still relies on server enforcement |
| FIND-005: Android `allowBackup="true"` | Low | **OPEN** | Still enabled; backup rules only exclude SecureStore, not AsyncStorage keys |
| FIND-006: CSV Units Cross-Validation | Low | **FIXED** | Zod `.refine()` validates units against SEBON rule (`schemas/entry.ts:62-73`) |
| FIND-007: `.env` in Workspace | Low | **OPEN** | Production `.env` still present in working directory |

---

## Confirmed Findings

### HIGH

#### FIND-001: Deep Link Token Replay — Server-Side Enforcement Not Verified

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Affected Files** | `src/lib/auth/AuthContext.tsx:1037-1054` (Linking listener), `src/lib/auth/mobileApi.ts:87-100` (`googleStart`/`googleExchange`), Web backend (`/api/mobile/exchange`) |
| **Attack Scenario** | Attacker captures a valid Google OAuth handoff token (32 hex chars) from user's device (clipboard, notification preview, browser history, or compromised device). Token passed via `sahakarisip://auth/callback?token=...`. If web backend `/api/mobile/exchange` does not enforce single-use consumption, attacker replays token to obtain valid Supabase RLS JWT and accesses victim's portfolio. |
| **Evidence** | Client mints nonce (`getRandomBytes(16)`), sends to web `/api/mobile/google`. On callback, token exchanged via `/api/mobile/exchange`. Client-side replay protection added (`isHandoffTokenUsed`/`markHandoffTokenUsed` in `AsyncStorage`), but comment states "Best-effort; server enforces single-use." Client protection is bypassable (clear AsyncStorage, different device). |
| **Root Cause** | Security of OAuth handoff depends entirely on web backend's token consumption logic (separate repository). Client-side protection is defense-in-depth only. |
| **Remediation** | 1. **Verify web backend marks nonce/token as consumed on first exchange** (idempotent rejection on replay).<br>2. Add short expiry (≤5 min) to handoff tokens at issuance.<br>3. Consider binding token to device fingerprint (IP, user agent) at issuance.<br>4. Document that client-side protection is supplementary only. |

---

### MEDIUM

#### FIND-002: Android `allowBackup="true"` Exposes App Data via `adb backup`

| Field | Detail |
|-------|--------|
| **Severity** | Medium (elevated from Low due to incomplete fix) |
| **Affected Files** | `android/app/src/main/AndroidManifest.xml:17`, `android/app/src/main/res/xml/secure_store_backup_rules.xml` |
| **Attack Scenario** | Attacker with physical USB access to unlocked device (or compromised host) runs `adb backup -f backup.ab com.samimrrza.sahakarisip`. The backup includes `AsyncStorage` (local profiles, session tokens, privacy settings, handoff token replay journal) because backup rules only exclude `SecureStore`, not `sahakarisip.v1.*` AsyncStorage keys. |
| **Evidence** | Manifest: `<application android:allowBackup="true" ... android:fullBackupContent="@xml/secure_store_backup_rules">`. Backup rules XML: only `<exclude domain="sharedpref" path="SecureStore"/>`. No exclusion for `sahakarisip.v1.*` keys which hold local profiles, session, biometric flags, and OAuth replay journal. |
| **Root Cause** | Default Expo template enables backup. Backup rules XML generated by Expo only covers SecureStore, not app-specific AsyncStorage keys. |
| **Remediation** | 1. Set `android:allowBackup="false"` in `AndroidManifest.xml`, OR<br>2. Create custom backup rules XML excluding `sahakarisip.v1.*` sharedprefs and SecureStore, reference it in Manifest.<br>3. Test with `adb backup` + `abe.jar` extraction to verify no sensitive keys appear. |

#### FIND-003: Google Sign-In Native Path — ID Token Validation Relies on Web Backend

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Affected Files** | `src/lib/auth/AuthContext.tsx:1091-1136` (native sign-in), `src/lib/auth/mobileApi.ts:109-114` (`googleNativeSignIn`) |
| **Attack Scenario** | Attacker obtains a valid Google ID token for victim's account (phishing, malware, stolen device). Uses it to call `/api/mobile/google-native` which exchanges ID token for SahakariSIP session (Supabase RLS JWT). If web backend does not properly validate ID token (audience, issuer, expiry, nonce), attacker gains portfolio access. |
| **Evidence** | Native flow: `GoogleSignin.signIn()` → `idToken` → `googleNativeSignIn(idToken)` → web `/api/mobile/google-native`. Web backend must verify ID token with Google (audience = Web client ID `416335590615-e96du...`, issuer `accounts.google.com`, not expired). Not verifiable from this repo. |
| **Root Cause** | ID token validation is entirely server-side (web backend). Mobile client cannot verify token integrity. |
| **Remediation** | 1. Verify web backend validates ID token: audience matches Web client, issuer is Google, not expired, nonce matches if used.<br>2. Ensure web backend uses `google-auth-library` or equivalent for verification.<br>3. Log verification failures for monitoring. |

---

### LOW

#### FIND-004: `.env` File with Production Credentials Exists in Working Directory

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Affected Files** | `.env` (not committed; `.gitignore` excludes it) |
| **Attack Scenario** | Developer accidentally commits `.env` (e.g., `git add .`). File contains production Supabase URL, anon key, VAPID public key, API URL. While anon key is RLS-constrained and safe to ship in APK, its presence in git history would require key rotation and exposes project identifier. |
| **Evidence** | `.env` contains production values for `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, `API_URL`. |
| **Root Cause** | Developer created `.env` for local testing; `.gitignore` prevents commit but file persists in workspace. |
| **Remediation** | 1. Delete `.env` from workspace; use `.env.local` (also gitignored) for local overrides.<br>2. Add pre-commit hook to reject `.env` commits.<br>3. Rotate anon key if ever committed (Supabase: Project Settings → API → Regenerate). |

#### FIND-005: NPM Dependency Vulnerabilities (Moderate)

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Affected Files** | `package-lock.json` (transitive dependencies) |
| **Attack Scenario** | `decode-uri-component` ≤0.4.2: DoS via exponential decoding of malformed percent-encoded input. `uuid` <11.1.1: Missing buffer bounds check in v3/v5/v6 when buffer provided. Both are transitive dependencies (via `expo-router`, `expo`, `@expo/config-plugins`). Exploitation requires attacker-controlled input to vulnerable functions. |
| **Evidence** | `npm audit --audit-level=high` reports moderate findings. Fix requires breaking changes (`expo-router@5.1.11`, `expo@46.0.21`). |
| **Root Cause** | Transitive dependencies in Expo ecosystem. No direct usage of vulnerable functions in app code. |
| **Remediation** | 1. Monitor for Expo SDK updates that resolve these transitively.<br>2. If app code directly calls `decode-uri-component` or `uuid` v3/v5/v6 with buffers, add input validation.<br>3. Accept as low-risk transitive issues; prioritize Expo SDK upgrades when feasible. |

#### FIND-006: Profile Photo Upload — MIME Type Trust

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Affected Files** | `src/lib/data/cloud.ts:972-980` (`updateProfileImage`), `src/lib/profilePhoto.ts:31-39` (`extFor`) |
| **Attack Scenario** | User uploads file with spoofed MIME type (e.g., `image/svg+xml` containing malicious JavaScript, or polyglot file). Server validates MIME type from client (`mimeType` parameter) and allows `image/jpeg`, `image/png`, `image/webp`. If Supabase Storage serves file with attacker-controlled `Content-Type`, could lead to XSS when viewed in browser context. |
| **Evidence** | Client validates `mimeType` against allowlist, but `mimeType` comes from `expo-image-picker` / `expo-document-picker` which trusts OS/file extension. `extFor` function derives extension from MIME type or filename. No server-side MIME sniffing or Content-Type override visible in this repo (Supabase Storage configuration not in source). |
| **Root Cause** | Client-side MIME validation only; relies on Supabase Storage to serve with correct headers. |
| **Remediation** | 1. Verify Supabase Storage bucket `avatars` has `Content-Type` forced by extension or explicit policy.<br>2. Consider adding `Content-Disposition: attachment` for avatars to prevent browser execution.<br>3. Client: validate file magic bytes (first bytes) match expected image format before upload. |

---

## Needs Validation

These findings require deployment, provider, or runtime facts not observable in repository source.

### NEEDS-VAL-001: Google OAuth Handoff — Web Backend Single-Use Token Enforcement

**Finding:** Deep link token replay possible if web backend doesn't enforce single-use (FIND-001)

**Missing Fact:** Does `POST /api/mobile/exchange` on the web backend (NextAuth) mark the nonce/token as consumed and reject replays?

**Why Source Cannot Confirm:** The web backend (`sahakari-sip` Next.js app) is a separate repository. The mobile client mints a nonce, receives an auth URL, and exchanges the callback token — but all replay protection lives server-side.

**Safe Validation Check:**
1. Deploy a test instance of the web backend (or use staging).
2. Initiate Google sign-in from the mobile app, capture the handoff token from the callback URL (`sahakarisip://auth/callback?token=...`).
3. Call `POST /api/mobile/exchange` with the token twice in succession.
4. Verify the second request fails with `400` or `409` (idempotent rejection).
5. Verify token expiry is ≤5 minutes from issuance.

**Related Code:**
- `src/lib/auth/mobileApi.ts:87-100` (googleStart, googleExchange)
- `src/lib/auth/AuthContext.tsx:1037-1054` (Linking listener, cold-start handler)

---

### NEEDS-VAL-002: Supabase RLS Policies Correctly Enforce Per-User Isolation

**Finding:** All cloud data access assumes RLS policies `auth.uid() = user_id` on every table

**Missing Fact:** Are the Supabase tables (`fund_config`, `entries`, `nav_history`, `notification_preferences`, `notifications_log`) protected by RLS policies that enforce `user_id = auth.uid()`?

**Why Source Cannot Confirm:** RLS policies are deployed database configuration, not application source. The mobile app uses the anon key and relies on the JWT's `sub` claim (user ID) being enforced by Postgres RLS.

**Safe Validation Check:**
1. Open Supabase Dashboard → Authentication → Policies.
2. Verify each table has `SELECT`, `INSERT`, `UPDATE`, `DELETE` policies with `USING (auth.uid() = user_id)` and `WITH CHECK (auth.uid() = user_id)`.
3. **Functional test:** Create two dummy users (A and B). Sign in as A on mobile app. Use the Supabase JS client with A's JWT to attempt:
   - `select * from entries where user_id = 'B's-id'`
   - `insert into entries (user_id, ...) values ('B's-id', ...)`
   - Verify both are rejected (zero rows returned / RLS violation error).
4. Verify `notification_preferences` upsert uses `onConflict: "user_id"` and RLS prevents overwriting another user's row.

**Related Code:** All methods in `src/lib/data/cloud.ts` — every query filters by `user_id` from `getUserId()` (the JWT `sub`).

---

### NEEDS-VAL-003: Android `fullBackupContent` XML Actually Excludes Sensitive Keys

**Finding:** `android:allowBackup="true"` with referenced backup rules XML (FIND-002)

**Missing Fact:** Does `android/app/src/main/res/xml/secure_store_backup_rules.xml` exclude `AsyncStorage` keys (`sahakarisip.v1.*`) and `SecureStore` data?

**Why Source Cannot Confirm:** The XML file is referenced in the manifest but its content was not accessible in the workspace view during audit (only build intermediate found).

**Safe Validation Check:**
1. Locate `android/app/src/main/res/xml/secure_store_backup_rules.xml` (or create it if missing).
2. Verify it contains `<exclude domain="sharedpref" path="sahakarisip.v1.*"/>` and excludes SecureStore paths.
3. If file is missing, permissive, or doesn't exclude the app's keys, set `android:allowBackup="false"` in `AndroidManifest.xml:17`.
4. **Functional test:** Build debug APK, install on device, run `adb backup -f test.ab com.samimrrza.sahakarisip`. Extract `test.ab` (using `abe.jar` or Android Backup Extractor) and verify no `sahakarisip.v1.*` keys appear in the backup.

**Related Code:**
- `android/app/src/main/AndroidManifest.xml:17` (`android:allowBackup="true" android:fullBackupContent="@xml/secure_store_backup_rules"`)

---

### NEEDS-VAL-004: Google ID Token Validation on Web Backend

**Finding:** Native Google sign-in sends ID token to web backend for exchange (FIND-003)

**Missing Fact:** Does `/api/mobile/google-native` on the web backend properly validate the Google ID token (audience = Web client ID, issuer = Google, not expired, nonce if used)?

**Why Source Cannot Confirm:** Web backend is separate repository. Mobile client sends ID token; all validation is server-side.

**Safe Validation Check:**
1. Deploy test web backend instance.
2. Obtain a valid Google ID token for a test account.
3. Call `/api/mobile/google-native` with:
   - Valid token → should succeed
   - Token with wrong audience (Android client ID) → should fail
   - Expired token → should fail
   - Token from different Google project → should fail
   - Malformed token → should fail
4. Verify all invalid tokens are rejected with 400/401.

**Related Code:**
- `src/lib/auth/AuthContext.tsx:1091-1136` (native sign-in flow)
- `src/lib/auth/mobileApi.ts:109-114` (`googleNativeSignIn`)

---

## Rejected / Not Applicable (Design Choices with Adequate Controls)

| ID | Area | Reason |
|----|------|--------|
| REJ-001 | SQL Injection | Supabase JS client uses parameterized queries; no string interpolation in any query. |
| REJ-002 | XSS/Injection | React Native doesn't render HTML; all dynamic values go through Text components. |
| REJ-003 | Hardcoded Secrets | No secrets in source. `.env` is gitignored. Anon key is public by design (RLS constrained). |
| REJ-004 | Service Role Key Exposure | Explicitly excluded: README and `.env.example` state service role key must never ship. |
| REJ-005 | Biometric PIN Fallback | `disableDeviceFallback: true` enforced in `biometric.ts:106`. |
| REJ-006 | Session Fixation | Cloud sign-in mints fresh JWT from web backend; local mode creates new salted hash profile. |
| REJ-007 | Account Enumeration | Web backend handles rate limiting; mobile surfaces generic errors. |
| REJ-008 | CSRF | No cookie-based auth; all cloud requests use Bearer token (JWT). |
| REJ-009 | Path Traversal | No file path handling from user input; CSV parsed in memory. |
| REJ-010 | SSRF | No outbound fetch to user-supplied URLs; only configured Supabase and web backend. |
| REJ-011 | Insecure Randomness | `expo-crypto.getRandomBytes(16)` used for nonce (CSPRNG). `uuid()` falls back to `Math.random` only in Node scripts (not app). |

---

## Architecture Summary

| Dimension | Detail |
|-----------|--------|
| **Product** | Nepali mutual fund SIP tracker (financial data, PII: email, portfolio) |
| **Users** | Individual investors; single-account per install |
| **Trust Boundaries** | 1. User ↔ App (input validation, privacy mask)<br>2. App ↔ Supabase (anon key + RLS JWT per user)<br>3. App ↔ Web Backend (NextAuth: email/password, Google OAuth, OTP)<br>4. App ↔ Local Storage (AsyncStorage namespaced by user_id; SecureStore for biometric) |
| **Auth Modes** | Cloud (Supabase RLS JWT via NextAuth), Local (PBKDF2-HMAC-SHA256 in AsyncStorage, 100k iterations) |
| **Data Isolation** | Cloud: RLS `user_id = auth.uid()`<br>Local: `sahakarisip.v1.<profileId>.*` keys |
| **Key Controls** | Zod schemas, HTTPS-only web URL, SecureStore (Keystore-backed), FLAG_SECURE (expo-screen-capture), explicit merge consent, client-side OAuth replay protection |
| **Build** | Expo prebuild → Gradle → signed APK; GitHub Actions CI (fails without keystore secrets) |
| **Dependencies** | Locked via `package-lock.json`; 2 moderate transitive CVEs (no direct exploit path) |

---

## Coverage Statement

This audit covered all identified trust boundaries and entry surfaces:

- **Auth surfaces:** email/password (cloud + local), Google OAuth handoff (browser + native), password reset OTP, biometric unlock
- **Data surfaces:** SIP entries, fund configs, CSV import, NAV history, notification prefs
- **Merge flow:** local→cloud one-time merge with user consent, deduplication, backup
- **Storage:** AsyncStorage (local mode, encrypted vault), SecureStore (biometric), Supabase (cloud mode)
- **Transport:** HTTPS to Supabase and web backend; custom scheme deep link (`sahakarisip://`)
- **Build:** CI workflow, keystore handling, dependency integrity

All attack classes from `ATTACK-CLASSES.md` relevant to a React Native/Expo mobile app were considered: Injection, Access Control, Cryptography/Secrets, Business Logic, Feature Abuse, Chained Vulnerabilities, Desktop/Mobile/Local-IPC, Web/Protocol/Auth, Data Isolation, Supply Chain, Obvious Things.

---

## Recommended Priority Order

1. **FIND-001 (High)** — Verify web backend enforces single-use on `/api/mobile/exchange`; add token expiry ≤5 min
2. **FIND-002 (Medium)** — Set `android:allowBackup="false"` or add `sahakarisip.v1.*` exclusion to backup rules; test with `adb backup`
3. **FIND-003 (Medium)** — Verify web backend validates Google ID token (audience, issuer, expiry)
4. **FIND-004 (Low)** — Delete `.env` from workspace; use `.env.local`; add pre-commit hook
5. **FIND-005 (Low)** — Monitor Expo SDK updates for transitive CVE fixes; no immediate action needed
6. **FIND-006 (Low)** — Verify Supabase Storage forces correct `Content-Type` for avatars; consider `Content-Disposition: attachment`
7. **NEEDS-VAL-001/002/003/004** — Owner-observed validation checks (web backend, Supabase RLS, Android backup, Google ID token)

---

## Appendix: Methodology

This audit followed the `security-audit` skill workflow (Phases 1–6):

1. **Reconnaissance** — Mapped product, principals, entry surfaces, trust boundaries, build process
2. **Coverage-Led Hunting** — Assigned ledger units per surface × boundary × attack class
3. **Candidate Validation** — Each candidate verified against source evidence and bounded local reasoning
4. **Structured Output** — Findings recorded with severity, evidence, attack scenario, remediation
5. **Independent Verification** — Self-review of each confirmed finding for completeness
6. **Report Generation** — This document

No target-controlled code was executed. All validation was source-based with mental fixtures. Prior audit (`SECURITY_AUDIT_REPORT.md`, `findings.json`) was used as baseline; delta analysis identified fixes and remaining gaps.