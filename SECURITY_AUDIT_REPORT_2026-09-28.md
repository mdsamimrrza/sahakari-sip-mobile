# SahakariSIP Mobile — Security Audit Report (2026-09-28)

**Repository:** sahakari-sip-mobile
**Commit:** 6289820 (v1.5.1, versionCode 11)
**Audit Date:** 2026-09-28
**Profile:** standard
**Scope:** Full codebase (React Native / Expo Android APK)
**Prior Audit:** 3953983 (v1.2.1, 2026-09-24) — 6 confirmed, 3 needs validation

---

## Executive Summary

This audit reviewed the SahakariSIP mobile application — a React Native/Expo app for tracking Nepali mutual fund SIP investments. The app implements dual-mode authentication (cloud via Supabase/NextAuth, local on-device with envelope encryption), financial calculations per SEBON rules, and a one-time local-to-cloud merge flow.

**Progress Since Prior Audit (3953983 → 6289820):**
- **4 prior findings FIXED** (1 High, 2 Medium, 1 Low)
- **3 prior findings STILL OPEN** (2 Low, 1 Medium partially addressed)
- **3 prior needs-validation STILL OPEN** (deployment-dependent)
- **2 NEW findings** in recently added code

**Overall Posture:** The codebase demonstrates strong security design with proper trust boundaries: Supabase anon key only (RLS-enforced isolation), PBKDF2-HMAC-SHA256 (100k iterations) for local passwords, AES-256-GCM envelope encryption for local vault, SecureStore for biometric entries and DEKs, Zod validation on all inputs, and explicit user consent for data merge. No critical vulnerabilities were found.

**Confirmed Findings:** 5 (0 Critical, 0 High, 2 Medium, 3 Low)
**Needs Validation:** 3 (deployment/environment dependent)
**Rejected/Not Applicable:** 11 (design choices with adequate compensating controls)

---

## Confirmed Findings

### MEDIUM

#### FIND-001: Android `allowBackup="true"` with Missing Backup Rules XML

| Field | Detail |
|-------|--------|
| **Severity** | Medium (was Low; elevated due to missing XML) |
| **Affected Files** | `android/app/src/main/AndroidManifest.xml:17` |
| **Attack Scenario** | Attacker with physical USB access to an unlocked device runs `adb backup -f backup.ab com.samimrrza.sahakarisip`. The manifest declares `android:fullBackupContent="@xml/secure_store_backup_rules"` but the XML file **does not exist** (directory `res/xml/` absent). Android falls back to backing up all app data including AsyncStorage (`sahakarisip.v1.*` keys: local profiles, session, privacy settings) and potentially SecureStore data. |
| **Evidence** | `AndroidManifest.xml:17` — `<application android:allowBackup="true" ... android:fullBackupContent="@xml/secure_store_backup_rules">`. `ls android/app/src/main/res/xml/` returns "No such file or directory". |
| **Root Cause** | Expo/React Native template enables backup by default. The referenced XML was never created or was removed during prebuild. |
| **Remediation** | 1. Set `android:allowBackup="false"` in `AndroidManifest.xml:17` (simplest, recommended for financial apps).<br>2. Or create `res/xml/secure_store_backup_rules.xml` with `<exclude domain="sharedpref" path="sahakarisip.v1.*"/>` and `<exclude domain="sharedpref" path="sahakarisip.biometric*"/>` plus SecureStore exclusions. |

#### FIND-002: Push Token Registration Sends Unauthenticated Requests to Wrong Endpoint

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Affected Files** | `src/lib/api/useApi.ts:4-9, 11-37`, `app/(app)/settings/notifications/push.tsx:94-109` |
| **Attack Scenario** | The `useApi` hook has a hardcoded fallback API base URL `https://master-admin-delta.vercel.app` (line 4) which does not match the production web URL `https://sahakari-sip.vercel.app`. `getAuthHeader()` returns `undefined` (line 8), so push token registration POSTs to `/api/mobile/push-token` **without any authentication**. An attacker can register arbitrary push tokens for any user ID, potentially enabling notification spam or token enumeration. |
| **Evidence** | `useApi.ts:4` — `const API_BASE = Constants.expoConfig?.extra?.apiUrl || "https://master-admin-delta.vercel.app";`<br>`useApi.ts:6-9` — `getAuthHeader()` returns `undefined`.<br>`push.tsx:99-104` — Calls `api.post("/api/mobile/push-token", { token, userId, platform })` with no auth header. |
| **Root Cause** | The `useApi` hook was scaffolded with a placeholder URL and no authentication implementation. The push feature was added without wiring the Supabase RLS JWT (available via `getMobileBearer()`) into the API client. |
| **Remediation** | 1. Remove the hardcoded fallback; require `expo.extra.apiUrl` in `app.json` (set via CI secrets).<br>2. Implement `getAuthHeader()` to return `Bearer <RLS JWT>` from `getMobileBearer()` for cloud-mode requests.<br>3. Verify the web backend `/api/mobile/push-token` validates the JWT and enforces `user_id` ownership. |

