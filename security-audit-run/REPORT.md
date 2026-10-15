# Security Audit Report — SahakariSIP Mobile

**Repository**: sahakari-sip-mobile  
**Commit**: 6ef5dad (v1.5.5, versionCode 15, clean worktree)  
**Audit Date**: 2026-10-11  
**Profile**: standard  
**Scope**: app/, src/, android/app/src/main/, .github/workflows/, package.json, app.json, .env.example  
**Execution Policy**: sandboxed-source-and-local-only

---

## Executive Summary

This audit examined the SahakariSIP mobile application (Expo/React Native, financial portfolio tracker) across 21 coverage units spanning authentication, local encryption, cloud data access, platform security, and supply chain. The audit found **20 findings** total:

| Status | Count | Severity Breakdown |
|--------|-------|-------------------|
| **Confirmed** | 13 | 2 Critical, 5 High, 3 Medium, 2 Low, 1 Informational |
| **Needs Validation** | 7 | Server-side controls not verifiable from mobile repo |

**Critical findings** (2):
- **FIND-2026-10-11-012**: Local vault `encryptJson()` returns plaintext when vault is locked, persisting unencrypted financial data to AsyncStorage
- **FIND-2026-10-11-015**: 27 NPM transitive vulnerabilities (1 critical command injection, 17 high) in production dependency chain

**High findings** (5):
- **FIND-2026-10-11-003**: Android ADB backup exfiltrates Supabase JWT and credentials via SharedPreferences (backup rules include all sharedprefs, only exclude SecureStore; `allowBackup=false` reverted by `expo prebuild`)
- **FIND-2026-10-11-008**: Session TTL only enforced on foreground transition — bypass by keeping app active
- **FIND-2026-10-11-009**: Recovery key displayed/entered in plaintext without `secureTextEntry` or screen capture prevention
- **FIND-2026-10-11-010**: CSV import uses naive `split(',')` parser without RFC 4180 support, no file size limit
- **FIND-2026-10-11-011**: Push tokens sent to hardcoded admin backend without authentication
- **FIND-2026-10-11-013**: Local→cloud merge merges ALL local profiles without identity verification (cross-user data contamination)

**Needs Validation** (7) — all require server-side verification in separate repositories:
- OAuth handoff token single-use enforcement (web backend)
- Google ID token validation (web backend, two endpoints)
- Supabase RLS policies (deployed SQL)
- Profile photo Supabase Storage bucket policies
- Password reset token server-side lifecycle
- Web backend token consumption logic

---

## Coverage Statement

**21 coverage units** planned and executed in Wave 1:

| Unit | Status | Finding |
|------|--------|---------|
| deep-link::oauth-handoff | candidate | FIND-2026-10-11-001 (needs_validation) |
| native-google-signin::google-idtoken-validation | candidate | FIND-2026-10-11-002 (needs_validation) |
| email-password::cloud-auth | covered | FIND-2026-10-11-019 (confirmed, medium) |
| password-reset::otp-flow | candidate | FIND-2026-10-11-020 (needs_validation) |
| adb-backup::android-backup | covered | FIND-2026-10-11-003 (confirmed, high) |
| supabase-rls::data-isolation | candidate | FIND-2026-10-11-004 (needs_validation) |
| profile-photo-upload::file-upload | candidate | FIND-2026-10-11-005 (needs_validation) |
| local-vault::envelope-encryption | covered | FIND-2026-10-11-006 (confirmed, medium) |
| biometric-unlock::secure-session | covered | FIND-2026-10-11-007 (confirmed, medium) |
| session-ttl::absolute-expiry | covered | FIND-2026-10-11-008 (confirmed, high) |
| local-password-reset::recovery-key | covered | FIND-2026-10-11-009 (confirmed, high) |
| csv-import::data-ingestion | covered | FIND-2026-10-11-010 (confirmed, high) |
| push-token::admin-backend | covered | FIND-2026-10-11-011 (confirmed, high) |
| local-data-store::encrypted-storage | covered | FIND-2026-10-11-012 (confirmed, critical) |
| local-merge::data-migration | covered | FIND-2026-10-11-013 (confirmed, high) |
| env-file::credential-exposure | covered | FIND-2026-10-11-014 (confirmed, low) |
| npm-deps::transitive-vulns | covered | FIND-2026-10-11-015 (confirmed, critical) |
| web-backend-token-consumption | candidate | FIND-2026-10-11-016 (needs_validation) |
| google-idtoken-server-validation | candidate | FIND-2026-10-11-017 (needs_validation) |
| android-backup-rules::xml-content | covered | FIND-2026-10-11-003 (confirmed, high) |
| screen-capture::prevention | covered | FIND-2026-10-11-018 (confirmed, informational) |

