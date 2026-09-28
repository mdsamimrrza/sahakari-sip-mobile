// ============================================================
// SahakariSIP — verify the mobile auth chain (read-only)
// ============================================================
// Proves where the dashboard failure comes from, without any app:
//
//   1. POST /api/mobile/password-login with a test account
//      → the web returns { user, access_token } (the RLS JWT)
//   2. decode the JWT (display only — we can't verify the signature
//      without the secret, and we don't need to)
//   3. GET /rest/v1/fund_config with that JWT as Bearer
//      → 200 + rows / []          = JWT accepted, chain healthy
//      → "No suitable key..."     = JWT signature rejected → Vercel's
//        SUPABASE_JWT_SECRET ≠ Supabase's current JWT signing key
//      → 401 JTI / no role        = token fine, RLS/role issue
//
// Usage (Git Bash):
//   EMAIL=you@example.com PASSWORD=secret node _verify/verify-mobile-auth.mjs
//
// Uses ONLY the publishable anon key + your own test credentials.
// Nothing is written; no server-side state changes.
// ============================================================

const WEB_URL = "https://sahakari-sip.vercel.app";
const SUPABASE_URL = "https://entbhjpnhdjfhcctcvmt.supabase.co";
const ANON_KEY = "sb_publishable_Qox-u2IFEpaoUHus51Ofhw_4XyVPI3D";

const email = process.env.EMAIL;
const password = process.env.PASSWORD;
if (!email || !password) {
  console.error("Set EMAIL and PASSWORD env vars to a test cloud account.");
  process.exit(1);
}

function decode(jwt) {
  const [, payload] = jwt.split(".");
  const json = Buffer.from(payload, "base64url").toString("utf8");
  return JSON.parse(json);
}

// 1. login → get the RLS JWT
console.log("== 1. POST /api/mobile/password-login ==");
const loginRes = await fetch(`${WEB_URL}/api/mobile/password-login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const loginBody = await loginRes.json();
if (!loginRes.ok || !loginBody.access_token) {
  console.error("login failed:", loginRes.status, loginBody);
  process.exit(1);
}
console.log("login OK — user:", loginBody.user?.id, loginBody.user?.email);

// 2. what the token claims (sub should be the next_auth user id)
const claims = decode(loginBody.access_token);
console.log("\n== 2. JWT claims ==");
console.log({ role: claims.role, sub: claims.sub, exp: new Date(claims.exp * 1000).toISOString() });

// 3. does Supabase accept it?
console.log("\n== 3. GET /rest/v1/fund_config with Bearer JWT ==");
const restRes = await fetch(`${SUPABASE_URL}/rest/v1/fund_config?select=id&limit=1`, {
  headers: { apikey: ANON_KEY, Authorization: `Bearer ${loginBody.access_token}` },
});
const restBody = await restRes.text();
console.log("status:", restRes.status);
console.log("body:  ", restBody.slice(0, 300));

if (restRes.ok) {
  console.log("\n✅ Chain healthy — JWT accepted. Dashboard problem is elsewhere (app-side).");
} else if (/suitable key|JWT/i.test(restBody)) {
  console.log(
    "\n❌ CONFIRMED: Supabase rejects the JWT signature.\n" +
      "   Fix: Vercel → project Settings → Environment Variables →\n" +
      "   SUPABASE_JWT_SECRET = Supabase Dashboard → Settings → API → 'JWT Secret (Legacy)' value (exact match),\n" +
      "   then redeploy Vercel and sign in again on the phone. No APK rebuild needed."
  );
} else {
  console.log("\n⚠️  Unexpected response — paste this output to the agent.");
}
