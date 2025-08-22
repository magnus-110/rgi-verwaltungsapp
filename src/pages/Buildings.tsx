
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuildingRow } from "@/components/BuildingRow";
import { CreateBuildingDialog } from "@/components/CreateBuildingDialog";
import { BulkUpload } from "@/components/BulkUpload";
import { CreateUserDialog } from "@/components/CreateUserDialog";
import { toast } from "sonner";
import { useManagementMode } from "@/hooks/useManagementMode";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Filter } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Building {
  id: string;
  name: string;
  address: string;
  building_code?: string;
  management_mode: "weg" | "rent";
  type?: string;
  manager_name?: string | null;
  created_at: string;
  updated_at: string;
}

export const Buildings = () => {
  const { profile } = useAuth();
  const { managementMode } = useManagementMode();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [filteredBuildings, setFilteredBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    if (profile) {
      fetchBuildings();
    }
  }, [profile, managementMode]);

  const fetchBuildings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("buildings")
        .select("*")
        .eq("management_mode", managementMode)
        .order("name");

      if (error) throw error;
      setBuildings(data || []);
      setFilteredBuildings(data || []);
    } catch (error) {
      console.error("Error fetching buildings:", error);
      toast.error("Fehler beim Laden der Gebäude");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = buildings;

    if (searchTerm) {
      filtered = filtered.filter(building =>
        building.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        building.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (building.building_code && building.building_code.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter(building => building.type === typeFilter);
    }

    setFilteredBuildings(filtered);
  }, [buildings, searchTerm, typeFilter]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Laden...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Gebäude</h1>
            <p className="text-muted-foreground">
              Verwalten Sie Ihre {managementMode === "weg" ? "WEG-" : "Miet-"}Gebäude
            </p>
          </div>
          
          <div className="flex gap-2">
            <CreateBuildingDialog onBuildingCreated={fetchBuildings} />
          </div>
        </div>

        {/* Collapsible Filters */}
        <Card>
          <Collapsible open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Filter
                  </CardTitle>
                  {isFilterOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Input
                      placeholder="Nach Gebäude suchen..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Typ filtern" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle Typen</SelectItem>
                        <SelectItem value="weg">WEG</SelectItem>
                        <SelectItem value="miete">Miete</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Buildings List */}
        <div className="space-y-4">
          {filteredBuildings.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">
                  {buildings.length === 0 
                    ? "Noch keine Gebäude vorhanden" 
                    : "Keine Gebäude entsprechen den Filterkriterien"
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredBuildings.map((building) => (
              <BuildingRow 
                key={building.id} 
                building={building} 
                onUpdate={fetchBuildings}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
