import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Scale, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export const ResolutionLedger = () => {
  const [search, setSearch] = useState("");
  const [buildingFilter, setBuildingFilter] = useState<string>("all");

  const { data: resolutions = [], isLoading } = useQuery({
    queryKey: ["etv-resolutions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_resolutions")
        .select(`
          *,
          buildings!inner(name, address),
          etv_meetings!inner(title, meeting_date)
        `)
        .order("resolved_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: buildings = [] } = useQuery({
    queryKey: ["weg-buildings-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name")
        .eq("management_mode", "weg")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = resolutions.filter((r: any) => {
    const matchesSearch =
      !search ||
      r.resolution_text?.toLowerCase().includes(search.toLowerCase()) ||
      r.resolution_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.buildings?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesBuilding = buildingFilter === "all" || r.building_id === buildingFilter;
    return matchesSearch && matchesBuilding;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Beschlüsse durchsuchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={buildingFilter} onValueChange={setBuildingFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Alle Liegenschaften" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Liegenschaften</SelectItem>
            {buildings.map((b: any) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Scale className="h-12 w-12 mx-auto mb-4" />
            <p className="font-medium">Keine Beschlüsse gefunden</p>
            <p className="text-sm">Beschlüsse werden automatisch nach Abstimmungen in der Versammlung gespeichert.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r: any) => {
            const meeting = r.etv_meetings;
            const building = r.buildings;
            return (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {r.result === "passed" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                        )}
                        <span className="font-semibold text-sm">{r.resolution_number}</span>
                        <Badge variant={r.result === "passed" ? "default" : "destructive"} className="text-xs">
                          {r.result === "passed" ? "Angenommen" : "Abgelehnt"}
                        </Badge>
                        {!r.published && <Badge variant="outline" className="text-xs">Entwurf</Badge>}
                      </div>
                      <p className="text-sm">{r.resolution_text}</p>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>{building?.name}</span>
                        <span>{meeting?.title}</span>
                        <span>{r.resolved_at ? format(new Date(r.resolved_at), "dd.MM.yyyy", { locale: de }) : ""}</span>
                        <span>Ja: {r.yes_count} | Nein: {r.no_count} | Enth.: {r.abstain_count}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
