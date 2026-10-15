# Architecture Summary — SahakariSIP Mobile

## Product, Principals, and Protected Resources

**Product:** SahakariSIP — Expo/React Native mobile app for tracking Nepali mutual fund SIP investments. Two operating modes:
- **Cloud** (Supabase-backed, authenticated via NextAuth web backend)
- **Device-Local** (on-device encrypted storage with PBKDF2-wrapped DEK)

**Principals:**
- **Authenticated cloud user** — Google OAuth (handoff + native) or email/password via web backend; receives long-lived Supabase RLS JWT
- **Authenticated local user** — PBKDF2-verified password unlocks envelope-encrypted vault
- **Attacker with physical device access** — USB/ADB, unlocked device
- **Attacker with captured OAuth token** — clipboard, notification preview, browser history
- **Attacker with Google ID token** — phishing, malware, stolen device
- **Authenticated cloud user attempting cross-tenant access** — same Supabase project, different user_id

**Protected Resources:**
- Financial portfolio data (fund configs, entries, NAV history, dividends)
- Authentication credentials (RLS JWT, local profile salted hashes, DEKs, recovery keys)
- Session tokens (mobile_session, handoff tokens, biometric entries)
- Profile photos (Supabase Storage)

## Comparable Software Baseline

Similar financial tracking apps (e.g., Monefy, Wallet, YNAB) delegate auth to OAuth providers and use platform keystores for local encryption. The RLS-delegated authorization model matches Supabase best practices. The envelope encryption design (DEK + PBKDF2 password wrap + recovery key wrap) aligns with mobile security recommendations. The Android `allowBackup=false` mitigates the known ADB backup extraction risk. The biometric unlock with `disableDeviceFallback=true` exceeds many peers that allow PIN fallback.

## Tech Stack and Deployment

- **Framework:** Expo SDK 57, React Native 0.86, expo-router
- **Auth:** NextAuth v5 web backend (Google + bcrypt credentials + OTP) → mobile delegates via `/api/mobile/*`
- **Database:** Supabase (Postgres) with RLS (`auth.uid() = user_id`)
- **Local Crypto:** AES-256-GCM (expo-crypto) + PBKDF2-HMAC-SHA256 100k (react-native-quick-crypto native / WebCrypto web)
- **Biometric:** expo-local-authentication + SecureStore (Keystore/Secure Enclave backed)
- **Build:** EAS / GitHub Actions (gradle assembleRelease); keystore + google-services.json from secrets
- **Offline Build Commands:** `npm ci`, `cd android && ./gradlew assembleRelease` (needs keystore, google-services.json)

## Entry Surfaces and Lifecycle Paths

| Surface | Path | Sink |
|---------|------|------|
| Deep link `sahakarisip://auth/callback?token=` | `app/(auth)/auth/callback.tsx` → `AuthContext.resolveGoogleHandoff` → `mobileApi.googleExchange` → web `/api/mobile/exchange` | Supabase RLS JWT in `mobile_session` |
| Web browser OAuth | `AuthContext.signInWithGoogle` (browser path) → `mobileApi.googleStart` → `WebBrowser.openAuthSessionAsync` → deep link callback | Same as above |
| Native Google Sign-In | `AuthContext.signInWithGoogle` (native path) → `@react-native-google-signin` → `mobileApi.googleNativeSignIn` → web `/api/mobile/google-native` | Supabase RLS JWT |
| Email/password | `AuthContext.signIn/signUp` → `mobileApi.passwordLogin/signup` → web `/api/mobile/password-login` `/signup` | Supabase RLS JWT or local vault unlock |
| Password reset OTP | Web backend → email → deep link `sahakarisip://reset?token=` → `verifyPasswordResetOtp` → `completePasswordReset` | New password hash / vault rewrap |
| Profile photo | `expo-document-picker` → `CloudStore.updateProfileImage` → Supabase Storage `avatars` bucket | Public URL in `users.image` |
| CSV import | `expo-document-picker` → `CloudStore/LocalStore.importEntriesFromCsv` → validated insert | `entries` table / local encrypted JSON |
| Push token | `autoRegisterPushToken` → `fetch(ADMIN_PUSH_TOKEN_URL)` | Admin backend token registry |
| ADB backup | `adb backup` → `abe.jar` extraction | `AsyncStorage` keys (`sahakarisip.v1.*`) |

## Trust Boundaries and Strongest Source-Visible Controls

