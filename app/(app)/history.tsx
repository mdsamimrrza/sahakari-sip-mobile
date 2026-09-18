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

import React, { useEffect, useMemo, useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { Pencil, Trash2, Search, ChevronDown, Plus, Upload } from "lucide-react-native";
import { useEntries, useFunds } from "@/hooks/useData";
import { computeEntryBreakdowns } from "@/lib/data/analytics";
import { formatCurrency, formatDate, formatNav, formatUnits } from "@/lib/format";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Entry } from "@/lib/types";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { Screen, PageHeader } from "@/components/ui/layout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Text, Card, Button, Input, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ConfirmDialog, Select, useToast } from "@/components/ui/overlays";
import { FundScopeSelector } from "@/components/dashboard/FundScopeSelector";
import { EntryFormModal } from "@/components/entries/EntryFormModal";
import { CsvImportModal } from "@/components/entries/CsvImportModal";

type SortKey = "purchase_date" | "amount" | "nav" | "units" | "rollover";

export default function HistoryScreen() {
  const { colors } = useTheme();
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
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter((e) => {
      const fundName = fundMap.get(e.fund_id) || "";
      return `${e.purchase_date} ${e.amount} ${e.nav} ${e.units} ${e.notes || ""} ${fundName}`
        .toLowerCase()
        .includes(q);
    });
  }, [entries, searchQuery, fundMap]);

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

  return (
    <>
      <Screen refreshing={loading} onRefresh={reload} header={<AppHeader />}>
        <PageHeader
          title="SIP History"
          subtitle="View, edit, or import your past monthly purchase records."
        />

        {/* Actions */}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button variant="outline" style={{ flex: 1 }} onPress={() => setCsvOpen(true)}>
            <Upload size={16} color={colors.foreground} />
            <Text variant="label">Import CSV</Text>
          </Button>
          <Button
            style={{ flex: 1 }}
            onPress={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={17} color={colors.primaryForeground} />
            <Text variant="label" color={colors.primaryForeground}>
              Add Entry
            </Text>
          </Button>
        </View>

        {funds.length > 1 && (
          <FundScopeSelector
            funds={funds}
            selectedFundId={fundId}
            onChange={(id) => {
              setFundId(id);
              setPage(1);
            }}
          />
        )}

        {/* Search + sort */}
        <View style={{ gap: spacing.sm }}>
          <Input
            value={search}
            onChangeText={(t) => {
              setSearch(t);
              setPage(1);
            }}
            placeholder="Search by date, amount, notes…"
            rightSlot={<Search size={16} color={colors.mutedForeground} />}
          />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Select
              containerStyle={{ flex: 1 }}
              value={sortKey}
              onValueChange={(v) => toggleSort(v as SortKey)}
              options={sortOptions}
              label="Sort by"
            />
            <Select
              containerStyle={{ flex: 1 }}
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(v === "all" ? "all" : Number(v));
                setPage(1);
              }}
              options={[
                { value: "10", label: "10 per page" },
                { value: "20", label: "20 per page" },
                { value: "50", label: "50 per page" },
                { value: "all", label: "All entries" },
              ]}
              label="Per page"
            />
          </View>
        </View>

        {/* Ledger */}
        {loading && entries.length === 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={90} />
          </View>
        ) : entries.length === 0 ? (
          <Card padded>
            <EmptyState
              title="No SIP entries recorded yet"
              description='Tap "Add Entry" or "Import CSV" to populate your history.'
            />
          </Card>
        ) : paginated.length === 0 ? (
          <Card padded>
            <EmptyState title="No entries match your search" />
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {paginated.map((entry) => {
              const b = breakdowns.get(entry.id);
              const isOpen = expanded === entry.id;
              return (
                <Card key={entry.id}>
                  <Pressable
                    onPress={() => setExpanded(isOpen ? null : entry.id)}
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
                      <View style={{ flex: 1 }}>
                        <Text variant="label">{formatDate(entry.purchase_date)}</Text>
                        {funds.length > 1 && (
                          <Text variant="caption" color={colors.mutedForeground}>
                            {fundMap.get(entry.fund_id) || "—"}
                          </Text>
                        )}
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Pressable
                          hitSlop={8}
                          onPress={(e) => {
                            e.stopPropagation();
                            setEditing(entry);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil size={16} color={colors.mutedForeground} />
                        </Pressable>
                        <Pressable
                          hitSlop={8}
                          onPress={(e) => {
                            e.stopPropagation();
                            setDeleteId(entry.id);
                          }}
                        >
                          <Trash2 size={16} color={colors.rose} />
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
                      <MiniMetric label="Deposit" value={formatCurrency(Number(entry.amount))} />
                      <MiniMetric label="NAV" value={formatNav(Number(entry.nav))} />
                      <MiniMetric label="Units" value={formatUnits(Number(entry.units))} />
                      <MiniMetric
                        label="Rollover"
                        value={b ? formatCurrency(b.remainingRollover) : "—"}
                        color={colors.success}
                      />
                    </View>

                    {/* Expanded rollover breakdown */}
                    {isOpen && b && (
                      <View
                        style={{
                          backgroundColor: colors.muted,
                          borderRadius: radius.lg,
                          padding: spacing.md,
                          gap: 6,
                        }}
                      >
                        <BreakdownRow
                          label="Carried Rollover"
                          value={`+ ${formatCurrency(b.carriedRollover)}`}
                          color={colors.blue}
                        />
                        <BreakdownRow
                          label="Total Available"
                          value={formatCurrency(b.totalAvailable)}
                        />
                        <BreakdownRow
                          label="Net Cash for Units"
                          value={formatCurrency(b.netCash)}
                        />
                        <BreakdownRow
                          label="Unit Cost"
                          value={formatCurrency(b.unitCost)}
                        />
                        <BreakdownRow
                          label="Ending Rollover"
                          value={formatCurrency(b.remainingRollover)}
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
              );
            })}
          </View>
        )}

        {/* Pagination footer */}
        {totalEntries > 0 && (
          <View style={{ gap: spacing.md }}>
            <Text variant="caption" color={colors.mutedForeground} align="center">
              Showing {totalEntries > 0 ? startIndex + 1 : 0}–
              {Math.min(startIndex + effectivePageSize, totalEntries)} of{" "}
              {totalEntries} entries
            </Text>

            {pageSize !== "all" && totalPages > 1 && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: spacing.md,
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
                <Text variant="label" tabular>
                  {validPage} / {totalPages}
                </Text>
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
