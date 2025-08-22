import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CreateUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  buildingId: string;
  userType: "tenant" | "weg_owner";
  onUserCreated?: () => void;
}

export const CreateUserDialog = ({ isOpen, onClose, buildingId, userType, onUserCreated }: CreateUserDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    role: userType === "tenant" ? "tenant" : "weg_owner"
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Call the admin-create-user function
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: formData.email,
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone: formData.phone,
          building_id: buildingId,
          management_mode: userType === "tenant" ? "rent" : "weg"
        }
      });

      if (error) throw error;

      toast.success(`${userType === "tenant" ? "Mieter" : "WEG-Eigentümer"} erfolgreich erstellt`);
      onClose();
      setFormData({ email: "", first_name: "", last_name: "", phone: "", role: userType === "tenant" ? "tenant" : "weg_owner" });
      onUserCreated?.();
    } catch (error: any) {
      console.error("Error creating user:", error);
      
      // Extract error message from the response
      let errorMessage = `Fehler beim Erstellen des ${userType === "tenant" ? "Mieters" : "WEG-Eigentümers"}`;
      
      // Check if this is a Supabase function error with data
      if (error?.message?.includes('Edge Function returned a non-2xx status code')) {
        // The actual error should be in the context or we need to handle it differently
        errorMessage = "Ein Benutzer mit dieser E-Mail-Adresse existiert bereits";
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {userType === "tenant" ? "Neuen Mieter hinzufügen" : "Neuen WEG-Eigentümer hinzufügen"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="first_name">Vorname</Label>
            <Input
              id="first_name"
              value={formData.first_name}
              onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="last_name">Nachname</Label>
            <Input
              id="last_name"
              value={formData.last_name}
              onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="phone">Telefon</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            />
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Erstelle..." : "Erstellen"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};