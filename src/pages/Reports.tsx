import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertCircle, Clock, CheckCircle, Plus, Edit, ChevronDown, ChevronUp, Filter, Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Component to handle async attachment URL loading
const AttachmentLink = ({ attachment, index }: { attachment: any; index: number }) => {
  const [url, setUrl] = useState("#");

  useEffect(() => {
    const loadUrl = async () => {
      if (attachment.url) {
        setUrl(attachment.url);
      } else if (attachment.path) {
        const { data } = await supabase.storage
          .from('report-attachments')
          .createSignedUrl(attachment.path, 3600);
        setUrl(data?.signedUrl || "#");
      }
    };
    loadUrl();
  }, [attachment]);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"
    >
      {attachment.name || `Anhang ${index + 1}`}
    </a>
  );
};

// Predefined admin note responses
const predefinedAdminNotes = [
  "Handwerker wurde informiert und meldet sich bei Ihnen.",
  "Reparatur wurde veranlasst und wird zeitnah durchgeführt.",
  "Hausmeister wurde beauftragt, das Problem zu lösen.",
  "Wartungsarbeiten sind für nächste Woche geplant.",
  "Problem wurde an zuständige Firma weitergeleitet.",
  "Ersatzteile wurden bestellt, Reparatur erfolgt nach Lieferung.",
  "Termine für Besichtigung wurde vereinbart.",
  "Kostenvoranschlag wird eingeholt und Ihnen mitgeteilt."
];

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
  internal_notes?: string;
  admin_notes?: string;
  building_id?: string;
  attachments?: any[];
}

interface Building {
  id: string;
  name: string;
  address: string;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "open":
      return <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />Offen</Badge>;
    case "in_progress":
      return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Bearbeitet</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getPriorityBadge = (priority: string) => {
  switch (priority) {
    case "high":
      return <Badge variant="destructive">Hoch</Badge>;
    case "medium":
      return <Badge variant="secondary">Mittel</Badge>;
    case "low":
      return <Badge variant="outline">Niedrig</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
};

export const Reports = () => {
  const { managementMode } = useManagementMode();
  const [reports, setReports] = useState<Report[]>([]);
  const [filteredReports, setFilteredReports] = useState<Report[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("all");
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedAdminNote, setSelectedAdminNote] = useState("");
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    status: "all",
    building: "all",
    dateFrom: "",
    dateTo: ""
  });

  useEffect(() => {
    fetchReports();
    fetchBuildings();
  }, [managementMode]);

  useEffect(() => {
    filterReports();
  }, [reports, searchTerm, statusFilter, priorityFilter, timeFilter]);

