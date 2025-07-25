import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Users, Building2, Home } from "lucide-react";

interface Building {
  id: string;
  name: string;
  address: string;
  type: string;
  management_mode: "weg" | "rent";
  created_at: string;
}

interface WegOwner {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
}

export const Buildings = () => {
  const { profile } = useAuth();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [wegOwners, setWegOwners] = useState<{ [buildingId: string]: WegOwner[] }>({});
  const [isCreateBuildingOpen, setIsCreateBuildingOpen] = useState(false);
  const [isCreateOwnerOpen, setIsCreateOwnerOpen] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Building form state
  const [buildingForm, setBuildingForm] = useState<{
    name: string;
    address: string;
    type: string;
    management_mode: "weg" | "rent";
  }>({
    name: "",
    address: "",
    type: "weg",
    management_mode: "weg"
  });

  // Owner form state
  const [ownerForm, setOwnerForm] = useState({
    email: "",
    first_name: "",
    last_name: ""
  });

  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchBuildings();
    }
  }, [profile]);

  const fetchBuildings = async () => {
    try {
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBuildings(data || []);
      
      // Fetch WEG owners for each building
      for (const building of data || []) {
        if (building.management_mode === 'weg') {
          await fetchWegOwners(building.id);
        }
      }
    } catch (error) {
      console.error('Error fetching buildings:', error);
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
      const { data, error } = await supabase
        .from('weg_owners')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setWegOwners(prev => ({
        ...prev,
        [buildingId]: data || []
      }));
    } catch (error) {
      console.error('Error fetching WEG owners:', error);
    }
  };

  const createBuilding = async () => {
    try {
      const { data, error } = await supabase
        .from('buildings')
        .insert([buildingForm])
        .select()
        .single();

      if (error) throw error;

      setBuildings(prev => [data, ...prev]);
      setBuildingForm({ name: "", address: "", type: "weg", management_mode: "weg" });
      setIsCreateBuildingOpen(false);
      
      toast({
        title: "Gebäude erstellt",
        description: "Das Gebäude wurde erfolgreich erstellt.",
      });
    } catch (error) {
      console.error('Error creating building:', error);
      toast({
        title: "Fehler",
        description: "Gebäude konnte nicht erstellt werden.",
        variant: "destructive",
      });
    }
  };

  const createWegOwner = async () => {
    try {
      const { data, error } = await supabase
        .from('weg_owners')
        .insert([ownerForm])
        .select()
        .single();

      if (error) throw error;

      // Update local state
      setWegOwners(prev => ({
        ...prev,
        [selectedBuildingId]: [data, ...(prev[selectedBuildingId] || [])]
      }));
      
      setOwnerForm({ email: "", first_name: "", last_name: "" });
      setIsCreateOwnerOpen(false);
      setSelectedBuildingId("");
      
      toast({
        title: "WEG-Eigentümer erstellt",
        description: "Der WEG-Eigentümer wurde erfolgreich erstellt.",
      });
    } catch (error) {
      console.error('Error creating WEG owner:', error);
      toast({
        title: "Fehler",
        description: "WEG-Eigentümer konnte nicht erstellt werden.",
        variant: "destructive",
      });
    }
  };

  const getTypeBadge = (type: string) => {
    const variants = {
      weg: "default",
      rent: "secondary"
    } as const;
    
    const labels = {
      weg: "WEG",
      rent: "Mietverwaltung"
    };
    
    return (
      <Badge variant={variants[type as keyof typeof variants]}>
        {labels[type as keyof typeof labels]}
      </Badge>
    );
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
      <AdminLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg">Laden...</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Gebäude</h1>
            <p className="text-muted-foreground">Verwalten Sie Ihre Gebäude und WEG-Eigentümer</p>
          </div>
          <Dialog open={isCreateBuildingOpen} onOpenChange={setIsCreateBuildingOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Neues Gebäude
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Neues Gebäude erstellen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={buildingForm.name}
                    onChange={(e) => setBuildingForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Gebäudename eingeben"
                  />
                </div>
                <div>
                  <Label htmlFor="address">Adresse</Label>
                  <Input
                    id="address"
                    value={buildingForm.address}
                    onChange={(e) => setBuildingForm(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Adresse eingeben"
                  />
                </div>
                <div>
                  <Label htmlFor="management_mode">Verwaltungsart</Label>
                  <Select
                    value={buildingForm.management_mode}
                    onValueChange={(value: "weg" | "rent") => setBuildingForm(prev => ({ 
                      ...prev, 
                      management_mode: value,
                      type: value
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weg">WEG-Verwaltung</SelectItem>
                      <SelectItem value="rent">Mietverwaltung</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={createBuilding} className="w-full">
                  Gebäude erstellen
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamt Gebäude</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{buildings.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">WEG Gebäude</CardTitle>
              <Home className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {buildings.filter(b => b.management_mode === 'weg').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Mietgebäude</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {buildings.filter(b => b.management_mode === 'rent').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">WEG-Eigentümer</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Object.values(wegOwners).reduce((total, owners) => total + owners.length, 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Buildings List */}
        <div className="space-y-4">
          {buildings.map((building) => (
            <Card key={building.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {building.name}
                      {getTypeBadge(building.type)}
                    </CardTitle>
                    <CardDescription>{building.address}</CardDescription>
                  </div>
                  {building.management_mode === 'weg' && (
                    <Dialog open={isCreateOwnerOpen && selectedBuildingId === building.id} 
                           onOpenChange={(open) => {
                             setIsCreateOwnerOpen(open);
                             if (open) setSelectedBuildingId(building.id);
                             else setSelectedBuildingId("");
                           }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          WEG-Eigentümer hinzufügen
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>WEG-Eigentümer hinzufügen</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="owner-email">E-Mail</Label>
                            <Input
                              id="owner-email"
                              type="email"
                              value={ownerForm.email}
                              onChange={(e) => setOwnerForm(prev => ({ ...prev, email: e.target.value }))}
                              placeholder="E-Mail-Adresse eingeben"
                            />
                          </div>
                          <div>
                            <Label htmlFor="owner-first-name">Vorname</Label>
                            <Input
                              id="owner-first-name"
                              value={ownerForm.first_name}
                              onChange={(e) => setOwnerForm(prev => ({ ...prev, first_name: e.target.value }))}
                              placeholder="Vorname eingeben"
                            />
                          </div>
                          <div>
                            <Label htmlFor="owner-last-name">Nachname</Label>
                            <Input
                              id="owner-last-name"
                              value={ownerForm.last_name}
                              onChange={(e) => setOwnerForm(prev => ({ ...prev, last_name: e.target.value }))}
                              placeholder="Nachname eingeben"
                            />
                          </div>
                          <Button onClick={createWegOwner} className="w-full">
                            WEG-Eigentümer erstellen
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardHeader>
              {building.management_mode === 'weg' && wegOwners[building.id] && wegOwners[building.id].length > 0 && (
                <CardContent>
                  <div className="space-y-2">
                    <h4 className="font-medium">WEG-Eigentümer ({wegOwners[building.id].length})</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>E-Mail</TableHead>
                          <TableHead>Erstellt am</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {wegOwners[building.id].map((owner) => (
                          <TableRow key={owner.id}>
                            <TableCell>
                              {owner.first_name || owner.last_name 
                                ? `${owner.first_name || ''} ${owner.last_name || ''}`.trim()
                                : '-'
                              }
                            </TableCell>
                            <TableCell>{owner.email}</TableCell>
                            <TableCell>
                              {new Date(owner.created_at).toLocaleDateString('de-DE')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {buildings.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine Gebäude vorhanden</h3>
              <p className="text-muted-foreground text-center mb-4">
                Erstellen Sie Ihr erstes Gebäude, um mit der Verwaltung zu beginnen.
              </p>
              <Button onClick={() => setIsCreateBuildingOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Erstes Gebäude erstellen
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
};