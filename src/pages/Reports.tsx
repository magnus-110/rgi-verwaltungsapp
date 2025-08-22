import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Filter, ChevronDown, ChevronUp, FileText, Download, Edit, Copy } from "lucide-react";
import { useManagementMode } from "@/hooks/useManagementMode";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EditReportDialog } from "@/components/reports/EditReportDialog";
import { ReportTemplatesManager } from "@/components/ReportTemplatesManager";
import * as XLSX from 'xlsx';

interface Report {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  building_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  attachments: any;
  reported_by?: string;
  updated_at?: string;
  admin_notes?: string;
  internal_notes?: string;
  buildings?: {
    name: string;
    address: string;
    manager_name?: string | null;
  } | null;
}

interface Building {
  id: string;
  name: string;
  address: string;
  manager_name?: string | null;
}

export const Reports = () => {
  const { profile } = useAuth();
  const { managementMode } = useManagementMode();
  const [openReports, setOpenReports] = useState<Report[]>([]);
  const [inProgressReports, setInProgressReports] = useState<Report[]>([]);
  const [filteredOpenReports, setFilteredOpenReports] = useState<Report[]>([]);
  const [filteredInProgressReports, setFilteredInProgressReports] = useState<Report[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [managerFilter, setManagerFilter] = useState<string>("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isInProgressOpen, setIsInProgressOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<string>("all");
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [activeTab, setActiveTab] = useState("reports");

  const tableName = managementMode === "weg" ? "weg_reports" : "miete_reports";

  useEffect(() => {
    if (profile) {
      fetchReports();
      fetchBuildings();
    }
  }, [profile, managementMode]);

  const fetchBuildings = async () => {
    try {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address, manager_name")
        .eq("management_mode", managementMode)
        .order("name");

      if (error) throw error;
      setBuildings(data || []);
      
      // Extract unique managers
      const uniqueManagers = [...new Set(
        (data || [])
          .map(b => b.manager_name)
          .filter(manager => manager && manager.trim() !== "")
      )].sort();
      setManagers(uniqueManagers);
    } catch (error) {
      console.error("Error fetching buildings:", error);
    }
  };

  const fetchReports = async () => {
    try {
      setLoading(true);
      
      // First fetch reports
      const { data: reportsData, error: reportsError } = await supabase
        .from(tableName)
        .select("*")
        .order("created_at", { ascending: false });

      if (reportsError) throw reportsError;

      // Then fetch buildings data separately and merge
      const { data: buildingsData, error: buildingsError } = await supabase
        .from("buildings")
        .select("id, name, address, manager_name")
        .eq("management_mode", managementMode);

      if (buildingsError) throw buildingsError;

      // Create a buildings lookup map
      const buildingsMap = new Map(
        (buildingsData || []).map(building => [building.id, building])
      );

      // Merge the data
      const reports: Report[] = (reportsData || []).map(report => ({
        ...report,
        buildings: buildingsMap.get(report.building_id) || null
      }));
      
      const open = reports.filter(report => report.status === "open");
      const inProgress = reports.filter(report => report.status === "in_progress");

      setOpenReports(open);
      setInProgressReports(inProgress);
      setFilteredOpenReports(open);
      setFilteredInProgressReports(inProgress);
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast({
        title: "Fehler",
        description: "Meldungen konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const filterReports = (reports: Report[]) => {
      let filtered = reports;

      if (searchTerm) {
        filtered = filtered.filter(report =>
          report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          report.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          report.contact_name.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      if (buildingFilter !== "all") {
        filtered = filtered.filter(report => report.building_id === buildingFilter);
      }

      if (managerFilter !== "all") {
        filtered = filtered.filter(report => 
          report.buildings?.manager_name === managerFilter
        );
      }

      return filtered;
    };

    setFilteredOpenReports(filterReports(openReports));
    setFilteredInProgressReports(filterReports(inProgressReports));
  }, [openReports, inProgressReports, searchTerm, buildingFilter, managerFilter]);

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Kopiert",
      description: "Text wurde in die Zwischenablage kopiert.",
    });
  };

  const exportToExcel = () => {
    const allReports = [...filteredOpenReports, ...filteredInProgressReports];
    const excelData = allReports.map(report => ({
      Titel: report.title,
      Beschreibung: report.description,
      Status: report.status === "open" ? "Offen" : "Bearbeitet",
      Erstellt: formatDateTime(report.created_at),
      Gebäude: report.buildings?.name || "",
      Adresse: report.buildings?.address || "",
      Verwalter: report.buildings?.manager_name || "",
      Kontakt: report.contact_name,
      Email: report.contact_email,
      Telefon: report.contact_phone || "",
      "Admin-Notizen": report.admin_notes || ""
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Meldungen");
    XLSX.writeFile(wb, `${managementMode === "weg" ? "WEG" : "Miet"}-Meldungen.xlsx`);
  };

  const getFilteredReportsByTimeRange = (reports: Report[]) => {
    if (timeRange === "all") return reports;
    
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case "today":
        startDate.setHours(0, 0, 0, 0);
        break;
      case "week":
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "year":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        return reports;
    }
    
    return reports.filter(report => new Date(report.created_at) >= startDate);
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString('de-DE');
    const timeStr = date.toLocaleTimeString('de-DE', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    return profile?.role === 'admin' ? `${dateStr} ${timeStr}` : dateStr;
  };

  const renderReportCard = (report: Report) => (
    <Card key={report.id} className="border-0 shadow-sm bg-white">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg font-medium">{report.title}</h3>
          <div className="flex gap-2 items-center">
            {getStatusBadge(report.status)}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(`${report.title}\n${report.description}`)}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingReport(report)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground mb-4">{report.description}</p>
        
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div className="space-y-1">
            <p><strong>Kontakt:</strong> {report.contact_name}</p>
            <p><strong>Telefon:</strong> {report.contact_phone || 'Nicht angegeben'}</p>
          </div>
          <div className="space-y-1">
            <p><strong>Gebäude:</strong> {report.buildings?.address || 'Nicht zugewiesen'}</p>
            <p><strong>Erstellt:</strong> {formatDateTime(report.created_at)}</p>
          </div>
        </div>

        {report.admin_notes && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-medium mb-1 text-blue-800">Verwalter-Notiz:</h4>
            <p className="text-sm text-blue-700">{report.admin_notes}</p>
          </div>
        )}

        {report.attachments && report.attachments.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Anhänge:</h4>
            <div className="grid grid-cols-2 gap-2">
              {report.attachments.map((attachment: any, index: number) => (
                <div key={index} className="flex items-center p-2 bg-muted rounded-lg">
                  <FileText className="h-4 w-4 mr-2 text-blue-600" />
                  <a
                    href={`https://eebphowrbarzawwixqcc.supabase.co/storage/v1/object/public/report-attachments/${attachment.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 truncate"
                  >
                    {attachment.name}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Laden...</div>
      </div>
    );
  }

  // Get time-filtered reports for display and counts
  const timeFilteredOpenReports = getFilteredReportsByTimeRange(filteredOpenReports);
  const timeFilteredInProgressReports = getFilteredReportsByTimeRange(filteredInProgressReports);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">
            {managementMode === "weg" ? "WEG-" : "Miet-"}Meldungen
          </h1>
          <p className="text-muted-foreground">
            Übersicht aller {managementMode === "weg" ? "WEG-" : "Miet-"}Meldungen
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="reports">Meldungen</TabsTrigger>
              <TabsTrigger value="templates">Vorlagen</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Zeitraum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="today">Heute</SelectItem>
                <SelectItem value="week">Diese Woche</SelectItem>
                <SelectItem value="month">Diesen Monat</SelectItem>
                <SelectItem value="year">Dieses Jahr</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={exportToExcel}>
              <Download className="h-4 w-4 mr-2" />
              Exportieren
            </Button>

            <Button 
              variant="outline" 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="reports" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Offen</h3>
                      <p className="text-3xl font-bold text-foreground">{timeFilteredOpenReports.length}</p>
                    </div>
                    <div className="text-muted-foreground">
                      <FileText className="h-8 w-8" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Bearbeitet</h3>
                      <p className="text-3xl font-bold text-foreground">{timeFilteredInProgressReports.length}</p>
                    </div>
                    <div className="text-muted-foreground">
                      <FileText className="h-8 w-8" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Collapsible Filters */}
            <Card>
              <Collapsible open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Filter
                      </CardTitle>
                      {isFilterOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Input
                          placeholder="Nach Meldung suchen..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                      <div>
                        <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="Gebäude filtern" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Alle Gebäude</SelectItem>
                            {buildings.map((building) => (
                              <SelectItem key={building.id} value={building.id}>
                                {building.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Select value={managerFilter} onValueChange={setManagerFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="Verwalter filtern" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Alle Verwalter</SelectItem>
                            {managers.map((manager) => (
                              <SelectItem key={manager} value={manager}>
                                {manager}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Open Reports */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-red-600">
                Offene Meldungen ({timeFilteredOpenReports.length})
              </h2>
              {timeFilteredOpenReports.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <p className="text-muted-foreground">Keine offenen Meldungen</p>
                  </CardContent>
                </Card>
              ) : (
                timeFilteredOpenReports.map(renderReportCard)
              )}
            </div>

            {/* In Progress Reports - Collapsible */}
            <div className="space-y-4">
              <Collapsible open={isInProgressOpen} onOpenChange={setIsInProgressOpen}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer">
                    <h2 className="text-xl font-semibold text-yellow-600">
                      Bearbeitete Meldungen ({timeFilteredInProgressReports.length})
                    </h2>
                    {isInProgressOpen ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4">
                  {timeFilteredInProgressReports.length === 0 ? (
                    <Card>
                      <CardContent className="text-center py-8">
                        <p className="text-muted-foreground">Keine bearbeiteten Meldungen</p>
                      </CardContent>
                    </Card>
                  ) : (
                    timeFilteredInProgressReports.map(renderReportCard)
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          </TabsContent>

          <TabsContent value="templates">
            <ReportTemplatesManager />
          </TabsContent>
        </Tabs>

        {/* Edit Report Dialog */}
        {editingReport && (
          <EditReportDialog
            report={editingReport}
            tableName={tableName}
            open={!!editingReport}
            onClose={() => setEditingReport(null)}
            onSaved={() => {
              fetchReports();
              setEditingReport(null);
            }}
          />
        )}
      </div>
    </div>
  );
};
