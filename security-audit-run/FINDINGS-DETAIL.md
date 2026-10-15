# Findings Detail — SahakariSIP Mobile Security Audit

**Audit Date**: 2026-10-11  
**Source**: findings.json (20 findings)

---

## FIND-2026-10-11-001: OAuth Handoff Token Replay

**Status**: needs_validation  
**Severity**: (pending server validation)  
**Fingerprint**: oauth-handoff-replay-via-captured-nonce  
**Boundary**: Mobile App → Web Backend (/api/mobile/exchange)  
**Lower-Trust Principal**: Attacker with captured deep link token (clipboard, notification preview, browser history, logs)  
**Affected Resource**: User's Google OAuth session / Supabase RLS JWT / Cloud account access

### Attack Scenario
Attacker captures the 32-char hex handoff nonce from clipboard, notification preview, or browser history and replays it to `/api/mobile/exchange` to obtain a valid Supabase RLS JWT, granting full cloud account access.

### Evidence
- `src/lib/auth/AuthContext.tsx:270-293` — USED_HANDOFF_TOKENS_KEY journal, markHandoffTokenUsed/isHandoffTokenUsed with 24h TTL and 50-entry cap; comment 'Best-effort; server enforces single-use'
- `src/lib/auth/AuthContext.tsx:997-1027` — completeGoogleHandoff checks isHandoffTokenUsed BEFORE googleExchange, marks AFTER success (non-atomic check-then-act)
- `src/lib/auth/AuthContext.tsx:1040-1057` — Linking listener cold-start path extracts token from sahakarisip://auth/callback?token= and calls googleHandoffRef.current directly
- `app/(auth)/auth/callback.tsx:31-38` — Warm handoff path: resolveGoogleHandoff resolves waiters, callback screen reflects resulting auth state
- `src/lib/auth/mobileApi.ts:87-94` — googleStart generates 32-char hex nonce client-side via expo-crypto getRandomBytes(16)
- `src/lib/auth/mobileApi.ts:97-100` — googleExchange POSTs nonce to /api/mobile/exchange; no client-side proof of server-side single-use

### Root Cause
Critical single-use enforcement relies on server-side logic in separate repository (sahakari-sip web backend) that cannot be audited from mobile codebase. Client-side journal is best-effort only.

### Recommended Remediation
Add server-side audit to verify /api/mobile/exchange atomically consumes and invalidates the handoff token. Implement nonce binding to device fingerprint or session. Consider PKCE for mobile OAuth flows.

### Validation Required
- [ ] Verify web backend /api/mobile/exchange implements atomic single-use consumption
- [ ] Confirm token invalidation on first use (prevents replay)
- [ ] Check if web backend binds nonce to IP/user-agent/device
- [ ] Verify web backend rate-limits exchange endpoint

---

## FIND-2026-10-11-002: Native Google Sign-In — Server-Side ID Token Validation Not Verifiable

**Status**: needs_validation  
**Severity**: (pending server validation)  
**Fingerprint**: native-google-signin:idtoken-server-validation-missing:src/lib/auth/AuthContext.tsx:1097-1113:src/lib/auth/mobileApi.ts:109-114  
**Boundary**: Mobile App → Web Backend (/api/mobile/google-native)  
**Lower-Trust Principal**: Mobile App (untrusted client running on user device)  
**Affected Resource**: Web Backend authentication service / user accounts in next_auth.users

### Attack Scenario
If the web backend /api/mobile/google-native fails to verify the ID token's aud/iss/exp/signature, an attacker with a valid Google ID token for a different audience (or a forged token) could authenticate as any user.

### Evidence
- `src/lib/auth/AuthContext.tsx:1097` — hardcoded webClientId fallback used in GoogleSignin.configure()
- `src/lib/auth/AuthContext.tsx:1102` — idToken extracted from userInfo.data?.idToken
- `src/lib/auth/AuthContext.tsx:1103-1108` — only null/undefined check, no JWT validation
- `src/lib/auth/AuthContext.tsx:1113` — googleNativeSignIn(idToken) called with raw token
- `src/lib/auth/mobileApi.ts:109-114` — googleNativeSignIn() POSTs {idToken} to /google-native

### Root Cause
Mobile client sends raw Google ID token without client-side validation of audience, issuer, expiry, or signature. Server-side validation at web backend cannot be verified from mobile repository.

### Recommended Remediation
Add server-side audit to verify /api/mobile/google-native validates: aud=webClientId, iss=accounts.google.com, exp > now, valid Google signature. Consider client-side pre-validation as defense-in-depth.

### Validation Required
- [ ] Verify web backend /api/mobile/google-native validates ID token aud/iss/exp/signature
- [ ] Confirm webClientId matches Google Cloud Console Android client config
- [ ] Check if web backend uses Google's tokeninfo endpoint or local JWKS verification

---

## FIND-2026-10-11-003: Android ADB Backup Exfiltrates Supabase JWT and Credentials

**Status**: confirmed  
**Severity**: high  
**Fingerprint**: adb-backup-asyncstorage-jwt-exfiltration  
**Boundary**: Device (USB/ADB) → App Private Storage  
**Lower-Trust Principal**: Physical device holder with ADB/USB access  
**Affected Resource**: Supabase RLS JWT (accessToken), device-local password hashes/vault metadata, session identity, OAuth replay tokens

