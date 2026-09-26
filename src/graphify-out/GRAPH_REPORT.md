# Graph Report - src  (2026-09-25)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 564 nodes · 1704 edges · 17 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ceac1c01`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ActionResult
- AuthContext.tsx
- DashboardCharts.tsx
- bs.ts
- useTheme
- useAuth
- FundConfigForm.tsx
- theme/index.tsx
- analytics.ts
- tax.ts
- types.ts
- constants.ts
- primitives.tsx
- NotificationSettings.tsx
- overlays.tsx
- auth.ts
- profilePhoto.ts

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 98 edges
2. `ActionResult` - 64 edges
3. `AuthProvider()` - 40 edges
4. `LocalStore` - 39 edges
5. `CloudStore` - 33 edges
6. `DataStore` - 31 edges
7. `useAuth()` - 30 edges
8. `FundConfig` - 26 edges
9. `cacheInvalidate()` - 25 edges
10. `Text()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `useDashboard()` --calls--> `useAuth()`  [EXTRACTED]
  hooks/useData.ts → lib/auth/AuthContext.tsx
- `useEntries()` --calls--> `useAuth()`  [EXTRACTED]
  hooks/useData.ts → lib/auth/AuthContext.tsx
- `useFunds()` --calls--> `useAuth()`  [EXTRACTED]
  hooks/useData.ts → lib/auth/AuthContext.tsx
- `Avatar()` --calls--> `useTheme()`  [EXTRACTED]
  components/ui/primitives.tsx → theme/index.tsx
- `CardDescription()` --calls--> `useTheme()`  [EXTRACTED]
  components/ui/primitives.tsx → theme/index.tsx

## Import Cycles
- None detected.

## Communities (17 total, 0 thin omitted)

### Community 0 - "ActionResult"
Cohesion: 0.05
Nodes (45): useDashboard(), useEntries(), useFunds(), AppUser, DP_CHARGE, ComputeDashboardInput, cache, CACHE_TTL_MS (+37 more)

### Community 1 - "AuthContext.tsx"
Cohesion: 0.06
Nodes (74): AuthContext, AuthContextValue, AuthProvider(), AuthResult, clearHandoffTokens(), googleHandoffResolvers, hashPassword(), isHandoffTokenUsed() (+66 more)

### Community 2 - "DashboardCharts.tsx"
Cohesion: 0.06
Nodes (43): BarChart, BaseChartProps, buildTicks(), ChartLegend(), ChartSeries, DonutChart, LineChart, niceTop() (+35 more)

### Community 3 - "bs.ts"
Cohesion: 0.10
Nodes (35): SIPScheduleFields(), SIPScheduleValue, addADMonths(), adDayDifference(), addBSMonths(), adToBS(), adToString(), BS_MONTH_NAMES (+27 more)

### Community 4 - "useTheme"
Cohesion: 0.12
Nodes (23): AuthModeSwitch(), AnimatedSplash(), AppHeader(), HeaderIconButton(), NotificationBell(), PrivacyToggle(), ThemeToggle(), UserAvatarMenu() (+15 more)

### Community 5 - "useAuth"
Cohesion: 0.11
Nodes (18): BiometricPromptDialog(), DataModeToggle(), MergePromptDialog(), handleConfirm(), resultMessage(), CsvImportModal(), parseCsv(), pickFile() (+10 more)

### Community 6 - "FundConfigForm.tsx"
Cohesion: 0.11
Nodes (20): GoogleButton(), NavEditModal(), handleSave(), ParsedRow, PreviewRow(), EMPTY_FORM, FormState, EMPTY_SCHEDULE (+12 more)

### Community 7 - "theme/index.tsx"
Cohesion: 0.15
Nodes (18): DataModeDetailsLink(), ModeCard(), SettingsGroup(), SettingsHubHeader(), SettingsRow(), Props, Modal(), Badge() (+10 more)

### Community 8 - "analytics.ts"
Cohesion: 0.15
Nodes (18): calculateFeeDrag(), FeeDragEntry, prepareFeeDragEntries(), calculateSipStreak(), buildCashFlows(), calculateXirr(), LONG_TERM_HOLDING_DAYS, XIRR_MIN_ENTRIES (+10 more)

### Community 9 - "tax.ts"
Cohesion: 0.13
Nodes (16): CGT_OPEN_ENDED_INDIVIDUAL, CGT_UNRESOLVED_MESSAGE, CgtRateInfo, estimateBucketedCgt(), EXIT_LOAD_SCHEDULES, ExitLoadSchedule, ExitLoadTier, getCapitalGainsStatus() (+8 more)

### Community 10 - "types.ts"
Cohesion: 0.13
Nodes (16): calculateProjectionChartData(), PROJECTION_YEARS, toDateKey(), CsvRow, EntryBreakdown, EntryFormData, ExitLoadSchedule, ExitLoadTier (+8 more)

### Community 11 - "constants.ts"
Cohesion: 0.12
Nodes (15): APP_DESCRIPTION, APP_DOWNLOAD_URL, APP_NAME, APP_TAGLINE, CHART_COLORS, CURRENCY_CODE, CURRENCY_LOCALE, FUND_PRESETS (+7 more)

### Community 12 - "primitives.tsx"
Cohesion: 0.13
Nodes (13): Avatar(), ButtonSize, ButtonVariant, CardDescription(), Image(), InputProps, Label(), ProgressBar() (+5 more)

### Community 13 - "NotificationSettings.tsx"
Cohesion: 0.27
Nodes (8): ChannelRow(), isExpoGo(), NotificationSettings(), handleTogglePush(), PermissionState, readPushPermission(), CardHeader(), Switch()

### Community 14 - "overlays.tsx"
Cohesion: 0.25
Nodes (7): DropdownSelect(), SelectOption, ToastContext, ToastContextValue, ToastEntry, ToastMessage, ToastViewport()

### Community 15 - "auth.ts"
Cohesion: 0.25
Nodes (7): MIN_PASSWORD_LENGTH, forgotPasswordSchema, LoginFormValues, loginSchema, resetPasswordSchema, SignupFormValues, signupSchema

### Community 16 - "profilePhoto.ts"
Cohesion: 0.43
Nodes (7): extFor(), getProfilePhoto(), PhotoMap, pickAndStoreProfilePhoto(), readMap(), removeProfilePhoto(), useProfilePhotoUri()

## Knowledge Gaps
- **91 isolated node(s):** `CacheEntry`, `CsvRowData`, `EntryFormValues`, `FundConfigFormValues`, `UpdateLatestNavValues` (+86 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 133 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useTheme()` connect `useTheme` to `DashboardCharts.tsx`, `bs.ts`, `useAuth`, `FundConfigForm.tsx`, `theme/index.tsx`, `primitives.tsx`, `NotificationSettings.tsx`, `overlays.tsx`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **Why does `ActionResult` connect `ActionResult` to `types.ts`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `DataStore` connect `ActionResult` to `AuthContext.tsx`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `CacheEntry`, `CsvRowData`, `EntryFormValues` to the rest of the system?**
  _91 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ActionResult` be split into smaller, more focused modules?**
  _Cohesion score 0.05041459369817579 - nodes in this community are weakly interconnected._
- **Should `AuthContext.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._
- **Should `DashboardCharts.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.060285563194077206 - nodes in this community are weakly interconnected._