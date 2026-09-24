# SahakariSIP Mobile — Security Audit Report

**Repository:** sahakari-sip-mobile
**Commit:** 3953983 (v1.2.1, versionCode 8)
**Audit Date:** 2026-09-24
**Profile:** standard
**Scope:** Full codebase (React Native / Expo Android APK)

---

## Executive Summary

This audit reviewed the SahakariSIP mobile application — a React Native/Expo app for tracking Nepali mutual fund SIP investments. The app implements dual-mode authentication (cloud via Supabase/NextAuth, local on-device), financial calculations per SEBON rules, and a one-time local-to-cloud merge flow.

**Overall Posture:** The codebase demonstrates careful security design with proper trust boundaries: Supabase anon key only (RLS-enforced isolation), salted SHA-256 for local passwords, SecureStore for biometric entries, Zod validation on all inputs, and explicit user consent for data merge. No critical vulnerabilities were found.

**Confirmed Findings:** 6 (1 High, 2 Medium, 3 Low)
**Needs Validation:** 3 (deployment/environment dependent)
**Rejected/Not Applicable:** 11 (design choices with adequate compensating controls)

---

## Confirmed Findings

### HIGH

#### FIND-001: CI Build Auto-Generates Weak Keystore When Signing Secrets Absent

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Affected Files** | `.github/workflows/build-release-apk.yml:83-92` |
| **Attack Scenario** | If repository secrets (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) are not configured, the CI workflow generates a self-signed keystore with hardcoded password `android123`. The resulting release APK is signed with this weak keystore. An attacker who obtains the APK can extract the keystore (standard Android tooling) and re-sign malicious updates with the same identity, enabling persistent app replacement on user devices. |
| **Evidence** | Lines 83-92: `keytool -genkeypair ... -storepass android123 -keypass android123`. The keystore is written to `android/app/release.keystore` and referenced in `android/keystore.properties`. |
| **Root Cause** | Fallback keystore generation uses a well-known, low-entropy password. No check fails the build when signing secrets are missing. |
| **Remediation** | 1. Make the build fail if `KEYSTORE_BASE64` secret is not set (remove the `else` branch).<br>2. Document that release builds require the keystore secret.<br>3. Rotate any APKs already published with the auto-generated keystore. |

---

### MEDIUM

#### FIND-002: On-Device Password Hashing Uses Bare SHA-256 (No Key Stretching)

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Affected Files** | `src/lib/auth/AuthContext.tsx:181-186` (`hashPassword` function) |
| **Attack Scenario** | A device is lost/stolen and the attacker extracts `AsyncStorage` (rooted device, backup, or forensic tool). The local profile stores `salt` and `hash = SHA256(salt + "::" + password)`. With a single SHA-256 iteration, an offline GPU attack can test ~10-50 billion passwords/second. An 8-character password (minimum enforced) falls in hours to days. |
| **Evidence** | ```typescript\nasync function hashPassword(password: string, salt: string): Promise<string> {\n  return Crypto.digestStringAsync(\n    Crypto.CryptoDigestAlgorithm.SHA256,\n    `${salt}::${password}`\n  );\n}\n```<br>No PBKDF2, Argon2, scrypt, or iteration count. `expo-crypto` does not expose a KDF. |
| **Root Cause** | The on-device auth mode was designed for simplicity and uses a fast hash instead of a memory-hard KDF. |
| **Remediation** | Replace with PBKDF2 (via `expo-crypto` + manual iterations) or Argon2 (via native module). Minimum: 100,000 PBKDF2-SHA256 iterations. Store `iterations` in the profile for future upgrades. |

#### FIND-003: Merge Deduplication by Case-Insensitive Fund Name Can Conflate Distinct Funds

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Affected Files** | `src/lib/data/merge.ts:253, 288-290` (`fundKey` function, `fundsByName` map) |
| **Attack Scenario** | User has two funds with names differing only in case (e.g., "NMB Saral Bachat Fund-E" on phone, "nmb saral bachat fund-e" on another device or cloud). During merge, `fundKey = name.trim().toLowerCase()` maps both to the same key. The merge treats them as one fund: entries from both are combined under a single cloud fund, corrupting portfolio analytics (XIRR, fee drag, CGT). |
| **Evidence** | ```typescript\nconst fundKey = (name: string) => name.trim().toLowerCase();\nconst fundsByName = new Map<string, FundConfig>();\n// ... later ...\nconst existing = fundsByName.get(name); // case-insensitive lookup\n```<br>No secondary discriminator (AMC code, ISIN, or user_id-scoped UUID) is used. |
| **Root Cause** | Deduplication assumes fund names are globally unique case-insensitively. In practice, Nepali AMCs may have similarly named funds, and user entry variance is likely. |
| **Remediation** | Use a composite key: `(user_id, fund_name_lowercase)`. Since merge is per-user, add the cloud user ID to the key. Or require an explicit fund-match step in the merge UI. |

