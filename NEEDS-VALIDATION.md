# Needs Validation — SahakariSIP Mobile Security Audit

This file records findings that require deployment, provider, or runtime facts not observable in the repository source. Each entry states the exact missing fact and a safe owner-observed or local check to resolve it.

---

## NEEDS-VAL-001: Google OAuth Handoff — Web Backend Single-Use Token Enforcement

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

## NEEDS-VAL-002: Supabase RLS Policies Correctly Enforce Per-User Isolation

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

## NEEDS-VAL-003: Android `fullBackupContent` XML Actually Excludes Sensitive Keys

**Finding:** `android:allowBackup="true"` with referenced backup rules XML (FIND-002)

**Missing Fact:** Does `android/app/src/main/res/xml/secure_store_backup_rules.xml` exclude `AsyncStorage` keys (`sahakarisip.v1.*`) and `SecureStore` data?

**Why Source Cannot Confirm:** The XML file is referenced in the manifest but its content was not accessible in the workspace view during audit (only build intermediate found, which only excludes SecureStore).

**Safe Validation Check:**
1. Locate `android/app/src/main/res/xml/secure_store_backup_rules.xml` (or create it if missing).
2. Verify it contains `<exclude domain="sharedpref" path="sahakarisip.v1.*"/>` and excludes SecureStore paths.
3. If file is missing, permissive, or doesn't exclude the app's keys, set `android:allowBackup="false"` in `AndroidManifest.xml:17`.
4. **Functional test:** Build debug APK, install on device, run `adb backup -f test.ab com.samimrrza.sahakarisip`. Extract `test.ab` (using `abe.jar` or Android Backup Extractor) and verify no `sahakarisip.v1.*` keys appear in the backup.

**Related Code:**
- `android/app/src/main/AndroidManifest.xml:17` (`android:allowBackup="true" android:fullBackupContent="@xml/secure_store_backup_rules"`)

---

## NEEDS-VAL-004: Google ID Token Validation on Web Backend

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

## Resolution Tracking

| Finding | Status | Owner Action | Resolved |
|---------|--------|--------------|----------|
| NEEDS-VAL-001 | Open | Validate web backend token consumption + expiry | ☐ |
| NEEDS-VAL-002 | Open | Verify Supabase RLS policies + functional test | ☐ |
| NEEDS-VAL-003 | Open | Inspect/create backup rules XML + adb backup test | ☐ |
| NEEDS-VAL-004 | Open | Validate web backend Google ID token verification | ☐ |

**Instructions:** Update this file as validations complete. Move resolved items to the main report's Confirmed/Rejected sections with updated severity.