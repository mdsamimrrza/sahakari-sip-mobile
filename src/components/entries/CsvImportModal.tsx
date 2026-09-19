// ============================================================
// SahakariSIP — CSV bulk import
// ============================================================
// Port of the web app's components/entries/csv-import-dialog.tsx.
//
// Accepts a CSV with headers date, amount, nav (+ optional units, notes).
// Every valid row is converted to whole units using the SEBON rule:
//   units = provided ?? floor(max(0, amount − 5) / nav)
// Invalid rows are skipped and reported, exactly like the web version.
// ============================================================

import React, { useState } from "react";
import { View, Pressable } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Upload, FileSpreadsheet, AlertTriangle, Check } from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { DP_CHARGE } from "@/lib/constants";
import { useTheme, radius, spacing } from "@/theme";
import { Text, Button, Card, Separator } from "@/components/ui/primitives";
import { Modal, Select, useToast } from "@/components/ui/overlays";
import type { FundConfig } from "@/lib/types";

interface ParsedRow {
  date: string;
  amount: number;
  nav: number;
  units?: number;
  notes?: string;
  isValid: boolean;
  error?: string;
}

const SAMPLE = `date,amount,nav
2024-01-15,5000,10.25
2024-02-15,5000,10.40
2024-03-15,5000,10.15`;

