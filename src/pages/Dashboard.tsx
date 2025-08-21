
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, FileText, Building2, Users, Sparkles, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";

const DashboardWidget = ({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  trend,
  isLoading = false
}: { 
  title: string; 
  value: string | number; 
  description: string; 
  icon: any; 
  trend?: string;
  isLoading?: boolean;
}) => (
  <Card className="hover:shadow-elegant transition-shadow">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="label-text text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="heading-primary text-2xl font-bold text-primary">
        {isLoading ? "..." : value}
      </div>
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
  const [stats, setStats] = useState({
    openReports: 0,
    inProgressReports: 0,
    resolvedReports: 0,
    buildingsCount: 0,
    totalReports: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [managementMode]);

  const fetchData = async () => {
    try {
      const reportsTable = managementMode === 'weg' ? 'weg_reports' : 'miete_reports';
      
      // Efficient counting queries
      const [
        openReportsResult,
        inProgressReportsResult, 
        resolvedReportsResult,
        buildingsResult,
        recentReportsResult,
        recentBuildingsResult
      ] = await Promise.all([
        // Count reports by status
        supabase
          .from(reportsTable)
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open'),
        supabase
          .from(reportsTable)
          .select('*', { count: 'exact', head: true })
          .eq('status', 'in_progress'),
        supabase
          .from(reportsTable)
          .select('*', { count: 'exact', head: true })
          .eq('status', 'resolved'),
        
        // Count buildings
        supabase
          .from('buildings')
          .select('*', { count: 'exact', head: true })
          .eq('management_mode', managementMode),
        
        // Get recent reports for display (only fetch what we need)
        supabase
          .from(reportsTable)
          .select('id, title, status, priority, contact_name, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
        
        // Get recent buildings for display
        supabase
          .from('buildings')
          .select('id, name, address')
          .eq('management_mode', managementMode)
          .order('created_at', { ascending: false })
          .limit(5)
      ]);

      // Update stats
      setStats({
        openReports: openReportsResult.count || 0,
        inProgressReports: inProgressReportsResult.count || 0, 
        resolvedReports: resolvedReportsResult.count || 0,
        buildingsCount: buildingsResult.count || 0,
        totalReports: (openReportsResult.count || 0) + (inProgressReportsResult.count || 0) + (resolvedReportsResult.count || 0)
      });

      // Set display data
      setReports(recentReportsResult.data || []);
      setBuildings(recentBuildingsResult.data || []);

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="destructive">Offen</Badge>;
      case "in_progress":
        return <Badge variant="secondary">Bearbeitet</Badge>;
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl font-sans font-semibold tracking-tight mb-2">
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
          value={stats.openReports}
          description="Neue Meldungen zur Bearbeitung"
          icon={AlertCircle}
          trend={stats.openReports > 0 ? `${stats.openReports} offen` : 'Keine offenen'}
          isLoading={loading}
        />
        <DashboardWidget
          title="Bearbeitet"
          value={stats.inProgressReports}
          description="Meldungen werden bearbeitet"
          icon={FileText}
          trend={`${stats.inProgressReports} aktiv`}
          isLoading={loading}
        />
        <DashboardWidget
          title="Verwaltete Gebäude"
          value={stats.buildingsCount}
          description={`${managementMode === 'weg' ? 'WEG-' : 'Miet-'}Gebäude`}
          icon={Building2}
          isLoading={loading}
        />
        <DashboardWidget
          title="Erledigte Meldungen"
          value={stats.resolvedReports}
          description="Erfolgreich abgeschlossen"
          icon={Users}
          trend={`${stats.resolvedReports} erledigt`}
          isLoading={loading}
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
              reports.map((report) => (
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
              <Building2 className="mr-2 h-5 w-5" />
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
              buildings.map((building) => (
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
                <div className="heading-primary text-2xl font-bold text-primary">{stats.totalReports}</div>
                <p className="body-secondary text-sm">Gesamte Meldungen</p>
              </div>
              <div className="text-center">
                <div className="heading-primary text-2xl font-bold text-primary">{stats.buildingsCount}</div>
                <p className="body-secondary text-sm">Verwaltete Gebäude</p>
              </div>
            </div>
          </CardContent>
        </Card>
    </div>
  );
};