#### FIND-004: Deep Link Token Replay Possible If Web Backend Doesn't Enforce Single-Use

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Affected Files** | `src/lib/auth/AuthContext.tsx:871-888` (Linking listener), `src/lib/auth/mobileApi.ts:87-100` (`googleStart`/`googleExchange`) |
| **Attack Scenario** | Attacker captures a valid Google OAuth handoff token (32 hex chars) from a user's device (clipboard, notification preview, shoulder surf, or compromised browser history). The token is passed via `sahakarisip://auth/callback?token=...`. If the web backend `/api/mobile/exchange` does not enforce single-use consumption, the attacker can replay the token to obtain a valid Supabase RLS JWT and access the victim's portfolio. |
| **Evidence** | Client mints nonce (`getRandomBytes(16)`), sends to web `/api/mobile/google`, receives auth URL. On callback, token is exchanged via `/api/mobile/exchange`. Client has no replay protection; relies entirely on server. |
| **Root Cause** | The security of the OAuth handoff depends entirely on the web backend's token consumption logic, which is outside this repository. |
| **Remediation** | 1. Verify web backend marks nonce/token as consumed on first exchange (idempotent rejection on replay).<br>2. Add short expiry (≤5 min) to handoff tokens.<br>3. Consider binding token to device fingerprint (IP, user agent) at issuance. |

---

### LOW

#### FIND-005: Android `allowBackup="true"` Exposes App Data via `adb backup`

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Affected Files** | `android/app/src/main/AndroidManifest.xml:14` |
| **Attack Scenario** | Attacker with physical USB access to an unlocked device (or compromised host) runs `adb backup -f backup.ab com.samimrrza.sahakarisip`. The backup includes `AsyncStorage` (local profiles, session, privacy settings) and potentially `SecureStore` data (biometric entries with Supabase JWTs). |
| **Evidence** | `<application android:allowBackup="true" ... android:fullBackupContent="@xml/secure_store_backup_rules" ...>`<br>The referenced XML may restrict some paths, but `allowBackup="true"` enables the backup API. |
| **Root Cause** | Default Expo/React Native template enables backup. Financial apps should disable it. |
| **Remediation** | Set `android:allowBackup="false"` in `AndroidManifest.xml`, or define `android:fullBackupContent` to explicitly exclude `sahakarisip.v1.*` AsyncStorage keys and SecureStore. |

#### FIND-006: CSV Import Accepts User-Supplied `units` Without Cross-Field Validation

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Affected Files** | `src/lib/data/cloud.ts:601-603`, `src/lib/data/local.ts:483-486` |
| **Attack Scenario** | User imports CSV with `units` value that doesn't match `(amount - DP_CHARGE) / nav` (whole-unit SEBON rule). The import accepts it, creating entries with inconsistent `units`. Dashboard recomputes from stored values, so analytics (XIRR, fee drag, CGT) become inaccurate. No security boundary crossed (self-impact only), but data integrity is violated. |
| **Evidence** | ```typescript\nconst units = parsed.data.units ?? Math.floor(effectiveCash / parsed.data.nav);\n// If units provided, used directly without validation\n```\nZod `csvRowSchema` allows optional `units` but doesn't cross-validate against `amount`/`nav`. |
| **Root Cause** | Schema validates field types and ranges individually, not the business rule relationship. |
| **Remediation** | Add a Zod `.refine()` on `csvRowSchema` to verify `units` (if provided) equals `Math.floor((amount - DP_CHARGE) / nav)`. Reject rows where the invariant fails. |

#### FIND-007: `.env` File with Production Credentials Exists in Working Directory

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Affected Files** | `.env` (not committed; `.gitignore` excludes it) |
| **Attack Scenario** | Developer accidentally commits `.env` (e.g., `git add .`). The file contains the production Supabase URL and anon key. While the anon key is constrained by RLS and safe to ship in the APK, its presence in git history would require key rotation and exposes the project identifier. |
| **Evidence** | `.env` contains:\n```\nEXPO_PUBLIC_SUPABASE_URL=https://entbhjpnhdjfhcctcvmt.supabase.co\nEXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Qox-u2IFEpaoUHus51Ofhw_4XyVPI3D\n``` |
| **Root Cause** | Developer created `.env` for local testing; `.gitignore` prevents commit but file persists in workspace. |
| **Remediation** | 1. Delete `.env` from workspace; use `.env.local` (also gitignored) for local overrides.<br>2. Add pre-commit hook to reject `.env` commits.<br>3. Rotate anon key if ever committed (Supabase: Project Settings → API → Regenerate). |

---

## Needs Validation

These findings require deployment/runtime facts not observable in source.

#### NEEDS-VAL-001: Google OAuth Handoff — Web Backend Single-Use Token Enforcement

