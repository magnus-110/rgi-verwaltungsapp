import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Scale, Search, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const statusBadge: Record<string, { label: string; cls: string; Icon: any }> = {
  open: { label: "Offen", cls: "bg-orange-500/15 text-orange-700 border-orange-500/30", Icon: AlertCircle },
  in_progress: { label: "In Bearbeitung", cls: "bg-blue-500/15 text-blue-700 border-blue-500/30", Icon: Clock },
  completed: { label: "Abgeschlossen", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", Icon: CheckCircle2 },
};

export const WegOwnerResolutions = () => {
  const { profile } = useAuth();
  const [search, setSearch] = useState("");

  const { data: buildingIds = [] } = useQuery({
    queryKey: ["weg-owner-building-ids", profile?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("weg_owner_buildings")
        .select("building_id")
        .eq("user_id", profile?.user_id);
      return (data || []).map((r: any) => r.building_id as string);
    },
    enabled: !!profile?.user_id,
  });

  const { data: resolutions = [], isLoading } = useQuery({
    queryKey: ["weg-owner-resolutions", buildingIds.join(",")],
    queryFn: async () => {
      if (!buildingIds.length) return [];
      const { data } = await supabase
        .from("etv_resolutions")
        .select("id, resolution_number, resolution_text, result, resolved_at, published, is_actionable, actionable_status, case_id, building_id, etv_meetings(title, meeting_date), buildings(name), cases(updated_at)")
        .in("building_id", buildingIds)
        .eq("published", true)
        .order("resolved_at", { ascending: false });
      return data || [];
    },
    enabled: buildingIds.length > 0,
  });

  const filtered = useMemo(() => {
    if (!search) return resolutions;
    const s = search.toLowerCase();
    return resolutions.filter((r: any) =>
      r.resolution_text?.toLowerCase().includes(s) ||
      r.resolution_number?.toLowerCase().includes(s) ||
      r.etv_meetings?.title?.toLowerCase().includes(s)
    );
  }, [resolutions, search]);

  const actionable = filtered.filter((r: any) => r.is_actionable && r.actionable_status !== "completed");
  const all = filtered;

  const renderCard = (r: any, showStatus: boolean) => {
    const meeting = r.etv_meetings;
    const status = statusBadge[r.actionable_status as string] || statusBadge.open;
    const StatusIcon = status.Icon;
    const lastUpdate = r.cases?.updated_at;
    return (
      <Card key={r.id}>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {r.result === "passed" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            <span className="font-semibold text-sm">{r.resolution_number}</span>
            <Badge variant="outline" className={r.result === "passed" ? "text-xs border-transparent bg-emerald-600 text-white" : "text-xs"}>
              {r.result === "passed" ? "Angenommen" : "Abgelehnt"}
            </Badge>
            {showStatus && r.is_actionable && (
              <Badge variant="outline" className={`text-xs gap-1 ${status.cls}`}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </Badge>
            )}
          </div>
          <p className="text-sm whitespace-pre-wrap">{r.resolution_text}</p>
          <div className="flex gap-x-4 gap-y-1 text-xs text-muted-foreground flex-wrap">
            <span>{r.buildings?.name}</span>
            <span>{meeting?.title}</span>
            <span>{r.resolved_at ? format(new Date(r.resolved_at), "dd.MM.yyyy", { locale: de }) : ""}</span>
          </div>
          {showStatus && r.is_actionable && lastUpdate && (
            <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
              Letzter Bearbeitungsstand: <span className="font-medium text-foreground">{format(new Date(lastUpdate), "dd.MM.yyyy", { locale: de })}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-2">
          <Scale className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Beschlüsse</h1>
            <p className="text-sm text-muted-foreground">Beschlusssammlung Ihrer WEG</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Beschlüsse durchsuchen…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <Tabs defaultValue="open" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="open">Umzusetzen ({actionable.length})</TabsTrigger>
            <TabsTrigger value="all">Alle Beschlüsse ({all.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="space-y-3">
            {isLoading ? (
              <p className="text-center text-muted-foreground py-8">Laden…</p>
            ) : actionable.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Scale className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">Keine offenen Beschlüsse</p>
                <p className="text-sm">Aktuell stehen keine Beschlüsse zur Umsetzung an.</p>
              </CardContent></Card>
            ) : actionable.map((r: any) => renderCard(r, true))}
          </TabsContent>

          <TabsContent value="all" className="space-y-3">
            {isLoading ? (
              <p className="text-center text-muted-foreground py-8">Laden…</p>
            ) : all.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Scale className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">Keine Beschlüsse vorhanden</p>
              </CardContent></Card>
            ) : all.map((r: any) => renderCard(r, false))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default WegOwnerResolutions;
