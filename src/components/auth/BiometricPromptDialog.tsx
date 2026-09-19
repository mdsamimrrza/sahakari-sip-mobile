// ============================================================
// SahakariSIP — Post-login biometric offer
// ============================================================
// Mounted at the app root. After a successful explicit sign-in on a
// device that supports biometrics, this offers the banking-style
// fingerprint unlock once. "Not now" is remembered per account.
// ============================================================

import React, { useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { ConfirmDialog, useToast } from "@/components/ui/overlays";

export function BiometricPromptDialog() {
  const { offerBiometric, dismissBiometricOffer, enableBiometric } = useAuth();
  const { toast } = useToast();
  const [enabling, setEnabling] = useState(false);

  if (!offerBiometric) return null;

  async function handleEnable() {
    setEnabling(true);
    const res = await enableBiometric();
    setEnabling(false);
    if (res.success) {
      toast({
        title: "Fingerprint unlock enabled",
        description: "Next time you log out, just use your fingerprint.",
        variant: "success",
      });
      dismissBiometricOffer(false);
    } else if (res.error && res.error !== "Not verified.") {
      toast({
        title: "Could not enable",
        description: res.error,
        variant: "destructive",
      });
      dismissBiometricOffer(false);
    }
    // "Not verified." → the user cancelled the OS prompt; keep the offer up.
  }

  return (
    <ConfirmDialog
      visible
      onClose={() => dismissBiometricOffer(true)}
      onConfirm={handleEnable}
      title="Use fingerprint to unlock?"
      description="Next time you log out, you can unlock the app with your fingerprint instead of typing your password. Your fingerprint stays on this device and is never sent anywhere."
      confirmLabel="Enable"
      loading={enabling}
    />
  );
}
