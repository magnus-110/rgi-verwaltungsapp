import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useManagementMode } from "@/hooks/useManagementMode";
import { BulkUpload } from "@/components/BulkUpload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Users, Building2, Home, Edit, Trash2, User } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Building {
  id: string;
  name: string;
  address: string;
  type: string;
  management_mode: "weg" | "rent";
  building_code?: string;
  created_at: string;
}

interface WegOwner {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
}

interface Tenant {
  id: string;
  user_id: string;
  building_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
}

export const Buildings = () => {
  const { profile } = useAuth();
  const { managementMode } = useManagementMode();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [wegOwners, setWegOwners] = useState<{ [buildingId: string]: WegOwner[] }>({});
  const [tenants, setTenants] = useState<{ [buildingId: string]: Tenant[] }>({});
  const [isCreateBuildingOpen, setIsCreateBuildingOpen] = useState(false);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isEditBuildingOpen, setIsEditBuildingOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [editingUser, setEditingUser] = useState<WegOwner | Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  // Building form state - type automatically set based on management mode
  const [buildingForm, setBuildingForm] = useState<{
    name: string;
    address: string;
    building_code: string;
  }>({
    name: "",
    address: "",
    building_code: "",
  });

  // User form state
  const [userForm, setUserForm] = useState<{
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone: string;
  }>({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    phone: "",
  });

  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchBuildings();
    }
  }, [profile, managementMode]);

  const fetchBuildings = async () => {
    try {
      setLoading(true);
      const { data: buildingsData, error } = await supabase
        .from("buildings")
        .select("*")
        .eq("management_mode", managementMode)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setBuildings(buildingsData || []);

      // Fetch users for each building
      if (buildingsData) {
        for (const building of buildingsData) {
          if (managementMode === 'weg') {
            await fetchWegOwners(building.id);
          } else {
            await fetchTenants(building.id);
          }
        }
      }
    } catch (error: any) {
      console.error("Error fetching buildings:", error);
      toast({
        title: "Fehler",
        description: "Gebäude konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchWegOwners = async (buildingId: string) => {
    try {
      // First get user_ids assigned to this building
      const { data: assignments, error: assignmentError } = await supabase
        .from("weg_owner_buildings")
        .select("user_id")
        .eq("building_id", buildingId);

      if (assignmentError) throw assignmentError;

      if (!assignments || assignments.length === 0) {
        setWegOwners(prev => ({
          ...prev,
          [buildingId]: []
        }));
        return;
      }

      const userIds = assignments.map(a => a.user_id);

      // Then get weg_owners for those user_ids
      const { data, error } = await supabase
        .from("weg_owners")
        .select("*")
        .in("user_id", userIds)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setWegOwners(prev => ({
        ...prev,
        [buildingId]: data || []
      }));
    } catch (error: any) {
      console.error("Error fetching WEG owners:", error);
    }
  };

  const fetchTenants = async (buildingId: string) => {
    try {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("building_id", buildingId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setTenants(prev => ({
        ...prev,
        [buildingId]: data || []
      }));
    } catch (error: any) {
      console.error("Error fetching tenants:", error);
    }
  };

  const createBuilding = async () => {
    if (!buildingForm.name || !buildingForm.address) {
      toast({
        title: "Fehler",
        description: "Bitte füllen Sie alle Pflichtfelder aus.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("buildings")
        .insert([{
          ...buildingForm,
          type: managementMode, // Automatically set type based on management mode
          management_mode: managementMode
        }])
        .select()
        .single();

      if (error) throw error;

      setBuildings(prev => [data, ...prev]);
      setBuildingForm({ name: "", address: "", building_code: "" });
      setIsCreateBuildingOpen(false);
      
      toast({
        title: "Erfolg",
        description: "Gebäude wurde erfolgreich erstellt.",
      });
    } catch (error: any) {
      console.error("Error creating building:", error);
      toast({
        title: "Fehler",
        description: "Gebäude konnte nicht erstellt werden.",
        variant: "destructive",
      });
    }
  };

  const updateBuilding = async () => {
    if (!editingBuilding) return;

    try {
      const { data, error } = await supabase
        .from("buildings")
        .update({
          name: buildingForm.name,
          address: buildingForm.address,
          building_code: buildingForm.building_code,
          type: managementMode // Update type based on current management mode
        })
        .eq("id", editingBuilding.id)
        .select()
        .single();

      if (error) throw error;

      setBuildings(prev => prev.map(b => b.id === editingBuilding.id ? data : b));
      setIsEditBuildingOpen(false);
      setEditingBuilding(null);
      
      toast({
        title: "Erfolg",
        description: "Gebäude wurde erfolgreich aktualisiert.",
      });
    } catch (error: any) {
      console.error("Error updating building:", error);
      toast({
        title: "Fehler",
        description: "Gebäude konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    }
  };

  const deleteBuilding = async (buildingId: string) => {
    try {
      const { error } = await supabase
        .from("buildings")
        .delete()
        .eq("id", buildingId);

      if (error) throw error;

      setBuildings(prev => prev.filter(b => b.id !== buildingId));
      
      toast({
        title: "Erfolg",
        description: "Gebäude wurde erfolgreich gelöscht.",
      });
    } catch (error: any) {
      console.error("Error deleting building:", error);
      toast({
        title: "Fehler",
        description: "Gebäude konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };

  const createUser = async () => {
    if (!userForm.email || !userForm.password || !selectedBuildingId) {
      toast({
        title: "Fehler",
        description: "Bitte füllen Sie alle Pflichtfelder aus.",
        variant: "destructive",
      });
      return;
    }

    if (userForm.password.length < 6) {
      toast({
        title: "Fehler",
        description: "Das Passwort muss mindestens 6 Zeichen lang sein.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Create regular user signup (they need to confirm their email)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userForm.email,
        password: userForm.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            first_name: userForm.first_name,
            last_name: userForm.last_name,
          }
        }
      });

      if (authError) {
        // Handle specific error cases
        if (authError.message.includes("already registered")) {
          toast({
            title: "Fehler", 
            description: "Ein Benutzer mit dieser E-Mail-Adresse ist bereits registriert.",
            variant: "destructive",
          });
          return;
        }
        throw authError;
      }

      if (managementMode === 'weg') {
        // For WEG management mode, set role to weg_owner
        if (authData.user) {
          // Update the profile created by the trigger to have the correct role based on management mode
          const { error: profileError } = await supabase
            .from("profiles")
            .update({
              first_name: userForm.first_name,
              last_name: userForm.last_name,
              role: 'weg_owner', // Always weg_owner in WEG mode
              force_password_change: true // Force password change for new users
            })
            .eq("user_id", authData.user.id);

          if (profileError) {
            console.warn("Profile update failed:", profileError);
          }
        }

        // Create WEG owner entry (upsert to handle existing users)
        const { data: wegOwnerData, error: wegOwnerError } = await supabase
          .from("weg_owners")
          .upsert({
            user_id: authData.user.id,
            email: userForm.email,
            first_name: userForm.first_name,
            last_name: userForm.last_name,
            phone: userForm.phone,
          })
          .select()
          .single();

        if (wegOwnerError) {
          console.error("WEG owner creation error:", wegOwnerError);
        }

        // Create building assignment (upsert to handle existing assignments)
        const { error: assignmentError } = await supabase
          .from("weg_owner_buildings")
          .upsert({
            user_id: authData.user.id,
            building_id: selectedBuildingId
          });

        if (assignmentError) {
          console.error("Building assignment error:", assignmentError);
        }

        // Refresh the owners list for this building
        await fetchWegOwners(selectedBuildingId);
      } else {
        // For rental management mode, set role to tenant
        if (authData.user) {
          const { error: profileError } = await supabase
            .from("profiles")
            .update({
              first_name: userForm.first_name,
              last_name: userForm.last_name,
              role: 'tenant', // Always tenant in rental mode
              building_id: selectedBuildingId,
              force_password_change: true // Force password change for new users
            })
            .eq("user_id", authData.user.id);

          if (profileError) {
            console.warn("Profile update failed:", profileError);
          }

          const { data: tenantData, error: tenantError } = await supabase
            .from("tenants")
            .insert([{
              user_id: authData.user.id,
              building_id: selectedBuildingId,
              email: userForm.email,
              first_name: userForm.first_name,
              last_name: userForm.last_name,
              phone: userForm.phone,
            }])
            .select()
            .single();

          if (tenantError) {
            console.error("Tenant creation error:", tenantError);
          } else {
            setTenants(prev => ({
              ...prev,
              [selectedBuildingId]: [...(prev[selectedBuildingId] || []), tenantData]
            }));
          }
        }
      }

      setUserForm({ email: "", password: "", first_name: "", last_name: "", phone: "" });
      setIsCreateUserOpen(false);
      setSelectedBuildingId("");
      
      toast({
        title: "Erfolg",
        description: `${managementMode === 'weg' ? 'WEG-Eigentümer' : 'Mieter'} wurde erfolgreich erstellt. ${authData.user?.email_confirmed_at ? 'Sie können sich sofort anmelden.' : 'Eine Bestätigungs-E-Mail wurde gesendet.'}`,
      });
    } catch (error: any) {
      console.error("Error creating user:", error);
      
      // Handle case where user already exists
      if (error.message?.includes("already registered")) {
        if (managementMode === 'weg') {
          try {
            // Find existing user by email
            const { data: existingProfile } = await supabase
              .from("profiles")
              .select("user_id, first_name, last_name, phone")
              .eq("email", userForm.email)
              .single();

            if (existingProfile) {
              // Update role to weg_owner
              await supabase
                .from("profiles")
                .update({ role: 'weg_owner' })
                .eq("user_id", existingProfile.user_id);

              // Upsert WEG owner entry
              await supabase
                .from("weg_owners")
                .upsert({
                  user_id: existingProfile.user_id,
                  email: userForm.email,
                  first_name: userForm.first_name || existingProfile.first_name,
                  last_name: userForm.last_name || existingProfile.last_name,
                  phone: userForm.phone || existingProfile.phone,
                });

              // Create building assignment
              await supabase
                .from("weg_owner_buildings")
                .upsert({
                  user_id: existingProfile.user_id,
                  building_id: selectedBuildingId
                });

              // Refresh the owners list
              await fetchWegOwners(selectedBuildingId);

              setUserForm({ email: "", password: "", first_name: "", last_name: "", phone: "" });
              setIsCreateUserOpen(false);
              setSelectedBuildingId("");
              
              toast({
                title: "Erfolg",
                description: "Bestehender Benutzer wurde dem Gebäude zugeordnet.",
              });
              return;
            }
          } catch (assignError: any) {
            console.error("Error assigning existing user:", assignError);
          }
        }
        
        toast({
          title: "Fehler", 
          description: "Ein Benutzer mit dieser E-Mail-Adresse ist bereits registriert.",
          variant: "destructive",
        });
      } else {
        let errorMessage = `${managementMode === 'weg' ? 'WEG-Eigentümer' : 'Mieter'} konnte nicht erstellt werden.`;
        if (error.message) {
          errorMessage += ` Details: ${error.message}`;
        }
        
        toast({
          title: "Fehler",
          description: errorMessage,
          variant: "destructive",
        });
      }
    }
  };

  const deleteUser = async (userId: string, userType: 'weg' | 'tenant') => {
    try {
      if (userType === 'weg') {
        const { error } = await supabase
          .from("weg_owners")
          .delete()
          .eq("id", userId);

        if (error) throw error;

        setWegOwners(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(buildingId => {
            updated[buildingId] = updated[buildingId].filter(owner => owner.id !== userId);
          });
          return updated;
        });
      } else {
        const { error } = await supabase
          .from("tenants")
          .delete()
          .eq("id", userId);

        if (error) throw error;

        setTenants(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(buildingId => {
            updated[buildingId] = updated[buildingId].filter(tenant => tenant.id !== userId);
          });
          return updated;
        });
      }
      
      toast({
        title: "Erfolg",
        description: `${userType === 'weg' ? 'WEG-Eigentümer' : 'Mieter'} wurde erfolgreich gelöscht.`,
      });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast({
        title: "Fehler",
        description: `${userType === 'weg' ? 'WEG-Eigentümer' : 'Mieter'} konnte nicht gelöscht werden.`,
        variant: "destructive",
      });
    }
  };

  const openEditBuilding = (building: Building) => {
    setEditingBuilding(building);
    setBuildingForm({
      name: building.name,
      address: building.address,
      building_code: building.building_code || ""
    });
    setIsEditBuildingOpen(true);
  };

  const openEditUser = (user: WegOwner | Tenant) => {
    setEditingUser(user);
    setUserForm({
      email: user.email,
      password: "",
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      phone: user.phone || "",
    });
    setIsEditUserOpen(true);
  };

  const getTypeBadge = (type: string) => {
    return (
      <Badge variant={type === "weg" ? "default" : "secondary"}>
        {type === "weg" ? "WEG" : "Miete"}
      </Badge>
    );
  };

  const getUserCount = () => {
    if (managementMode === 'weg') {
      return Object.values(wegOwners).flat().length;
    } else {
      return Object.values(tenants).flat().length;
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Zugriff verweigert</h1>
          <p className="text-muted-foreground">Sie haben keine Berechtigung für diesen Bereich.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Laden...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">
            {managementMode === 'weg' ? 'WEG-Verwaltung' : 'Mietverwaltung'}
          </h1>
          <p className="text-lg text-muted-foreground">
            Verwalten Sie Ihre {managementMode === 'weg' ? 'WEG-Gebäude und Eigentümer' : 'Mietgebäude und Mieter'}
          </p>
        </div>
        <Dialog open={isCreateBuildingOpen} onOpenChange={setIsCreateBuildingOpen}>
          <DialogTrigger asChild>
          <Button className="bg-gradient-primary text-white hover:scale-105 transition-all duration-200 text-base px-6 py-3">
            <Plus className="h-5 w-5 mr-2" />
              Neues Gebäude
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Neues Gebäude erstellen</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={buildingForm.name}
                  onChange={(e) => setBuildingForm(prev => ({...prev, name: e.target.value}))}
                  placeholder="Gebäudename"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Adresse *</Label>
                <Input
                  id="address"
                  value={buildingForm.address}
                  onChange={(e) => setBuildingForm(prev => ({...prev, address: e.target.value}))}
                  placeholder="Straße, PLZ Ort"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="building-code">Gebäude-Code (optional)</Label>
                <Input
                  id="building-code"
                  value={buildingForm.building_code}
                  onChange={(e) => setBuildingForm(prev => ({...prev, building_code: e.target.value}))}
                  placeholder="z.B. WEG-123456"
                />
                <p className="text-xs text-muted-foreground">
                  Ein eindeutiger Code für einfachere Identifikation durch WEG-Eigentümer.
                </p>
              </div>
              <div className="bg-muted/30 p-4 rounded-lg">
                <Label className="text-sm font-medium text-muted-foreground">
                  Typ: {managementMode === 'weg' ? 'WEG-Verwaltung' : 'Mietverwaltung'}
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Der Gebäudetyp wird automatisch basierend auf dem aktuellen Verwaltungsmodus gesetzt.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={createBuilding}
                className="flex-1 bg-gradient-primary text-white hover:scale-105 transition-all duration-200"
              >
                Erstellen
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setIsCreateBuildingOpen(false)}
                className="flex-1"
              >
                Abbrechen
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="dashboard-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gebäude gesamt</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{buildings.length}</div>
          </CardContent>
        </Card>
        
        <Card className="dashboard-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {managementMode === 'weg' ? 'WEG-Gebäude' : 'Mietgebäude'}
            </CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{buildings.filter(b => b.type === managementMode).length}</div>
          </CardContent>
        </Card>
        
        <Card className="dashboard-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {managementMode === 'weg' ? 'WEG-Eigentümer' : 'Mieter'} gesamt
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getUserCount()}</div>
          </CardContent>
        </Card>

        <Card className="dashboard-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktive Verwaltung</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{managementMode === 'weg' ? 'WEG' : 'Miete'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Buildings List */}
      {buildings.length === 0 ? (
        <Card className="dashboard-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Keine Gebäude gefunden</h3>
            <p className="text-muted-foreground text-center mb-4">
              Erstellen Sie Ihr erstes {managementMode === 'weg' ? 'WEG-' : 'Miet-'}Gebäude, um zu beginnen.
            </p>
            <Dialog open={isCreateBuildingOpen} onOpenChange={setIsCreateBuildingOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-primary text-white hover:scale-105 transition-all duration-200">
                  <Plus className="h-4 w-4 mr-2" />
                  Erstes Gebäude erstellen
                </Button>
              </DialogTrigger>
            </Dialog>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {buildings.map((building) => (
            <Card key={building.id} className="dashboard-card">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {building.name}
                      {getTypeBadge(building.type)}
                    </CardTitle>
                    <CardDescription>{building.address}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditBuilding(building)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Gebäude löschen</AlertDialogTitle>
                          <AlertDialogDescription>
                            Sind Sie sicher, dass Sie dieses Gebäude löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteBuilding(building.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Löschen
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-medium">
                    {managementMode === 'weg' ? 'WEG-Eigentümer' : 'Mieter'} ({managementMode === 'weg' 
                      ? (wegOwners[building.id]?.length || 0) 
                      : (tenants[building.id]?.length || 0)})
                  </h4>
                  <div className="flex gap-2">
                    <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setSelectedBuildingId(building.id)}
                          className="hover:scale-105 transition-all duration-200"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {managementMode === 'weg' ? 'Eigentümer hinzufügen' : 'Mieter hinzufügen'}
                        </Button>
                      </DialogTrigger>
                    </Dialog>
                    <BulkUpload
                      buildingId={building.id}
                      managementMode={managementMode}
                      onUploadComplete={fetchBuildings}
                    />
                  </div>
                </div>

                {/* Users Table */}
                {((managementMode === 'weg' && wegOwners[building.id]?.length > 0) || 
                  (managementMode === 'rent' && tenants[building.id]?.length > 0)) && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>E-Mail</TableHead>
                        <TableHead>Telefon</TableHead>
                        <TableHead className="text-right">Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(managementMode === 'weg' ? wegOwners[building.id] || [] : tenants[building.id] || []).map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            {user.first_name || user.last_name 
                              ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                              : '-'}
                          </TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{user.phone || '-'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditUser(user)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      {managementMode === 'weg' ? 'WEG-Eigentümer' : 'Mieter'} löschen
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Sind Sie sicher, dass Sie diesen {managementMode === 'weg' ? 'WEG-Eigentümer' : 'Mieter'} löschen möchten?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteUser(user.id, managementMode === 'weg' ? 'weg' : 'tenant')}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Löschen
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {managementMode === 'weg' ? 'Neuen WEG-Eigentümer hinzufügen' : 'Neuen Mieter hinzufügen'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">E-Mail *</Label>
              <Input
                id="email"
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm(prev => ({...prev, email: e.target.value}))}
                placeholder="user@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Passwort *</Label>
              <Input
                id="password"
                type="password"
                value={userForm.password}
                onChange={(e) => setUserForm(prev => ({...prev, password: e.target.value}))}
                placeholder="Mindestens 6 Zeichen"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="first_name">Vorname</Label>
                <Input
                  id="first_name"
                  value={userForm.first_name}
                  onChange={(e) => setUserForm(prev => ({...prev, first_name: e.target.value}))}
                  placeholder="Vorname"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="last_name">Nachname</Label>
                <Input
                  id="last_name"
                  value={userForm.last_name}
                  onChange={(e) => setUserForm(prev => ({...prev, last_name: e.target.value}))}
                  placeholder="Nachname"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                value={userForm.phone}
                onChange={(e) => setUserForm(prev => ({...prev, phone: e.target.value}))}
                placeholder="+49 123 456789"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={createUser}
              className="flex-1 bg-gradient-primary text-white hover:scale-105 transition-all duration-200"
            >
              Erstellen
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsCreateUserOpen(false);
                setSelectedBuildingId("");
                setUserForm({ email: "", password: "", first_name: "", last_name: "", phone: "" });
              }}
              className="flex-1"
            >
              Abbrechen
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Building Dialog */}
      <Dialog open={isEditBuildingOpen} onOpenChange={setIsEditBuildingOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Gebäude bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={buildingForm.name}
                onChange={(e) => setBuildingForm(prev => ({...prev, name: e.target.value}))}
                placeholder="Gebäudename"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-address">Adresse *</Label>
              <Input
                id="edit-address"
                value={buildingForm.address}
                onChange={(e) => setBuildingForm(prev => ({...prev, address: e.target.value}))}
                placeholder="Straße, PLZ Ort"
              />
             </div>
             <div className="grid gap-2">
               <Label htmlFor="edit-building-code">Gebäude-Code (optional)</Label>
               <Input
                 id="edit-building-code"
                 value={buildingForm.building_code}
                 onChange={(e) => setBuildingForm(prev => ({...prev, building_code: e.target.value}))}
                 placeholder="z.B. WEG-123456"
               />
               <p className="text-xs text-muted-foreground">
                 Ein eindeutiger Code für einfachere Identifikation durch WEG-Eigentümer.
               </p>
             </div>
             <div className="bg-muted/30 p-4 rounded-lg">
               <Label className="text-sm font-medium text-muted-foreground">
                 Typ: {managementMode === 'weg' ? 'WEG-Verwaltung' : 'Mietverwaltung'}
               </Label>
               <p className="text-xs text-muted-foreground mt-1">
                 Der Gebäudetyp wird automatisch basierend auf dem aktuellen Verwaltungsmodus gesetzt.
               </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={updateBuilding}
              className="flex-1 bg-gradient-primary text-white hover:scale-105 transition-all duration-200"
            >
              Speichern
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setIsEditBuildingOpen(false)}
              className="flex-1"
            >
              Abbrechen
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {managementMode === 'weg' ? 'WEG-Eigentümer bearbeiten' : 'Mieter bearbeiten'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-email">E-Mail</Label>
              <Input
                id="edit-email"
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm(prev => ({...prev, email: e.target.value}))}
                placeholder="user@example.com"
                disabled
              />
              <p className="text-xs text-muted-foreground">
                Die E-Mail-Adresse kann nicht geändert werden.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-first_name">Vorname</Label>
                <Input
                  id="edit-first_name"
                  value={userForm.first_name}
                  onChange={(e) => setUserForm(prev => ({...prev, first_name: e.target.value}))}
                  placeholder="Vorname"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-last_name">Nachname</Label>
                <Input
                  id="edit-last_name"
                  value={userForm.last_name}
                  onChange={(e) => setUserForm(prev => ({...prev, last_name: e.target.value}))}
                  placeholder="Nachname"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-phone">Telefon</Label>
              <Input
                id="edit-phone"
                value={userForm.phone}
                onChange={(e) => setUserForm(prev => ({...prev, phone: e.target.value}))}
                placeholder="+49 123 456789"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={async () => {
                if (!editingUser) return;
                
                try {
                  const table = managementMode === 'weg' ? 'weg_owners' : 'tenants';
                  const { error } = await supabase
                    .from(table)
                    .update({
                      first_name: userForm.first_name,
                      last_name: userForm.last_name,
                      phone: userForm.phone,
                    })
                    .eq("id", editingUser.id);

                  if (error) throw error;

                  // Update local state
                  if (managementMode === 'weg') {
                    setWegOwners(prev => {
                      const updated = { ...prev };
                      Object.keys(updated).forEach(buildingId => {
                        updated[buildingId] = updated[buildingId].map(owner => 
                          owner.id === editingUser.id 
                            ? { ...owner, first_name: userForm.first_name, last_name: userForm.last_name, phone: userForm.phone }
                            : owner
                        );
                      });
                      return updated;
                    });
                  } else {
                    setTenants(prev => {
                      const updated = { ...prev };
                      Object.keys(updated).forEach(buildingId => {
                        updated[buildingId] = updated[buildingId].map(tenant => 
                          tenant.id === editingUser.id 
                            ? { ...tenant, first_name: userForm.first_name, last_name: userForm.last_name, phone: userForm.phone }
                            : tenant
                        );
                      });
                      return updated;
                    });
                  }

                  setIsEditUserOpen(false);
                  setEditingUser(null);

                  toast({
                    title: "Erfolg",
                    description: `${managementMode === 'weg' ? 'WEG-Eigentümer' : 'Mieter'} wurde erfolgreich aktualisiert.`,
                  });
                } catch (error: any) {
                  console.error("Error updating user:", error);
                  toast({
                    title: "Fehler",
                    description: `${managementMode === 'weg' ? 'WEG-Eigentümer' : 'Mieter'} konnte nicht aktualisiert werden.`,
                    variant: "destructive",
                  });
                }
              }}
              className="flex-1 bg-gradient-primary text-white hover:scale-105 transition-all duration-200"
            >
              Speichern
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsEditUserOpen(false);
                setEditingUser(null);
              }}
              className="flex-1"
            >
              Abbrechen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};