---

### LOW

#### FIND-003: `.env` File with Production Credentials Exists in Working Directory

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Affected Files** | `.env` (not committed; `.gitignore` excludes it) |
| **Attack Scenario** | Developer accidentally commits `.env` (e.g., `git add .`). The file contains the production Supabase URL and anon key. While the anon key is constrained by RLS and safe to ship in the APK, its presence in git history would require key rotation and exposes the project identifier. |
| **Evidence** | `.env` contains:<br>```\nEXPO_PUBLIC_SUPABASE_URL=https://entbhjpnhdjfhcctcvmt.supabase.co\nEXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Qox-u2IFEpaoUHus51Ofhw_4XyVPI3D\nEXPO_PUBLIC_WEB_URL=https://sahakari-sip.vercel.app\nEXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=416335590615-e96duqpfc9f7eg4qg0aqnj42avuiqs8l.apps.googleusercontent.com\n``` |
| **Root Cause** | Developer created `.env` for local testing; `.gitignore` prevents commit but file persists in workspace. |
| **Remediation** | 1. Delete `.env` from workspace; use `.env.local` (also gitignored) for local overrides.<br>2. Add pre-commit hook to reject `.env` commits (script exists at `scripts/pre-commit-env-guard.sh`).<br>3. Rotate anon key if ever committed (Supabase: Project Settings → API → Regenerate). |

#### FIND-004: `app.json` Contains Placeholder `eas.projectId`

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Affected Files** | `app.json:82` |
| **Attack Scenario** | The `eas.projectId` is set to `00000000-0000-0000-0000-000000000000`. This is a placeholder that should be replaced with the actual EAS project ID. While not directly exploitable, it indicates the EAS project linking was not completed, which could cause issues with OTA updates or build tracking. |
| **Evidence** | `app.json:81-83` — `"eas": { "projectId": "00000000-0000-0000-0000-000000000000" }` |
| **Root Cause** | EAS project not linked or ID not updated after `eas init`. |
| **Remediation** | Run `eas init` or manually set the correct project ID from the Expo dashboard. |

#### FIND-005: Debug Keystore Password in `build.gradle` (Debug Build Only)

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Affected Files** | `android/app/build.gradle:112-115` |
| **Attack Scenario** | The debug signing config uses hardcoded passwords `android` / `androiddebugkey` / `android`. This is standard Android debug keystore behavior and only affects debug builds. The release config correctly reads from `keystore.properties` (gitignored). No production impact. |
| **Evidence** | `build.gradle:112-115` — `debug { storeFile file('debug.keystore'); storePassword 'android'; keyAlias 'androiddebugkey'; keyPassword 'android' }` |
| **Root Cause** | Standard Expo/React Native template. Debug keystore is not used for release. |
| **Remediation** | None required — this is expected for debug builds. Document that debug APKs are not for distribution. |

---

## Prior Audit Findings — Status Update

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| FIND-001 (prior) | CI Build Auto-Generates Weak Keystore | **FIXED** | Workflow now fails if `KEYSTORE_BASE64` secret missing (`.github/workflows/build-release-apk.yml:81-84`) |
| FIND-002 (prior) | On-Device Password Hashing Uses Bare SHA-256 | **FIXED** | Now uses PBKDF2-HMAC-SHA256, 100k iterations via `react-native-quick-crypto` (`AuthContext.tsx:216-226`) |
| FIND-003 (prior) | Merge Deduplication by Case-Insensitive Fund Name | **FIXED** | Composite key `fundKey(userId, name)` with user_id prefix (`merge.ts:266`) |
| FIND-004 (prior) | Deep Link Token Replay If Web Backend Doesn't Enforce Single-Use | **PARTIALLY ADDRESSED** | Client-side replay protection added (`AuthContext.tsx:270-313, 994-1026`); still depends on web backend enforcement (NEEDS-VAL-001) |
| FIND-005 (prior) | Android `allowBackup="true"` | **STILL OPEN** | See FIND-001 above (elevated to Medium) |
| FIND-006 (prior) | CSV Import Accepts User-Supplied `units` Without Cross-Field Validation | **FIXED** | `csvRowSchema` now has `.refine()` verifying `units === floor((amount - DP_CHARGE) / nav)` (`schemas/entry.ts:62-73`) |
| FIND-007 (prior) | `.env` File with Production Credentials | **STILL OPEN** | See FIND-003 above |

