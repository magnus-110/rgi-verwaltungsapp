import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, MessageSquare, Building2, CheckCircle } from "lucide-react";

interface Report {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
}

export const TenantDashboard = () => {
  const { profile } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [tenantInfo, setTenantInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchReports();
      fetchTenantInfo();
    }
  }, [profile]);

  const fetchTenantInfo = async () => {
    try {
      const { data: tenantData, error: tenantError } = await supabase
        .from("tenants")
        .select("*, buildings(id, name, address)")
        .eq("user_id", profile?.user_id)
        .single();

      if (tenantError) throw tenantError;
      setTenantInfo(tenantData);
    } catch (error) {
      console.error("Error fetching tenant info:", error);
    }
  };

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from("miete_reports")
        .select("*")
        .eq("reported_by", profile?.user_id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="destructive">Offen</Badge>;
      case "in_progress":
        return <Badge variant="secondary">In Bearbeitung</Badge>;
      case "resolved":
        return <Badge variant="default">Erledigt</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "low":
        return <Badge variant="outline">Niedrig</Badge>;
      case "medium":
        return <Badge variant="secondary">Mittel</Badge>;
      case "high":
        return <Badge variant="destructive">Hoch</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  const openReports = reports.filter(r => r.status === "open").length;
  const inProgressReports = reports.filter(r => r.status === "in_progress").length;
  const resolvedReports = reports.filter(r => r.status === "resolved").length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">
          Willkommen, {profile?.first_name || 'Mieter'}!
        </h1>
        <p className="text-lg text-muted-foreground">
          Hier finden Sie eine Übersicht über Ihre Meldungen und Aktivitäten.
        </p>
        {/* Building Info */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Ihr Gebäude</p>
                <p className="text-sm text-muted-foreground">
                  {tenantInfo ? `${tenantInfo.buildings?.name || 'Unbekannt'} - ${tenantInfo.buildings?.address || 'Keine Adresse'}` : 'Laden...'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offene Meldungen</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openReports}</div>
            <p className="text-xs text-muted-foreground">
              Meldungen warten auf Bearbeitung
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Bearbeitung</CardTitle>
            <Building2 className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressReports}</div>
            <p className="text-xs text-muted-foreground">
              Meldungen werden bearbeitet
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Erledigt</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resolvedReports}</div>
            <p className="text-xs text-muted-foreground">
              Erfolgreich bearbeitete Meldungen
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Aktuelle Meldungen</CardTitle>
          <CardDescription>
            Ihre letzten Meldungen im Überblick
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Laden...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Noch keine Meldungen erstellt.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map((report) => (
                <div key={report.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold">{report.title}</h3>
                    <div className="flex gap-2">
                      {getStatusBadge(report.status)}
                      {getPriorityBadge(report.priority)}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {report.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Erstellt am: {new Date(report.created_at).toLocaleDateString('de-DE')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};