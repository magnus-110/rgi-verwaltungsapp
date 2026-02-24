import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface User {
  id: string;
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role?: string;
  building_id?: string;
}

interface EditUserDialogProps {
  user: User | null;
  userType: 'tenants' | 'weg_owners' | 'profiles';
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const EditUserDialog = ({
  user,
  userType,
  isOpen,
  onClose,
  onUpdate,
}: EditUserDialogProps) => {
  const [formData, setFormData] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    role: "tenant" as "admin" | "weg_owner" | "tenant"
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || "",
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        phone: user.phone || "",
        role: (user.role as "admin" | "weg_owner" | "tenant") || "tenant"
      });
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const emailChanged = formData.email !== user.email;

      // Update auth email via edge function if changed
      if (emailChanged) {
        const { error: authEmailError } = await supabase.functions.invoke("admin-update-email", {
          body: { userId: user.user_id, newEmail: formData.email },
        });
        if (authEmailError) throw authEmailError;
      }

      // Update the specific user table
      if (userType === 'tenants') {
        const { error } = await supabase
          .from("tenants")
          .update({
            email: formData.email,
            first_name: formData.first_name,
            last_name: formData.last_name,
            phone: formData.phone,
            updated_at: new Date().toISOString()
          })
          .eq("user_id", user.user_id);

        if (error) throw error;
      } else if (userType === 'weg_owners') {
        const { error } = await supabase
          .from("weg_owners")
          .update({
            email: formData.email,
            first_name: formData.first_name,
            last_name: formData.last_name,
            phone: formData.phone,
            updated_at: new Date().toISOString()
          })
          .eq("user_id", user.user_id);

        if (error) throw error;
      }

      // Always update profiles table
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          email: formData.email,
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone: formData.phone,
          ...(userType === 'profiles' ? { role: formData.role } : {}),
          updated_at: new Date().toISOString()
        })
        .eq("user_id", user.user_id);

      if (profileError) throw profileError;

      toast.success("Benutzer erfolgreich aktualisiert");
      onUpdate();
      onClose();
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast.error("Fehler beim Aktualisieren: " + (error.message || "Unbekannter Fehler"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Benutzer bearbeiten</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="first_name">Vorname</Label>
            <Input
              id="first_name"
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Nachname</Label>
            <Input
              id="last_name"
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefon</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
          {userType === 'profiles' && (
            <div className="space-y-2">
              <Label htmlFor="role">Rolle</Label>
              <Select value={formData.role} onValueChange={(value: "admin" | "weg_owner" | "tenant") => setFormData({ ...formData, role: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant">Mieter</SelectItem>
                  <SelectItem value="weg_owner">WEG-Eigentümer</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Speichern..." : "Speichern"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};