import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, CheckCircle, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";

interface Report {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  created_at: string;
  updated_at: string;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "open":
      return <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />Offen</Badge>;
    case "in_progress":
      return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />In Bearbeitung</Badge>;
    case "resolved":
      return <Badge variant="default"><CheckCircle className="mr-1 h-3 w-3" />Erledigt</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getPriorityBadge = (priority: string) => {
  switch (priority) {
    case "critical":
      return <Badge className="bg-red-500 text-white">Kritisch</Badge>;
    case "high":
      return <Badge className="bg-orange-500 text-white">Hoch</Badge>;
    case "medium":
      return <Badge className="bg-yellow-500 text-black">Mittel</Badge>;
    case "low":
      return <Badge className="bg-green-500 text-white">Niedrig</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
};

export const Reports = () => {
  const { managementMode } = useManagementMode();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, [managementMode]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const tableName = managementMode === "weg" ? "weg_reports" : "miete_reports";
      
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const openReports = reports.filter(r => r.status === "open").length;
  const inProgressReports = reports.filter(r => r.status === "in_progress").length;
  const resolvedReports = reports.filter(r => r.status === "resolved").length;
  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Meldungen</h2>
            <p className="text-muted-foreground">
              Verwalten Sie alle eingegangenen Meldungen
            </p>
          </div>
          <Button className="bg-gradient-primary hover:opacity-90">
            <Plus className="mr-2 h-4 w-4" />
            Neue Meldung
          </Button>
        </div>

        {/* Statistiken */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{reports.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Offen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{openReports}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">In Bearbeitung</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">{inProgressReports}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Erledigt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{resolvedReports}</div>
            </CardContent>
          </Card>
        </div>

        {/* Meldungen Liste */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">Laden...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Keine Meldungen vorhanden.</p>
            </div>
          ) : (
            reports.map((report) => (
              <Card key={report.id} className="hover:shadow-elegant transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{report.title}</CardTitle>
                      <CardDescription>{report.description}</CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      {getStatusBadge(report.status)}
                      {getPriorityBadge(report.priority)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-sm font-medium">Kontakt</p>
                      <p className="text-sm text-muted-foreground">{report.contact_name}</p>
                      <p className="text-sm text-muted-foreground">{report.contact_email}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Telefon</p>
                      <p className="text-sm text-muted-foreground">{report.contact_phone || 'Nicht angegeben'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Erstellt</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(report.created_at).toLocaleDateString('de-DE')}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2 mt-4">
                    <Button variant="outline" size="sm">Details</Button>
                    <Button variant="outline" size="sm">Bearbeiten</Button>
                    {report.status === "open" && (
                      <Button size="sm" className="bg-gradient-primary hover:opacity-90">
                        Bearbeitung starten
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
    </div>
  );
};