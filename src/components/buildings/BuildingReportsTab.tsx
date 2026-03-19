import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Edit, Copy, AlertCircle } from "lucide-react";
import { useManagementMode } from "@/hooks/useManagementMode";
import { EditReportDialog } from "@/components/reports/EditReportDialog";
import { useToast } from "@/hooks/use-toast";

interface BuildingReportsTabProps {
  buildingId: string;
  managementMode: "weg" | "rent";
}

export const BuildingReportsTab = ({ buildingId, managementMode }: BuildingReportsTabProps) => {
  const { toast } = useToast();
  const [editingReport, setEditingReport] = useState<any>(null);

  const tableName = managementMode === "weg" ? "weg_reports" : "miete_reports";

  const { data: reports = [], isLoading, refetch } = useQuery({
    queryKey: ['building-reports', buildingId, tableName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .eq("building_id", buildingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const openReports = reports.filter(r => r.status === 'open');
  const inProgressReports = reports.filter(r => r.status === 'in_progress');
  const resolvedReports = reports.filter(r => r.status === 'resolved');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open": return <Badge variant="destructive" className="text-xs">Offen</Badge>;
      case "in_progress": return <Badge variant="secondary" className="text-xs">Bearbeitet</Badge>;
      case "resolved": return <Badge className="text-xs">Erledigt</Badge>;
      default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const copyToClipboard = (report: any) => {
    const text = `Name: ${report.contact_name}\nTitel: ${report.title}\nBeschreibung: ${report.description}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Kopiert", description: "Meldungsinformationen kopiert." });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Laden...</div>;
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="p-3 bg-muted rounded-xl mb-4">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg mb-1">Keine Meldungen</h3>
        <p className="text-sm text-muted-foreground">Für dieses Gebäude liegen keine Meldungen vor.</p>
      </div>
    );
  }

  const renderReport = (report: any) => (
    <Card key={report.id} className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{report.title}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(report.created_at)}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {getStatusBadge(report.status)}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copyToClipboard(report)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingReport(report)}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {report.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{report.description}</p>
        )}
        {report.contact_name && (
          <p className="text-xs text-muted-foreground mt-2">Kontakt: {report.contact_name}</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="flex gap-4 text-sm">
        <span className="text-muted-foreground">
          <Badge variant="destructive" className="text-xs mr-1">{openReports.length}</Badge> Offen
        </span>
        <span className="text-muted-foreground">
          <Badge variant="secondary" className="text-xs mr-1">{inProgressReports.length}</Badge> In Bearbeitung
        </span>
        <span className="text-muted-foreground">
          <Badge className="text-xs mr-1">{resolvedReports.length}</Badge> Erledigt
        </span>
      </div>

      {/* Open reports */}
      {openReports.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Offene Meldungen</h4>
          <div className="space-y-2">{openReports.map(renderReport)}</div>
        </div>
      )}

      {/* In progress */}
      {inProgressReports.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">In Bearbeitung</h4>
          <div className="space-y-2">{inProgressReports.map(renderReport)}</div>
        </div>
      )}

      {/* Resolved */}
      {resolvedReports.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Erledigt</h4>
          <div className="space-y-2">{resolvedReports.map(renderReport)}</div>
        </div>
      )}

      {editingReport && (
        <EditReportDialog
          report={editingReport}
          open={!!editingReport}
          tableName={managementMode === 'weg' ? 'weg_reports' : 'miete_reports'}
          onClose={() => setEditingReport(null)}
          onSaved={() => { setEditingReport(null); refetch(); }}
        />
      )}
    </div>
  );
};