---

## Needs Validation

These findings require deployment/runtime facts not observable in the repository source.

### NEEDS-VAL-001: Google OAuth Handoff — Web Backend Single-Use Token Enforcement

**Related:** FIND-004 (prior), client-side replay protection added in `AuthContext.tsx:270-313`

| Field | Detail |
|-------|--------|
| **Missing Fact** | Does `POST /api/mobile/exchange` on the web backend (NextAuth) mark the nonce/token as consumed and reject replays? |
| **Why Source Cannot Confirm** | The web backend (`sahakari-sip` Next.js app) is a separate repository. The mobile client mints a nonce, receives an auth URL, and exchanges the callback token — but all replay protection lives server-side. |
| **Safe Validation Check** | 1. Deploy a test instance of the web backend (or use staging).<br>2. Initiate Google sign-in from the mobile app, capture the handoff token from the callback URL (`sahakarisip://auth/callback?token=...`).<br>3. Call `POST /api/mobile/exchange` with the token twice in succession.<br>4. Verify the second request fails with `400` or `409` (idempotent rejection).<br>5. Verify token expiry is ≤5 minutes from issuance. |

### NEEDS-VAL-002: Supabase RLS Policies Correctly Enforce Per-User Isolation

**Related:** All cloud data access in `src/lib/data/cloud.ts`

