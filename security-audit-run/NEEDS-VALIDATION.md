# Needs Validation — SahakariSIP Mobile Security Audit

**Audit Date**: 2026-10-11  
**Source**: findings.json (7 findings requiring server-side validation)  

These findings require validation against server-side components that are NOT in this mobile repository. They represent trust boundaries where the mobile client assumes server enforcement but cannot verify it from source.

---

## NEEDS-VAL-001: OAuth Handoff Token Single-Use Enforcement

**Finding**: FIND-2026-10-11-001  
**Server Component**: Web Backend (`/api/mobile/exchange`) in sahakari-sip repo  
**Mobile Evidence**: Client-side AsyncStorage journal (24h TTL, 50-entry cap) marked "best-effort; server enforces single-use"

### Validation Checklist
- [ ] **Atomic consumption**: `/api/mobile/exchange` must atomically read-and-invalidate the handoff nonce in a single transaction
- [ ] **Replay rejection**: Second request with same nonce returns error (not new JWT)
- [ ] **Nonce binding**: Nonce bound to device fingerprint / IP / user-agent at issuance
- [ ] **Rate limiting**: Exchange endpoint rate-limited per IP / account
- [ ] **Audit logging**: Replay attempts logged for detection

### Test Plan
```bash
# 1. Capture valid handoff token from sahakarisip://auth/callback?token=...
# 2. POST to /api/mobile/exchange with captured nonce → should succeed
# 3. POST same nonce again → should return 400/409 error
# 4. Verify no new JWT issued on replay
```

### Blockers
- Web backend source not in this repository
- Requires coordination with sahakari-sip web backend team
- Production endpoint testing needs staging environment

---

## NEEDS-VAL-002: Google ID Token Validation (Native Sign-In)

**Finding**: FIND-2026-10-11-002 (and duplicate FIND-2026-10-11-017)  
**Server Component**: Web Backend (`/api/mobile/google-native`) in sahakari-sip repo  
**Mobile Evidence**: Raw ID token sent without client-side aud/iss/exp/sig validation