**Coverage gaps**: None within declared scope. 7 units require server-side validation outside this repository.

**Prior run carry-forward**: 9 prior findings carried forward (4 confirmed same-source, 3 needs_validation, 2 changed-source). All revalidated or reclassified.

---

## Methodology

This audit followed the security-audit skill full workflow (6 phases):
1. **Reconnaissance** — Architecture mapping, trust boundaries, coverage ledger
2. **Hunting Waves** — 21 isolated hunter agents with companion domain guidance
3. **Candidate Validation** — Fingerprint consolidation, evidence review
4. **Structured Output** — findings.json, coverage-ledger.json
5. **Independent Verification** — Fresh review of confirmed findings
6. **Report Generation** — This document, FINDINGS-DETAIL.md, NEEDS-VALIDATION.md

**Companion domains applied**:
- WEB-PROTOCOL-AND-AUTH.md (OAuth/OIDC, file upload)
- DESKTOP-MOBILE-AND-LOCAL-IPC.md (deep links, backup, session, credentials)
- DATA-ISOLATION-AND-LIFECYCLE.md (RLS, merge)
- ATTACK-CLASSES.md (supply chain, obvious things)
- SUPPLY-CHAIN-AND-RELEASE.md (dependencies)

---

## Critical Findings Detail

### FIND-2026-10-11-012 — Local Vault: encryptJson Returns Plaintext When Locked (CRITICAL)

**Boundary**: App Runtime → Encrypted AsyncStorage  
**Root Cause**: `encryptJson()` in `local-vault.ts:201-208` returns raw JSON when `!activeDek` instead of throwing. All LocalStore writes route through `writeJson()` → `encryptJson()`.

**Impact**: Any write operation while vault is locked (post-logout, TTL expiry, explicit lock) persists unencrypted financial data (funds, entries, NAV, prefs) to AsyncStorage. Subsequent unlock does not re-encrypt.

**Evidence**:
- `src/lib/auth/local-vault.ts:201-208` — `encryptJson()` returns plaintext when vault locked
- `src/lib/data/local.ts:89-92` — `writeJson()` calls `encryptJson()` for all writes
- `src/lib/data/local.ts:107-129` — All CRUD operations use `writeJson()`

**Remediation**: Change `encryptJson()` to throw when vault locked. Add vault state guard before LocalStore writes. Ensure vault unlocked before any data operation.

---

### FIND-2026-10-11-015 — NPM Transitive Vulnerabilities: 27 Total (1 Critical, 17 High) (CRITICAL)

**Boundary**: Dependency Supply Chain → Application Runtime  
**Root Cause**: Expo SDK 57 pins vulnerable transitive dependencies in production tree (not devDependencies).

**Key Vulnerabilities**:
- **Critical**: `shell-quote@1.10.0` (CVE GHSA-pqg4-j6r4-53mv, CWE-78) command injection via `react-native@0.86.3` → `react-devtools-core@6.1.5`
- **High**: `node-forge@1.4.0` (CVE GHSA-86w9-cpqp-85rv, CWE-347) RSA signature verification bypass via `expo` → `@expo/cli` → `@expo/code-signing-certificates`
- **High**: `braces@3.0.3` / `micromatch@4.0.8` (CVE GHSA-vfj7-8cjw-p6xm, CWE-674) stack exhaustion DoS via metro file-map
- **High**: `react-native-reanimated@4.5.1` / `react-native-worklets@0.10.1` via `expo-modules-core`

**Remediation**: Upgrade to Expo SDK 58+ / React Native 0.87+. Add `npm audit` CI gate. Monitor for patched versions. Consider `package.json` overrides for critical vulns.

---

## High Findings Detail

### FIND-2026-10-11-003 — Android ADB Backup Exfiltrates JWT/Credentials (HIGH)

