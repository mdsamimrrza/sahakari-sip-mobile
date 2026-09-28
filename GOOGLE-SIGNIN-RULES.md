# GOOGLE SIGN-IN - DO NOT TOUCH WITHOUT READING THIS

This file exists because breaking Google sign-in cost two full days of
debugging (Sep 26-28, 2026). Read it before changing ANY Google/OAuth
configuration anywhere in this project or the web project.

## The three OAuth clients (Google Cloud project 416335590615)

| Client name | Client ID | Type | Role |
|---|---|---|---|
| Sahakari SIP Web | `416335590615-e96duqpfc9f7eg4qg0aqnj42avuiqs8l.apps.googleusercontent.com` | Web application | **THE ONLY client allowed as `webClientId` / `serverClientId` / `AUTH_GOOGLE_ID`** |
| SahakariSIP Android | `416335590615-7qmsb34qr1aegnng0rfsib9lca10ke3m.apps.googleusercontent.com` | Android | Registered against the RELEASE keystore SHA-1. Never used as webClientId. |
| SahakariSIP Android Debug | `416335590615-f111...` | Android | Registered against the DEBUG keystore SHA-1. Never used as webClientId. |

Registered SHA-1 fingerprints (do not remove from the Android clients):
- Release keystore: `B2:5D:0F:D8:64:00:AF:18:24:FE:4B:39:82:F4:F3:3C:16:F0:93:1F`
- Debug keystore: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`

## THE RULES

1. **NEVER put an Android-type client ID into any of these places:**
   - APK: `.env` -> `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
   - APK: the fallback strings in `src/lib/auth/AuthContext.tsx` (two
     `configure()` sites) and `.github/workflows/build-release-apk.yml`
   - Web: `.env` -> `AUTH_GOOGLE_ID` and the Vercel env var `AUTH_GOOGLE_ID`
   Play Services rejects an Android client used as the server client ID
   with: `You must use a Web client as the server client ID` - which the
   app surfaces as DEVELOPER_ERROR. This exact mistake was made via the
   GitHub repo secret `GOOGLE_WEB_CLIENT_ID` (held the Android client
   7qms...) and poisoned every CI-built release APK. The secret was
   deleted on Sep 28, 2026 and the workflow now hardcodes the Web client.

2. **NEVER delete or re-create the Web client (`e96d...`) in Cloud
   Console.** If it is ever deleted and re-created, the NEW client ID
   must be updated in ALL of: APK `.env`, the workflow hardcode,
   `AuthContext.tsx` fallbacks, web `.env` `AUTH_GOOGLE_ID`, and the
   Vercel env var `AUTH_GOOGLE_ID` - then redeploy the web app AND
   rebuild the APK. A fresh clone of the repo without `.env` uses the
   AuthContext fallback, so that fallback must always hold a Web-type
   client ID.

3. **Never remove the SHA-1 fingerprints** from the two Android clients.
   Removing them = every fresh (non-cached) sign-in fails with
   DEVELOPER_ERROR, even though cached/silent sign-ins keep working.

4. **CI release APKs are built by `.github/workflows/build-release-apk.yml`**
   on every push to main and every tag. It bakes whatever
   `GOOGLE_WEB_CLIENT_ID` value the workflow carries into the APK bundle.
   After downloading any release APK, verify what it bakes:
   ```
   python -c "import zipfile,re; d=zipfile.ZipFile('SahakariSIP.apk').read('assets/index.android.bundle'); print(set(re.findall(rb'416335590615-[a-z0-9]{32}', d)))"
   ```
   It must print the `e96d...` Web client. If it prints `7qms...` the
   build is broken - do not distribute it.

5. **The release pipeline is manual/CI, not magic.** GitHub release
   assets are only as fresh as the last workflow run or manual upload.
   Check the asset's versionCode before installing it over a newer
   install (`aapt2 dump badging SahakariSIP.apk | grep versionCode`).

## HOW TO DIAGNOSE A BROKEN GOOGLE SIGN-IN (in order)

1. `adb logcat -c` then reproduce, then grep the capture for
   `GetTokenResponseHandler` and `GoogleSignatureVerifier` - the real
   Play Services rejection reason appears there:
   - `You must use a Web client as the server client ID` -> an Android
     client ID is being passed as webClientId (rule 1 violated).
   - `DEVELOPER_ERROR` (code 10) -> package/SHA-1/client registration
     mismatch (rules 2-3 violated or clients edited in console).
2. Verify the client IDs baked into the installed APK bundle (command
   in rule 4).
3. Verify the three clients still exist:
   `curl -s -o /dev/null -w "%{http_code}" "https://accounts.google.com/o/oauth2/v2/auth?client_id=<ID>&response_type=code&scope=email&redirect_uri=https://sahakari-sip.vercel.app"`
   -> HTTP 302 = exists. 400 = deleted.
4. Server-side failures appear in `vercel logs sahakari-sip.vercel.app`
   (e.g. the `email_verified` vs `emailVerified` column bug of Sep 26).

## VERSION SYNC REMINDER

`android/app/build.gradle` hardcodes `versionCode`/`versionName` and is
NOT auto-synced from `app.json`. Bump BOTH (or installs fail with
INSTALL_FAILED_VERSION_DOWNGRADE). The CI workflow stamps them from
app.json automatically.