### Validation Checklist
- [ ] **Audience verification**: `aud` claim equals configured `webClientId` (416335590615-e96duqpfc9f7eg4qg0aqnj42avuiqs8l.apps.googleusercontent.com)
- [ ] **Issuer verification**: `iss` claim is `accounts.google.com` or `https://accounts.google.com`
- [ ] **Expiry check**: `exp` claim > current time (with clock skew tolerance)
- [ ] **Signature verification**: Valid Google signature via JWKS (https://www.googleapis.com/oauth2/v3/certs) or tokeninfo endpoint
- [ ] **Nonce validation**: If PKCE/OIDC nonce used, verify matches
- [ ] **Email verification**: `email_verified` claim is true

### Test Plan
```bash
# 1. Obtain valid Google ID token for test account
# 2. POST to /api/mobile/google-native with valid token → should succeed
# 3. Modify aud claim to different client ID → should reject
# 4. Use expired token → should reject
# 5. Forge token with invalid signature → should reject
# 6. Token with email_verified=false → should reject
```

### Blockers
- Web backend source not in this repository
- Requires Google Cloud Console configuration verification
- Production endpoint testing needs staging environment

---

## NEEDS-VAL-003: Supabase RLS Data Isolation Policies

**Finding**: FIND-2026-10-11-004  
**Server Component**: Supabase Postgres RLS policies (deployed SQL)  
**Mobile Evidence**: All CloudStore queries filter by user_id; RLS SQL files in repo but not runtime config

### Validation Checklist
- [ ] **RLS enabled**: All user tables (fund_config, entries, nav_history, notification_preferences, notifications_log, users, dividends) have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- [ ] **Policies exist**: Each table has policies for SELECT/INSERT/UPDATE/DELETE using `user_id = auth.uid()` or `public.app_effective_user_id()`
- [ ] **Anon role isolation**: `supabase-verify-rls.sql` Query 7 — anon role sees ZERO rows without JWT
- [ ] **Cross-user test**: Two test users; User A cannot read/write User B data with User A's JWT
- [ ] **Storage RLS**: `avatars` bucket has policies restricting access to owning user
- [ ] **nav_reference**: Correctly shared (no user_id) — market data only

### Test Plan
```sql
-- Run supabase-verify-rls.sql against production
-- Key queries:
-- 1. SELECT * FROM pg_policies WHERE schemaname = 'public';
-- 2. Test cross-user isolation with two JWTs
-- 3. Verify anon role access = 0 rows
```

### Blockers
- Supabase dashboard / SQL editor access required
- Production Supabase project credentials needed
- SQL verification scripts in repo (`supabase-verify-rls.sql`, `supabase-enable-rls.sql`, `supabase-fix-user-mapping.sql`)

---

## NEEDS-VAL-004: Supabase Storage Avatar Bucket Policies

**Finding**: FIND-2026-10-11-005  
**Server Component**: Supabase Storage `avatars` bucket policies  
**Mobile Evidence**: Client-side MIME allowlist only; file uploaded with client-supplied contentType

### Validation Checklist
- [ ] **Upload content-type enforcement**: Bucket policy rejects upload if `content-type` not in allowlist (image/jpeg, image/png, image/webp)
- [ ] **Download Content-Type header**: Served files have correct `Content-Type` matching actual content
- [ ] **CSP headers**: `Content-Security-Policy: default-src 'none'; img-src 'self' data:` or similar
- [ ] **No HTML/JS execution**: Upload HTML with image MIME → served as image (not executed)
- [ ] **Path isolation**: Users can only upload to `{userId}/avatar.*` path
- [ ] **Size limit**: Bucket enforces max file size (2MB per mobile client)

### Test Plan
```bash
# 1. Upload valid JPEG → should succeed, serve with image/jpeg
# 2. Upload HTML file with content-type=image/jpeg → should reject OR serve as text/html
# 3. Upload 3MB file → should reject
# 4. Access another user's avatar path → should 403/404
# 5. Check response headers for CSP
```

### Blockers
- Supabase Storage policies not in mobile repo
- Requires Supabase dashboard access
- Need to test actual browser rendering behavior

---

## NEEDS-VAL-005: Password Reset Token Server-Side Lifecycle

**Finding**: FIND-2026-10-11-020  
**Server Component**: Web Backend (`/api/mobile/password-reset` endpoints) in sahakari-sip repo  
**Mobile Evidence**: resetToken stored in long-lived React ref; no client-side TTL/invalidation

### Validation Checklist
- [ ] **resetToken TTL**: Server enforces short expiry (e.g., 10-15 min) on resetToken
- [ ] **Single-use enforcement**: resetToken invalidated after first successful completeReset
- [ ] **OTP rate limiting**: `/api/mobile/password-reset` (PUT - verify OTP) rate-limited per email/IP
- [ ] **Brute-force protection**: Failed verifyResetOtp attempts locked out
- [ ] **Cryptographic binding**: resetToken bound to email/session (not just random opaque token)
- [ ] **Invalidate on password change**: If user changes password via other means, resetToken invalidated

### Test Plan
```bash
# 1. Request password reset → receive OTP via email
# 2. Verify OTP → receive resetToken
# 3. Wait > TTL → use resetToken → should reject
# 4. Use resetToken twice → second should reject
# 5. Brute-force OTP (6-digit) → should lock after N attempts
# 6. Change password via signin → resetToken should invalidate
```

### Blockers
- Web backend source not in this repository
- Requires email delivery testing
- Production endpoint testing needs staging environment

---

## NEEDS-VAL-006: Web Backend Token Consumption Logic (Duplicate)

**Finding**: FIND-2026-10-11-016  
**Note**: Duplicate of NEEDS-VAL-001 (separate coverage unit, same root cause)  
**Server Component**: Web Backend (`/api/mobile/exchange`)  
**Action**: Track with NEEDS-VAL-001

---

## NEEDS-VAL-007: Google ID Token Validation (Duplicate)

**Finding**: FIND-2026-10-11-017  
**Note**: Duplicate of NEEDS-VAL-002 (separate coverage unit, same root cause)  
**Server Component**: Web Backend (`/api/mobile/google-native`)  
**Action**: Track with NEEDS-VAL-002

---

## Validation Priority Order

| Priority | Validation | Depends On | Owner |
|----------|------------|------------|-------|
| 1 | NEEDS-VAL-001 (OAuth handoff) | sahakari-sip web backend | Backend team |
| 2 | NEEDS-VAL-002/007 (Google ID token) | sahakari-sip web backend | Backend team |
| 3 | NEEDS-VAL-003 (Supabase RLS) | Supabase project access | Mobile/Backend team |
| 4 | NEEDS-VAL-004 (Storage bucket) | Supabase project access | Mobile/Backend team |
| 5 | NEEDS-VAL-005 (Password reset) | sahakari-sip web backend | Backend team |

---

## Validation Status Tracking

| Validation ID | Status | Last Checked | Blocker |
|---------------|--------|--------------|---------|
| NEEDS-VAL-001 | pending | 2026-10-11 | Web backend access |
| NEEDS-VAL-002 | pending | 2026-10-11 | Web backend access |
| NEEDS-VAL-003 | pending | 2026-10-11 | Supabase dashboard access |
| NEEDS-VAL-004 | pending | 2026-10-11 | Supabase dashboard access |
| NEEDS-VAL-005 | pending | 2026-10-11 | Web backend access |
| NEEDS-VAL-006 | duplicate | N/A | N/A |
| NEEDS-VAL-007 | duplicate | N/A | N/A |

---

## Coordination Notes

1. **Web Backend (sahakari-sip repo)**: NEEDS-VAL-001, 002, 005, 006, 007 all require sahakari-sip web backend audit. Recommend single audit pass covering all three endpoints (`/exchange`, `/google-native`, `/password-reset`).

2. **Supabase (hosted)**: NEEDS-VAL-003 and 004 require Supabase project access. Run `supabase-verify-rls.sql` and check Storage bucket policies in dashboard.

3. **Mobile repo changes**: Mobile-side mitigations (client-side validation, rate limiting, secure input) can proceed in parallel but do not substitute server validation.

4. **Re-audit trigger**: When server validations complete, re-run mobile audit to update finding status from `needs_validation` to `confirmed`/`rejected`.

---

*This checklist tracks server-side validations that cannot be completed from the mobile repository alone. Each validation requires access to the respective server component.*