| Boundary | Control | Source Location |
|----------|---------|-----------------|
| OAuth handoff token replay | Server-side single-use enforcement (claimed); client-side AsyncStorage journal (supplementary) | `AuthContext.tsx:997-1028`, `mobileApi.ts:97-100` |
| Google ID token validation | Web backend must verify audience/issuer/expiry (not in this repo) | `AuthContext.tsx:1094-1140`, `mobileApi.ts:109-114` |
| Cloud data isolation | Supabase RLS policies (deployed config, not in source) | `cloud.ts` all methods filter by `user_id` |
| Local vault confidentiality | AES-256-GCM DEK + PBKDF2 100k password wrap + SHA-256 recovery wrap | `local-vault.ts:101-120` |
| Biometric session protection | `disableDeviceFallback=true` + SecureStore (Keystore-backed) | `biometric.ts:101-112` |
| Session TTL enforcement | AppState listener + 4hr absolute expiry | `AuthContext.tsx:386-418` |
| Android backup extraction | `allowBackup=false` in Manifest; backup rules only exclude SecureStore | `AndroidManifest.xml:20`, `secure_store_backup_rules.xml` |
| Input validation | Zod schemas at every cloud store boundary | `schemas/entry.ts`, `schemas/fund-config.ts` |
| File upload MIME trust | Client allowlist only; Supabase Storage policy unknown | `cloud.ts:989-1048` |

## Repository-Relative Starting Paths

- `src/lib/auth/AuthContext.tsx` — Primary auth logic, Google flows, session management
- `src/lib/auth/mobileApi.ts` — Web backend API client
- `src/lib/auth/mobileSession.ts` — Session storage (AsyncStorage)
- `src/lib/auth/biometric.ts` — Biometric unlock (SecureStore)
- `src/lib/auth/local-vault.ts` — Envelope encryption (AES-256-GCM + PBKDF2)
- `src/lib/auth/nativeCrypto.ts` / `nativeCrypto.web.ts` — Crypto primitives shim
- `src/lib/data/cloud.ts` — Supabase data access (RLS-enforced)
- `src/lib/data/local.ts` — On-device encrypted storage
- `src/lib/data/merge.ts` — Local→cloud merge logic
- `src/lib/data/store.ts` — Data store interfaces
- `src/lib/supabase.ts` — Supabase client with Bearer token hook
- `src/lib/schemas/entry.ts`, `fund-config.ts` — Zod validation schemas
- `android/app/src/main/AndroidManifest.xml` — Permissions, backup config
- `android/app/src/main/res/xml/secure_store_backup_rules.xml` — Auto Backup rules
- `android/app/src/main/res/xml/secure_store_data_extraction_rules.xml` — Data extraction rules
- `app/(auth)/auth/callback.tsx` — Deep link callback handler

## Prior Coverage Gaps and Revalidation Targets

From prior run (2026-10-05, commit 40d331c):
- **FIND-001** (High, confirmed): Deep link token replay — server enforcement not verified
- **FIND-002** (Medium, confirmed): Android allowBackup=true — now set to false, but backup rules incomplete
- **FIND-003** (Medium, confirmed): Google native ID token validation relies on web backend
- **FIND-004** (Low, confirmed): .env file in workspace with production credentials
- **FIND-005** (Low, confirmed): NPM transitive vulnerabilities (33 total, 22 high)
- **FIND-006** (Low, confirmed): Profile photo MIME type trust
- **FIND-007** (Low, confirmed): Recovery key exposure in UI during reset
- **FIND-008** (Low, confirmed): Session TTL bypass on foreground (no periodic check)
- **FIND-009** (Medium, needs_validation): Supabase RLS policies not verified
- **FIND-010** (Medium, needs_validation): Web backend token consumption logic
- **FIND-011** (Medium, needs_validation): Android backup rules XML content
- **FIND-012** (Medium, needs_validation): Google ID token validation on web backend

All prior confirmed findings carry forward with same fingerprints where source unchanged. Needs_validation items become current planned revalidation units.

## Companion Selection Summary

| Boundary | Attack Class | Companion |
|----------|--------------|-----------|
| OAuth handoff / ID token | WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding | WEB-PROTOCOL-AND-AUTH.md |
| Deep link callback | DESKTOP-MOBILE-AND-LOCAL-IPC.md#Deep-link, callback, and navigation attack classes | DESKTOP-MOBILE-AND-LOCAL-IPC.md |
| Android backup / local storage | DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch | DESKTOP-MOBILE-AND-LOCAL-IPC.md |
| RLS data isolation | DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement | DATA-ISOLATION-AND-LIFECYCLE.md |
| File upload | WEB-PROTOCOL-AND-AUTH.md#File upload and content-type validation | WEB-PROTOCOL-AND-AUTH.md |
| Supply chain | ATTACK-CLASSES.md#Supply chain | ATTACK-CLASSES.md |
| Session / token | DESKTOP-MOBILE-AND-LOCAL-IPC.md#Session and token boundary | DESKTOP-MOBILE-AND-LOCAL-IPC.md |
| Local vault crypto | ATTACK-CLASSES.md#Obvious things | ATTACK-CLASSES.md |