export function CsvImportModal({
  visible,
  onClose,
  funds,
  selectedFundId,
  onImported,
}: {
  visible: boolean;
  onClose: () => void;
  funds: FundConfig[];
  selectedFundId?: string;
  onImported?: () => void;
}) {
  const { colors } = useTheme();
  const { store } = useAuth();
  const { toast } = useToast();

  const [fundId, setFundId] = useState(
    selectedFundId || funds[0]?.id || ""
  );
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showSample, setShowSample] = useState(false);

  const validCount = rows.filter((r) => r.isValid).length;

  // Upper bound on a single import batch — keeps the parsed preview and the
  // store's bulk insert bounded no matter how large the picked file is.
  const MAX_IMPORT_ROWS = 2000;

  function parseCsv(text: string) {
    const lines = text
      .split(/\r\n|\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length <= 1) {
      toast({
        title: "Invalid CSV",
        description: "File contains no data rows.",
        variant: "destructive",
      });
      return;
    }

    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const dateIdx = header.findIndex((h) => h.includes("date"));
    const amountIdx = header.findIndex((h) => h.includes("amount"));
    const navIdx = header.findIndex((h) => h.includes("nav"));
    const unitsIdx = header.findIndex((h) => h.includes("unit"));
    const notesIdx = header.findIndex((h) => h.includes("note"));

    if (dateIdx === -1 || amountIdx === -1 || navIdx === -1) {
      toast({
        title: "Missing required columns",
        description: "CSV must include 'date', 'amount', and 'nav' headers.",
        variant: "destructive",
      });
      return;
    }

    const parsed: ParsedRow[] = [];
    const dataLines = lines.slice(1, MAX_IMPORT_ROWS + 1);
    const truncated = lines.length - 1 > MAX_IMPORT_ROWS;
    for (let i = 0; i < dataLines.length; i++) {
      const cols = dataLines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const dateStr = cols[dateIdx] || "";
      const amountNum = parseFloat(cols[amountIdx] || "0");
      const navNum = parseFloat(cols[navIdx] || "0");
      const unitsNum =
        unitsIdx !== -1 ? parseFloat(cols[unitsIdx] || "0") : undefined;
      const notesStr = notesIdx !== -1 ? cols[notesIdx] : "";

      let isValid = true;
      let error = "";

      if (isNaN(new Date(dateStr).getTime())) {
        isValid = false;
        error = "Invalid date";
      } else if (new Date(dateStr) > new Date()) {
        isValid = false;
        error = "Future date";
      } else if (isNaN(amountNum) || amountNum <= 0) {
        isValid = false;
        error = "Invalid amount";
      } else if (isNaN(navNum) || navNum <= 0) {
        isValid = false;
        error = "Invalid NAV";
      }

      parsed.push({
        date: dateStr,
        amount: amountNum,
        nav: navNum,
        units: unitsNum && unitsNum > 0 ? unitsNum : undefined,
        notes: notesStr,
        isValid,
        error,
      });
    }

    setRows(parsed);
    if (truncated) {
      toast({
        title: "File truncated",
        description: `Only the first ${MAX_IMPORT_ROWS} data rows will be imported.`,
      });
    }
  }

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/csv", "text/plain", "*/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setFileName(asset.name ?? "import.csv");

      const text = await FileSystem.readAsStringAsync(asset.uri);
      parseCsv(text);
    } catch (e) {
      toast({
        title: "Could not read the file",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  async function handleImport() {
    if (!store) return;
    const valid = rows.filter((r) => r.isValid);
    if (valid.length === 0) return;

    setProcessing(true);
    const res = await store.importEntriesFromCsv(
      fundId,
      valid.map((r) => ({
        date: r.date,
        amount: r.amount,
        nav: r.nav,
        units: r.units,
        notes: r.notes,
      }))
    );
    setProcessing(false);

    if (res.success && res.data) {
      toast({
        title: "Import completed 🎉",
        description: `Imported ${res.data.imported} entries.${
          res.data.skipped > 0 ? ` ${res.data.skipped} rows skipped.` : ""
        }`,
        variant: "success",
      });
      setRows([]);
      setFileName("");
      onImported?.();
      onClose();
    } else {
      toast({
        title: "Import failed",
        description: res.error || "Failed to process the import.",
        variant: "destructive",
      });
    }
  }

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Import SIP History from CSV"
      description="Required columns: date, amount, nav (optional: units, notes)."
      position="bottom"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            fullWidth
            size="lg"
            loading={processing}
            disabled={validCount === 0}
            onPress={handleImport}
          >
            {`Import${validCount > 0 ? ` ${validCount} Rows` : ""}`}
          </Button>
          <Button fullWidth variant="outline" onPress={onClose}>
            Cancel
          </Button>
        </View>
      }
    >
      <View style={{ gap: spacing.lg }}>
        {funds.length > 1 && (
          <Select
            label="Target Fund"
            value={fundId}
            onValueChange={setFundId}
            options={funds.map((f) => ({ value: f.id, label: f.fund_name }))}
          />
        )}

        <Pressable onPress={pickFile}>
          <Card
            style={{
              backgroundColor: `${colors.primary}0A`,
              padding: spacing.xl,
              alignItems: "center",
              gap: spacing.sm,
              borderStyle: "dashed",
              borderWidth: 1.5,
              borderColor: `${colors.primary}66`,
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${colors.primary}1F`,
              }}
            >
              <Upload size={24} color={colors.primary} />
            </View>
            <Text variant="label">Select CSV File</Text>
            <Text variant="caption" color={colors.mutedForeground} align="center">
              {fileName ? `Selected: ${fileName}` : "Tap to browse your device"}
            </Text>
          </Card>
        </Pressable>

        <Pressable onPress={() => setShowSample((v) => !v)}>
          <Text variant="caption" color={colors.primary} style={{ fontWeight: "700" }}>
            {showSample ? "Hide format example" : "Show format example"}
          </Text>
        </Pressable>

        {showSample && (
          <Card padded style={{ borderWidth: 0, backgroundColor: colors.muted }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${colors.primary}1F`,
                }}
              >
                <FileSpreadsheet size={15} color={colors.primary} />
              </View>
              <Text variant="caption" style={{ fontWeight: "700" }}>
                Expected CSV format
              </Text>
            </View>
            <Text
              variant="mono"
              color={colors.mutedForeground}
              style={{ marginTop: spacing.sm, fontSize: 11, lineHeight: 17 }}
            >
              {SAMPLE}
            </Text>
            <Text variant="caption" color={colors.mutedForeground} style={{ marginTop: spacing.sm }}>
              Units are auto-calculated as floor((amount − {DP_CHARGE}) / nav)
              unless a units column is supplied.
            </Text>
          </Card>
        )}

        {rows.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text variant="label">
              Preview — {validCount} valid of {rows.length} rows
            </Text>
            <View
              style={{
                borderRadius: radius.lg,
                overflow: "hidden",
                backgroundColor: colors.muted,
              }}
            >
              {rows.slice(0, 30).map((row, idx) => (
                <View key={idx}>
                  {idx > 0 && <Separator />}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: spacing.md,
                      gap: spacing.sm,
                      backgroundColor: row.isValid
                        ? "transparent"
                        : `${colors.destructive}14`,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: row.isValid
                            ? `${colors.success}1F`
                            : `${colors.destructive}1F`,
                        }}
                      >
                        {row.isValid ? (
                          <Check size={13} color={colors.success} strokeWidth={3} />
                        ) : (
                          <AlertTriangle size={13} color={colors.destructive} />
                        )}
                      </View>
                      <Text variant="caption">{row.date || "—"}</Text>
                    </View>
                    <Text variant="caption" color={colors.mutedForeground} tabular>
                      {isNaN(row.amount) ? "—" : row.amount} @{" "}
                      {isNaN(row.nav) ? "—" : row.nav}
                    </Text>
                    {!row.isValid ? (
                      <Text variant="caption" color={colors.destructive}>
                        {row.error}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
            {rows.length > 30 && (
              <Text variant="caption" color={colors.mutedForeground}>
                Showing the first 30 of {rows.length} rows.
              </Text>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}
