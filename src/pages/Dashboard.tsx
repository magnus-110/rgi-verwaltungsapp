import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, FileText, Building2, Users, Sparkles, TrendingUp, Activity, MessageSquare, BarChart3, LineChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart as RechartsBarChart, Bar } from 'recharts';
import { TodoDashboardWidget } from "@/components/todos/TodoDashboardWidget";

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
      <CardTitle className="label-text text-sm font-medium truncate">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </CardHeader>
    <CardContent className="space-y-2">
      <div className="heading-primary text-xl sm:text-2xl font-bold text-primary truncate">
        {isLoading ? "..." : value}
      </div>
      <p className="body-secondary text-xs leading-tight">{description}</p>
      {trend && (
        <div className="flex items-center pt-1">
          <TrendingUp className="h-3 w-3 text-green-500 mr-1 flex-shrink-0" />
          <span className="body-secondary text-xs text-green-500 truncate">{trend}</span>
        </div>
      )}
    </CardContent>
  </Card>
);

export const Dashboard = () => {
  const { managementMode } = useManagementMode();
  const [reports, setReports] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [timeframeDays, setTimeframeDays] = useState<number>(30);
  const [monthlyTicketsData, setMonthlyTicketsData] = useState<any[]>([]);
  const [topProblemBuildingsData, setTopProblemBuildingsData] = useState<any[]>([]);
  const [chatbotStatus, setChatbotStatus] = useState({ online: false, conversations: 0 });
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
  }, [managementMode, timeframeDays]);

  const fetchData = async () => {
    try {
      const reportsTable = managementMode === 'weg' ? 'weg_reports' : 'miete_reports';
      
      // Efficient data fetching with all new features
      const [
        openReportsResult,
        inProgressReportsResult, 
        resolvedReportsResult,
        buildingsResult,
        recentReportsResult,
        recentBuildingsResult,
        chatbotHealthResult,
        chatbotSessionsResult,
        allSessionsResult,
        monthlyReportsResult,
        problemBuildingsResult
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
          .select('id, title, status, contact_name, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
        
        // Get recent buildings for display
        supabase
          .from('buildings')
          .select('id, name, address')
          .eq('management_mode', managementMode)
          .order('created_at', { ascending: false })
          .limit(5),

        // Chatbot health check
        supabase.functions.invoke('chat-with-ai', {
          body: { healthCheck: true, userId: 'health', managementMode: managementMode }
        }),

        // Chatbot conversations count
        supabase
          .from('chatbot_sessions')
          .select('*', { count: 'exact', head: true })
          .eq('management_mode', managementMode)
          .gte('started_at', new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000).toISOString()),

        // Debug: Get all chatbot sessions
        supabase
          .from('chatbot_sessions')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(10),

        // Monthly tickets data (last 12 months)
        supabase
          .from(reportsTable)
          .select('created_at')
          .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()),

        // Problem buildings data
        supabase
          .from(reportsTable)
          .select('id, building_id, created_at')
          .gte('created_at', new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000).toISOString())
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

      // Process chatbot data
      
      setChatbotStatus({
        online: chatbotHealthResult.data?.online || false,
        conversations: chatbotSessionsResult.count || 0
      });

      // Process monthly tickets data
      const monthlyData = processMonthlyData(monthlyReportsResult.data || []);
      setMonthlyTicketsData(monthlyData);

      // Process problem buildings data
      const problemBuildings = await processProblemBuildings(problemBuildingsResult.data || []);
      setTopProblemBuildingsData(problemBuildings);

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const processMonthlyData = (reports: any[]) => {
    const months = [];
    const now = new Date();
    
    // Generate last 12 months
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        month: date.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
        tickets: 0,
        date: date
      });
    }

    // Count reports per month
    reports.forEach(report => {
      const reportDate = new Date(report.created_at);
      const monthIndex = months.findIndex(m => 
        m.date.getMonth() === reportDate.getMonth() && 
        m.date.getFullYear() === reportDate.getFullYear()
      );
      if (monthIndex >= 0) {
        months[monthIndex].tickets++;
      }
    });

    return months;
  };

  const processProblemBuildings = async (reports: any[]) => {
    if (reports.length === 0) return [];

    // Count reports per building
    const buildingCounts: Record<string, number> = {};
    reports.forEach(report => {
      if (report.building_id) {
        buildingCounts[report.building_id] = (buildingCounts[report.building_id] || 0) + 1;
      }
    });

    // Get building names and occupant counts
    const buildingIds = Object.keys(buildingCounts);
    if (buildingIds.length === 0) return [];

    const { data: buildingsData } = await supabase
      .from('buildings')
      .select('id, name, address')
      .in('id', buildingIds);

    // Get occupant counts based on management mode
    const occupantPromises = buildingIds.map(async (buildingId) => {
      if (managementMode === 'rent') {
        const { count } = await supabase
          .from('tenants')
          .select('*', { count: 'exact', head: true })
          .eq('building_id', buildingId);
        return { buildingId, occupants: count || 1 };
      } else {
        const { count } = await supabase
          .from('weg_owner_buildings')
          .select('*', { count: 'exact', head: true })
          .eq('building_id', buildingId);
        return { buildingId, occupants: count || 1 };
      }
    });

    const occupantResults = await Promise.all(occupantPromises);
    const occupantMap = occupantResults.reduce((acc, { buildingId, occupants }) => {
      acc[buildingId] = occupants;
      return acc;
    }, {} as Record<string, number>);

    // Calculate normalized values and create result
    const result = buildingIds
      .map(buildingId => {
        const building = buildingsData?.find(b => b.id === buildingId);
        const reportCount = buildingCounts[buildingId];
        const occupants = occupantMap[buildingId] || 1;
        const normalizedValue = reportCount / occupants;

        return {
          name: building?.name || 'Unbekannt',
          value: normalizedValue,
          rawCount: reportCount,
          occupants: occupants
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return result;
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
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <DashboardWidget
          title="Offene Meldungen"
          value={stats.openReports}
          description="Neue Meldungen zur Bearbeitung"
          icon={AlertCircle}
          trend={stats.openReports > 0 ? `${stats.openReports} offen` : 'Keine offenen'}
          isLoading={loading}
        />
        <DashboardWidget
          title="Chatbot Status"
          value={chatbotStatus.online ? "Online" : "Offline"}
          description={`${chatbotStatus.conversations} Konversationen`}
          icon={chatbotStatus.online ? Activity : AlertCircle}
          trend={chatbotStatus.online ? "Verfügbar" : "Nicht verfügbar"}
          isLoading={loading}
        />
      </div>

      {/* Aufgaben Widget - volle Breite */}
      <TodoDashboardWidget />

      {/* Charts Section */}
      <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
        {/* Monthly Tickets Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="heading-primary flex items-center text-lg font-semibold">
              <LineChart className="mr-2 h-5 w-5" />
              Tickets pro Monat
            </CardTitle>
            <CardDescription className="body-secondary">
              Entwicklung der letzten 12 Monate
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 flex items-center justify-center body-secondary">Laden...</div>
            ) : (
              <ChartContainer
                config={{
                  tickets: {
                    label: "Tickets",
                    color: "hsl(var(--primary))",
                  },
                }}
                 className="h-48 sm:h-64"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart data={monthlyTicketsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line 
                      type="monotone" 
                      dataKey="tickets" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))" }}
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Problem Buildings Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="heading-primary flex items-center text-lg font-semibold">
              <BarChart3 className="mr-2 h-5 w-5" />
              Meldungen pro Wohnanlage
            </CardTitle>
            <CardDescription className="body-secondary">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-xs">Top 10 Häuser mit den meisten Meldungen pro {managementMode === 'weg' ? 'Eigentümer' : 'Mieter'}</span>
                <Select value={timeframeDays.toString()} onValueChange={(value) => setTimeframeDays(Number(value))}>
                  <SelectTrigger className="w-24 h-6 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 Tage</SelectItem>
                    <SelectItem value="90">90 Tage</SelectItem>
                    <SelectItem value="180">180 Tage</SelectItem>
                    <SelectItem value="365">365 Tage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 flex items-center justify-center body-secondary">Laden...</div>
            ) : topProblemBuildingsData.length === 0 ? (
              <div className="h-64 flex items-center justify-center body-secondary">
                Keine Daten im ausgewählten Zeitraum
              </div>
            ) : (
              <ChartContainer
                config={{
                  value: {
                    label: "Meldungen pro Person",
                    color: "hsl(22 93% 53%)",
                  },
                }}
                className="h-48 sm:h-64"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={topProblemBuildingsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      type="category"
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      interval={0}
                      fontSize={10}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis type="number" />
                    <ChartTooltip 
                      content={<ChartTooltipContent />}
                      formatter={(value: any, name: any, props: any) => [
                        `${value.toFixed(2)} (${props.payload.rawCount} Meldungen / ${props.payload.occupants} ${managementMode === 'weg' ? 'Eigentümer' : 'Mieter'})`,
                        "Meldungen pro Person"
                      ]}
                    />
                    <Bar 
                      dataKey="value" 
                      fill="hsl(22 93% 53%)"
                      radius={[4, 4, 0, 0]}
                    />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
