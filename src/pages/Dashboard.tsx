import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Newspaper, Castle, Users, Sparkles, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";

const DashboardWidget = ({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  trend 
}: { 
  title: string; 
  value: string; 
  description: string; 
  icon: any; 
  trend?: string;
}) => (
  <Card className="hover:shadow-elegant transition-shadow">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="label-text text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="heading-primary text-2xl font-bold text-primary">{value}</div>
      <p className="body-secondary text-xs">{description}</p>
      {trend && (
        <div className="flex items-center pt-1">
          <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
          <span className="body-secondary text-xs text-green-500">{trend}</span>
        </div>
      )}
    </CardContent>
  </Card>
);

export const Dashboard = () => {
  const { managementMode } = useManagementMode();
  const [reports, setReports] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [managementMode]);

  const fetchData = async () => {
    try {
      // Fetch reports based on management mode
      const reportsTable = managementMode === 'weg' ? 'weg_reports' : 'miete_reports';
      const { data: reportsData, error: reportsError } = await supabase
        .from(reportsTable)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (reportsError) throw reportsError;

      // Fetch buildings
      const { data: buildingsData, error: buildingsError } = await supabase
        .from("buildings")
        .select("*")
        .eq("management_mode", managementMode)
        .order("created_at", { ascending: false });

      if (buildingsError) throw buildingsError;

      setReports(reportsData || []);
      setBuildings(buildingsData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "border-red-500";
      case "medium":
        return "border-yellow-500";
      case "low":
        return "border-blue-500";
      default:
        return "border-gray-300";
    }
  };

  const openReports = reports.filter(r => r.status === "open").length;
  const inProgressReports = reports.filter(r => r.status === "in_progress").length;
  const resolvedReports = reports.filter(r => r.status === "resolved").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="heading-display text-4xl font-bold tracking-tight mb-2">
          {managementMode === 'weg' ? 'WEG-Verwaltung' : 'Mietverwaltung'} Dashboard
        </h2>
        <p className="body-secondary text-lg">
          Überblick über Ihre {managementMode === 'weg' ? 'WEG-' : 'Miet-'}Verwaltungsaktivitäten
        </p>
      </div>

      {/* Statistik Widgets */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardWidget
          title="Offene Meldungen"
          value={openReports.toString()}
          description={`${reports.filter(r => r.priority === "high").length} hoch, ${reports.filter(r => r.priority === "medium").length} mittel, ${reports.filter(r => r.priority === "low").length} niedrig`}
          icon={AlertCircle}
          trend={`${openReports > 0 ? '+' : ''}${openReports} offen`}
        />
        <DashboardWidget
          title="In Bearbeitung"
          value={inProgressReports.toString()}
          description="Meldungen werden bearbeitet"
          icon={Newspaper}
          trend={`${inProgressReports} aktiv`}
        />
        <DashboardWidget
          title="Verwaltete Gebäude"
          value={buildings.length.toString()}
          description={`${managementMode === 'weg' ? 'WEG-' : 'Miet-'}Gebäude`}
          icon={Castle}
        />
        <DashboardWidget
          title="Erledigte Meldungen"
          value={resolvedReports.toString()}
          description="Erfolgreich abgeschlossen"
          icon={Users}
          trend={`${resolvedReports} erledigt`}
        />
      </div>

      {/* Hauptbereiche */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Aktuelle Meldungen */}
        <Card>
          <CardHeader>
            <CardTitle className="heading-primary flex items-center text-lg font-semibold">
              <AlertCircle className="mr-2 h-5 w-5" />
              Aktuelle {managementMode === 'weg' ? 'WEG-' : 'Miet-'}Meldungen
            </CardTitle>
            <CardDescription className="body-secondary">
              Die neuesten eingegangenen Meldungen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="text-center py-4 body-secondary">Laden...</div>
            ) : reports.length === 0 ? (
                <div className="text-center py-4 body-secondary">
                  Keine Meldungen vorhanden
                </div>
            ) : (
              reports.slice(0, 5).map((report) => (
                <div key={report.id} className={`border-l-4 ${getPriorityColor(report.priority)} pl-4`}>
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="heading-primary font-medium">{report.title}</h4>
                    {getStatusBadge(report.status)}
                  </div>
                  <p className="body-secondary text-sm">
                    {report.contact_name} • {new Date(report.created_at).toLocaleDateString('de-DE')}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Gebäude Übersicht */}
        <Card>
          <CardHeader>
            <CardTitle className="heading-primary flex items-center text-lg font-semibold">
              <Castle className="mr-2 h-5 w-5" />
              Verwaltete Gebäude
            </CardTitle>
            <CardDescription className="body-secondary">
              Übersicht Ihrer {managementMode === 'weg' ? 'WEG-' : 'Miet-'}Gebäude
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
                  <div className="text-center py-4 body-secondary">Laden...</div>
            ) : buildings.length === 0 ? (
                <div className="text-center py-4 body-secondary">
                  Keine Gebäude vorhanden
                </div>
            ) : (
              buildings.slice(0, 5).map((building) => (
                <div key={building.id} className="space-y-2">
                  <h4 className="heading-primary font-medium">{building.name}</h4>
                  <p className="body-secondary text-sm">{building.address}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

        {/* Chatbot Status */}
        <Card>
          <CardHeader>
            <CardTitle className="heading-primary flex items-center text-lg font-semibold">
              <Sparkles className="mr-2 h-5 w-5" />
              Chatbot Status
            </CardTitle>
            <CardDescription className="body-secondary">
              Aktueller Status und Nutzungsstatistiken des AI-Assistenten
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-center">
                <div className="heading-primary text-2xl font-bold text-green-500">Online</div>
                <p className="body-secondary text-sm">System Status</p>
              </div>
              <div className="text-center">
                <div className="heading-primary text-2xl font-bold text-primary">247</div>
                <p className="body-secondary text-sm">Anfragen heute</p>
              </div>
              <div className="text-center">
                <div className="heading-primary text-2xl font-bold text-primary">94%</div>
                <p className="body-secondary text-sm">Erfolgsrate</p>
              </div>
            </div>
          </CardContent>
        </Card>
    </div>
  );
};