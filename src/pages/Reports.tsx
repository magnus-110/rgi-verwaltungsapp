import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { Filter, ChevronDown, ChevronUp, FileText, Download, Edit, Copy, CalendarIcon, X, FolderPlus, Link2, Search, Phone, Mail, Building2, User, StickyNote, Lock, Paperclip, Inbox as InboxIcon, AlertCircle, Clock } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { useManagementMode } from "@/hooks/useManagementMode";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EditReportDialog } from "@/components/reports/EditReportDialog";
import { ReportTemplatesManager } from "@/components/ReportTemplatesManager";
import { CreateCaseDialog } from "@/components/cases/CreateCaseDialog";
import { LinkReportToCaseDialog } from "@/components/cases/LinkReportToCaseDialog";
import { useAddCaseEvent } from "@/hooks/useCases";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
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
  case_id?: string | null;
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

interface AttachmentWithUrl {
  name: string;
  path: string;
  size: number;
  type: string;
  signedUrl?: string;
}

// Helper function to safely parse attachments
const parseAttachments = (attachments: any): any[] => {
  if (!attachments) return [];
  if (Array.isArray(attachments)) return attachments;
  if (typeof attachments === 'string') {
    try {
      const parsed = JSON.parse(attachments);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const Reports = () => {
  const { profile } = useAuth();
  const { managementMode } = useManagementMode();
  const [openReports, setOpenReports] = useState<Report[]>([]);
  const [inProgressReports, setInProgressReports] = useState<Report[]>([]);
  const [filteredOpenReports, setFilteredOpenReports] = useState<Report[]>([]);
  const [filteredInProgressReports, setFilteredInProgressReports] = useState<Report[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [managerFilter, setManagerFilter] = useState<string>("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isInProgressOpen, setIsInProgressOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<string>("all");
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [activeTab, setActiveTab] = useState("reports");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    building: "all",
    status: "all"
  });
  const [attachmentUrls, setAttachmentUrls] = useState<{[key: string]: AttachmentWithUrl[]}>({});
  const [createCaseFromReport, setCreateCaseFromReport] = useState<Report | null>(null);
  const [linkReportToCase, setLinkReportToCase] = useState<Report | null>(null);
  const addEvent = useAddCaseEvent();

  const tableName = managementMode === "weg" ? "weg_reports" : "miete_reports";

  useEffect(() => {
    if (profile) {
      fetchReports();
      fetchBuildings();
    }
  }, [profile, managementMode]);

  // Real-time subscription for new reports
  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('reports-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: tableName
        },
        (payload) => {
          console.log('New report received:', payload);
          // Add the new report to the beginning of the list
          fetchReports(); // Refetch to get complete data with building info
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: tableName
        },
        (payload) => {
          console.log('Report updated:', payload);
          fetchReports(); // Refetch to get updated data
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, tableName]);

  const fetchBuildings = async () => {
    try {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address, manager_name")
        .eq("management_mode", managementMode)
        .order("name");

      if (error) throw error;
      setBuildings(data || []);
      
      // Fetch admin managers separately
      const { data: managersData, error: managersError } = await supabase
        .from("building_managers")
        .select(`
          id,
          user_id,
          building_id,
          profiles:user_id (
            first_name,
            last_name,
            email
          )
        `);

      if (managersError) throw managersError;

      // Filter managers for current buildings
      const filteredManagers = (managersData || []).filter(bm => 
        (data || []).some(building => building.id === bm.building_id)
      );

      // Extract unique managers
      const uniqueManagers = [...new Map(
        filteredManagers.map(bm => [
          bm.user_id,
          {
            id: bm.user_id,
            name: (bm.profiles as any)?.first_name && (bm.profiles as any)?.last_name 
              ? `${(bm.profiles as any).first_name} ${(bm.profiles as any).last_name}`
              : (bm.profiles as any)?.email || 'Unbekannter Admin'
          }
        ])
      ).values()];
      
      setManagers(uniqueManagers);
    } catch (error) {
      console.error("Error fetching buildings:", error);
    }
  };

  const generateSignedUrls = async (reportId: string, attachments: any) => {
    const attachmentsArray = parseAttachments(attachments);
    if (attachmentsArray.length === 0) return [];

    const attachmentsWithUrls: AttachmentWithUrl[] = [];

    for (const attachment of attachmentsArray) {
      try {
        const { data, error } = await supabase.storage
          .from('report-attachments')
          .createSignedUrl(attachment.path, 3600);

        if (error) {
          console.error('Error generating signed URL:', error);
          attachmentsWithUrls.push({ ...attachment, signedUrl: undefined });
        } else {
          attachmentsWithUrls.push({ ...attachment, signedUrl: data.signedUrl });
        }
      } catch (error) {
        console.error('Error generating signed URL:', error);
        attachmentsWithUrls.push({ ...attachment, signedUrl: undefined });
      }
    }

    return attachmentsWithUrls;
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

      // Fetch building managers data
      const { data: managersData, error: managersError } = await supabase
        .from("building_managers")
        .select(`
          building_id,
          user_id,
          profiles:user_id (
            first_name,
            last_name,
            email
          )
        `);

      if (managersError) throw managersError;

      // Create a managers lookup map
      const managersMap = new Map();
      (managersData || []).forEach(bm => {
        if (!managersMap.has(bm.building_id)) {
          managersMap.set(bm.building_id, []);
        }
        managersMap.get(bm.building_id).push({
          user_id: bm.user_id,
          name: (bm.profiles as any)?.first_name && (bm.profiles as any)?.last_name 
            ? `${(bm.profiles as any).first_name} ${(bm.profiles as any).last_name}`
            : (bm.profiles as any)?.email || 'Unbekannter Admin'
        });
      });

      // Create a buildings lookup map
      const buildingsMap = new Map(
        (buildingsData || []).map(building => [building.id, {
          ...building,
          managers: managersMap.get(building.id) || []
        }])
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

      // Generate signed URLs for attachments
      const urlPromises = reports.map(async (report) => {
        const attachmentsArray = parseAttachments(report.attachments);
        if (attachmentsArray.length > 0) {
          const attachmentsWithUrls = await generateSignedUrls(report.id, report.attachments);
          return { reportId: report.id, attachments: attachmentsWithUrls };
        }
        return { reportId: report.id, attachments: [] };
      });

      const urlsResults = await Promise.all(urlPromises);
      const urlsMap: {[key: string]: AttachmentWithUrl[]} = {};
      urlsResults.forEach(result => {
        urlsMap[result.reportId] = result.attachments;
      });

      setAttachmentUrls(urlsMap);
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
        filtered = filtered.filter(report => {
          const building = report.buildings as any;
          return building?.managers?.some((manager: any) => manager.user_id === managerFilter);
        });
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

  const copyToClipboard = (report: Report) => {
    const text = `Name: ${report.contact_name}
Erstellt am: ${formatDateTime(report.created_at)}
Titel: ${report.title}
Beschreibung: ${report.description}`;
    
    navigator.clipboard.writeText(text);
    toast({
      title: "Kopiert",
      description: "Meldungsinformationen wurden in die Zwischenablage kopiert.",
    });
  };

  const exportToExcel = () => {
    // Apply export filters
    let allReports = [...openReports, ...inProgressReports];
    
    // Filter by date range
    if (exportFilters.startDate || exportFilters.endDate) {
      allReports = allReports.filter(report => {
        const reportDate = new Date(report.created_at);
        const startOk = !exportFilters.startDate || reportDate >= exportFilters.startDate;
        const endOk = !exportFilters.endDate || reportDate <= exportFilters.endDate;
        return startOk && endOk;
      });
    }
    
    // Filter by building
    if (exportFilters.building !== "all") {
      allReports = allReports.filter(report => report.building_id === exportFilters.building);
    }
    
    // Filter by status
    if (exportFilters.status !== "all") {
      allReports = allReports.filter(report => report.status === exportFilters.status);
    }
    
    const excelData = allReports.map(report => ({
      Titel: report.title,
      Beschreibung: report.description,
      Status: report.status === "open" ? "Offen" : report.status === "in_progress" ? "Bearbeitet" : "Erledigt",
      Erstellt: formatDateTime(report.created_at),
      Gebäude: report.buildings?.name || "",
      Adresse: report.buildings?.address || "",
      Verwalter: (report.buildings as any)?.managers?.map((m: any) => m.name).join(', ') || 'Nicht zugewiesen',
      Kontakt: report.contact_name,
      Email: report.contact_email,
      Telefon: report.contact_phone || "",
      "Admin-Notizen": report.admin_notes || ""
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Meldungen");
    XLSX.writeFile(wb, `${managementMode === "weg" ? "WEG" : "Miet"}-Meldungen.xlsx`);
    
    setExportDialogOpen(false);
    toast({
      title: "Export erfolgreich",
      description: `${excelData.length} Meldungen wurden exportiert.`,
    });
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

  const formatRelative = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: de });
    } catch {
      return formatDateTime(dateString);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "?";
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");
  };

  const renderReportCard = (report: Report) => {
    const accent = report.status === "open" ? "border-l-destructive" : "border-l-warning";
    const managerNames = (report.buildings as any)?.managers?.map((m: any) => m.name).join(', ') || 'Nicht zugewiesen';
    const attachments = attachmentUrls[report.id] || parseAttachments(report.attachments);

    return (
      <Card key={report.id} className={cn("rgi-card border-l-4 hover:shadow-md transition-all", accent)}>
        <CardContent className="p-5">
          {/* Header row */}
          <div className="flex items-start gap-3 mb-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                {getInitials(report.contact_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold leading-snug truncate">{report.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="font-medium text-foreground/80">{report.contact_name || 'Unbekannt'}</span>
                    <span>·</span>
                    <span title={formatDateTime(report.created_at)}>{formatRelative(report.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-70 hover:opacity-100 transition-opacity">
                  {report.case_id ? (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Link2 className="h-3 w-3" />
                      Vorgang
                    </Badge>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCreateCaseFromReport(report)}
                        title="Neuen Vorgang aus Meldung erstellen"
                      >
                        <FolderPlus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setLinkReportToCase(report)}
                        title="Mit existierendem Vorgang verknüpfen"
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {getStatusBadge(report.status)}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => copyToClipboard(report)}
                    title="Kopieren"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditingReport(report)}
                    title="Bearbeiten"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {report.description && (
            <p className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap">{report.description}</p>
          )}

          {/* Meta grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{report.contact_phone || '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{report.contact_email || '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{report.buildings?.address || 'Nicht zugewiesen'}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{managerNames}</span>
            </div>
          </div>

          {report.admin_notes && (
            <div className="mt-4 p-3 bg-success/5 border border-success/20 rounded-lg flex gap-2">
              <StickyNote className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-foreground mb-0.5">Verwalter-Notiz</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.admin_notes}</p>
              </div>
            </div>
          )}

          {report.internal_notes && (
            <div className="mt-3 p-3 bg-muted/40 border border-border rounded-lg flex gap-2">
              <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-foreground mb-0.5">Interne Notizen</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.internal_notes}</p>
              </div>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {attachments.map((attachment: any, index: number) => (
                attachment.signedUrl ? (
                  <a
                    key={index}
                    href={attachment.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted/40 text-xs text-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors max-w-[220px]"
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate">{attachment.name}</span>
                  </a>
                ) : (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted/40 text-xs text-muted-foreground max-w-[220px]"
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate">{attachment.name}</span>
                  </span>
                )
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

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
    <div className="min-h-screen bg-background p-0 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            {managementMode === "weg" ? "WEG-" : "Miet-"}Meldungen
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Übersicht aller {managementMode === "weg" ? "WEG-" : "Miet-"}Meldungen
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3 md:gap-4 md:justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList variant="underline">
              <TabsTrigger variant="underline" value="reports">Meldungen</TabsTrigger>
              <TabsTrigger variant="underline" value="templates">Vorlagen</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-full md:w-40 h-11 md:h-10">
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

            <Button
              variant="outline"
              className="h-11 md:h-10 flex-1 md:flex-initial"
              onClick={() => setExportDialogOpen(true)}
            >
              <Download className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Exportieren</span>
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="reports" className="space-y-4 md:space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <Card>
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm md:text-lg font-semibold text-foreground">Offen</h3>
                      <p className="text-2xl md:text-3xl font-bold text-foreground">{timeFilteredOpenReports.length}</p>
                    </div>
                    <div className="text-muted-foreground">
                      <FileText className="h-6 w-6 md:h-8 md:w-8" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm md:text-lg font-semibold text-foreground">Bearbeitet</h3>
                      <p className="text-2xl md:text-3xl font-bold text-foreground">{timeFilteredInProgressReports.length}</p>
                    </div>
                    <div className="text-muted-foreground">
                      <FileText className="h-6 w-6 md:h-8 md:w-8" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Compact Filters */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Meldungen durchsuchen..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button variant="outline" className="gap-2" onClick={() => setIsFilterOpen(!isFilterOpen)}>
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">Filter</span>
                  {(buildingFilter !== 'all' || managerFilter !== 'all') && (
                    <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[20px]">
                      {[buildingFilter !== 'all', managerFilter !== 'all'].filter(Boolean).length}
                    </span>
                  )}
                  {isFilterOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>

              <Collapsible open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <CollapsibleContent>
                  <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
                    <div className="flex flex-col lg:flex-row gap-3">
                      <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                        <SelectTrigger className="w-full lg:w-[200px]">
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
                      <Select value={managerFilter} onValueChange={setManagerFilter}>
                        <SelectTrigger className="w-full lg:w-[200px]">
                          <SelectValue placeholder="Verwalter filtern" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Alle Verwalter</SelectItem>
                          {managers.map((manager) => (
                            <SelectItem key={manager.id} value={manager.id}>
                              {manager.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(buildingFilter !== 'all' || managerFilter !== 'all') && (
                        <Button variant="ghost" size="sm" onClick={() => { setBuildingFilter('all'); setManagerFilter('all'); }}>
                          <X className="h-4 w-4 mr-1" />
                          Zurücksetzen
                        </Button>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

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

        {/* Export Dialog */}
        <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Meldungen exportieren</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Von Datum</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !exportFilters.startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {exportFilters.startDate ? (
                          format(exportFilters.startDate, "PPP", { locale: de })
                        ) : (
                          <span>Datum wählen</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={exportFilters.startDate}
                        onSelect={(date) => setExportFilters(prev => ({ ...prev, startDate: date }))}
                        initialFocus
                        locale={de}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="space-y-2">
                  <Label>Bis Datum</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !exportFilters.endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {exportFilters.endDate ? (
                          format(exportFilters.endDate, "PPP", { locale: de })
                        ) : (
                          <span>Datum wählen</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={exportFilters.endDate}
                        onSelect={(date) => setExportFilters(prev => ({ ...prev, endDate: date }))}
                        initialFocus
                        locale={de}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Gebäude</Label>
                <Select 
                  value={exportFilters.building} 
                  onValueChange={(value) => setExportFilters(prev => ({ ...prev, building: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
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
              
              <div className="space-y-2">
                <Label>Status</Label>
                <Select 
                  value={exportFilters.status} 
                  onValueChange={(value) => setExportFilters(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle</SelectItem>
                    <SelectItem value="open">Offen</SelectItem>
                    <SelectItem value="in_progress">Bearbeitet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button onClick={exportToExcel}>
                <Download className="h-4 w-4 mr-2" />
                Exportieren
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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

        {/* Create Case from Report */}
        <CreateCaseDialog
          open={!!createCaseFromReport}
          onOpenChange={(open) => !open && setCreateCaseFromReport(null)}
          buildingId={createCaseFromReport?.building_id || ""}
          managementMode={managementMode}
          defaults={createCaseFromReport ? {
            title: createCaseFromReport.title,
            description: createCaseFromReport.description,
          } : undefined}
          onCreated={async (caseRow) => {
            if (!createCaseFromReport) return;
            await supabase.from(tableName).update({ case_id: caseRow.id } as any).eq("id", createCaseFromReport.id);
            try {
              await addEvent.mutateAsync({
                case_id: caseRow.id,
                event_type: "note",
                title: "Aus Meldung erstellt",
                body: `Meldung: ${createCaseFromReport.title}\n${createCaseFromReport.description || ""}${createCaseFromReport.contact_name ? `\n\nKontakt: ${createCaseFromReport.contact_name}` : ""}`,
                source_table: tableName,
                source_id: createCaseFromReport.id,
                trigger_summary: false,
              });
            } catch (e) { console.error(e); }
            setCreateCaseFromReport(null);
            fetchReports();
          }}
        />

        {/* Link Report to existing Case */}
        {linkReportToCase && (
          <LinkReportToCaseDialog
            open={!!linkReportToCase}
            onOpenChange={(open) => !open && setLinkReportToCase(null)}
            buildingId={linkReportToCase.building_id}
            report={linkReportToCase}
            tableName={tableName}
            onLinked={() => { setLinkReportToCase(null); fetchReports(); }}
          />
        )}
      </div>
    </div>
  );
};
