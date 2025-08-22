
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Filter, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { useManagementMode } from "@/hooks/useManagementMode";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Report {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  building_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  attachments: any;
  reported_by?: string;
  updated_at?: string;
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
      const { data, error } = await supabase
        .from(tableName)
        .select(`
          *,
          buildings (
            name,
            address,
            manager_name
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const reports = (data || []) as Report[];
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
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-medium mb-1">{report.title}</h3>
            <p className="text-sm text-muted-foreground mb-1">
              {formatDateTime(report.created_at)}
            </p>
            {report.buildings && (
              <p className="text-sm text-muted-foreground">
                {report.buildings.name} - {report.buildings.address}
                {report.buildings.manager_name && (
                  <span className="ml-2 text-blue-600">
                    (Verwalter: {report.buildings.manager_name})
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {getStatusBadge(report.status)}
            {getPriorityBadge(report.priority)}
          </div>
        </div>
        
        <p className="text-muted-foreground mb-4">{report.description}</p>
        
        <div className="text-sm text-muted-foreground mb-4">
          <p><strong>Kontakt:</strong> {report.contact_name} ({report.contact_email})</p>
          {report.contact_phone && <p><strong>Telefon:</strong> {report.contact_phone}</p>}
        </div>

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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">
            {managementMode === "weg" ? "WEG-" : "Miet-"}Meldungen
          </h1>
          <p className="text-muted-foreground">
            Übersicht aller {managementMode === "weg" ? "WEG-" : "Miet-"}Meldungen
          </p>
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
            Offene Meldungen ({filteredOpenReports.length})
          </h2>
          {filteredOpenReports.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">Keine offenen Meldungen</p>
              </CardContent>
            </Card>
          ) : (
            filteredOpenReports.map(renderReportCard)
          )}
        </div>

        {/* In Progress Reports - Collapsible */}
        <div className="space-y-4">
          <Collapsible open={isInProgressOpen} onOpenChange={setIsInProgressOpen}>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer">
                <h2 className="text-xl font-semibold text-yellow-600">
                  Bearbeitete Meldungen ({filteredInProgressReports.length})
                </h2>
                {isInProgressOpen ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4">
              {filteredInProgressReports.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <p className="text-muted-foreground">Keine bearbeiteten Meldungen</p>
                  </CardContent>
                </Card>
              ) : (
                filteredInProgressReports.map(renderReportCard)
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
};
