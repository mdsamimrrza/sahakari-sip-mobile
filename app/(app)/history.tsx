// ============================================================
// SahakariSIP — SIP History
// ============================================================
// Port of the web app's (app)/history/page.tsx + entry-table.tsx:
//   • fund scope filter + free-text search
//   • sortable ledger of deposits (date, amount, NAV, units, rollover)
//   • expandable per-entry rollover-wallet breakdown
//   • inline edit / delete
//   • CSV bulk import
//   • client-side pagination (10 / 20 / 50 / All)
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Pressable,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal as RNModal,
  useWindowDimensions,
} from "react-native";
import { Pencil, Trash2, Search, ChevronDown, Plus, Upload, Calendar, ArrowUpDown } from "lucide-react-native";
import { useEntries, useFunds } from "@/hooks/useData";
import { computeEntryBreakdowns } from "@/lib/data/analytics";
import { formatCurrency, formatDate, formatNav, formatUnits } from "@/lib/format";
import { usePrivacy } from "@/lib/privacy/PrivacyContext";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Entry } from "@/lib/types";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { Screen, PageHeader } from "@/components/ui/layout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Text, Card, Button, Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { DateField } from "@/components/ui/DateField";
import { ConfirmDialog, Modal, useToast } from "@/components/ui/overlays";
import { FundScopeSelector } from "@/components/dashboard/FundScopeSelector";
import { EntryFormModal } from "@/components/entries/EntryFormModal";
import { CsvImportModal } from "@/components/entries/CsvImportModal";

type SortKey = "purchase_date" | "amount" | "nav" | "units" | "rollover";
type DateFilter = "all" | "month" | "quarter" | "year" | "custom";

const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.07,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
function animateLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