### Attack Scenario
Attacker with physical device access runs `adb backup -all com.samimrrza.sahakarisip` and extracts the backup. Using abe.jar, they unpack the backup and read all SharedPreferences including sahakarisip.v1.mobile_session (Supabase RLS JWT), sahakarisip.v1.session (user identity), sahakarisip.v1.profiles (password hashes/salts/vault), and sahakarisip.v1.used_handoff_tokens.

### Evidence
- `android/app/src/main/AndroidManifest.xml:20` — android:allowBackup="false" with comment warning expo prebuild reverts it
- `android/app/src/main/res/xml/secure_store_backup_rules.xml:5-6` — `<include domain="sharedpref" path="."/> <exclude domain="sharedpref" path="SecureStore"/>`
- `android/app/src/main/res/xml/secure_store_data_extraction_rules.xml:6-7,10-11` — Same include-all sharedprefs pattern for cloud-backup and device-transfer
- `src/lib/auth/mobileSession.ts:35,55-81` — SESSION_KEY="sahakarisip.v1.mobile_session" stores MobileSession with accessToken (Supabase RLS JWT) and expiresAt in AsyncStorage
- `src/lib/auth/AuthContext.tsx:190-192,420-429` — SESSION_KEY="sahakarisip.v1.session" stores AppUser (id, email, name, avatarUrl, mode) and SESSION_STARTED_KEY timestamp in AsyncStorage
- `src/lib/auth/AuthContext.tsx:233-244` — PROFILES_KEY="sahakarisip.v1.profiles" stores LocalProfile[] with salt, hash, iterations, vault (wrapped DEKs) in AsyncStorage
- `src/lib/auth/AuthContext.tsx:272-292` — USED_HANDOFF_TOKENS_KEY="sahakarisip.v1.used_handoff_tokens" stores replay-protection tokens in AsyncStorage
- `src/lib/auth/local-vault.ts:32,178-188` — SECURESTORE_PREFIX="sahakarisip.v1.dek." stores DEKs in SecureStore (correctly excluded)

### Root Cause
Backup rules explicitly include all SharedPreferences (domain=sharedpref path=.) while only excluding SecureStore. The only protection is android:allowBackup=false which expo prebuild reverts to true.

### Recommended Remediation
Change backup rules to exclude all sahakarisip.* SharedPreferences keys. Add explicit `<exclude domain="sharedpref" path="sahakarisip"/>` rules. Add CI check to prevent allowBackup=true in Manifest. Store all sensitive data in SecureStore/Keystore, not AsyncStorage.

---

## FIND-2026-10-11-004: Supabase RLS Data Isolation — Server-Side Policies Not Verifiable

**Status**: needs_validation  
**Severity**: (pending server validation)  
**Fingerprint**: 4cf29e0ed8000e75  
**Boundary**: Supabase (Postgres) → User Data  
**Lower-Trust Principal**: Mobile client (untrusted code running on user device)  
**Affected Resource**: All user portfolio data (fund_config, entries, nav_history, notification_preferences, notifications_log)

### Attack Scenario
If Supabase RLS policies are missing, disabled, or misconfigured on any table, a malicious client with a valid JWT could read/write any user's data by manipulating the user_id in queries.

### Evidence
- `src/lib/data/cloud.ts:62-65` getUserId() reads session.user.id from mobileSession
- `src/lib/data/cloud.ts:76-78` db getter uses getSupabase() which injects Bearer token via accessToken hook
- `src/lib/supabase.ts:58-63` createClient with accessToken: () => getMobileBearer()
- `src/lib/auth/mobileSession.ts:94-97` getMobileBearer() returns session.accessToken (RLS JWT)
- All CloudStore queries filter by user_id (20+ query sites)
- `src/lib/data/cloud.ts:787-791` nav_reference query has NO user_id filter (by design - shared market data)
- `supabase-enable-rls.sql`, `supabase-fix-user-mapping.sql`, `supabase-verify-rls.sql` — RLS SQL files in repo but deployed separately
- `NEEDS-VALIDATION.md:28-46` NEEDS-VAL-002 documents RLS policies cannot be verified from source

### Root Cause
Application code correctly filters by user_id but actual enforcement lives in Supabase RLS policies (deployed SQL, not in this repo). The mobile repo cannot verify RLS configuration.

### Recommended Remediation
Deploy Supabase RLS verification scripts (supabase-verify-rls.sql) in CI/CD. Add integration tests that verify cross-user isolation with multiple test users. Document RLS policies in repo as SQL migrations for auditability.

### Validation Required
- [ ] Run supabase-verify-rls.sql against production Supabase project
- [ ] Verify all user tables have RLS enabled and correct policies
- [ ] Test cross-user isolation with two test accounts
- [ ] Confirm Storage RLS policies for avatars bucket

---

## FIND-2026-10-11-005: Profile Photo Upload — Client-Side MIME Trust

**Status**: needs_validation  
**Severity**: (pending server validation)  
**Fingerprint**: profile-photo-upload-mime-trust-cloudts-1000  
**Boundary**: User Input (File) → Supabase Storage → Browser Rendering  
**Lower-Trust Principal**: Authenticated mobile app user (client-controlled file URI and MIME type)  
**Affected Resource**: Supabase Storage 'avatars' bucket; public avatar URLs served to web app users via <img> tags

### Attack Scenario
Attacker uploads HTML/JS file with spoofed image MIME type. If Supabase Storage bucket policies don't enforce content-type on upload/serve, the file executes in web app browser context when avatar is rendered via public URL.

