
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuildingRow } from "@/components/BuildingRow";
import { CreateBuildingDialog } from "@/components/CreateBuildingDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useManagementMode } from "@/hooks/useManagementMode";

export const Buildings = () => {
  const { managementMode } = useManagementMode();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data: buildingsData, isLoading } = useQuery({
    queryKey: ['buildings-paginated', managementMode, search, sortBy, page],
    queryFn: async () => {
      let query = supabase
        .from('buildings')
        .select('*', { count: 'exact' })
        .eq('management_mode', managementMode);

      // Apply search filter
      if (search.trim()) {
        query = query.or(`name.ilike.%${search}%,address.ilike.%${search}%,building_code.ilike.%${search}%`);
      }

      // Apply sorting
      switch (sortBy) {
        case 'name':
          query = query.order('name');
          break;
        case 'address':
          query = query.order('address');
          break;
        case 'created_at':
          query = query.order('created_at', { ascending: false });
          break;
        default:
          query = query.order('name');
      }

      // Apply pagination
      query = query.range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        buildings: data || [],
        totalCount: count || 0,
        hasMore: (data?.length || 0) === pageSize
      };
    },
  });

  const buildings = buildingsData?.buildings || [];
  const totalCount = buildingsData?.totalCount || 0;
  const hasMore = buildingsData?.hasMore || false;
  const canLoadPrevious = page > 0;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0); // Reset to first page when searching
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    setPage(0); // Reset to first page when sorting changes
  };

  const handleUploadComplete = () => {
    // Invalidate queries to refresh the buildings list
    queryClient.invalidateQueries({ queryKey: ['buildings-paginated'] });
    queryClient.invalidateQueries({ queryKey: ['building-user-counts'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-4xl font-sans font-semibold tracking-tight mb-2">
            {managementMode === 'weg' ? 'WEG-' : 'Miet-'}Gebäude
          </h2>
          <p className="body-secondary text-lg">
            Verwalten Sie Ihre {managementMode === 'weg' ? 'WEG-' : 'Miet-'}Gebäude und deren Nutzer
          </p>
        </div>
        <div className="flex space-x-2">
          <CreateBuildingDialog onBuildingCreated={handleUploadComplete} />
        </div>
      </div>

      {/* Search and Filter Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filter & Suche</CardTitle>
          <CardDescription>
            Durchsuchen Sie Ihre Gebäude nach Name, Adresse oder Gebäudecode
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nach Gebäude suchen..."
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={sortBy} onValueChange={handleSortChange}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Sortieren nach" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="address">Adresse</SelectItem>
                <SelectItem value="created_at">Erstellungsdatum</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {totalCount} Gebäude gefunden
          {search && ` für "${search}"`}
        </p>
        <p className="text-sm text-muted-foreground">
          Seite {page + 1} von {Math.ceil(totalCount / pageSize)}
        </p>
      </div>

      {/* Buildings List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="text-lg">Lädt Gebäude...</div>
          </div>
        ) : buildings.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <div className="text-lg font-medium mb-2">Keine Gebäude gefunden</div>
              <p className="text-muted-foreground mb-4">
                {search 
                  ? `Keine Gebäude entsprechen Ihrer Suche nach "${search}"`
                  : 'Sie haben noch keine Gebäude erstellt.'
                }
              </p>
              {!search && (
                <CreateBuildingDialog onBuildingCreated={handleUploadComplete} />
              )}
            </CardContent>
          </Card>
        ) : (
          buildings.map((building) => (
            <BuildingRow key={building.id} building={building} />
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {(hasMore || canLoadPrevious) && (
        <div className="flex justify-center items-center space-x-4 py-4">
          <Button
            variant="outline"
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={!canLoadPrevious}
          >
            Vorherige Seite
          </Button>
          <span className="text-sm text-muted-foreground">
            Seite {page + 1} von {Math.ceil(totalCount / pageSize)}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage(page + 1)}
            disabled={!hasMore}
          >
            Nächste Seite
          </Button>
        </div>
      )}
    </div>
  );
};
