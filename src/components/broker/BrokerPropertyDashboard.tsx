import { useState } from "react";
import { Home, ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BrokerOverviewTab } from "./BrokerOverviewTab";
import { BrokerDocumentsTab } from "./BrokerDocumentsTab";
import { BrokerNotesTab } from "./BrokerNotesTab";
import { BrokerLeadsTab } from "./BrokerLeadsTab";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  propertyId: string;
  onBack?: () => void;
}

export const BrokerPropertyDashboard = ({ propertyId, onBack }: Props) => {
  const [tab, setTab] = useState("overview");
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: prop, isLoading } = useQuery({
    queryKey: ['broker-property', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('broker_properties' as any)
        .select('*').eq('id', propertyId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const handleDelete = async () => {
    const { error } = await supabase.from('broker_properties' as any).delete().eq('id', propertyId);
    if (error) { toast.error(error.message); return; }
    toast.success("Objekt gelöscht");
    qc.invalidateQueries({ queryKey: ['broker-properties'] });
    navigate('/makler/objekte');
  };

  if (isLoading || !prop) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        {isLoading ? "Laden..." : "Objekt nicht gefunden"}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 md:p-6 border-b border-border bg-card sticky top-0 z-10">
        <div className="flex items-start justify-between gap-2 md:gap-4">
          <div className="flex items-start gap-2 md:gap-3 min-w-0 flex-1">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden h-10 w-10 -ml-2">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="p-2 md:p-2.5 bg-primary/10 rounded-xl flex-shrink-0">
              <Home className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base md:text-2xl font-bold truncate leading-tight">{prop.title}</h1>
              <div className="flex items-center gap-1.5 mt-1 md:mt-1.5 flex-wrap">
                <Badge variant="secondary" className="text-[10px] md:text-xs px-1.5 py-0">
                  {prop.listing_type === 'rent' ? 'Vermietung' : 'Verkauf'}
                </Badge>
                {!prop.is_active && (
                  <Badge variant="outline" className="text-[10px] md:text-xs px-1.5 py-0">
                    inaktiv
                  </Badge>
                )}
                {prop.city && (
                  <Badge variant="outline" className="text-[10px] md:text-xs px-1.5 py-0 hidden sm:inline-flex">
                    {prop.city}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" title="Löschen"
                className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Objekt löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Das Objekt sowie alle zugehörigen Interessenten, Notizen und Verlaufseinträge werden unwiderruflich gelöscht. Dokumente bleiben im DMS verbleiben unverknüpft.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Löschen</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
        <div className="px-2 md:px-6 bg-card border-b border-border overflow-x-auto scrollbar-hide">
          <TabsList variant="underline" className="h-auto">
            {[
              { value: "overview", label: "Übersicht" },
              { value: "documents", label: "Dokumente" },
              { value: "notes", label: "Notizen" },
              { value: "leads", label: "Interessenten" },
            ].map(t => (
              <TabsTrigger key={t.value} value={t.value} variant="underline"
                className="px-3 md:px-4 py-3 text-xs md:text-sm whitespace-nowrap min-h-[44px]">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <TabsContent value="overview" className="p-3 md:p-6 mt-0">
            <BrokerOverviewTab property={prop} onUpdated={() => qc.invalidateQueries({ queryKey: ['broker-property', propertyId] })} />
          </TabsContent>
          <TabsContent value="documents" className="p-3 md:p-6 mt-0">
            <BrokerDocumentsTab propertyId={propertyId} />
          </TabsContent>
          <TabsContent value="notes" className="p-3 md:p-6 mt-0">
            <BrokerNotesTab propertyId={propertyId} />
          </TabsContent>
          <TabsContent value="leads" className="p-3 md:p-6 mt-0">
            <BrokerLeadsTab propertyId={propertyId} />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};