### Evidence
- `src/lib/data/cloud.ts:989-1048` (updateProfileImage)
- `src/lib/data/cloud.ts:995-996` (fetch URI → blob, no content inspection)
- `src/lib/data/cloud.ts:997-998` (size check only)
- `src/lib/data/cloud.ts:1000-1003` (allowlist validates client-supplied mimeType parameter)
- `src/lib/data/cloud.ts:1005` (extension derived from trusted mimeType)
- `src/lib/data/cloud.ts:1021-1026` (upload with contentType: mimeType)
- `src/lib/data/cloud.ts:1032-1033` (public URL used directly)
- `src/components/settings/profile-image-manager.tsx:67` (mimeType = asset.mimeType || 'image/jpeg')
- `src/lib/profilePhoto.ts:61-66` (picker validation trusts asset.mimeType/asset.name)
- Supabase Storage bucket policies for 'avatars' NOT in repository

### Root Cause
Client-side MIME validation trusts attacker-controlled asset.mimeType; no magic-byte validation; file uploaded with client-supplied contentType. Server-side Storage policies not verifiable from mobile repo.

### Recommended Remediation
Add magic-byte validation (check file header) before upload. Configure Supabase Storage bucket policies to enforce content-type on upload and serve. Serve avatars through a proxy that sets correct Content-Type and CSP headers.

### Validation Required
- [ ] Confirm Supabase Storage 'avatars' bucket policies: does upload enforce content-type? Does download serve correct Content-Type header?
- [ ] Verify web app renders avatar URLs via <img> tags (same Supabase project)
- [ ] Test if spoofed MIME type with HTML content executes in browser when accessed via public URL
- [ ] Check if Supabase Storage normalizes/overrides content-type on serve

---

## FIND-2026-10-11-006: Local Vault — PBKDF2 Iterations Below 2026 Baseline

**Status**: confirmed  
**Severity**: medium  
**Fingerprint**: local-vault::envelope-encryption::pbkdf2-100k-iterations-inadequate-2026  
**Boundary**: Device User → Local Encrypted Vault  
**Lower-Trust Principal**: Attacker with vault metadata (salt, wrapped DEK) and offline compute  
**Affected Resource**: User's password-wrapped DEK (and all local vault data)

### Attack Scenario
Attacker extracts the vault metadata (wrap_salt, wrapped_dek_password) from AsyncStorage and performs offline brute-force attack on the password. At 100k iterations, PBKDF2-HMAC-SHA256 is ~6x below 2024-2026 baseline (NIST SP 800-63B: 600k; OWASP: 600k minimum), reducing effective password entropy by ~2.5 bits.

### Evidence
- `src/lib/auth/local-vault.ts:29` — const WRAP_ITERATIONS = 100_000
- `src/lib/auth/local-vault.ts:88-90` — passwordWrapKeyBytes uses pbkdf2Bytes with WRAP_ITERATIONS
- `src/lib/auth/nativeCrypto.ts:82-93` — pbkdf2Bytes calls quickCrypto().pbkdf2Sync (native) / WebCrypto (web) with iterations parameter

### Root Cause
PBKDF2 iteration count of 100,000 was adequate ~2018 but is significantly below current 2026 baselines (600k+). The native crypto shim (react-native-quick-crypto) supports higher iterations.

### Recommended Remediation
Increase WRAP_ITERATIONS to 600,000 (OWASP 2026 minimum) or 1,000,000 (NIST SP 800-63B). Test performance impact on target devices. Add versioning to vault format to allow iterative upgrades for existing users.

---

## FIND-2026-10-11-007: Biometric Unlock Resets TTL Without Server Revalidation

**Status**: confirmed  
**Severity**: medium  
**Fingerprint**: biometric-ttl-reset-without-server-revalidation  
**Boundary**: OS Biometric Prompt → SecureStore Session Entry → Supabase RLS JWT  
**Lower-Trust Principal**: Local biometric sensor / OS authentication subsystem  
**Affected Resource**: MobileSession (Supabase RLS JWT + user identity) stored in SecureStore

### Attack Scenario
User's JWT is revoked server-side (password change, admin revoke, security event). User authenticates via biometric; app restores stale JWT from SecureStore and resets client-side 4-hour TTL without any server-side token validation. The user remains authenticated until a Supabase request fails.

### Evidence
- `src/lib/auth/biometric.ts:106` disableDeviceFallback: true correctly prevents PIN/pattern fallback
- `src/lib/auth/biometric.ts:53-56` SecureStore.setItemAsync stores BiometricEntry with mobileSession (JWT) or localProfileId — Keystore/Enclave backed
- `src/lib/auth/AuthContext.tsx:650-654` unlockWithBiometric checks entry.mobileSession.expiresAt <= now (JWT expiry) before restore
- `src/lib/auth/AuthContext.tsx:658-660` TTL reset: new SESSION_STARTED_KEY written after biometric unlock, granting fresh 4-hour window
- `src/lib/auth/AuthContext.tsx:1359` signOut calls clearBiometricEntry() — biometric entry does NOT survive explicit signOut
- `src/lib/auth/AuthContext.tsx:1380-1415` expireSession stashes current mobileSession to biometric entry on TTL expiry, then sets status=locked for biometric re-auth

### Root Cause
Stateless JWT design means server-side revocation cannot be instantly enforced on biometric unlock. The app trusts the stored JWT until a Supabase request fails.

### Recommended Remediation
On biometric unlock, make a lightweight Supabase API call (e.g., getUser()) to validate the JWT is still active before resetting TTL. Implement short JWT lifetime (15-30 min) with refresh token rotation for better revocation granularity.

---

## FIND-2026-10-11-008: Session TTL Bypass — Only Checked on Foreground Transition

