import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useManagementMode } from "@/hooks/useManagementMode";
import { MeetingList } from "@/components/meetings/MeetingList";
import { MeetingEditor } from "@/components/meetings/MeetingEditor";
import { ResolutionLedger } from "@/components/meetings/ResolutionLedger";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ArrowLeft, Users, Scale } from "lucide-react";

export const Meetings = () => {
  const { profile } = useAuth();
  const { managementMode } = useManagementMode();
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { data: meetings = [], isLoading, refetch } = useQuery({
    queryKey: ["etv-meetings", managementMode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_meetings")
        .select(`
          *,
          buildings!inner(id, name, address, management_mode)
        `)
        .eq("buildings.management_mode", "weg")
        .order("meeting_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const handleBack = () => {
    setSelectedMeetingId(null);
    setIsCreating(false);
    refetch();
  };

  if (isCreating || selectedMeetingId) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Button variant="ghost" onClick={handleBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Übersicht
        </Button>
        <MeetingEditor
          meetingId={selectedMeetingId}
          onSaved={handleBack}
          onCancel={handleBack}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Versammlungen</h1>
          <p className="text-muted-foreground">
            Eigentümerversammlungen planen, durchführen und dokumentieren
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Neue ETV
        </Button>
      </div>

      <Tabs defaultValue="meetings">
        <TabsList>
          <TabsTrigger value="meetings" className="gap-2">
            <Users className="h-4 w-4" />
            Versammlungen
          </TabsTrigger>
          <TabsTrigger value="resolutions" className="gap-2">
            <Scale className="h-4 w-4" />
            Beschlusssammlung
          </TabsTrigger>
        </TabsList>
        <TabsContent value="meetings" className="mt-4">
          <MeetingList
            meetings={meetings}
            isLoading={isLoading}
            onSelect={(id) => setSelectedMeetingId(id)}
          />
        </TabsContent>
        <TabsContent value="resolutions" className="mt-4">
          <ResolutionLedger />
        </TabsContent>
      </Tabs>
    </div>
  );
};