| Field | Detail |
|-------|--------|
| **Status** | Needs Validation |
| **Missing Fact** | Does `POST /api/mobile/exchange` on the web backend (NextAuth) mark the nonce/token as consumed and reject replays? |
| **Safe Check** | Owner deploys a test instance, captures a handoff token, exchanges it twice, and verifies the second request fails with 400/409. |
| **Related Finding** | FIND-004 |

#### NEEDS-VAL-002: Supabase RLS Policies Correctly Enforce Per-User Isolation

| Field | Detail |
|-------|--------|
| **Status** | Needs Validation |
| **Missing Fact** | Are the Supabase tables (`fund_config`, `entries`, `nav_history`, `notification_preferences`, `notifications_log`) protected by RLS policies `auth.uid() = user_id`? |
| **Safe Check** | Owner runs `supabase db dump --schema public` or checks Supabase Dashboard → Authentication → Policies. Test with two dummy users: sign in as user A, attempt to read user B's rows via Supabase client with user A's JWT. |
| **Related Finding** | All cloud data access (`src/lib/data/cloud.ts`) |

#### NEEDS-VAL-003: Android `fullBackupContent` XML Actually Excludes Sensitive Keys

| Field | Detail |
|-------|--------|
| **Status** | Needs Validation |
| **Missing Fact** | Does `android/app/src/main/res/xml/secure_store_backup_rules.xml` exclude `AsyncStorage` keys (`sahakarisip.v1.*`) and `SecureStore` data? |
| **Safe Check** | Owner inspects the XML file. If missing or permissive, set `allowBackup="false"`. |
| **Related Finding** | FIND-005 |

---

## Rejected / Not Applicable (Design Choices with Adequate Controls)

| ID | Area | Reason |
|----|------|--------|
| REJ-001 | SQL Injection | Supabase JS client uses parameterized queries; no string interpolation in queries. |
| REJ-002 | XSS/Injection | React Native doesn't render HTML; all dynamic values go through Text components. |
| REJ-003 | Hardcoded Secrets | No secrets in source. `.env` is gitignored. Anon key is public by design. |
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
| **Auth Modes** | Cloud (Supabase RLS JWT via NextAuth), Local (salted SHA-256 in AsyncStorage) |
| **Data Isolation** | Cloud: RLS `user_id = auth.uid()`<br>Local: `sahakarisip.v1.<profileId>.*` keys |
| **Key Controls** | Zod schemas, HTTPS-only web URL, SecureStore (Keystore-backed), FLAG_SECURE (expo-screen-capture), explicit merge consent |
| **Build** | Expo prebuild → Gradle → signed APK; GitHub Actions CI |
| **Dependencies** | Locked via `package-lock.json`; no known critical CVEs at audit time |

---

## Coverage Statement

This audit covered all identified trust boundaries and entry surfaces:

- **Auth surfaces**: email/password (cloud + local), Google OAuth handoff, password reset OTP, biometric unlock
- **Data surfaces**: SIP entries, fund configs, CSV import, NAV history, notification prefs
- **Merge flow**: local→cloud one-time merge with user consent, deduplication, backup
- **Storage**: AsyncStorage (local mode), SecureStore (biometric), Supabase (cloud mode)
- **Transport**: HTTPS to Supabase and web backend; custom scheme deep link
- **Build**: CI workflow, keystore handling, dependency integrity

All attack classes from `ATTACK-CLASSES.md` relevant to a React Native/Expo mobile app were considered: Injection, Access Control, Cryptography/Secrets, Business Logic, Feature Abuse, Chained Vulnerabilities, Desktop/Mobile/Local-IPC, Web/Protocol/Auth, Data Isolation, Supply Chain, Obvious Things.

---

## Recommended Priority Order

1. **FIND-001 (High)** — Fail CI build if signing secrets missing; rotate any affected APKs
2. **FIND-002 (Medium)** — Upgrade local password hashing to PBKDF2/Argon2
3. **FIND-003 (Medium)** — Fix merge deduplication to use composite key
4. **FIND-004 (Medium)** — Verify web backend single-use token enforcement
5. **FIND-005 (Low)** — Set `allowBackup="false"` or restrict backup rules
6. **FIND-006 (Low)** — Add cross-field CSV validation
7. **FIND-007 (Low)** — Remove `.env` from workspace; add pre-commit guard
8. **NEEDS-VAL-001/002/003** — Owner-observed validation checks

---

## Appendix: Methodology

This audit followed the `security-audit` skill workflow (Phases 1–6):
1. **Reconnaissance** — Mapped product, principals, entry surfaces, trust boundaries, build process
2. **Coverage-Led Hunting** — Assigned ledger units per surface × boundary × attack class
3. **Candidate Validation** — Each candidate verified against source evidence and bounded local reasoning
4. **Structured Output** — Findings recorded with severity, evidence, attack scenario, remediation
5. **Independent Verification** — Self-review of each confirmed finding for completeness
6. **Report Generation** — This document and `findings.json`

No target-controlled code was executed. All validation was source-based with mental fixtures.