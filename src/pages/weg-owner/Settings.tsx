import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Building2, Plus, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface WegOwnerBuilding {
  id: string;
  building_id: string;
  created_at: string;
}

export const WegOwnerSettings = () => {
  const { profile, updatePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [newBuildingId, setNewBuildingId] = useState("");
  const [buildings, setBuildings] = useState<WegOwnerBuilding[]>([]);
  const [availableBuildings, setAvailableBuildings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (profile?.user_id) {
      fetchBuildingAssignments();
      fetchAvailableBuildings();
    }
  }, [profile?.user_id]);

  const fetchBuildingAssignments = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("weg_owner_buildings")
        .select(`
          *,
          buildings:building_id (
            id,
            name,
            address
          )
        `)
        .eq("user_id", profile?.user_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBuildings(data || []);
    } catch (error: any) {
      console.error("Error fetching building assignments:", error);
      toast({
        title: "Fehler",
        description: "Gebäude-Zuordnungen konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAvailableBuildings = async () => {
    try {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address")
        .eq("management_mode", "weg")
        .order("name");

      if (error) throw error;
      setAvailableBuildings(data || []);
    } catch (error: any) {
      console.error("Error fetching available buildings:", error);
    }
  };

  const addBuildingAssignment = async () => {
    if (!newBuildingId) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie ein Gebäude aus.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("weg_owner_buildings")
        .insert([{
          user_id: profile?.user_id,
          building_id: newBuildingId
        }])
        .select(`
          *,
          buildings:building_id (
            id,
            name,
            address
          )
        `)
        .single();

      if (error) throw error;

      setBuildings(prev => [data, ...prev]);
      setNewBuildingId("");
      
      toast({
        title: "Erfolg",
        description: "Gebäude wurde erfolgreich hinzugefügt.",
      });
    } catch (error: any) {
      console.error("Error adding building assignment:", error);
      if (error.code === '23505') {
        toast({
          title: "Fehler",
          description: "Dieses Gebäude ist bereits in Ihrer Liste.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Fehler",
          description: "Gebäude konnte nicht hinzugefügt werden.",
          variant: "destructive",
        });
      }
    }
  };

  const removeBuildingAssignment = async (buildingAssignmentId: string) => {
    try {
      const { error } = await supabase
        .from("weg_owner_buildings")
        .delete()
        .eq("id", buildingAssignmentId);

      if (error) throw error;

      setBuildings(prev => prev.filter(b => b.id !== buildingAssignmentId));
      
      toast({
        title: "Erfolg",
        description: "Gebäude-ID wurde erfolgreich entfernt.",
      });
    } catch (error: any) {
      console.error("Error removing building assignment:", error);
      toast({
        title: "Fehler",
        description: "Gebäude-ID konnte nicht entfernt werden.",
        variant: "destructive",
      });
    }
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
        <p className="text-muted-foreground">Verwalten Sie Ihre Kontodaten und Gebäude-Zuordnungen</p>
      </div>

      {/* Building Assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Gebäude-Verwaltung
          </CardTitle>
          <CardDescription>
            Verwalten Sie Ihre Gebäude-IDs für den KI-Chatbot. Diese IDs erhalten Sie von Ihrem Administrator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add New Building */}
          <div className="flex gap-2">
            <Select value={newBuildingId} onValueChange={setNewBuildingId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Gebäude auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {availableBuildings
                  .filter(building => !buildings.some(b => b.building_id === building.id))
                  .map((building) => (
                    <SelectItem key={building.id} value={building.id}>
                      {building.name} - {building.address}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button onClick={addBuildingAssignment} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Hinzufügen
            </Button>
          </div>

          {/* Building List */}
          {isLoading ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground">Laden...</p>
            </div>
          ) : buildings.length === 0 ? (
            <div className="text-center py-8 border border-dashed rounded-lg">
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Noch keine Gebäude zugeordnet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Fügen Sie Ihr erstes Gebäude hinzu, um den KI-Chatbot nutzen zu können.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {buildings.map((building) => (
                <div key={building.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="font-medium">{(building as any).buildings?.name || 'Unbekanntes Gebäude'}</span>
                      <span className="text-sm text-muted-foreground">{(building as any).buildings?.address}</span>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Gebäude-ID entfernen</AlertDialogTitle>
                        <AlertDialogDescription>
                          Möchten Sie das Gebäude "{(building as any).buildings?.name}" wirklich aus Ihrer Liste entfernen?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => removeBuildingAssignment(building.id)}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          Entfernen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Password Change */}
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

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Profil-Informationen</CardTitle>
          <CardDescription>
            Ihre aktuellen Kontodaten. Änderungen können nur durch den Administrator vorgenommen werden.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vorname</Label>
              <Input value={profile?.first_name || "Nicht gesetzt"} disabled />
            </div>
            <div className="space-y-2">
              <Label>Nachname</Label>
              <Input value={profile?.last_name || "Nicht gesetzt"} disabled />
            </div>
            <div className="space-y-2">
              <Label>E-Mail</Label>
              <Input value={profile?.email || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input value={(profile as any)?.phone || "Nicht gesetzt"} disabled />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Für Änderungen an Ihren Profildaten wenden Sie sich bitte an Ihren Administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};