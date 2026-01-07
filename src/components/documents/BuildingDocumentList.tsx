import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, FileCheck, FileX, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Building {
  id: string;
  name: string;
  address: string;
  building_code: string;
}

interface BuildingDocumentListProps {
  buildings: Building[];
  selectedBuildingId: string | null;
  onSelectBuilding: (id: string) => void;
  isLoading: boolean;
}

interface DocumentStatus {
  [buildingId: string]: {
    status: 'none' | 'uploading' | 'processing' | 'ready' | 'error';
    pageCount?: number;
  };
}

export function BuildingDocumentList({
  buildings,
  selectedBuildingId,
  onSelectBuilding,
  isLoading,
}: BuildingDocumentListProps) {
  const [documentStatuses, setDocumentStatuses] = useState<DocumentStatus>({});

  useEffect(() => {
    const fetchDocumentStatuses = async () => {
      const { data, error } = await supabase
        .from('building_documents')
        .select('building_id, status, page_count')
        .eq('category', 'building');

      if (!error && data) {
        const statuses: DocumentStatus = {};
        data.forEach(doc => {
          if (doc.building_id) {
            statuses[doc.building_id] = {
              status: doc.status as any,
              pageCount: doc.page_count || undefined,
            };
          }
        });
        setDocumentStatuses(statuses);
      }
    };

    fetchDocumentStatuses();

    // Subscribe to changes
    const channel = supabase
      .channel('building-doc-statuses')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'building_documents',
        },
        () => {
          fetchDocumentStatuses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [buildings]);

  const getStatusIcon = (buildingId: string) => {
    const status = documentStatuses[buildingId];
    if (!status || status.status === 'none') {
      return <FileX className="h-4 w-4 text-muted-foreground" />;
    }
    if (status.status === 'processing' || status.status === 'uploading') {
      return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
    }
    if (status.status === 'ready') {
      return <FileCheck className="h-4 w-4 text-green-500" />;
    }
    return <FileX className="h-4 w-4 text-red-500" />;
  };

  const getStatusText = (buildingId: string) => {
    const status = documentStatuses[buildingId];
    if (!status || status.status === 'none') {
      return 'Kein Dokument';
    }
    if (status.status === 'processing') {
      return 'Wird verarbeitet...';
    }
    if (status.status === 'uploading') {
      return 'Wird hochgeladen...';
    }
    if (status.status === 'ready') {
      return `${status.pageCount || '?'} Seiten`;
    }
    if (status.status === 'error') {
      return 'Fehler';
    }
    return '';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Gebäude
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Gebäude ({buildings.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <div className="space-y-1 p-4">
            {buildings.map((building) => (
              <button
                key={building.id}
                onClick={() => onSelectBuilding(building.id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg transition-colors",
                  selectedBuildingId === building.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{building.name}</p>
                    <p className={cn(
                      "text-xs truncate",
                      selectedBuildingId === building.id
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    )}>
                      {building.building_code}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {getStatusIcon(building.id)}
                    <span className={cn(
                      "text-xs",
                      selectedBuildingId === building.id
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    )}>
                      {getStatusText(building.id)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
            {buildings.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Keine Gebäude vorhanden
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