**Boundary**: Device (USB/ADB) → App Private Storage  
**Root Cause**: Backup rules (`secure_store_backup_rules.xml`, `secure_store_data_extraction_rules.xml`) include all SharedPreferences (`<include domain="sharedpref" path="."/>`) while only excluding SecureStore. `android:allowBackup=false` in Manifest is reverted by `expo prebuild`.

**Exfiltrated Data**: `sahakarisip.v1.mobile_session` (Supabase RLS JWT), `sahakarisip.v1.session` (user identity), `sahakarisip.v1.profiles` (password hashes, salts, wrapped DEKs), `sahakarisip.v1.used_handoff_tokens`.

**Remediation**: Add explicit `<exclude domain="sharedpref" path="sahakarisip"/>` rules. Add CI check preventing `allowBackup=true`. Migrate all sensitive data to SecureStore.

---

### FIND-2026-10-11-008 — Session TTL Bypass: Only Checked on Foreground (HIGH)

**Boundary**: App Runtime → Session State (4-hour absolute expiry)  
**Root Cause**: TTL enforcement in `AuthContext.tsx:386-418` only triggers on `AppState` background→active transition. No periodic timer.

**Impact**: App kept in foreground indefinitely bypasses the 4-hour absolute expiry. Biometric users get effective extension via stashed re-auth.

**Remediation**: Add `setInterval` (e.g., every 5 min) checking TTL regardless of AppState. Call `expireSession()` immediately on expiry even in foreground.

---

### FIND-2026-10-11-009 — Recovery Key Plaintext Display/Input (HIGH)

**Boundary**: Device User → Recovery Key Input → Vault DEK  
**Root Cause**: Recovery key displayed in plaintext (large bold font), copied to clipboard, entered in `TextInput` without `secureTextEntry`. `expo-screen-capture` installed but `preventScreenCaptureAsync()` never called (though global FLAG_SECURE in `app/_layout.tsx` covers these screens).

**Remediation**: Add `secureTextEntry` to recovery key inputs. Remove clipboard copy or add warning. Mask display (show first/last 4 chars only). Verify global FLAG_SECURE covers all sensitive screens.

---

### FIND-2026-10-11-010 — CSV Import: Naive Parser, No Size Limit (HIGH)

**Boundary**: User Input (CSV) → Parsed Data → Database  
**Root Cause**: Custom `parseCsv()` in `CsvImportModal.tsx:70-148` uses `split(',')` without RFC 4180 support. `FileSystem.readAsStringAsync()` reads entire file with no size limit.

**Attack Vectors**: Quoted commas/newlines bypass parser → field confusion. Unbounded file read → DoS. Scientific notation in numeric fields → overflow. Ambiguous date formats.

**Remediation**: Replace with RFC 4180 compliant parser (PapaParse). Add 1MB file size limit before read. Restrict numeric fields to fixed-point regex. Add server-side payload limits.

---

### FIND-2026-10-11-011 — Push Token to Unauthenticated Admin Backend (HIGH)

**Boundary**: Mobile App → Admin Backend (push token registration)  
**Root Cause**: Hardcoded `ADMIN_PUSH_TOKEN_URL` in `push-registration.ts:46`. POST/DELETE send `{token, userId, platform}` with only `Content-Type`, no auth. Response validation only checks `res.ok`.

**Impact**: Compromised Vercel deployment → harvest all push tokens → arbitrary notifications. Push token = bearer credential.

**Remediation**: Move URL to env var. Add mTLS or shared secret auth. Validate response body. Consider Expo push service directly.

---

### FIND-2026-10-11-013 — Local→Cloud Merge: Cross-User Data Contamination (HIGH)

**Boundary**: Local Device Data → Cloud Supabase  
**Root Cause**: `merge.ts` scans ALL local profiles via AsyncStorage regex without verifying identity match with authenticated cloud session.

**Impact**: User on shared device merges another user's SIP data into their cloud account. `MergePromptDialog` shows aggregate counts only.

**Remediation**: Verify local profile email matches cloud session email before merge. Show per-profile confirmation dialog. Skip mismatched identities.

---

## Medium Findings

