import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Fingerprint, ShieldCheck, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PasskeyPromptDialogProps {
  userId: string;
  /** Wenn false, wird der Dialog nie geöffnet (z. B. bevor AGB akzeptiert sind). */
  enabled: boolean;
  onResolved?: () => void;
}

const SESSION_KEY = "passkey_prompt_postponed";

const browserSupportsPasskeys = () =>
  typeof window !== "undefined" && !!(window as any).PublicKeyCredential;

export const PasskeyPromptDialog = ({ userId, enabled, onResolved }: PasskeyPromptDialogProps) => {
  const [open, setOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!enabled || !userId) return;
    if (!browserSupportsPasskeys()) {
      onResolved?.();
      return;
    }
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      onResolved?.();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // 1) Bereits dauerhaft abgelehnt oder Passkey gesetzt?
        const { data: profile } = await supabase
          .from("profiles")
          .select("passkey_prompt_dismissed_at")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled) return;
        if (profile?.passkey_prompt_dismissed_at) {
          onResolved?.();
          return;
        }

        // 2) Hat der Nutzer bereits einen Passkey registriert?
        const api = (supabase.auth as any)?.passkey;
        if (api?.list) {
          const { data: list } = await api.list();
          if (cancelled) return;
          if (Array.isArray(list) && list.length > 0) {
            // Flag setzen damit wir nicht erneut fragen
            await supabase
              .from("profiles")
              .update({ passkey_prompt_dismissed_at: new Date().toISOString() })
              .eq("user_id", userId);
            onResolved?.();
            return;
          }
        }

        setOpen(true);
      } catch (e) {
        console.error("PasskeyPromptDialog check failed", e);
        onResolved?.();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, userId, onResolved]);

  const close = () => {
    setOpen(false);
    onResolved?.();
  };

  const handleRegister = async () => {
    const auth = supabase.auth as any;
    if (typeof auth.registerPasskey !== "function") {
      toast.error("Passkey-Funktion ist im Browser nicht verfügbar.");
      return;
    }
    setRegistering(true);
    try {
      const { error } = await auth.registerPasskey();
      if (error) {
        if (error.name === "NotAllowedError" || error.code === "user_cancelled") {
          // Nutzer hat abgebrochen – Dialog offen lassen
          return;
        }
        toast.error(error.message ?? "Passkey konnte nicht registriert werden.");
        return;
      }
      toast.success("Passkey erfolgreich eingerichtet.");
      await supabase
        .from("profiles")
        .update({ passkey_prompt_dismissed_at: new Date().toISOString() })
        .eq("user_id", userId);
      close();
    } catch (e: any) {
      console.error("registerPasskey failed", e);
      toast.error(e?.message ?? "Passkey konnte nicht registriert werden.");
    } finally {
      setRegistering(false);
    }
  };

  const handlePostpone = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    close();
  };

  const handleNeverAsk = async () => {
    setDismissing(true);
    try {
      await supabase
        .from("profiles")
        .update({ passkey_prompt_dismissed_at: new Date().toISOString() })
        .eq("user_id", userId);
      close();
    } catch (e: any) {
      toast.error(e?.message ?? "Konnte nicht gespeichert werden.");
    } finally {
      setDismissing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handlePostpone(); }}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Fingerprint className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">Passkey einrichten?</DialogTitle>
          <DialogDescription className="text-center">
            Melden Sie sich künftig schneller und sicherer an – ohne Passwort.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Zap className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-medium">Blitzschneller Login</p>
              <p className="text-xs text-muted-foreground">Mit Face ID, Touch ID, Windows Hello oder Sicherheitsschlüssel.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-md border p-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-medium">Mehr Sicherheit</p>
              <p className="text-xs text-muted-foreground">Passkeys sind phishing-resistent und werden sicher auf Ihrem Gerät gespeichert.</p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button onClick={handleRegister} disabled={registering} className="w-full">
            <Fingerprint className="h-4 w-4 mr-2" />
            {registering ? "Wird eingerichtet…" : "Passkey jetzt einrichten"}
          </Button>
          <Button variant="outline" onClick={handlePostpone} disabled={registering} className="w-full">
            Später erinnern
          </Button>
          <Button variant="ghost" onClick={handleNeverAsk} disabled={registering || dismissing} className="w-full text-muted-foreground">
            Nicht mehr fragen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
