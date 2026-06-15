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
import { Mail, Info } from "lucide-react";
import { PasskeysSection } from "@/components/settings/PasskeysSection";
import { useAutoStartPageTour } from "@/components/weg-owner/onboarding/GuidedTourProvider";

export const WegOwnerSettings = () => {
  useAutoStartPageTour("settings");
  const { profile, updatePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [legalSheetOpen, setLegalSheetOpen] = useState(false);
  const [legalSheetTab, setLegalSheetTab] = useState<"agb" | "datenschutz">("agb");

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
 
     if (newPassword.length < 6) {
       toast({
         title: "Fehler",
         description: "Das neue Passwort muss mindestens 6 Zeichen lang sein.",
         variant: "destructive",
       });
       return;
     }
 
     setIsUpdatingPassword(true);
     try {
       await updatePassword(newPassword);
       setCurrentPassword("");
       setNewPassword("");
       setConfirmPassword("");
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
 
   return (
     <div className="max-w-4xl mx-auto space-y-6 p-4">
       <div className="mb-6">
         <h1 className="text-2xl font-bold text-foreground">Einstellungen</h1>
         <p className="text-muted-foreground">Verwalten Sie Ihre Kontodaten und Wohnungen</p>
       </div>
       <OwnerSelfServiceSection />

       <div className="space-y-1 mt-8">
         <h2 className="text-lg font-semibold">Login & Sicherheit</h2>
         <p className="text-sm text-muted-foreground">
           Diese drei Punkte steuern, wie Sie sich anmelden: Die E-Mail-Adresse ist Ihr Benutzername, das Passwort schützt Ihren Account und Passkeys ermöglichen eine bequeme, passwortlose Anmeldung per Fingerabdruck, Face ID oder Sicherheitsschlüssel.
         </p>
       </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" /> Login-E-Mail
          </CardTitle>
          <CardDescription>
            Diese E-Mail-Adresse verwenden Sie für die Anmeldung und für „Passwort vergessen".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentLoginEmail && !currentLoginEmail.toLowerCase().endsWith("@users.rgi-immobilien.app") ? (
            <div className="space-y-2">
              <Label className="text-xs">Aktuelle Login-E-Mail</Label>
              <Input value={currentLoginEmail} disabled />
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 bg-muted/50 border border-muted rounded-md text-xs text-muted-foreground">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Aktuell ist <b>keine persönliche E-Mail-Adresse</b> hinterlegt. Sie melden sich nur mit Ihrem Benutzernamen an.
                Hinterlegen Sie hier eine E-Mail-Adresse, damit Sie sich künftig auch per E-Mail anmelden und „Passwort vergessen" nutzen können.
              </span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-email" className="text-xs">Neue Login-E-Mail</Label>
            <Input
              id="new-email"
              type="email"
              placeholder="neue@email.de"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <div className="flex items-start gap-2 p-3 bg-muted/50 border border-muted rounded-md text-xs text-muted-foreground">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Nach dem Ändern erhalten Sie eine Bestätigungs-E-Mail an die <b>neue</b> Adresse.
              Der Login funktioniert weiterhin mit der alten E-Mail, bis Sie den Link in der Bestätigungs-E-Mail anklicken.
            </span>
          </div>
          <Button onClick={handleEmailChange} disabled={isUpdatingEmail} className="w-full">
            {isUpdatingEmail
              ? "Wird gespeichert..."
              : currentLoginEmail && !currentLoginEmail.toLowerCase().endsWith("@users.rgi-immobilien.app")
                ? "Login-E-Mail ändern"
                : "Login-E-Mail hinterlegen"}
          </Button>
        </CardContent>
      </Card>

       <Card>
         <CardHeader>
           <CardTitle>Passwort ändern</CardTitle>
           <CardDescription>
             Ändern Sie Ihr Anmeldepasswort für mehr Sicherheit.
           </CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
           <div className="space-y-2">
             <Label htmlFor="current-password">Aktuelles Passwort</Label>
             <Input
               id="current-password"
               type="password"
               value={currentPassword}
               onChange={(e) => setCurrentPassword(e.target.value)}
             />
           </div>
           <div className="space-y-2">
             <Label htmlFor="new-password">Neues Passwort</Label>
             <Input
               id="new-password"
               type="password"
               value={newPassword}
               onChange={(e) => setNewPassword(e.target.value)}
             />
           </div>
           <div className="space-y-2">
             <Label htmlFor="confirm-password">Neues Passwort bestätigen</Label>
             <Input
               id="confirm-password"
               type="password"
               value={confirmPassword}
               onChange={(e) => setConfirmPassword(e.target.value)}
             />
           </div>
           <Button 
             onClick={handlePasswordChange} 
             disabled={isUpdatingPassword}
             className="w-full"
           >
             {isUpdatingPassword ? "Wird geändert..." : "Passwort ändern"}
           </Button>
         </CardContent>
       </Card>

       <PasskeysSection />
 
       <div className="flex justify-center gap-4 pt-4 pb-8">
         <button 
           onClick={() => openLegalSheet("agb")}
           className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
         >
           AGB
         </button>
         <span className="text-xs text-muted-foreground">|</span>
         <button 
           onClick={() => openLegalSheet("datenschutz")}
           className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
         >
           Datenschutz
         </button>
       </div>
 
       <LegalDocumentsSheet 
         open={legalSheetOpen} 
         onOpenChange={setLegalSheetOpen}
         defaultTab={legalSheetTab}
       />
     </div>
   );
 };