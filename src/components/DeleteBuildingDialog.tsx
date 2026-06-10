import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Trash2, ShieldAlert, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DeleteBuildingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  buildingId: string;
  buildingName: string;
  buildingCode?: string;
  onDelete: () => void;
}

export const DeleteBuildingDialog = ({
  isOpen,
  onClose,
  buildingId,
  buildingName,
  buildingCode,
  onDelete,
}: DeleteBuildingDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [nameInput, setNameInput] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setNameInput("");
      setPassword("");
      supabase.auth.getUser().then(({ data }) => {
        setUserEmail(data.user?.email ?? null);
      });
    }
  }, [isOpen]);

  const nameMatches = nameInput.trim() === buildingName.trim() && nameInput.length > 0;

  const handleClose = () => {
    if (isLoading) return;
    onClose();
  };

  const handleDelete = async () => {
    if (!userEmail) {
      toast.error("Kein angemeldeter Nutzer gefunden.");
      return;
    }
    if (!password) {
      toast.error("Bitte Passwort eingeben.");
      return;
    }
    setIsLoading(true);
    try {
      // Re-authentication
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password,
      });
      if (authError) {
        toast.error("Passwort falsch. Löschung abgebrochen.");
        setIsLoading(false);
        return;
      }

      // 1. forum posts
      const { error: forumError } = await supabase.from("forum_posts").delete().eq("building_id", buildingId);
      if (forumError) throw forumError;

      // 2. weg reports
      const { error: wegReportsError } = await supabase.from("weg_reports").delete().eq("building_id", buildingId);
      if (wegReportsError) throw wegReportsError;

      // 3. miete reports
      const { error: mieteReportsError } = await supabase.from("miete_reports").delete().eq("building_id", buildingId);
      if (mieteReportsError) throw mieteReportsError;

      // 4. building managers
      const { error: managersError } = await supabase.from("building_managers").delete().eq("building_id", buildingId);
      if (managersError) throw managersError;

      // 5. tenants
      const { error: tenantsError } = await supabase.from("tenants").delete().eq("building_id", buildingId);
      if (tenantsError) throw tenantsError;

      // 6. weg owner buildings
      const { error: wegOwnersError } = await supabase
        .from("weg_owner_buildings")
        .delete()
        .eq("building_id", buildingId);
      if (wegOwnersError) throw wegOwnersError;

      // 7. profiles
      const { error: profilesError } = await supabase
        .from("profiles")
        .update({ building_id: null })
        .eq("building_id", buildingId);
      if (profilesError) throw profilesError;

      // 8. building
      const { error: buildingError } = await supabase.from("buildings").delete().eq("id", buildingId);
      if (buildingError) throw buildingError;

      toast.success("Gebäude und alle zugehörigen Daten erfolgreich gelöscht");
      onDelete();
      onClose();
    } catch (error: any) {
      console.error("Error deleting building:", error);
      toast.error("Fehler beim Löschen des Gebäudes: " + (error?.message || "Unbekannter Fehler"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Gebäude löschen — Schritt {step} von 2
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Achtung:</strong> Diese Aktion kann nicht rückgängig gemacht werden.
              Alle zugehörigen Daten (Nutzer, Meldungen, Forum-Beiträge, etc.) werden ebenfalls gelöscht.
            </AlertDescription>
          </Alert>

          <div className="bg-muted p-3 rounded-lg">
            <p className="font-semibold">{buildingName}</p>
            {buildingCode && <p className="text-sm text-muted-foreground">Code: {buildingCode}</p>}
          </div>

          {step === 1 && (
            <div className="space-y-2">
              <Label htmlFor="confirm-name">
                Zur Bestätigung tippen Sie bitte den exakten Gebäudenamen ein:
              </Label>
              <Input
                id="confirm-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={buildingName}
                autoComplete="off"
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive" />
                Bitte bestätigen Sie mit Ihrem Konto-Passwort
              </Label>
              {userEmail && (
                <p className="text-xs text-muted-foreground">Angemeldet als: {userEmail}</p>
              )}
              <Input
                id="confirm-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort"
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && password && !isLoading) handleDelete();
                }}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                Abbrechen
              </Button>
              <Button
                variant="destructive"
                disabled={!nameMatches}
                onClick={() => setStep(2)}
              >
                Weiter
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={isLoading}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isLoading || !password}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {isLoading ? "Lösche..." : "Unwiderruflich löschen"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
