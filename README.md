# SahakariSIP — React Native (Android APK)

A React Native / Expo port of the **SahakariSIP** Next.js web app — a tracker for Nepali
mutual-fund SIP investments that follows SEBON accounting rules.

The mobile app reproduces the web app's **features, screens, navigation, business rules and
data handling**. What changes is the runtime: the web app's Next.js Server Actions and
NextAuth can't execute inside an APK, so they are replaced by an equivalent data layer
(see *Architecture* below) that produces **identical numbers**.

> 🌐 **Live web app:** [https://sahakari-sip.vercel.app](https://sahakari-sip.vercel.app)

---

## Feature parity

| Area | What it does |
|---|---|
| **Dashboard** | KPI cards (Invested, Current Value, Gain/Loss, XIRR, SIP Streak), portfolio growth chart with 7 time ranges, NAV history chart, monthly contributions, invested-vs-gain donut, AMC fee-drag chart |
| **History** | Search, sort by date/amount/NAV/units/rollover, page sizes 10/20/50/All, expandable per-entry SEBON rollover breakdown, edit, delete, CSV import |
| **Projections** | Return scenario (8/10/12%), step-up (0/5/10/15%), seeded corpus, actual+projected bridged chart, milestone table |
| **Tax & Settlement Ledger** | 4-section audit: (01) Initial Cash Deposits & SEBON Charges, (02) Units & Embedded AMC Fees, (03) Capital Gains Tax Schedule, (04) Final Settlement Ledger (Bank Credit) — plus 3 headline tiles: Total Deposited / Total Taxes Owed / Net Bank Payout |
| **Settings** | Fund CRUD (search + 5-per-page pagination, presets), installment reminders (push + email), profile card, appearance, danger zone |
| **Onboarding** | 5-step wizard: Choose Fund → Fee Rate → Monthly SIP → Start Date → Current NAV |
| **Auth** | Email/password sign-in, sign-up, password reset, sign-out, delete account |

---

## Nepal-specific financial rules (ported verbatim)

These are the rules that make the numbers correct for Nepali mutual funds. They live in
`src/lib/calculations/` and `src/lib/data/analytics.ts`.

- **Whole-unit allotment (SEBON)** — units are always `Math.floor(amount / nav)`. The
  fractional remainder is *not* invested.
- **NPR 5 flat DP charge** — deducted per deposit (`DP_CHARGE = 5`), before unit allotment.
- **SIP Rollover Wallet** — leftover cash from each deposit carries forward to the next
  deposit and is tracked as `unallottedCash`. It is 100% refundable on exit.
- **Capital Gains Tax** — lot-based, evaluated as if the portfolio were redeemed today:
  - held **> 365 days** → **7.5%** long-term
  - held **≤ 365 days** → **10.0%** short-term
  - losses produce NPR 0 taxable, never a negative tax.
- **XIRR** — Newton–Raphson solver over the cash-flow series; requires **≥ 3 entries**
  (`XIRR_MIN_ENTRIES`) and returns `null` when the solver fails to converge.
- **AMC fee drag** — management fees are already embedded in the published daily NAV, so
  they are modelled for insight and are **not** subtracted a second time at exit.
- **Net in-hand settlement** =
  `(currentValue ?? totalInvested) + unallottedCash − totalEstimatedCgt`

---

## Architecture

### Two backends, one contract

The web app's `src/lib/actions/*` (393 + 430 + 291 lines of Server Actions) are re-expressed
as a single interface, `DataStore` (`src/lib/data/store.ts`), implemented twice:

| Adapter | Backend | Notes |
|---|---|---|
| `CloudStore` | Supabase (Postgres + RLS) | **Anon key only.** The web app's service-role key is deliberately *not* shipped in the bundle — every request runs as the signed-in user, so RLS (`auth.uid() = user_id`) isolates each portfolio. Same project, same tables as the web app. |
| `LocalStore` | AsyncStorage | Fully offline. Namespaced `sahakarisip.v1.<uid>.*`. |

Both adapters call the same `computeDashboardData()` pipeline
(`src/lib/data/analytics.ts`), so **the dashboard, tax ledger and projections produce
byte-identical results regardless of which backend is active.**

### Auth

NextAuth v5 (bcrypt on the server + Nodemailer OTP) cannot run on-device, so there are two
equivalent routes:

1. **Cloud** — Supabase Auth email + password against the same Supabase project.
2. **On-device** — a salted SHA-256 profile via `expo-crypto`; the hash never leaves the
   phone. Password reset honestly reports that an on-device profile can't be recovered by
   email rather than pretending otherwise.

The user picks between them with the Cloud / On-device toggle on the auth screens.

### Charts

Recharts is DOM-only, so `src/components/charts/index.tsx` is a self-contained
`react-native-svg` chart library — `LineChart`, `BarChart`, `DonutChart` — with an API
shaped to accept the same data arrays the web app feeds Recharts.

### Timezone safety

`new Date("2024-03-15")` parses as UTC and shifts a day in some timezones.
`parseDateSafe()` parses components manually and `toDateKey()` / `todayKey()` format locally,
mirroring the web app's own `buildCashFlows` approach. Nepal is UTC+05:45, so this matters.

### Navigation

The web app's 4-item mobile bottom bar omits Tax & Settlement (it's desktop-sidebar-only).
The mobile app mirrors that: 4 tabs — **Dashboard, History, Projections, Settings** — with
`tax-breakdown` registered as a hidden route reachable from the dashboard summary sheet and
from Settings.