**Status**: confirmed  
**Severity**: high  
**Fingerprint**: sipapk-session-ttl-foreground-only-check  
**Boundary**: App Runtime → Session State (absolute 4-hour TTL boundary)  
**Lower-Trust Principal**: Attacker with physical access to unlocked device (or malware with foreground execution)  
**Affected Resource**: User session (cloud Supabase RLS JWT or local vault DEK)

### Attack Scenario
Attacker with physical access to unlocked device keeps the app in foreground continuously. The absolute 4-hour TTL is only checked on AppState background→active transition. The session never expires, effectively bypassing the banking-style absolute expiry guarantee.

### Evidence
- `src/lib/auth/AuthContext.tsx:257-261` (SESSION_TTL_MS = 4*60*60*1000 constant)
- `src/lib/auth/AuthContext.tsx:386-418` (AppState listener — TTL check ONLY at lines 391-400 when nextState==='active' AND prev!=='active')
- `src/lib/auth/AuthContext.tsx:1380-1418` (expireSession — biometric stash vs full logout)
- `src/lib/auth/AuthContext.tsx:698-700` (bootstrap also checks TTL on cold start)

### Root Cause
TTL enforcement is event-driven (AppState change) rather than time-driven (periodic timer). Biometric users get effective session extension via stashed re-auth.

### Recommended Remediation
Add a periodic timer (e.g., setInterval every 5 min) that checks TTL regardless of AppState. On TTL expiry, call expireSession immediately even in foreground. This enforces the absolute 4-hour boundary as documented.

---

## FIND-2026-10-11-009: Recovery Key Displayed/Entered in Plaintext

**Status**: confirmed  
**Severity**: high  
**Fingerprint**: local-password-reset:recovery-key:plaintext-display-and-input-without-screen-capture-protection  
**Boundary**: Device User → Recovery Key Input → Vault DEK  
**Lower-Trust Principal**: Device User (shoulder-surfer, screenshot/recording malware, clipboard-accessing apps)  
**Affected Resource**: Device-local account vault DEK (full decryption of all local portfolio data)

### Attack Scenario
The 128-bit recovery key is displayed in plaintext at signup (large font, bold) and entered in plaintext during password reset (no secureTextEntry). No screen capture prevention is active despite expo-screen-capture being installed. Clipboard copy exposes key to system clipboard. Attacker with visual access or clipboard access captures the recovery key and fully decrypts the local vault.

### Evidence
- `src/lib/auth/AuthContext.tsx:936-954` — signUp creates vault and returns recoveryKey in AuthResult
- `src/lib/auth/AuthContext.tsx:1257-1312` — resetLocalPassword accepts recoveryKey in plaintext, calls unwrapWithRecoveryKey
- `src/components/auth/RecoveryKeyOnce.tsx:29` — Clipboard.setStringAsync(recoveryKey) copies key to system clipboard
- `src/components/auth/RecoveryKeyOnce.tsx:79` — Recovery key rendered in plaintext: {recoveryKey} with fontSize: lg, fontWeight: 800
- `app/(auth)/signup.tsx:117-122,160-177` — On device-mode signup, recoveryKey stored in state and RecoveryKeyOnce rendered
- `app/(auth)/login.tsx:227-234` — Forgot password recovery key Input lacks secureTextEntry, autoCapitalize=characters
- `app/(auth)/login.tsx:201-268` — Forgot password flow for local mode displays recovery key input in plaintext
- `package.json` — expo-screen-capture:~57.0.3 installed but NOT imported/used anywhere in src/
- `src/lib/auth/local-vault.ts:62-64,67-69,140-151` — Recovery key normalized, SHA-256 hashed for verification, used directly as AES-256-GCM key wrapper

### Root Cause
Recovery key displayed and entered in plaintext without secureTextEntry or screen capture protection. expo-screen-capture is installed but preventScreenCaptureAsync() is never called.

### Recommended Remediation
Add secureTextEntry to recovery key input fields. Call ScreenCapture.preventScreenCaptureAsync() on screens displaying/entering recovery key. Remove clipboard copy or make it optional with clear warning. Mask recovery key display (show only first/last 4 chars).

---

## FIND-2026-10-11-010: CSV Import — Naive Parser, No Size Limit

**Status**: confirmed  
**Severity**: high  
**Fingerprint**: sha256:csv-import-naive-parser-no-size-limit  
**Boundary**: User Input (CSV file) → Parsed Data → Validated Entries → Database  
**Lower-Trust Principal**: Untrusted user-supplied CSV file via expo-document-picker  
**Affected Resource**: SahakariSIP entries table (Supabase/AsyncStorage), fund NAV history, dashboard computations

### Attack Scenario
Attacker crafts malicious CSV with quoted commas, embedded newlines, or scientific notation that bypasses the naive split(',') parser, causing field confusion, data corruption, or DoS via unbounded file read into memory.

### Evidence
- `src/components/entries/CsvImportModal.tsx:70-148` — parseCsv() uses split(',') without RFC 4180 support (no quoted field handling, no escaped quotes, no embedded newlines)
- `src/components/entries/CsvImportModal.tsx:162` — FileSystem.readAsStringAsync(asset.uri) reads entire file with no size limit
- `src/components/entries/CsvImportModal.tsx:68` — MAX_IMPORT_ROWS=2000 only limits rows after parsing, not file size
- `src/lib/schemas/entry.ts:54-57` — date validation uses new Date(val) which accepts ambiguous formats
- `src/lib/schemas/entry.ts:58-60` — z.coerce.number() accepts scientific notation (e.g., '1e1000' → Infinity, caught by .finite(); but '1e10' → 10000000000 passes)
- `src/lib/data/cloud.ts:630-722` — importEntriesFromCsv validates via csvRowSchema.safeParse but trusts parsed output
- `src/lib/data/local.ts:552-641` — importEntriesFromCsv same validation path as cloud

