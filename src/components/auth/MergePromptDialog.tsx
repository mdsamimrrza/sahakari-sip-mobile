// ============================================================
// SahakariSIP — One-time local → cloud merge prompt
// ============================================================
// Mounted once at the app root. When AuthContext detects a cloud
// session on a device that holds local data, this offers the merge
// BEFORE anything happens — merging is opt-in, never silent.
// ============================================================

import React, { useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { ConfirmDialog, useToast } from "@/components/ui/overlays";
import type { MergeResult } from "@/lib/data/merge";

function resultMessage(counts: MergeResult | undefined): string {
  if (!counts) return "Your cloud account is up to date.";
  const parts: string[] = [];
  if (counts.fundsAdded) {
    parts.push(`${counts.fundsAdded} fund${counts.fundsAdded === 1 ? "" : "s"} added`);
  }
  if (counts.entriesImported) {
    parts.push(`${counts.entriesImported} entries moved`);
  }
  if (counts.duplicatesSkipped) {
    parts.push(`${counts.duplicatesSkipped} duplicate${counts.duplicatesSkipped === 1 ? "" : "s"} skipped`);
  }
  return parts.length
    ? parts.join(", ").replace(/,([^,]*)$/, " and$1") + "."
    : "Nothing new to move — your account already has everything.";
}

export function MergePromptDialog() {
  const { pendingMerge, confirmMerge, dismissMerge } = useAuth();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  if (!pendingMerge) return null;

  async function handleConfirm() {
    setRunning(true);
    const res = await confirmMerge();
    setRunning(false);
    if (res.success) {
      toast({
        title: "Data merged",
        description: resultMessage(res.counts),
        variant: "success",
      });
    } else {
      toast({
        title: "Merge failed",
        description:
          res.error ??
          "Your data is safe on this phone. You can merge again next time you sign in.",
        variant: "destructive",
      });
    }
  }

  return (
    <ConfirmDialog
      visible
      onClose={dismissMerge}
      onConfirm={handleConfirm}
      title="Merge your data?"
      description={`We found ${pendingMerge.localEntries} SIP entries on this phone and ${pendingMerge.cloudEntries} in your cloud account. Merging combines both — your dashboard totals may change. A backup is saved first and nothing is deleted.`}
      confirmLabel="Merge"
      loading={running}
    />
  );
}