---

## Project layout

```
app/
  _layout.tsx              Providers: SafeArea → Theme → Auth → Toast → Stack
  index.tsx                Landing (hero, feature grid, trust badges)
  onboarding.tsx           5-step fund setup wizard
  (auth)/                  login · signup · forgot-password
  (app)/                   dashboard · history · projections · tax-breakdown · settings
src/
  theme/                   Design tokens (Light "Royal Cream & Navy" / Dark "Royal Navy & Gold")
  lib/
    calculations/          xirr · streak · fee-drag · projections
    data/                  store (contract) · cloud · local · analytics
    schemas/               Zod: entry · fund-config · auth
    auth/AuthContext.tsx   Dual-mode auth provider
    types.ts constants.ts format.ts utils.ts supabase.ts
  components/
    ui/                    primitives · overlays · layout · DateField
    charts/                SVG LineChart · BarChart · DonutChart
    dashboard/             SummaryCards · DashboardCharts · FundScopeSelector · LatestNavEditor
    entries/               EntryFormModal · CsvImportModal
    settings/              FundConfigForm · NotificationSettings · DeleteAccountDialog
    layout/ auth/          AppLogo · AuthShell · DataModeToggle
  hooks/useData.ts         useDashboard · useFunds · useEntries
```

---

## Running it

```bash
npm install
npx expo start          # dev server (Metro)
npx expo run:android    # build + install a debug build on a connected device
npm run typecheck       # tsc --noEmit
```

### Environment

`.env` at the project root:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_DEFAULT_DATA_MODE=local
```

Only `EXPO_PUBLIC_*` values are inlined into the bundle — **never put the service-role key
here.** If Supabase isn't configured the app still runs, cloud sign-in is simply reported as
unavailable and the on-device mode is used.

### Building a release APK

```bash
export JAVA_HOME="/c/Program Files/Java/jdk-17"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"

npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease
```

The signed APK lands at:

```
android/app/build/outputs/apk/release/app-release.apk
```

> **Signing note:** `expo prebuild` generates a debug keystore only. For a *release* build,
> either add a `release` signing config to `android/app/build.gradle`, or keep the generated
> `android/app/debug.keystore` wired as the release signer for local testing. For Play Store
> distribution, generate a dedicated upload keystore.

---

## Design tokens

Ported 1:1 from the web app's `globals.css`:

| Token | Light — "Royal Cream & Navy" | Dark — "Royal Navy & Gold" |
|---|---|---|
| `background` | `#F7F3E9` (cream) | `#0D1B2A` (navy) |
| `foreground` | `#0D1B2A` (navy) | `#F7F3E9` (cream) |
| `card` | `#FFFFFF` | `#1B263B` |
| `primary` | `#0D1B2A` | `#EBC547` (bright gold) |
| `secondary` / `accent` | `#D4AF37` (gold) | `#415A77` |
| `border` | `#E0DCD1` | `#2C3E5C` |
| positive / negative | `#10B77F` / `#E21D48` | `#10B77F` / `#F43F5E` |

Theme mode (Light / Dark / System) persists to AsyncStorage and is selectable in Settings.

---

## Known divergences from the web app

These are deliberate, and are the only places behaviour differs:

1. **Google OAuth** is not wired up. NextAuth's Google provider needs a server-side callback
   that an APK can't host; email/password covers the same ground on both backends.
2. **Push notifications** use the OS notification permission instead of Web Push (VAPID +
   service worker). A release build without FCM credentials still lets the toggle be flipped;
   it just reports honestly that the OS hasn't granted delivery.
3. **Password reset** for *on-device* profiles can't send email (there is no server), so the
   app says so instead of faking a success.
4. **Account deletion** purges every row the user owns through the active `DataStore`
   (RLS-scoped on cloud) rather than calling a server-side `SECURITY DEFINER` RPC.