### Root Cause
Custom CSV parser uses naive split(',') without RFC 4180 compliance. No file size limit before parsing. Zod schema allows scientific notation in numeric fields.

### Recommended Remediation
Replace custom parser with RFC 4180 compliant library (e.g., PapaParse). Add file size limit (e.g., 1MB) before reading. Restrict numeric fields to fixed-point decimal regex. Add server-side row count and payload size limits.

---

## FIND-2026-10-11-011: Push Token Registration to Hardcoded Admin Backend Without Auth

**Status**: confirmed  
**Severity**: high  
**Fingerprint**: push-token-admin-backend-hardcoded-no-auth-2026  
**Boundary**: Mobile App → Admin Backend (push token registration)  
**Lower-Trust Principal**: Admin backend (https://master-admin-delta.vercel.app) - external Vercel deployment not under app control  
**Affected Resource**: User's Expo push token + userId (PII + notification capability)

### Attack Scenario
Attacker compromises the Vercel deployment or hijacks the domain, harvests all users' push tokens, and sends arbitrary notifications. Push token is a bearer credential - anyone with it can send pushes to that device.

### Evidence
- `src/lib/notifications/push-registration.ts:46` - Hardcoded ADMIN_PUSH_TOKEN_URL = "https://master-admin-delta.vercel.app/api/mobile/push-token"
- `src/lib/notifications/push-registration.ts:86-94` - POST request sends {token, userId, platform} with only Content-Type header, no Authorization
- `src/lib/notifications/push-registration.ts:115-119` - DELETE request sends {token, userId} with no authentication
- `src/lib/notifications/push-registration.ts:95` - Only checks res.ok, no response body validation
- `.env:6` - API_URL=https://master-admin-delta.vercel.app exists but is NOT used in push-registration.ts

### Root Cause
Hardcoded admin backend URL with no authentication, no authorization, no response validation. Push tokens sent as bearer credentials over unauthenticated channel.

### Recommended Remediation
Move admin backend URL to environment variable. Add mutual TLS or shared secret authentication for push token registration. Validate admin backend response. Consider using Expo's built-in push service directly instead of custom admin backend.

### Validation Required
- [ ] Whether the admin backend at master-admin-delta.vercel.app implements any authentication/authorization for the push-token endpoint
- [ ] Whether the admin backend validates the userId matches the authenticated session
- [ ] Whether push tokens are stored encrypted at rest in the admin backend
- [ ] Whether the Vercel deployment has proper access controls and audit logging

---

## FIND-2026-10-11-012: Local Vault — encryptJson Returns Plaintext When Locked

**Status**: confirmed  
**Severity**: critical  
**Fingerprint**: local-vault-encryptjson-plaintext-on-locked-vault  
**Boundary**: App Runtime → Encrypted AsyncStorage  
**Lower-Trust Principal**: Locked/Unauthenticated App Runtime (vault locked, no active DEK)  
**Affected Resource**: All local encrypted data store payloads (funds, entries, nav_history, prefs, notifications, profile) written via writeJson/encryptJson

### Attack Scenario
When the vault is locked (activeDek === null), encryptJson() returns the plaintext JSON string instead of encrypting it. Any write operation (createFundConfig, createEntry, updateFundConfig, saveNotificationPreferences, updateProfileImage, etc.) persists unencrypted sensitive financial data to AsyncStorage. Subsequent unlock does not re-encrypt existing plaintext records.

### Evidence
- `src/lib/auth/local-vault.ts:201-208` — encryptJson() returns raw json when !activeDek
- `src/lib/data/local.ts:89-92` — writeJson() calls encryptJson() for all data writes
- `src/lib/data/local.ts:107-129` — All CRUD operations (funds, entries, nav, prefs, notifications, profile) route through writeJson()

### Root Cause
encryptJson() has a fallback to return plaintext when no active DEK, intended for legacy migration but creates a security hole when vault is locked during normal operation.

### Recommended Remediation
Change encryptJson() to throw an error when vault is locked instead of returning plaintext. Add vault state check before any write operation. Ensure vault is unlocked before LocalStore methods execute (they're only called after authentication).

### Validation Required
- [ ] Confirm vault can be locked during normal app operation (e.g., after logout, background timeout, or explicit lockVault())
- [ ] Verify no auto-unlock logic runs before writes in LocalStore methods
- [ ] Test: lock vault → call createFundConfig → inspect AsyncStorage for plaintext
- [ ] Check if NAV_AUTO_KEY/NAV_LAST_SYNC_KEY plaintext storage is acceptable (low-sensitivity metadata)

---

## FIND-2026-10-11-013: Local→Cloud Merge — Cross-User Data Contamination

**Status**: confirmed  
**Severity**: high  
**Fingerprint**: sha256:local-merge-cross-user-contamination-v1  
**Boundary**: Local Device Data → Cloud Supabase (one-time merge)  
**Lower-Trust Principal**: Local device profile (unverified identity mapping)  
**Affected Resource**: Cloud user account data (fund_config, entries, nav_history, notification_preferences)

### Attack Scenario
User signs into their cloud account on a shared device. The merge process scans ALL local profiles on the device without validating identity match between the local profile and the authenticated cloud session. Another user's SIP data gets merged into the current user's cloud account.

### Evidence
- `src/lib/data/merge.ts:99-108` listLocalDataUids() scans ALL local profiles via regex on AsyncStorage keys, no filtering by authenticated user
- `src/lib/data/merge.ts:214-243` inspectMergeCandidate() iterates all uids from listLocalDataUids() and aggregates counts without identity verification
- `src/lib/data/merge.ts:325-329` mergeLocalIntoCloud() loops through all uids from listLocalDataUids() and merges each profile's funds/entries into the cloud account
- `src/lib/data/merge.ts:126-133` cloudUserIds() gets effective user ID from authenticated session only
- `src/lib/data/cloud.ts:62-74` CloudStore.getUserId()/getEffectiveUserId() returns authenticated session identity
- `src/components/auth/MergePromptDialog.tsx:65` description shows aggregate counts but doesn't reveal WHICH local profiles will be merged
- `src/lib/auth/AuthContext.tsx:475-482` offerMerge() calls inspectMergeCandidate() without identity validation

### Root Cause
Merge logic iterates all local profiles without verifying email/identity match with the authenticated cloud session. No per-profile confirmation.

### Recommended Remediation
Before merge, verify local profile email matches cloud session email. Show per-profile confirmation dialog listing which local accounts will be merged. Skip profiles with mismatched identity.

### Validation Required
- [ ] Verify if local profiles store email/identity that could be matched against cloud session email
- [ ] Test merge behavior on device with multiple local profiles
- [ ] Confirm backupCloudToLocal only exposes authenticated user's cloud data
- [ ] Check if MERGE_DONE_PREFIX markers prevent re-merge but don't prevent initial cross-user merge

---

## FIND-2026-10-11-014: .env File in Workspace with Production Credentials

**Status**: confirmed  
**Severity**: low  
**Fingerprint**: env-file-credential-exposure-sahakari-sip  
**Boundary**: Developer Workspace → Git History (Accidental Commit)  
**Lower-Trust Principal**: Developer Workstation (untrusted local environment)  
**Affected Resource**: Supabase project (entbhjpnhdjfhcctcvmt), Vercel deployments (sahakari-sip.vercel.app, master-admin-delta.vercel.app), VAPID push credentials

### Attack Scenario
Developer accidentally commits .env file to git. While all values use EXPO_PUBLIC_* prefix (intended for client-side exposure) and no server-side secrets are present, the file's presence creates risk.

### Evidence
- `.env:1-8` — Contains EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_VAPID_PUBLIC_KEY, API_URL
- `.gitignore:9` — Blocks .env, .env.eas, .env.local, .env.*.local
- `scripts/pre-commit-env-guard.sh:14-16` — Pre-commit hook blocks staging of .env and .env.* files

### Root Cause
.env file exists in workspace with production values. Pre-commit hook mitigates but may not be installed on all developer machines.

### Recommended Remediation
Remove .env from workspace (use .env.example only). Ensure all developers use local .env.local files not tracked by git. Verify pre-commit hook is installed via CI check.

### Validation Required
- [ ] Verify .env has never been committed to git history (check git log --all --full-history -- .env)
- [ ] Confirm pre-commit hook is installed in all developer clones
- [ ] Audit whether any developer has added server-side secrets to local .env
- [ ] Check if EXPO_PUBLIC_SUPABASE_ANON_KEY is actually a publishable anon key

---

## FIND-2026-10-11-015: NPM Transitive Dependencies — 27 Vulnerabilities

**Status**: confirmed  
**Severity**: critical  
**Fingerprint**: cef17cd3b3dd1b55f3c6bf63225a521ea2074c63fc0dc211ab33fe66d3e24025  
**Boundary**: Dependency Supply Chain → Application Runtime  
**Lower-Trust Principal**: Transitive NPM dependencies (shell-quote@1.10.0, node-forge@1.4.0, braces@3.0.3, micromatch@4.0.8, react-native-reanimated@4.5.1, react-native-worklets@0.10.1, metro@0.84.6, @expo/* packages)  
**Affected Resource**: SahakariSIP mobile application runtime (Expo SDK 57 / React Native 0.86.3)

### Attack Scenario
Supply chain compromise via transitive dependencies in runtime path. Critical command injection in shell-quote enables RCE during build/dev. RSA signature verification bypass in node-forge affects code-signing integrity. DoS vectors in metro tooling.

### Evidence
- `package.json:19` "expo": "~57.0.26"
- `package.json:41` "react-native": "0.86.3"
- `package.json:43` "react-native-quick-crypto": "^1.1.7"
- `npm audit`: shell-quote@1.10.0 (critical, CVE GHSA-pqg4-j6r4-53mv, CWE-78) via react-native@0.86.3 → react-devtools-core@6.1.5
- `npm audit`: node-forge@1.4.0 (high, CVE GHSA-86w9-cpqp-85rv, CWE-347) via expo@57.0.26 → @expo/cli@57.0.27 → @expo/code-signing-certificates@0.0.6
- `npm audit`: braces@3.0.3 (high, CVE GHSA-vfj7-8cjw-p6xm, CWE-674) via @expo/metro-file-map@57.0.3 → micromatch@4.0.8
- `npm audit`: micromatch@4.0.8 (high) via metro-file-map@0.84.5 (expo) and metro-file-map@0.84.6 (react-native)
- `npm audit`: react-native-reanimated@4.5.1 (high) via expo-router@57.0.24 and expo-modules-core@57.0.20
- `npm audit`: react-native-worklets@0.10.1 (high) via @expo/ui@57.0.21 and expo-modules-core@57.0.20
- `npm ls`: shell-quote@1.10.0 in prod tree at react-native → react-devtools-core
- `npm ls`: node-forge@1.4.0 in prod tree at expo → @expo/cli → @expo/code-signing-certificates
- `npm ls`: braces@3.0.3 / micromatch@4.0.8 in prod tree at @expo/metro-file-map and react-native metro

### Root Cause
Expo SDK 57 pins vulnerable transitive dependencies in production dependency chain. These are not devDependencies - they ship in the APK.

### Recommended Remediation
Upgrade to Expo SDK 58+ or React Native 0.87+ which may resolve transitive vulnerabilities. Add npm audit CI gate. Monitor for patched versions of affected packages. Consider pinning overrides in package.json for critical vulns.

### Validation Required
- [ ] Confirm shell-quote@1.10.0 command injection exploitable in CI/build context
- [ ] Verify node-forge@1.4.0 RSA bypass impacts expo code-signing in production builds
- [ ] Assess react-native-reanimated@4.5.1 / worklets@0.10.1 runtime exploitability
- [ ] Check if Expo SDK 58+ or React Native 0.87+ resolves these transitive vulnerabilities
- [ ] Validate braces/micromatch DoS requires attacker-controlled glob patterns in metro config

---

## FIND-2026-10-11-016: Web Backend Handoff Token Single-Use Not Verifiable

**Status**: needs_validation  
**Severity**: (pending server validation)  
**Fingerprint**: sha256:web-backend-handoff-token-single-use-not-verifiable-mobile-repo  
**Boundary**: Mobile App → Web Backend (/api/mobile/exchange)  
**Lower-Trust Principal**: Mobile Client (untrusted, user-controlled device)  
**Affected Resource**: Web Backend OAuth handoff token consumption endpoint

### Attack Scenario
If the web backend does not atomically consume and invalidate the handoff token, an attacker who intercepts the sahakarisip://auth/callback?token=... redirect could replay it to obtain a valid Supabase RLS JWT.

### Evidence
- `src/lib/auth/mobileApi.ts:97-100` - googleExchange() POSTs nonce to /api/mobile/exchange
- `src/lib/auth/AuthContext.tsx:270-293` - Client-side handoff token journal (USED_HANDOFF_TOKENS_KEY) with TTL and cap
- `src/lib/auth/AuthContext.tsx:291` - Comment: 'Best-effort; server enforces single-use.'
- `src/lib/auth/AuthContext.tsx:266-267` - Comment: 'completeGoogleHandoff dedupes the exchange (the token is single-use server-side too)'
- `src/lib/auth/AuthContext.tsx:998-1002` - completeGoogleHandoff() checks isHandoffTokenUsed() before exchange
- `src/lib/auth/AuthContext.tsx:1004-1005` - Calls googleExchange(token) then markHandoffTokenUsed(token)

### Root Cause
Server-side single-use enforcement is a critical OAuth/OIDC security control that cannot be verified from the mobile repository.

### Recommended Remediation
Add server-side audit of /api/mobile/exchange in sahakari-sip web backend repo. Verify atomic token consumption and invalidation.

### Validation Required
- [ ] Verify web backend /api/mobile/exchange implements atomic single-use consumption
- [ ] Confirm token invalidation on first use
- [ ] Check if web backend logs replay attempts

---

## FIND-2026-10-11-017: Google ID Token Server-Side Validation Not Verifiable

**Status**: needs_validation  
**Severity**: (pending server validation)  
**Fingerprint**: google-idtoken-server-validation::mobile-trusts-server-validation::authcontext-webclientid-hardcoded  
**Boundary**: Mobile App → Web Backend (/api/mobile/google-native)  
**Lower-Trust Principal**: Mobile App (unverified client)  
**Affected Resource**: Web Backend Google ID token validation endpoint

### Attack Scenario
Mobile client sends raw Google ID token to /api/mobile/google-native without client-side validation. Server-side validation (audience, issuer, expiry, signature) cannot be verified from mobile repository.

### Evidence
- `src/lib/auth/AuthContext.tsx:1097` - hardcoded webClientId in GoogleSignin.configure
- `src/lib/auth/AuthContext.tsx:1102` - idToken extracted from GoogleSignin.signIn() result
- `src/lib/auth/AuthContext.tsx:1113` - googleNativeSignIn(idToken) called with raw token
- `src/lib/auth/mobileApi.ts:109-114` - POST /google-native with { idToken } body

### Root Cause
Trust boundary violation: client assumes server validates ID token but server code is in separate repo.

### Recommended Remediation
Add server-side audit of /api/mobile/google-native in sahakari-sip web backend repo. Verify audience=webClientId, issuer=accounts.google.com, expiry, signature validation.

### Validation Required
- [ ] Verify web backend /api/mobile/google-native validates ID token aud/iss/exp/signature
- [ ] Confirm webClientId matches Google Cloud Console Android client config

---

## FIND-2026-10-11-018: Screen Capture Prevention — Properly Implemented

**Status**: confirmed  
**Severity**: informational  
**Fingerprint**: sha256:screen-capture-global-prevention-implemented-v1  
**Boundary**: App UI → Screenshot/Screen Recording (expo-screen-capture FLAG_SECURE boundary)  
**Lower-Trust Principal**: Malicious app / screen recorder / screenshot tool / shoulder surfer  
**Affected Resource**: All app screens including auth (login, signup, forgot-password, lock), recovery key display (RecoveryKeyOnce), and authenticated app screens

### Result
No vulnerability found. Screen capture prevention IS properly implemented globally at the app root level via expo-screen-capture.preventScreenCaptureAsync() in app/_layout.tsx. The protection applies to ALL screens including sensitive ones.

### Evidence
- `app/_layout.tsx:23` - import * as ScreenCapture from "expo-screen-capture"
- `app/_layout.tsx:46-51` - useEffect calls ScreenCapture.preventScreenCaptureAsync() on mount with cleanup
- `package.json` - "expo-screen-capture": "~57.0.3" dependency present
- `src/components/auth/RecoveryKeyOnce.tsx` - Recovery key display protected by global FLAG_SECURE
- `app/(auth)/signup.tsx:160-177` - RecoveryKeyOnce rendered when recoveryKey state is set
- `app/(auth)/login.tsx:187-199` - RecoveryKeyOnce rendered when recoveryKey state is set (legacy upgrade)
- `app/(auth)/lock.tsx` - Biometric lock screen protected
- `app/(auth)/forgot-password.tsx` - Password reset with recovery key input protected

---

## FIND-2026-10-11-019: Email Enumeration via Differentiated Auth Errors

**Status**: confirmed  
**Severity**: medium  
**Fingerprint**: sha256:email-enumeration-via-auth-error-messages-2026  
**Boundary**: Mobile App → Web Backend credential verification  
**Lower-Trust Principal**: Unauthenticated mobile app user (attacker-controlled input, untrusted network)  
**Affected Resource**: User account existence and authentication state

### Attack Scenario
Attacker uses signin/signup error messages to enumerate valid email addresses. Signin differentiates 'email not confirmed' vs 'invalid credentials'. Signup passes through server error 'email already exists'. No client-side rate limiting on auth endpoints.

### Evidence
- `src/lib/auth/AuthContext.tsx:835-848` — signIn differentiates 'email not confirmed' vs 'invalid credentials' error messages
- `src/lib/auth/AuthContext.tsx:918-922` — signup passes through server error messages directly (e.g., 'email already exists')
- `src/lib/auth/mobileApi.ts:118-123` — passwordLogin sends email+password in plaintext JSON body over HTTPS
- `src/lib/auth/mobileApi.ts:125-129` — signup sends email+password+confirmPassword to /api/mobile/signup over HTTPS
- `src/lib/auth/AuthContext.tsx:903-908` — Only client-side validation is password length >= 8 and password match; no complexity requirements
- `src/lib/auth/mobileApi.ts:33-63` — request() function has no retry/backoff, no rate-limit handling, no certificate pinning
- `src/lib/auth/mobileApi.ts:13-19` — WEB_URL defaults to https://sahakari-sip.vercel.app; isWebConfigured only checks https:// prefix

### Root Cause
Differentiated error messages leak account existence. No client-side rate limiting. Weak password policy (8 chars only).

### Recommended Remediation
Use generic "invalid credentials" for all auth failures. Implement client-side rate limiting with exponential backoff. Add password complexity requirements. Consider certificate pinning for auth endpoints.

### Validation Required
- [ ] Confirm server-side rate limiting exists on /api/mobile/password-login and /api/mobile/signup
- [ ] Verify server returns generic error messages for email enumeration
- [ ] Confirm bcrypt verification is server-side only
- [ ] Verify OTP email confirmation is enforced before first signin

---

## FIND-2026-10-11-020: Password Reset Token in Long-Lived React Ref

**Status**: needs_validation  
**Severity**: (pending server validation)  
**Fingerprint**: sha256:password-reset-otp-resettoken-client-exposure-2026  
**Boundary**: Mobile App → Web Backend (OTP verification & password reset)  
**Lower-Trust Principal**: Mobile App (untrusted client environment)  
**Affected Resource**: User account takeover via password reset flow

### Attack Scenario
The resetToken returned by verifyResetOtp is stored in a long-lived React ref (resetTokenRef.current) with no client-side invalidation on background, failed attempts, time expiry, or sign-out. An attacker with access to the running app memory can extract the valid resetToken and complete password reset without the OTP.

### Evidence
- `src/lib/auth/AuthContext.tsx:350` - resetTokenRef = useRef({ token: null, email: null }) holds resetToken in memory for component lifetime
- `src/lib/auth/AuthContext.tsx:1519-1522` - verifyPasswordResetOtp stores result.resetToken and result.email in resetTokenRef.current
- `src/lib/auth/AuthContext.tsx:1551-1559` - completePasswordReset reads token from resetTokenRef.current, uses storedEmail for binding, clears ref only on success
- `src/lib/auth/mobileApi.ts:149-156` - verifyResetOtp returns { resetToken, email } from server; throws if no resetToken
- `src/lib/auth/mobileApi.ts:158-168` - completeReset requires email, resetToken, newPassword, confirmPassword

### Root Cause
Reset token stored in long-lived React ref with no client-side TTL, invalidation on background/signout, or failed attempt tracking.

### Recommended Remediation
Add client-side TTL for resetToken (e.g., 10 min). Invalidate on AppState background, signOut, or failed completeReset attempt. Store resetToken in SecureStore with expiry instead of React ref. Server-side must enforce single-use and short TTL.

### Validation Required
- [ ] Server-side resetToken TTL and single-use enforcement
- [ ] Server-side OTP rate limiting (6-digit)
- [ ] Server-side brute-force protection on verifyResetOtp endpoint
- [ ] Whether resetToken is cryptographically bound to email/server-session

---