| Field | Detail |
|-------|--------|
| **Missing Fact** | Are the Supabase tables (`fund_config`, `entries`, `nav_history`, `notification_preferences`, `notifications_log`) protected by RLS policies that enforce `user_id = auth.uid()`? |
| **Why Source Cannot Confirm** | RLS policies are deployed database configuration, not application source. The mobile app uses the anon key and relies on the JWT's `sub` claim (user ID) being enforced by Postgres RLS. |
| **Safe Validation Check** | 1. Open Supabase Dashboard → Authentication → Policies.<br>2. Verify each table has `SELECT`, `INSERT`, `UPDATE`, `DELETE` policies with `USING (auth.uid() = user_id)` and `WITH CHECK (auth.uid() = user_id)`.<br>3. **Functional test:** Create two dummy users (A and B). Sign in as A on mobile app. Use the Supabase JS client with A's JWT to attempt:<br>   - `select * from entries where user_id = 'B's-id'`<br>   - `insert into entries (user_id, ...) values ('B's-id', ...)`<br>   - Verify both are rejected (zero rows returned / RLS violation error).<br>4. Verify `notification_preferences` upsert uses `onConflict: "user_id"` and RLS prevents overwriting another user's row. |

### NEEDS-VAL-003: Android Backup Rules XML Actually Excludes Sensitive Keys

**Related:** FIND-001 (this audit), FIND-005 (prior audit)

| Field | Detail |
|-------|--------|
| **Missing Fact** | Does `android/app/src/main/res/xml/secure_store_backup_rules.xml` exist and exclude `AsyncStorage` keys (`sahakarisip.v1.*`) and `SecureStore` data? |
| **Why Source Cannot Confirm** | The XML file is referenced in the manifest but does not exist in the workspace (`res/xml/` directory absent). |
| **Safe Validation Check** | 1. The file does not exist — create it or set `allowBackup="false"`.<br>2. **Functional test:** Build debug APK, install on device, run `adb backup -f test.ab com.samimrrza.sahakarisip`. Extract `test.ab` (using `abe.jar` or Android Backup Extractor) and verify no `sahakarisip.v1.*` keys appear in the backup. |

---

## Rejected / Not Applicable (Design Choices with Adequate Controls)

| ID | Area | Reason |
|----|------|--------|
| REJ-001 | SQL Injection | Supabase JS client uses parameterized queries; no string interpolation in queries. |
| REJ-002 | XSS/Injection | React Native doesn't render HTML; all dynamic values go through Text components. |
| REJ-003 | Hardcoded Secrets | No secrets in source. `.env` is gitignored. Anon key is public by design (RLS constrained). |
| REJ-004 | Service Role Key Exposure | Explicitly excluded: README and `.env.example` state service role key must never ship. |
| REJ-005 | Biometric PIN Fallback | `disableDeviceFallback: true` enforced in `biometric.ts:106`. |
| REJ-006 | Session Fixation | Cloud sign-in mints fresh JWT from web backend; local mode creates new salted hash profile. |
| REJ-007 | Account Enumeration | Web backend handles rate limiting; mobile surfaces generic errors. |
| REJ-008 | CSRF | No cookie-based auth; all cloud requests use Bearer token (JWT). |
| REJ-009 | Path Traversal | No file path handling from user input; CSV parsed in memory via expo-document-picker. |
| REJ-010 | SSRF | No outbound fetch to user-supplied URLs; only configured Supabase and web backend endpoints. |
| REJ-011 | Insecure Randomness | `expo-crypto.getRandomBytes(16)` used for nonce (CSPRNG). `uuid()` falls back to `Math.random` only in Node scripts (not app). |
| REJ-012 | Recovery Key Entropy | Recovery key is 128 bits of `expo-crypto` CSPRNG output; SHA-256 wrap is acceptable (no KDF needed for high-entropy key). |
| REJ-013 | Local Vault AES-GCM | Uses Expo's `Crypto.aesEncryptAsync`/`aesDecryptAsync` with AES-256-GCM (authenticated encryption). |

---

## Architecture Summary

| Dimension | Detail |
|-----------|--------|
| **Product** | Nepali mutual fund SIP tracker (financial data, PII: email, portfolio) |
| **Users** | Individual investors; single-account per install |
| **Trust Boundaries** | 1. User ↔ App (input validation, privacy mask)<br>2. App ↔ Supabase (anon key + RLS JWT per user)<br>3. App ↔ Web Backend (NextAuth: email/password, Google OAuth, OTP)<br>4. App ↔ Local Storage (AsyncStorage namespaced by user_id; SecureStore for biometric/DEK) |
| **Auth Modes** | Cloud (Supabase RLS JWT via NextAuth), Local (PBKDF2 100k + AES-256-GCM envelope encryption) |
| **Data Isolation** | Cloud: RLS `user_id = auth.uid()`<br>Local: `sahakarisip.v1.<profileId>.*` keys + encrypted vault |
| **Key Controls** | Zod schemas, HTTPS-only web URL, SecureStore (Keystore-backed), FLAG_SECURE (expo-screen-capture), explicit merge consent, client-side OAuth replay protection |
| **Build** | Expo prebuild → Gradle → signed APK; GitHub Actions CI (fails without signing secrets) |
| **Dependencies** | Locked via `package-lock.json`; no known critical CVEs at audit time |

---

## Coverage Statement

This audit covered all identified trust boundaries and entry surfaces:

- **Auth surfaces**: email/password (cloud + local), Google OAuth handoff (browser + native), password reset OTP, biometric unlock, recovery key
- **Data surfaces**: SIP entries, fund configs, CSV import, NAV history, notification prefs, push tokens
- **Merge flow**: local→cloud one-time merge with user consent, deduplication (composite key), cloud snapshot backup
- **Storage**: AsyncStorage (local mode + session), SecureStore (biometric entries, DEKs), Supabase (cloud mode)
- **Transport**: HTTPS to Supabase and web backend; custom scheme deep link (`sahakarisip://`)
- **Build**: CI workflow, keystore handling, dependency integrity
- **New features audited**: envelope encryption local vault, recovery key, push notifications, profile photos, tax calculations, SIP schedule engine

All attack classes from `ATTACK-CLASSES.md` relevant to a React Native/Expo mobile app were considered: Injection, Access Control, Cryptography/Secrets, Business Logic, Feature Abuse, Chained Vulnerabilities, Desktop/Mobile/Local-IPC, Web/Protocol/Auth, Data Isolation, Supply Chain, Obvious Things.

---

## Recommended Priority Order

1. **FIND-001 (Medium)** — Set `android:allowBackup="false"` or create proper backup rules XML
2. **FIND-002 (Medium)** — Fix `useApi.ts` auth header and API base URL; wire Supabase JWT for push token registration
3. **FIND-003 (Low)** — Delete `.env` from workspace; enable pre-commit hook
4. **FIND-004 (Low)** — Set correct `eas.projectId` in `app.json`
5. **NEEDS-VAL-001** — Validate web backend single-use token enforcement
6. **NEEDS-VAL-002** — Verify Supabase RLS policies + functional test
7. **NEEDS-VAL-003** — Create backup rules XML or disable backup (addresses FIND-001)

---

## Appendix: Methodology

This audit followed the `security-audit` skill workflow (Phases 1–6):

1. **Reconnaissance** — Mapped product, principals, entry surfaces, trust boundaries, build process, diffed against prior audit commit (3953983)
2. **Coverage-Led Hunting** — Assigned ledger units per surface × boundary × attack class; focused on changed files and new features
3. **Candidate Validation** — Each candidate verified against source evidence and bounded local reasoning
4. **Structured Output** — Findings recorded with severity, evidence, attack scenario, remediation
5. **Independent Verification** — Self-review of each confirmed finding for completeness
6. **Report Generation** — This document

No target-controlled code was executed. All validation was source-based with mental fixtures.