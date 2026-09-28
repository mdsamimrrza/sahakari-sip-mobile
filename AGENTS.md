# Agent rules for this repository

- **Google sign-in configuration is frozen.** Read `GOOGLE-SIGNIN-RULES.md`
  BEFORE touching anything related to Google/OAuth: client IDs, `.env`
  Google vars, workflow env, Cloud Console clients, or SHA-1 fingerprints.
  The Web client `416335590615-e96du...` is the ONLY client allowed as
  `webClientId`/`AUTH_GOOGLE_ID`. Android client IDs in those spots caused
  a two-day DEVELOPER_ERROR outage.
- `android/app/build.gradle` hardcodes versionCode/versionName - bump it
  together with `app.json` or installs fail with a version downgrade.
- Do not commit scratch files: `src/graphify-out/`, `_verify/*.png`,
  `_verify/*.ab`, `assets/adaptive-icon2.png` are ignored on purpose.
- Never print or commit secrets: `.env`, keystore passwords,
  `keystore.properties`, GitHub tokens.