### FIND-2026-10-11-006 — PBKDF2 Iterations (100k) Below 2026 Baseline (MEDIUM)
**Boundary**: Device User → Local Encrypted Vault  
**Remediation**: Increase `WRAP_ITERATIONS` to 600,000 (OWASP 2026 minimum). Add vault versioning for iterative upgrades.

### FIND-2026-10-11-007 — Biometric Unlock Resets TTL Without Server Revalidation (MEDIUM)
**Boundary**: OS Biometric → SecureStore → Supabase RLS JWT  
**Remediation**: On biometric unlock, make lightweight Supabase API call to validate JWT before TTL reset. Shorten JWT lifetime with refresh rotation.

### FIND-2026-10-11-019 — Email Enumeration via Differentiated Auth Errors (MEDIUM)
**Boundary**: Mobile App → Web Backend credential verification  
**Remediation**: Use generic "invalid credentials" for all auth failures. Add client-side rate limiting with exponential backoff. Add password complexity requirements.

---

## Low Findings

### FIND-2026-10-11-014 — .env File in Workspace (LOW)
**Boundary**: Developer Workspace → Git History  
**Remediation**: Remove `.env` from workspace (use `.env.example` only). Verify pre-commit hook installed via CI.

---

## Informational

### FIND-2026-10-11-018 — Screen Capture Prevention Properly Implemented (INFO)
**Boundary**: App UI → Screenshot/Screen Recording  
Global `ScreenCapture.preventScreenCaptureAsync()` in `app/_layout.tsx` protects all screens including recovery key display. No action needed.

---

## Needs Validation (Server-Side Controls Not In This Repo)

| Finding | Server Component | Validation Required |
|---------|------------------|---------------------|
| FIND-2026-10-11-001 | Web backend `/api/mobile/exchange` | Atomic single-use token consumption |
| FIND-2026-10-11-002 | Web backend `/api/mobile/google-native` | ID token aud/iss/exp/sig validation |
| FIND-2026-10-11-004 | Supabase RLS policies | `supabase-verify-rls.sql` against production |
| FIND-2026-10-11-005 | Supabase Storage `avatars` bucket | Content-type enforcement on upload/serve |
| FIND-2026-10-11-016 | Web backend `/api/mobile/exchange` | Token consumption logic (duplicate of 001) |
| FIND-2026-10-11-017 | Web backend `/api/mobile/google-native` | ID token validation (duplicate of 002) |
| FIND-2026-10-11-020 | Web backend `/api/mobile/password-reset` | resetToken TTL, single-use, OTP rate limiting |

**Note**: FIND-2026-10-11-016 and 017 are duplicates of 001 and 002 respectively (separate coverage units, same root cause).

---

## Recommended Priority Order

1. **Immediate** (Critical):
   - Fix `encryptJson()` plaintext-on-locked (FIND-012)
   - Upgrade Expo SDK / resolve NPM vulns (FIND-015)

2. **High Priority** (High):
   - Android backup rules + `allowBackup` CI guard (FIND-003)
   - Session TTL periodic enforcement (FIND-008)
   - Recovery key secure input/display (FIND-009)
   - CSV parser replacement + size limits (FIND-010)
   - Push token admin backend auth (FIND-011)
   - Local→cloud merge identity verification (FIND-013)

3. **Medium Priority**:
   - PBKDF2 iterations increase (FIND-006)
   - Biometric unlock server revalidation (FIND-007)
   - Email enumeration generic errors + rate limiting (FIND-019)

4. **Validation Required** (Coordinate with web/backend teams):
   - OAuth handoff single-use (FIND-001)
   - Google ID token validation (FIND-002, 017)
   - Supabase RLS policies (FIND-004)
   - Storage bucket policies (FIND-005)
   - Password reset token lifecycle (FIND-020)

5. **Hygiene**:
   - Remove `.env` from workspace (FIND-014)

---

## Artifacts

- `findings.json` — Machine-readable findings with evidence
- `coverage-ledger.json` — Deterministic coverage tracking
- `FINDINGS-DETAIL.md` — Per-finding deep dive
- `NEEDS-VALIDATION.md` — Server-side validation checklist
- `run-metadata.json` — Run configuration

---

*Audit conducted per security-audit skill v1.0, standard profile, sandboxed-source-and-local-only execution policy.*