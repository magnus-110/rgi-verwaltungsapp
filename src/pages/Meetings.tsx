import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useManagementMode } from "@/hooks/useManagementMode";
import { MeetingList } from "@/components/meetings/MeetingList";
import { MeetingEditor } from "@/components/meetings/MeetingEditor";
import { ResolutionLedger } from "@/components/meetings/ResolutionLedger";
import { SubmittedTopsManager } from "@/components/meetings/SubmittedTopsManager";

import { ProtocolTemplatesTab } from "@/components/meetings/ProtocolTemplatesTab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowLeft, Users, Scale, Inbox, Building2, FileText } from "lucide-react";


export const Meetings = () => {
  const { profile } = useAuth();
  const { managementMode } = useManagementMode();
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("all");

  // Load WEG buildings for filter
  const { data: wegBuildings = [] } = useQuery({
    queryKey: ["weg-buildings-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address")
        .eq("management_mode", "weg")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: meetings = [], isLoading, refetch } = useQuery({
    queryKey: ["etv-meetings", managementMode, selectedBuildingId],
    queryFn: async () => {
      let query = supabase
        .from("etv_meetings")
        .select(`
          *,
          buildings!inner(id, name, address, management_mode)
        `)
        .eq("buildings.management_mode", "weg")
        .order("meeting_date", { ascending: false });

      if (selectedBuildingId !== "all") {
        query = query.eq("building_id", selectedBuildingId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Count pending submitted tops
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["pending-tops-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("etv_submitted_tops")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count || 0;
    },
  });

  const handleBack = () => {
    setSelectedMeetingId(null);
    setIsCreating(false);
    refetch();
  };

  if (isCreating || selectedMeetingId) {
    return (
      <div className="p-3 md:p-6 space-y-3 md:space-y-4">
        <Button variant="ghost" onClick={handleBack} className="gap-2 h-10 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Übersicht
        </Button>
        <MeetingEditor
          meetingId={selectedMeetingId}
          initialBuildingId={isCreating && selectedBuildingId !== "all" ? selectedBuildingId : undefined}
          onSaved={handleBack}
          onCancel={handleBack}
        />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Versammlungen</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Eigentümerversammlungen planen, durchführen und dokumentieren
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="gap-2 h-11 md:h-10 hidden md:inline-flex">
          <Plus className="h-4 w-4" />
          Neue ETV
        </Button>
      </div>

      {/* Building Filter */}
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <Select value={selectedBuildingId} onValueChange={setSelectedBuildingId}>
          <SelectTrigger className="w-full md:w-[300px] h-11 md:h-10">
            <SelectValue placeholder="Liegenschaft filtern..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Liegenschaften</SelectItem>
            {wegBuildings.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="meetings">
        <TabsList className="w-full md:w-auto overflow-x-auto scrollbar-hide">
          <TabsTrigger value="meetings" className="gap-1.5 md:gap-2 min-h-[44px] text-xs md:text-sm">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Versammlungen</span>
            <span className="sm:hidden">ETV</span>
          </TabsTrigger>
          <TabsTrigger value="submissions" className="gap-1.5 md:gap-2 min-h-[44px] text-xs md:text-sm">
            <Inbox className="h-4 w-4" />
            Anträge
            {pendingCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="resolutions" className="gap-1.5 md:gap-2 min-h-[44px] text-xs md:text-sm">
            <Scale className="h-4 w-4" />
            <span className="hidden sm:inline">Beschlusssammlung</span>
            <span className="sm:hidden">Beschl.</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="meetings" className="mt-4">
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">Aktuelle</TabsTrigger>
              <TabsTrigger value="past">Vergangene</TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="mt-4">
              <MeetingList
                meetings={meetings.filter((m: any) => !["completed", "cancelled"].includes(m.status))}
                isLoading={isLoading}
                onSelect={(id) => setSelectedMeetingId(id)}
              />
            </TabsContent>
            <TabsContent value="past" className="mt-4">
              <MeetingList
                meetings={meetings.filter((m: any) => ["completed", "cancelled"].includes(m.status))}
                isLoading={isLoading}
                onSelect={(id) => setSelectedMeetingId(id)}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="submissions" className="mt-4">
          <SubmittedTopsManager buildingFilter={selectedBuildingId} />
        </TabsContent>
        <TabsContent value="resolutions" className="mt-4">
          <ResolutionLedger buildingFilter={selectedBuildingId} />
        </TabsContent>
      </Tabs>

      {/* Mobile FAB */}
      <Button
        onClick={() => setIsCreating(true)}
        className="md:hidden fixed right-4 h-14 w-14 rounded-full shadow-lg z-40"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        aria-label="Neue ETV"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
};