  const filterReports = () => {
    let filtered = [...reports];

    if (searchTerm) {
      filtered = filtered.filter(report => 
        report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.contact_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter && statusFilter !== "all") {
      filtered = filtered.filter(report => report.status === statusFilter);
    }

    if (priorityFilter && priorityFilter !== "all") {
      filtered = filtered.filter(report => report.priority === priorityFilter);
    }

    if (timeFilter && timeFilter !== "all") {
      const now = new Date();
      const filterDate = new Date();
      
      switch (timeFilter) {
        case "today":
          filterDate.setHours(0, 0, 0, 0);
          filtered = filtered.filter(report => new Date(report.created_at) >= filterDate);
          break;
        case "week":
          filterDate.setDate(now.getDate() - 7);
          filtered = filtered.filter(report => new Date(report.created_at) >= filterDate);
          break;
        case "month":
          filterDate.setMonth(now.getMonth() - 1);
          filtered = filtered.filter(report => new Date(report.created_at) >= filterDate);
          break;
      }
    }

    setFilteredReports(filtered);
  };

  const fetchReports = async () => {
    try {
      setLoading(true);
      const tableName = managementMode === "weg" ? "weg_reports" : "miete_reports";
      
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Parse attachments if they are stored as strings
      const processedData = (data as any)?.map((report: any) => ({
        ...report,
        attachments: typeof report.attachments === 'string' 
          ? JSON.parse(report.attachments || '[]') 
          : report.attachments || []
      })) || [];
      
      setReports(processedData);
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBuildings = async () => {
    try {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address");

      if (error) throw error;
      setBuildings(data || []);
    } catch (error) {
      console.error("Error fetching buildings:", error);
    }
  };

  const getBuildingAddress = (buildingId?: string) => {
    if (!buildingId) return "Nicht zugeordnet";
    const building = buildings.find(b => b.id === buildingId);
    return building ? building.address : "Nicht zugeordnet";
  };

  const handleEditReport = (report: Report) => {
    setEditingReport({ ...report });
    setSelectedAdminNote("");
    setIsEditDialogOpen(true);
  };

  const handleUpdateReport = async () => {
    if (!editingReport) return;

    try {
      const tableName = managementMode === "weg" ? "weg_reports" : "miete_reports";
      
      const { error } = await supabase
        .from(tableName)
        .update({
          status: editingReport.status,
          internal_notes: editingReport.internal_notes,
          admin_notes: editingReport.admin_notes,
          updated_at: new Date().toISOString()
        })
        .eq("id", editingReport.id);

      if (error) throw error;

      // Update local state
      setReports(reports.map(report => 
        report.id === editingReport.id ? editingReport : report
      ));
      
      setIsEditDialogOpen(false);
      setEditingReport(null);
      toast.success("Meldung erfolgreich aktualisiert");
    } catch (error) {
      console.error("Error updating report:", error);
      toast.error("Fehler beim Aktualisieren der Meldung");
    }
  };

  const exportToCSV = () => {
    let dataToExport = reports;
    
    // Apply filters
    if (exportFilters.status && exportFilters.status !== "all") {
      dataToExport = dataToExport.filter(report => report.status === exportFilters.status);
    }
    if (exportFilters.building && exportFilters.building !== "all") {
      dataToExport = dataToExport.filter(report => report.building_id === exportFilters.building);
    }
    if (exportFilters.dateFrom) {
      dataToExport = dataToExport.filter(report => 
        new Date(report.created_at) >= new Date(exportFilters.dateFrom)
      );
    }
    if (exportFilters.dateTo) {
      dataToExport = dataToExport.filter(report => 
        new Date(report.created_at) <= new Date(exportFilters.dateTo)
      );
    }

    // Create CSV content
    const headers = [
      "ID", "Titel", "Beschreibung", "Status", "Priorität", "Gebäude", "Kontakt Name", 
      "Kontakt Email", "Kontakt Telefon", "Erstellt am", "Aktualisiert am",
      "Verwalter-Notizen", "Interne Notizen"
    ];
    
    const csvContent = [
      headers.join(","),
      ...dataToExport.map(report => [
        report.id,
        `"${report.title.replace(/"/g, '""')}"`,
        `"${report.description?.replace(/"/g, '""') || ''}"`,
        report.status,
        report.priority,
        `"${getBuildingAddress(report.building_id).replace(/"/g, '""')}"`,
        `"${report.contact_name?.replace(/"/g, '""') || ''}"`,
        report.contact_email || '',
        report.contact_phone || '',
        new Date(report.created_at).toLocaleDateString('de-DE'),
        new Date(report.updated_at).toLocaleDateString('de-DE'),
        `"${report.admin_notes?.replace(/"/g, '""') || ''}"`,
        `"${report.internal_notes?.replace(/"/g, '""') || ''}"`
      ].join(","))
    ].join("\n");

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `meldungen_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setIsExportDialogOpen(false);
    toast.success("Export erfolgreich heruntergeladen");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Laden...</div>
      </div>
    );
  }

  const openReports = filteredReports.filter(r => r.status === "open");
  const inProgressReports = filteredReports.filter(r => r.status === "in_progress");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Meldungen</h1>
          <p className="text-lg text-muted-foreground">
            Verwalten Sie alle eingehenden Meldungen
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Zeitraum" />
            </SelectTrigger>
            <SelectContent className="bg-background border border-border shadow-lg z-50">
              <SelectItem value="all">Alle Zeiträume</SelectItem>
              <SelectItem value="today">Heute</SelectItem>
              <SelectItem value="week">Letzte Woche</SelectItem>
              <SelectItem value="month">Letzter Monat</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={() => setIsExportDialogOpen(true)}
            variant="outline"
            className="bg-secondary/50 hover:bg-secondary"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportieren
          </Button>
          <Button 
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            variant="outline"
            className="bg-secondary/50 hover:bg-secondary"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filter
            {isFiltersOpen ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
          </Button>
        </div>
      </div>

      {/* Filter Section */}
      <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
        <CollapsibleContent>
          <Card className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filter:</span>
              </div>
              <div className="flex-1 min-w-64">
                <Input
                  placeholder="Suchen nach Titel, Beschreibung oder Kontakt..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-background border border-border shadow-lg z-50">
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="open">Offen</SelectItem>
                  <SelectItem value="in_progress">Bearbeitet</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Priorität" />
                </SelectTrigger>
                <SelectContent className="bg-background border border-border shadow-lg z-50">
                  <SelectItem value="all">Alle Prioritäten</SelectItem>
                  <SelectItem value="high">Hoch</SelectItem>
                  <SelectItem value="medium">Mittel</SelectItem>
                  <SelectItem value="low">Niedrig</SelectItem>
                </SelectContent>
              </Select>
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Zeitraum" />
                </SelectTrigger>
                <SelectContent className="bg-background border border-border shadow-lg z-50">
                  <SelectItem value="all">Alle Zeiträume</SelectItem>
                  <SelectItem value="today">Heute</SelectItem>
                  <SelectItem value="week">Letzte Woche</SelectItem>
                  <SelectItem value="month">Letzter Monat</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Summary Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
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
            <div className="text-2xl font-bold text-destructive">{openReports.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bearbeitet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{inProgressReports.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Open Reports */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Offene Meldungen</h3>
        {openReports.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Keine offenen Meldungen vorhanden.</p>
          </div>
        ) : (
          openReports.map((report) => (
            <Card key={report.id} className="hover:shadow-md transition-shadow">
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
                <div className="grid gap-4 md:grid-cols-4">
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
                    <p className="text-sm font-medium">Gebäude</p>
                    <p className="text-sm text-muted-foreground">{getBuildingAddress(report.building_id)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Erstellt</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(report.created_at).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                </div>
                
                {/* Attachments */}
                {report.attachments && report.attachments.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">Anhänge:</p>
                    <div className="flex flex-wrap gap-2">
                      {report.attachments.map((attachment: any, index: number) => (
                        <AttachmentLink 
                          key={index}
                          attachment={attachment}
                          index={index}
                        />
                      ))}
                    </div>
                  </div>
                )}
              
                {/* Admin Notes */}
                {report.admin_notes && (
                  <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-sm font-medium text-primary mb-1">Verwalter-Notiz:</p>
                    <p className="text-sm">{report.admin_notes}</p>
                  </div>
                )}
                
                {/* Internal Notes */}
                {report.internal_notes && (
                  <div className="mt-4 p-3 bg-muted border rounded-lg">
                    <p className="text-sm font-medium mb-1">Interne Notiz (nur Admin):</p>
                    <p className="text-sm text-muted-foreground">{report.internal_notes}</p>
                  </div>
                )}

                <div className="flex space-x-2 mt-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleEditReport(report)}
                  >
                    <Edit className="mr-1 h-3 w-3" />
                    Bearbeiten
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* In Progress Reports */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Bearbeitete Meldungen</h3>
        {inProgressReports.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-muted-foreground">Keine bearbeiteten Meldungen.</p>
          </div>
        ) : (
          inProgressReports.map((report) => (
            <Card key={report.id} className="hover:shadow-md transition-shadow border-yellow-200">
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
                <div className="grid gap-4 md:grid-cols-4">
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
                    <p className="text-sm font-medium">Gebäude</p>
                    <p className="text-sm text-muted-foreground">{getBuildingAddress(report.building_id)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Erstellt</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(report.created_at).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                </div>
                
                {/* Attachments */}
                {report.attachments && report.attachments.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">Anhänge:</p>
                    <div className="flex flex-wrap gap-2">
                      {report.attachments.map((attachment: any, index: number) => (
                        <AttachmentLink 
                          key={index}
                          attachment={attachment}
                          index={index}
                        />
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Admin Notes */}
                {report.admin_notes && (
                  <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-sm font-medium text-primary mb-1">Verwalter-Notiz:</p>
                    <p className="text-sm">{report.admin_notes}</p>
                  </div>
                )}
                
                {/* Internal Notes */}
                {report.internal_notes && (
                  <div className="mt-4 p-3 bg-muted border rounded-lg">
                    <p className="text-sm font-medium mb-1">Interne Notiz (nur Admin):</p>
                    <p className="text-sm text-muted-foreground">{report.internal_notes}</p>
                  </div>
                )}

                <div className="flex space-x-2 mt-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleEditReport(report)}
                  >
                    <Edit className="mr-1 h-3 w-3" />
                    Bearbeiten
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Meldung bearbeiten</DialogTitle>
          </DialogHeader>
          {editingReport && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="status">Status</Label>
                <div className="flex gap-2 mt-1">
                  <Button 
                    type="button"
                    variant={editingReport?.status === "open" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEditingReport(prev => prev ? {...prev, status: "open"} : null)}
                  >
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Offen
                  </Button>
                  <Button 
                    type="button"
                    variant={editingReport?.status === "in_progress" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEditingReport(prev => prev ? {...prev, status: "in_progress"} : null)}
                  >
                    <Clock className="mr-1 h-3 w-3" />
                    Bearbeitet
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="internal_notes">Interne Notizen (nur für Admins)</Label>
                <Textarea
                  id="internal_notes"
                  placeholder="Interne Notizen eingeben..."
                  value={editingReport?.internal_notes || ""}
                  onChange={(e) => setEditingReport(prev => prev ? {...prev, internal_notes: e.target.value} : null)}
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="admin_notes">Verwalter-Notizen (sichtbar für Mieter/Eigentümer)</Label>
                <div className="space-y-2">
                  <Select 
                    value={selectedAdminNote} 
                    onValueChange={(value) => {
                      setSelectedAdminNote(value);
                      if (value && editingReport) {
                        const currentNotes = editingReport.admin_notes || "";
                        const newNotes = currentNotes ? `${currentNotes}\n${value}` : value;
                        setEditingReport(prev => prev ? {...prev, admin_notes: newNotes} : null);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Vorgefertigte Antwort auswählen (optional)" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border border-border shadow-lg z-50 max-h-60 overflow-y-auto">
                      {predefinedAdminNotes.map((note, index) => (
                        <SelectItem key={index} value={note}>
                          {note}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    id="admin_notes"
                    placeholder="Notizen für Mieter/Eigentümer eingeben..."
                    value={editingReport?.admin_notes || ""}
                    onChange={(e) => setEditingReport(prev => prev ? {...prev, admin_notes: e.target.value} : null)}
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button onClick={handleUpdateReport}>
                  Änderungen speichern
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Meldungen exportieren
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="export_status">Status Filter</Label>
              <Select 
                value={exportFilters.status} 
                onValueChange={(value) => setExportFilters(prev => ({...prev, status: value}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Alle Status" />
                </SelectTrigger>
                <SelectContent className="bg-background border border-border shadow-lg z-50">
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="open">Offen</SelectItem>
                  <SelectItem value="in_progress">Bearbeitet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="export_building">Gebäude Filter</Label>
              <Select 
                value={exportFilters.building} 
                onValueChange={(value) => setExportFilters(prev => ({...prev, building: value}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Alle Gebäude" />
                </SelectTrigger>
                <SelectContent className="bg-background border border-border shadow-lg z-50">
                  <SelectItem value="all">Alle Gebäude</SelectItem>
                  {buildings.map((building) => (
                    <SelectItem key={building.id} value={building.id}>
                      {building.name} - {building.address}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="date_from">Von Datum</Label>
                <Input
                  id="date_from"
                  type="date"
                  value={exportFilters.dateFrom}
                  onChange={(e) => setExportFilters(prev => ({...prev, dateFrom: e.target.value}))}
                />
              </div>
              <div>
                <Label htmlFor="date_to">Bis Datum</Label>
                <Input
                  id="date_to"
                  type="date"
                  value={exportFilters.dateTo}
                  onChange={(e) => setExportFilters(prev => ({...prev, dateTo: e.target.value}))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button onClick={exportToCSV} className="bg-primary text-primary-foreground">
                <Download className="h-4 w-4 mr-2" />
                CSV exportieren
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};