export default function HistoryScreen() {
  const { colors, isDark } = useTheme();
  const { formatPrivate } = usePrivacy();
  const { store } = useAuth();
  const { toast } = useToast();

  const [fundId, setFundId] = useState("all");
  const { funds } = useFunds();
  const { entries, loading, reload } = useEntries(fundId);

  const [search, setSearch] = useState("");
  // Debounced search — filtering + re-sorting the whole list on every
  // keystroke made typing feel sluggish; the query settles after 300ms.
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(search), 300);
    return () => clearTimeout(id);
  }, [search]);
  const [sortKey, setSortKey] = useState<SortKey>("purchase_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customDateRange, setCustomDateRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  // Draft range edited inside the custom-range popup before applying.
  const [customOpen, setCustomOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  // Anchored dropdowns: screen position of the tapped icon, so the options
  // card drops down just below it instead of sliding up as a bottom sheet.
  const dateBtnRef = useRef<any>(null);
  const sortBtnRef = useRef<any>(null);
  const [iconRect, setIconRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [customDraft, setCustomDraft] = useState<{ from: string; to: string }>({ from: "", to: "" });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fundMap = useMemo(
    () => new Map(funds.map((f) => [f.id, f.fund_name])),
    [funds]
  );

  const breakdowns = useMemo(() => computeEntryBreakdowns(entries), [entries]);

  const filtered = useMemo(() => {
    let result = entries;

    // Apply date filter
    if (dateFilter !== "all") {
      const now = new Date();
      let cutoff: Date;
      switch (dateFilter) {
        case "month":
          cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "quarter":
          cutoff = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          break;
        case "year":
          cutoff = new Date(now.getFullYear(), 0, 1);
          break;
        case "custom":
          if (customDateRange.from && customDateRange.to) {
            const fromDate = new Date(customDateRange.from);
            const toDate = new Date(customDateRange.to);
            toDate.setHours(23, 59, 59, 999);
            result = result.filter((e) => {
              const entryDate = new Date(e.purchase_date);
              return entryDate >= fromDate && entryDate <= toDate;
            });
          }
          break;
      }
      if (dateFilter !== "custom") {
        result = result.filter((e) => new Date(e.purchase_date) >= cutoff);
      }
    }

    // Apply search query
    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter((e) => {
      const fundName = fundMap.get(e.fund_id) || "";
      return `${e.purchase_date} ${e.amount} ${e.nav} ${e.units} ${e.notes || ""} ${fundName}`
        .toLowerCase()
        .includes(q);
    });
  }, [entries, searchQuery, fundMap, dateFilter, customDateRange]);

  const totals = useMemo(
    () => ({
      count: filtered.length,
      invested: filtered.reduce((sum, e) => sum + Number(e.amount), 0),
    }),
    [filtered]
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      if (sortKey === "rollover") {
        aVal = breakdowns.get(a.id)?.remainingRollover ?? 0;
        bVal = breakdowns.get(b.id)?.remainingRollover ?? 0;
      } else if (sortKey === "purchase_date") {
        aVal = new Date(a.purchase_date).getTime();
        bVal = new Date(b.purchase_date).getTime();
      } else {
        aVal = Number(a[sortKey]);
        bVal = Number(b[sortKey]);
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir, breakdowns]);

  const totalEntries = sorted.length;
  const effectivePageSize = pageSize === "all" ? totalEntries || 1 : pageSize;
  const totalPages = Math.ceil(totalEntries / effectivePageSize) || 1;
  const validPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (validPage - 1) * effectivePageSize;
  const paginated = sorted.slice(startIndex, startIndex + effectivePageSize);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  }

  /** Measure the tapped icon, then open its dropdown anchored below it. */
  function openDropdown(ref: { current: any } | null, open: () => void) {
    ref?.current?.measureInWindow((x: number, y: number, w: number, h: number) => {
      setIconRect({ x, y, w, h });
      open();
    });
  }

  async function handleDelete() {
    if (!store || !deleteId) return;
    setDeleting(true);
    const res = await store.deleteEntry(deleteId);
    setDeleting(false);

    if (res.success) {
      toast({
        title: "Entry deleted",
        description: "The SIP record has been removed.",
        variant: "success",
      });
      setDeleteId(null);
      reload();
    } else {
      toast({
        title: "Delete failed",
        description: res.error,
        variant: "destructive",
      });
    }
  }

  const sortOptions: Array<{ value: SortKey; label: string }> = [
    { value: "purchase_date", label: "Date" },
    { value: "amount", label: "Deposit Amount" },
    { value: "nav", label: "NAV" },
    { value: "units", label: "Units" },
    { value: "rollover", label: "Rollover Leftover" },
  ];

  const dateChipOptions: Array<{ value: DateFilter; label: string }> = [
    { value: "all", label: "All dates" },
    { value: "month", label: "This month" },
    { value: "quarter", label: "This quarter" },
    { value: "year", label: "This year" },
    { value: "custom", label: "Custom…" },
  ];

  const customChipLabel =
    dateFilter === "custom" && customDateRange.from && customDateRange.to
      ? `${customDateRange.from} → ${customDateRange.to}`
      : "Custom…";

  const activeSortLabel = sortOptions.find((o) => o.value === sortKey)?.label ?? "Date";
  const activeDateLabel =
    dateFilter === "custom"
      ? customChipLabel
      : (dateChipOptions.find((o) => o.value === dateFilter)?.label ?? "All dates");

  function pickDateFilter(v: DateFilter) {
    animateLayout();
    setPage(1);
    if (v === "custom") {
      // Open the custom-range popup with the current range as draft.
      // Android: opening a native dialog while the dropdown's dialog is
      // still animating out leaves the new one touch-dead (Apply ignores
      // taps), so wait for the dropdown to fully dismiss first.
      setCustomDraft({ ...customDateRange });
      setTimeout(() => setCustomOpen(true), 350);
      return;
    }
    if (v === dateFilter) {
      // Tapping the active chip clears back to all dates
      setDateFilter("all");
      setCustomDateRange({ from: "", to: "" });
      return;
    }
    setDateFilter(v);
    setCustomDateRange({ from: "", to: "" });
  }

  return (
    <>
      <Screen refreshing={loading} onRefresh={reload} header={<AppHeader />}>
        {/* ---------- Statement hero ---------- */}
        <View
          style={{
            marginHorizontal: -spacing.lg,
            marginTop: -spacing.xs,
            backgroundColor: isDark ? "#1E293B" : colors.primary,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing.xl,
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
            overflow: "hidden",
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -52,
              right: -36,
              width: 148,
              height: 148,
              borderRadius: 74,
              backgroundColor: "#FFFFFF",
              opacity: 0.12,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: -70,
              right: 70,
              width: 170,
              height: 170,
              borderRadius: 85,
              backgroundColor: colors.secondary,
              opacity: 0.3,
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text variant="title" color="#FFFFFF" numberOfLines={1} style={{ flex: 1 }}>
              SIP History
            </Text>
            <View
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: 5,
                borderRadius: radius.full,
                backgroundColor: "#FFFFFF",
              }}
            >
              <Text
                style={{ fontSize: fontSize.xs, fontWeight: "800", color: isDark ? "#1E293B" : colors.primary }}
                numberOfLines={1}
              >
                {totals.count} {totals.count === 1 ? "payment" : "payments"}
              </Text>
            </View>
          </View>
          {loading && entries.length === 0 ? (
            <View style={{ marginTop: spacing.sm }}>
              <Skeleton height={34} width="60%" />
            </View>
          ) : (
            <>
              {/* Amount row: value + eye on the same line, right side (like dashboard) */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: spacing.xs,
                }}
              >
                <Text
                  style={{
                    fontSize: fontSize.xxxl,
                    fontWeight: "900",
                    color: "#FFFFFF",
                    fontVariant: ["tabular-nums"],
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {formatPrivate(formatCurrency(totals.invested))}
                </Text>
                <View style={{ marginLeft: spacing.sm }}>
                  <PrivacyEyeButton variant="hero" />
                </View>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  marginTop: 6,
                  flexWrap: "wrap",
                }}
              >
                <Text style={{ fontSize: fontSize.sm, color: "#FFFFFF", opacity: 0.85, flexShrink: 1 }}>
                  Total deposited
                  {searchQuery.trim() || dateFilter !== "all" || fundId !== "all" ? " in view" : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.xs }}>
                  <Pressable
                    onPress={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Add entry"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      paddingHorizontal: spacing.md,
                      paddingVertical: 7,
                      borderRadius: radius.full,
                      backgroundColor: "#FFFFFF",
                    }}
                  >
                    <Plus size={16} color={isDark ? "#1E293B" : colors.primary} strokeWidth={2.8} />
                    <Text style={{ fontSize: fontSize.sm, fontWeight: "800", color: isDark ? "#1E293B" : colors.primary }}>
                      Add
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setCsvOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Import CSV"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      paddingHorizontal: spacing.md,
                      paddingVertical: 7,
                      borderRadius: radius.full,
                      backgroundColor: "#FFFFFF2E",
                    }}
                  >
                    <Upload size={15} color="#FFFFFF" />
                    <Text style={{ fontSize: fontSize.sm, fontWeight: "800", color: "#FFFFFF" }}>
                      Import
                    </Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Controls — compact search + icon-only sheets in one card */}
        <Card style={{ borderWidth: 0, ...SHADOW }}>
          <View
            style={{
              flexDirection: "row",
              gap: spacing.sm,
              alignItems: "center",
              padding: spacing.md,
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                backgroundColor: colors.muted,
                borderRadius: radius.lg,
                paddingHorizontal: spacing.sm,
                paddingVertical: 4,
              }}
            >
              <Search size={15} color={colors.mutedForeground} />
              <TextInput
                value={search}
                onChangeText={(t) => {
                  setSearch(t);
                  setPage(1);
                }}
                placeholder="Search…"
                placeholderTextColor={colors.mutedForeground}
                style={{ flex: 1, color: colors.foreground, fontSize: fontSize.sm, paddingVertical: 4 }}
              />
              {search.length > 0 && (
                <Pressable
                  onPress={() => {
                    setSearch("");
                    setPage(1);
                  }}
                  hitSlop={8}
                  accessibilityLabel="Clear search"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.card,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "800" }} color={colors.mutedForeground}>
                    ×
                  </Text>
                </Pressable>
              )}
            </View>
            <Pressable
              ref={dateBtnRef}
              onPress={() => openDropdown(dateBtnRef, () => setDateSheetOpen(true))}
              accessibilityRole="button"
              accessibilityLabel={`Show payments from: ${activeDateLabel}`}
              style={{
                height: 40,
                width: 40,
                borderRadius: radius.md,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.muted,
              }}
            >
              <Calendar size={17} color={colors.emerald} />
              {dateFilter !== "all" && (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.primary,
                  }}
                />
              )}
            </Pressable>
            <Pressable
              ref={sortBtnRef}
              onPress={() => openDropdown(sortBtnRef, () => setSortSheetOpen(true))}
              accessibilityRole="button"
              accessibilityLabel={`Sort payments by: ${activeSortLabel}`}
              style={{
                height: 40,
                width: 40,
                borderRadius: radius.md,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.muted,
              }}
            >
              <ArrowUpDown size={17} color={colors.primary} />
              {(sortKey !== "purchase_date" || sortDir !== "desc") && (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.primary,
                  }}
                />
              )}
            </Pressable>
          </View>
        </Card>

        <FundScopeSelector
          funds={funds}
          selectedFundId={fundId}
          onChange={(id) => {
            setFundId(id);
            setPage(1);
          }}
        />

        {/* Date dropdown — anchored just below the calendar icon */}
        <AnchorDropdown
          visible={dateSheetOpen}
          onClose={() => setDateSheetOpen(false)}
          anchor={iconRect}
          title="Show payments from"
        >
          {dateChipOptions.map((opt) => (
            <SheetRow
              key={opt.value}
              label={opt.value === "custom" ? customChipLabel : opt.label}
              active={dateFilter === opt.value}
              onPress={() => {
                setDateSheetOpen(false);
                pickDateFilter(opt.value);
              }}
            />
          ))}
        </AnchorDropdown>

        {/* Sort dropdown — anchored just below the sort icon */}
        <AnchorDropdown
          visible={sortSheetOpen}
          onClose={() => setSortSheetOpen(false)}
          anchor={iconRect}
          title="Sort payments by"
        >
          {sortOptions.map((opt) => (
            <SheetRow
              key={opt.value}
              label={
                sortKey === opt.value
                  ? `${opt.label} ${sortDir === "asc" ? "↑" : "↓"}`
                  : opt.label
              }
              active={sortKey === opt.value}
              onPress={() => {
                toggleSort(opt.value);
                setSortSheetOpen(false);
              }}
            />
          ))}
        </AnchorDropdown>

        {/* Custom range popup */}
        <Modal
          visible={customOpen}
          onClose={() => setCustomOpen(false)}
          title="Custom date range"
          description="Pick the first and last day to show."
          footer={
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setCustomOpen(false)}
              >
                Cancel
              </Button>
              <Button
                style={{ flex: 1 }}
                disabled={!customDraft.from || !customDraft.to}
                onPress={() => {
                  animateLayout();
                  setCustomDateRange(customDraft);
                  setDateFilter("custom");
                  setPage(1);
                  setCustomOpen(false);
                }}
              >
                Apply
              </Button>
            </View>
          }
        >
          <View style={{ gap: spacing.md }}>
            <DateField
              label="From"
              value={customDraft.from}
              onChange={(v) => setCustomDraft((d) => ({ ...d, from: v }))}
              maxDate={customDraft.to || undefined}
            />
            <DateField
              label="To"
              value={customDraft.to}
              onChange={(v) => setCustomDraft((d) => ({ ...d, to: v }))}
              minDate={customDraft.from || undefined}
            />
          </View>
        </Modal>
        {/* Ledger */}
        {loading && entries.length === 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={90} />
          </View>
        ) : entries.length === 0 ? (
          <Card padded style={{ borderWidth: 0, ...SHADOW }}>
            <EmptyState
              title="No SIP entries recorded yet"
              description='Tap "Add Entry" or "Import CSV" to populate your history.'
            />
          </Card>
        ) : paginated.length === 0 ? (
          <Card padded style={{ borderWidth: 0, ...SHADOW }}>
            <EmptyState title="No entries match your search" />
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {paginated.map((entry, idx) => {
              const b = breakdowns.get(entry.id);
              const isOpen = expanded === entry.id;
              const monthLabel = new Date(entry.purchase_date).toLocaleString("en-US", {
                month: "long",
                year: "numeric",
              });
              const prev = idx > 0 ? paginated[idx - 1] : null;
              const showMonth =
                !prev ||
                new Date(prev.purchase_date).toLocaleString("en-US", {
                  month: "long",
                  year: "numeric",
                }) !== monthLabel;
              return (
                <React.Fragment key={entry.id}>
                  {showMonth && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.sm,
                        marginTop: idx === 0 ? spacing.xs : spacing.sm,
                        marginHorizontal: spacing.xs,
                      }}
                    >
                      <Text
                        variant="caption"
                        color={colors.mutedForeground}
                        style={{ fontWeight: "800" }}
                      >
                        {monthLabel}
                      </Text>
                      <View
                        style={{ flex: 1, height: 1, backgroundColor: colors.border }}
                      />
                    </View>
                  )}
                <Card
                  style={{
                    borderWidth: 0,
                    borderLeftWidth: 3,
                    borderLeftColor: colors.emerald,
                    ...SHADOW,
                  }}
                >
                  <Pressable
                    onPress={() => {
                      animateLayout();
                      setExpanded(isOpen ? null : entry.id);
                    }}
                    style={{ padding: spacing.lg, gap: spacing.md }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: spacing.sm,
                      }}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text variant="label" style={{ fontWeight: "800" }}>
                          {formatDate(entry.purchase_date)}
                        </Text>
                        {funds.length > 1 && (
                          <View style={{ alignSelf: "flex-start" }}>
                            <Badge bg={`${colors.info}14`} color={colors.info}>
                              {fundMap.get(entry.fund_id) || "—"}
                            </Badge>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                        <Pressable
                          hitSlop={8}
                          onPress={(e) => {
                            e.stopPropagation();
                            setEditing(entry);
                            setFormOpen(true);
                          }}
                          accessibilityLabel="Edit entry"
                          style={{
                            height: 32,
                            width: 32,
                            borderRadius: radius.md,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: colors.muted,
                          }}
                        >
                          <Pencil size={14} color={colors.mutedForeground} />
                        </Pressable>
                        <Pressable
                          hitSlop={8}
                          onPress={(e) => {
                            e.stopPropagation();
                            setDeleteId(entry.id);
                          }}
                          accessibilityLabel="Delete entry"
                          style={{
                            height: 32,
                            width: 32,
                            borderRadius: radius.md,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: `${colors.rose}14`,
                          }}
                        >
                          <Trash2 size={14} color={colors.rose} />
                        </Pressable>
                        <ChevronDown
                          size={17}
                          color={colors.mutedForeground}
                          style={{
                            transform: [{ rotate: isOpen ? "180deg" : "0deg" }],
                          }}
                        />
                      </View>
                    </View>

                    {/* Metric strip */}
                    <View
                      style={{
                        flexDirection: "row",
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                        paddingTop: spacing.md,
                      }}
                    >
                      <MiniMetric label="Deposit" value={formatPrivate(formatCurrency(Number(entry.amount)))} />
                      <MiniMetric label="NAV" value={formatNav(Number(entry.nav))} />
                      <MiniMetric label="Units" value={formatUnits(Number(entry.units))} />
                      <MiniMetric
                        label="Rollover"
                        value={b ? formatPrivate(formatCurrency(b.remainingRollover)) : "—"}
                        color={colors.success}
                      />
                    </View>

                    {/* Expanded rollover breakdown */}
                    {isOpen && b && (
                      <View
                        style={{
                          backgroundColor: `${colors.success}0A`,
                          borderRadius: radius.lg,
                          padding: spacing.md,
                          gap: 6,
                        }}
                      >
                        <BreakdownRow
                          label="Carried Rollover"
                          value={`+ ${formatPrivate(formatCurrency(b.carriedRollover))}`}
                          color={colors.blue}
                        />
                        <BreakdownRow
                          label="Total Available"
                          value={formatPrivate(formatCurrency(b.totalAvailable))}
                        />
                        <BreakdownRow
                          label="Net Cash for Units"
                          value={formatPrivate(formatCurrency(b.netCash))}
                        />
                        <BreakdownRow
                          label="Unit Cost"
                          value={formatPrivate(formatCurrency(b.unitCost))}
                        />
                        <BreakdownRow
                          label="Ending Rollover"
                          value={formatPrivate(formatCurrency(b.remainingRollover))}
                          color={colors.success}
                          emphasis
                        />
                        {entry.notes ? (
                          <Text
                            variant="caption"
                            color={colors.mutedForeground}
                            style={{ fontStyle: "italic", marginTop: 4 }}
                          >
                            {entry.notes}
                          </Text>
                        ) : null}
                      </View>
                    )}
                  </Pressable>
                </Card>
                </React.Fragment>
              );
            })}
          </View>
        )}

        {/* Pagination footer */}
        {totalEntries > 0 && (
          <Card style={{ borderWidth: 0, ...SHADOW }}>
            <View style={{ padding: spacing.lg, gap: spacing.md }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing.sm,
                }}
              >
                <Text variant="caption" color={colors.mutedForeground} numberOfLines={1} style={{ flex: 1 }}>
                  Showing {totalEntries > 0 ? startIndex + 1 : 0}–
                  {Math.min(startIndex + effectivePageSize, totalEntries)} of{" "}
                  {totalEntries}
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.xs }}>
                  {(["10", "20", "50", "all"] as const).map((size) => {
                    const active =
                      pageSize === "all" ? size === "all" : String(pageSize) === size;
                    return (
                      <Pressable
                        key={size}
                        onPress={() => {
                          setPageSize(size === "all" ? "all" : Number(size));
                          setPage(1);
                        }}
                        style={{
                          height: 30,
                          minWidth: 34,
                          paddingHorizontal: spacing.sm,
                          borderRadius: radius.full,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: active ? colors.primary : colors.muted,
                        }}
                      >
                        <Text
                          style={{ fontSize: fontSize.xs, fontWeight: "800" }}
                          color={active ? colors.primaryForeground : colors.mutedForeground}
                        >
                          {size === "all" ? "All" : size}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

            {pageSize !== "all" && totalPages > 1 && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: spacing.xs,
                  flexWrap: "wrap",
                }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={validPage <= 1}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                {totalPages <= 7
                  ? Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <Pressable
                        key={p}
                        onPress={() => setPage(p)}
                        style={{
                          height: 34,
                          minWidth: 34,
                          paddingHorizontal: spacing.sm,
                          borderRadius: radius.lg,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: p === validPage ? colors.primary : colors.card,
                          borderWidth: p === validPage ? 0 : 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Text
                          variant="caption"
                          color={p === validPage ? colors.primaryForeground : colors.foreground}
                          style={{ fontWeight: "800" }}
                        >
                          {p}
                        </Text>
                      </Pressable>
                    ))
                  : (
                    <Text variant="label" tabular>
                      {validPage} / {totalPages}
                    </Text>
                  )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={validPage >= totalPages}
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </View>
            )}
            </View>
          </Card>
        )}
      </Screen>

      <EntryFormModal
        visible={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        funds={funds}
        entry={editing}
        defaultFundId={fundId !== "all" ? fundId : undefined}
        onSaved={reload}
      />

      <CsvImportModal
        visible={csvOpen}
        onClose={() => setCsvOpen(false)}
        funds={funds}
        selectedFundId={fundId !== "all" ? fundId : undefined}
        onImported={reload}
      />

      <ConfirmDialog
        visible={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        loading={deleting}
        destructive
        title="Delete SIP Entry"
        description="Are you sure you want to delete this SIP record? This action cannot be undone."
        confirmLabel="Delete"
      />
    </>
  );
}

/**
 * A dropdown options card that appears anchored just below the icon that
 * opened it (anchor = measured screen rect of the icon). Full-screen
 * transparent Modal provides the tap-outside-to-dismiss backdrop and the
 * Android back button handling; statusBarTranslucent keeps the Modal's
 * coordinate space equal to measureInWindow's window space.
 */
function AnchorDropdown({
  visible,
  onClose,
  anchor,
  title,
  width = 250,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  anchor: { x: number; y: number; w: number; h: number } | null;
  title: string;
  width?: number;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const { width: screenW } = useWindowDimensions();

  if (!anchor) return null;
  const left = Math.min(
    Math.max(8, anchor.x + anchor.w - width),
    Math.max(8, screenW - 8 - width)
  );
  // Edge-to-edge builds: measureInWindow and a statusBarTranslucent Modal
  // share the same window space (status bar included), so the raw rect is
  // used as-is — adding insets.top double-counts and drops the card ~50px
  // below its anchor icon.
  const top = anchor.y + anchor.h + 6;

  return (
    <RNModal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.25)" }} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top,
            left,
            width,
            backgroundColor: colors.card,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            paddingVertical: spacing.xs,
            ...SHADOW,
          }}
        >
          <Text
            variant="caption"
            color={colors.mutedForeground}
            style={{
              fontWeight: "800",
              paddingHorizontal: spacing.md,
              paddingTop: spacing.xs,
              paddingBottom: 2,
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

function SheetRow({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            borderRadius: radius.lg,
            backgroundColor: active ? colors.muted : "transparent",
            opacity: pressed ? 0.6 : 1,
          }}
        >
          <Text variant="label" style={{ flex: 1, fontWeight: active ? "800" : "500" }}>
            {label}
          </Text>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: 2,
              borderColor: active ? colors.primary : colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {active ? (
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: colors.primary,
                }}
              />
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

function MiniMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }}>
        {label}
      </Text>
      <Text
        variant="caption"
        color={color ?? colors.foreground}
        style={{ fontWeight: "700" }}
        tabular
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function BreakdownRow({
  label,
  value,
  color,
  emphasis,
}: {
  label: string;
  value: string;
  color?: string;
  emphasis?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.sm,
      }}
    >
      <Text variant="caption" color={colors.mutedForeground} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text
        variant="caption"
        color={color ?? colors.foreground}
        style={{ fontWeight: emphasis ? "800" : "600" }}
        tabular
      >
        {value}
      </Text>
    </View>
  );
}
