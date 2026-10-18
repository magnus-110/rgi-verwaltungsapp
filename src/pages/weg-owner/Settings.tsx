 import { useState, useEffect } from "react";
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { LegalDocumentsSheet } from "@/components/LegalDocumentsSheet";
import { OwnerSelfServiceSection } from "@/components/owner/OwnerSelfServiceSection";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Info, HelpCircle, Lock, Fingerprint, LogOut } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PortalAbschnitt, PortalSeitenkopf, PortalZeile } from "@/components/weg-owner/PortalListe";
import { Switch } from "@/components/ui/switch";
import { PasskeysSection } from "@/components/settings/PasskeysSection";
import { useGuidedTour } from "@/components/weg-owner/onboarding/GuidedTourProvider";


export const WegOwnerSettings = () => {
  const { profile, updatePassword, signOut } = useAuth();
  const [offen, setOffen] = useState<"email" | "passwort" | "passkey" | null>(null);
  const { isDisabled, enableTours, disableTours } = useGuidedTour();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [legalSheetOpen, setLegalSheetOpen] = useState(false);
  const [legalSheetTab, setLegalSheetTab] = useState<"agb" | "datenschutz">("agb");

  // Name
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  useEffect(() => {
    setFirstName(profile?.first_name ?? "");
    setLastName(profile?.last_name ?? "");
  }, [profile?.first_name, profile?.last_name]);

  const handleNameSave = async () => {
    if (!profile?.user_id) return;
    setIsUpdatingName(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ first_name: firstName.trim() || null, last_name: lastName.trim() || null })
        .eq("user_id", profile.user_id);
      if (error) throw error;
      toast({ title: "Gespeichert", description: "Ihr Name wurde aktualisiert." });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Name konnte nicht gespeichert werden.", variant: "destructive" });
    } finally {
      setIsUpdatingName(false);
    }
  };


  // Login email change
  const [currentLoginEmail, setCurrentLoginEmail] = useState<string>("");
  const [newEmail, setNewEmail] = useState("");
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentLoginEmail(data.user?.email ?? "");
    });
  }, []);

  const handleEmailChange = async () => {
    const trimmed = newEmail.trim();
    if (!trimmed) {
      toast({ title: "Fehler", description: "Bitte geben Sie eine neue E-Mail-Adresse ein.", variant: "destructive" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "Fehler", description: "Bitte geben Sie eine gültige E-Mail-Adresse ein.", variant: "destructive" });
      return;
    }
    if (trimmed.toLowerCase() === currentLoginEmail.toLowerCase()) {
      toast({ title: "Hinweis", description: "Das ist bereits Ihre aktuelle Login-E-Mail.", variant: "destructive" });
      return;
    }
    setIsUpdatingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-email-change", {
        body: { new_email: trimmed },
      });
      if (error) {
        // Try to read error body
        const ctx = (error as any)?.context;
        let msg = error.message || "E-Mail konnte nicht geändert werden.";
        try {
          const text = ctx ? await ctx.text?.() : "";
          const parsed = text ? JSON.parse(text) : null;
          if (parsed?.error) msg = parsed.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      toast({
        title: "Bestätigungs-E-Mail versendet",
        description: `Wir haben eine Bestätigungs-E-Mail an ${trimmed} gesendet. Klicken Sie dort auf den Link, um die Änderung abzuschließen. Der Link ist 24 Stunden gültig.`,
      });
      setNewEmail("");
      setOffen(null);
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "E-Mail konnte nicht geändert werden.", variant: "destructive" });
    } finally {
      setIsUpdatingEmail(false);
    }
  };
  const openLegalSheet = (tab: "agb" | "datenschutz") => {
    setLegalSheetTab(tab);
    setLegalSheetOpen(true);
  };

  const handlePasswordChange = async () => {
     if (!currentPassword || !newPassword || !confirmPassword) {
       toast({
         title: "Fehler",
         description: "Bitte füllen Sie alle Felder aus.",
         variant: "destructive",
       });
       return;
     }
 
     if (newPassword !== confirmPassword) {
       toast({
         title: "Fehler",
         description: "Die neuen Passwörter stimmen nicht überein.",
         variant: "destructive",
       });
       return;
     }
 
     if (newPassword.length < 8) {
       toast({
         title: "Fehler",
         description: "Das neue Passwort muss mindestens 8 Zeichen lang sein.",
         variant: "destructive",
       });
       return;
     }
 
     setIsUpdatingPassword(true);
     try {
       const { error } = await updatePassword(newPassword, currentPassword);
       if (error) return;

       setCurrentPassword("");
       setNewPassword("");
       setConfirmPassword("");
       setOffen(null);
       toast({
         title: "Erfolg",
         description: "Passwort wurde erfolgreich geändert.",
       });
     } catch (error: any) {
       toast({
         title: "Fehler",
         description: error.message || "Passwort konnte nicht geändert werden.",
         variant: "destructive",
       });
     } finally {
       setIsUpdatingPassword(false);
     }
   };
 
  const hatEchteMail = !!currentLoginEmail && !currentLoginEmail.toLowerCase().endsWith("@users.rgi-immobilien.app");
  const initialen = [profile?.first_name?.[0], profile?.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl md:max-w-2xl mx-auto px-4 py-5 space-y-5">
        <PortalSeitenkopf titel="Einstellungen" />

        <section className="bg-card rounded-[14px] border border-border/60 shadow-sm p-4 flex items-center gap-3.5">
          <span className="h-[52px] w-[52px] rounded-full bg-primary/10 text-[#B35500] flex items-center justify-center text-lg font-bold shrink-0">{initialen}</span>
          <div className="min-w-0">
            <div className="font-display text-[17px] font-semibold text-foreground truncate">
              {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Ihr Konto"}
            </div>
            <div className="text-[13px] text-muted-foreground truncate">
              {hatEchteMail ? `Anmeldung mit ${currentLoginEmail}` : "Anmeldung mit Benutzernamen"}
            </div>
          </div>
        </section>

        <OwnerSelfServiceSection />

        <PortalAbschnitt titel="Anmeldung und Sicherheit">
          <PortalZeile
            data-tour="settings-login-email"
            icon={Mail}
            titel="E-Mail für die Anmeldung"
            untertitel={hatEchteMail ? currentLoginEmail : "Noch keine E-Mail hinterlegt"}
            onClick={() => setOffen("email")}
          />
          <PortalZeile data-tour="settings-password" icon={Lock} titel="Passwort ändern" onClick={() => setOffen("passwort")} />
          <PortalZeile data-tour="settings-passkeys" icon={Fingerprint} titel="Mit Fingerabdruck oder Gesicht anmelden" untertitel="Passkeys einrichten" onClick={() => setOffen("passkey")} />
        </PortalAbschnitt>

        <PortalAbschnitt titel="Hilfe">
          <PortalZeile
            icon={HelpCircle}
            titel="Hilfe-Knopf und Rundgänge"
            untertitel="Kurze Erklärungen auf jeder Seite"
            rechts={
              <Switch
                aria-label="Hilfe-Knopf und Rundgänge anzeigen"
                checked={!isDisabled()}
                onCheckedChange={(checked) => (checked ? enableTours() : disableTours())}
              />
            }
          />
        </PortalAbschnitt>

        <PortalAbschnitt>
          <PortalZeile icon={LogOut} titel="Abmelden" gefahr pfeil={false} onClick={() => signOut()} />
        </PortalAbschnitt>

        <div className="flex justify-center gap-4 pt-1 pb-4">
          <button onClick={() => openLegalSheet("agb")} className="text-xs text-muted-foreground hover:text-foreground hover:underline min-h-[44px]">AGB</button>
          <span className="text-xs text-muted-foreground self-center">|</span>
          <button onClick={() => openLegalSheet("datenschutz")} className="text-xs text-muted-foreground hover:text-foreground hover:underline min-h-[44px]">Datenschutz</button>
        </div>
      </div>

      <Dialog open={offen === "email"} onOpenChange={(o) => !o && setOffen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>E-Mail für die Anmeldung</DialogTitle>
            <DialogDescription>Mit dieser Adresse melden Sie sich an und können „Passwort vergessen“ nutzen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {hatEchteMail && (
              <div className="space-y-1.5">
                <Label className="text-xs">Aktuell</Label>
                <Input value={currentLoginEmail} disabled />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="new-email" className="text-xs">Neue E-Mail-Adresse</Label>
              <Input id="new-email" type="email" placeholder="neue@email.de" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              Sie bekommen eine Bestätigung an die neue Adresse. Bis Sie den Link darin anklicken, gilt weiter die alte.
            </p>
            <Button onClick={handleEmailChange} disabled={isUpdatingEmail} className="w-full h-11">
              {isUpdatingEmail ? "Wird gespeichert…" : hatEchteMail ? "E-Mail ändern" : "E-Mail hinterlegen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={offen === "passwort"} onOpenChange={(o) => !o && setOffen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Passwort ändern</DialogTitle>
            <DialogDescription>Mindestens 8 Zeichen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Aktuelles Passwort</Label>
              <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Neues Passwort</Label>
              <Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Neues Passwort wiederholen</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <Button onClick={handlePasswordChange} disabled={isUpdatingPassword} className="w-full h-11">
              {isUpdatingPassword ? "Wird geändert…" : "Passwort ändern"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={offen === "passkey"} onOpenChange={(o) => !o && setOffen(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <PasskeysSection />
        </DialogContent>
      </Dialog>

      <LegalDocumentsSheet open={legalSheetOpen} onOpenChange={setLegalSheetOpen} defaultTab={legalSheetTab} />
    </div>
  );
};
