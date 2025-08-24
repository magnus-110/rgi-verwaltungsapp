import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Trash2 } from "lucide-react";
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
  onDelete 
}: DeleteBuildingDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from("buildings")
        .delete()
        .eq("id", buildingId);

      if (error) throw error;

      toast.success("Gebäude erfolgreich gelöscht");
      onDelete();
      onClose();
    } catch (error) {
      console.error("Error deleting building:", error);
      toast.error("Fehler beim Löschen des Gebäudes");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Gebäude löschen
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Achtung:</strong> Diese Aktion kann nicht rückgängig gemacht werden. 
              Alle zugehörigen Daten (Nutzer, Meldungen, Forum-Beiträge, etc.) werden ebenfalls gelöscht.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <p className="text-sm">
              Möchten Sie das folgende Gebäude wirklich unwiderruflich löschen?
            </p>
            <div className="bg-muted p-3 rounded-lg">
              <p className="font-semibold">{buildingName}</p>
              {buildingCode && (
                <p className="text-sm text-muted-foreground">Code: {buildingCode}</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Abbrechen
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleDelete} 
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {isLoading ? "Lösche..." : "Unwiderruflich löschen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};