import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useManagementMode } from "@/hooks/useManagementMode";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Download,
  Settings2,
  RefreshCw,
  AlertTriangle,
  Loader2,
  FolderOpen,
  Sparkles,
  Eye,
  ArrowLeft,
  StopCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MappingPreview } from "@/components/reorganization/MappingPreview";

interface Building {
  id: string;
  name: string;
  building_code: string;
}

interface Preset {
  id: string;
  name: string;
  description: string | null;
  agent_ids: string[];
}

interface Document {
  id: string;
  file_name: string;
  status: string;
  page_count: number | null;
  created_at: string;
  building_id: string | null;
}

interface ReorganizationJob {
  id: string;
  source_document_id: string;
  preset_id: string | null;
  building_id: string | null;
  status: string;
  progress: number;
  current_phase: string | null;
  current_agent_name: string | null;
  total_pages: number | null;
  total_document_pages: number | null;
  indexed_pages_at_start: number | null;
  processed_pages: number;
  page_mappings: Record<string, unknown>;
  unassigned_pages: number[];
  awaiting_review: boolean;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  source_document?: Document;
  preset?: Preset;
}

interface ReorganizedDocument {
  id: string;
  file_name: string;
  file_path: string;
  page_count: number | null;
  category_label: string | null;
  source_pages: number[];
  created_at: string;
}

export function ReorganizationDashboard() {
  const { profile } = useAuth();
  const { managementMode } = useManagementMode();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [jobs, setJobs] = useState<ReorganizationJob[]>([]);
  const [reorganizedDocs, setReorganizedDocs] = useState<ReorganizedDocument[]>([]);

  const [selectedBuilding, setSelectedBuilding] = useState<string>("");
  const [selectedDocument, setSelectedDocument] = useState<string>("");
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [activeTab, setActiveTab] = useState("start");
  const [reviewingJobId, setReviewingJobId] = useState<string | null>(null);
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    loadData();
  }, [managementMode]);

  // Poll for job updates
  useEffect(() => {
    const activeJobs = jobs.filter(j => ['pending', 'indexing', 'searching', 'validating', 'splitting', 'awaiting_review'].includes(j.status));
    if (activeJobs.length === 0) return;

    const interval = setInterval(() => {
      loadJobs();
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([
      loadBuildings(),
      loadPresets(),
      loadDocuments(),
      loadJobs(),
      loadReorganizedDocs(),
    ]);
    setLoading(false);
  };

  const loadBuildings = async () => {
    const { data } = await supabase
      .from("buildings")
      .select("id, name, building_code")
      .eq("management_mode", managementMode)
      .order("name");
    setBuildings(data || []);
  };

  const loadPresets = async () => {
    const { data } = await supabase
      .from("agent_presets")
      .select("id, name, description, agent_ids")
      .or(`management_mode.eq.${managementMode},is_template.eq.true`)
      .order("is_default", { ascending: false });
    setPresets(data || []);
    if (data && data.length > 0 && !selectedPreset) {
      setSelectedPreset(data[0].id);
    }
  };

  const loadDocuments = async () => {
    const { data } = await supabase
      .from("building_documents")
      .select("id, file_name, status, page_count, created_at, building_id")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(100);
    setDocuments(data || []);
  };

  const loadJobs = async () => {
    const { data } = await supabase
      .from("reorganization_jobs")
      .select(`
        *,
        source_document:building_documents(id, file_name, page_count),
        preset:agent_presets(id, name)
      `)
      .order("created_at", { ascending: false })
      .limit(20);
    
    if (data) {
      setJobs(data.map(job => ({
        ...job,
        page_mappings: (typeof job.page_mappings === 'object' && job.page_mappings !== null 
          ? job.page_mappings 
          : {}) as Record<string, unknown>,
        unassigned_pages: Array.isArray(job.unassigned_pages) ? job.unassigned_pages : [],
        awaiting_review: job.awaiting_review || false,
        source_document: job.source_document as unknown as Document,
        preset: job.preset as unknown as Preset,
      })));
    }
  };

  const loadReorganizedDocs = async () => {
    const { data } = await supabase
      .from("reorganized_documents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setReorganizedDocs(data || []);
  };

  const filteredDocuments = selectedBuilding
    ? documents.filter(d => d.building_id === selectedBuilding)
    : documents;

  const startReorganization = async () => {
    if (!selectedDocument || !selectedPreset) {
      toast({
        title: "Auswahl erforderlich",
        description: "Bitte wählen Sie ein Dokument und ein Preset aus.",
        variant: "destructive",
      });
      return;
    }

    setStarting(true);
    try {
      // Create the job
      const { data: job, error: jobError } = await supabase
        .from("reorganization_jobs")
        .insert({
          source_document_id: selectedDocument,
          preset_id: selectedPreset,
          building_id: selectedBuilding || null,
          status: "pending",
          created_by: profile?.user_id,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Start the orchestration
      const { error: orchError } = await supabase.functions.invoke("orchestrate-reorganization", {
        body: { jobId: job.id },
      });

      if (orchError) throw orchError;

      toast({
        title: "Reorganisation gestartet",
        description: "Der Prozess läuft im Hintergrund. Sie können den Fortschritt hier verfolgen.",
      });

      setActiveTab("jobs");
      loadJobs();
    } catch (error) {
      console.error("Error starting reorganization:", error);
      toast({
        title: "Fehler",
        description: "Die Reorganisation konnte nicht gestartet werden.",
        variant: "destructive",
      });
    } finally {
      setStarting(false);
    }
  };

  const downloadDocument = async (doc: ReorganizedDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from("reorganized-documents")
        .createSignedUrl(doc.file_path, 3600);

      if (error) throw error;
      
      window.open(data.signedUrl, "_blank");
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download fehlgeschlagen",
        description: "Das Dokument konnte nicht heruntergeladen werden.",
        variant: "destructive",
      });
    }
  };

  const cancelJob = async (jobId: string) => {
    setCancellingJobId(jobId);
    try {
      const { error } = await supabase
        .from("reorganization_jobs")
        .update({
          status: "error",
          error_message: "Job wurde vom Benutzer abgebrochen",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (error) throw error;

      toast({
        title: "Job abgebrochen",
        description: "Der Reorganisations-Job wurde erfolgreich abgebrochen.",
      });

      loadJobs();
    } catch (error) {
      console.error("Cancel error:", error);
      toast({
        title: "Fehler",
        description: "Der Job konnte nicht abgebrochen werden.",
        variant: "destructive",
      });
    } finally {
      setCancellingJobId(null);
    }
  };

  const retryJob = async (job: ReorganizationJob) => {
    setRetryingJobId(job.id);
    try {
      // Create a new job based on the failed one
      const { data: newJob, error: createError } = await supabase
        .from("reorganization_jobs")
        .insert({
          source_document_id: job.source_document_id,
          preset_id: job.preset_id,
          building_id: job.building_id || null,
          status: "pending",
          created_by: profile?.user_id,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Start the orchestration
      const { error: orchError } = await supabase.functions.invoke("orchestrate-reorganization", {
        body: { jobId: newJob.id },
      });

      if (orchError) throw orchError;

      toast({
        title: "Job neu gestartet",
        description: "Der Reorganisations-Job wurde erneut gestartet.",
      });

      loadJobs();
    } catch (error) {
      console.error("Retry error:", error);
      toast({
        title: "Fehler",
        description: "Der Job konnte nicht neu gestartet werden.",
        variant: "destructive",
      });
    } finally {
      setRetryingJobId(null);
    }
  };

  const deleteJob = async (jobId: string) => {
    setDeletingJobId(jobId);
    try {
      // First delete associated agent_search_results
      await supabase
        .from("agent_search_results")
        .delete()
        .eq("job_id", jobId);

      // Then delete the job itself
      const { error } = await supabase
        .from("reorganization_jobs")
        .delete()
        .eq("id", jobId);

      if (error) throw error;

      toast({
        title: "Job gelöscht",
        description: "Der Job wurde erfolgreich entfernt.",
      });

      loadData();
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Fehler",
        description: "Der Job konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    } finally {
      setDeletingJobId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="h-4 w-4 text-muted-foreground" />;
      case "indexing": 
      case "searching":
      case "validating":
      case "splitting":
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case "awaiting_review": return <Eye className="h-4 w-4 text-amber-500" />;
      case "completed": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Wartend";
      case "indexing": return "Indexierung";
      case "searching": return "Suche läuft";
      case "validating": return "Validierung";
      case "awaiting_review": return "Überprüfung erforderlich";
      case "splitting": return "PDF-Erstellung";
      case "completed": return "Abgeschlossen";
      case "failed": return "Fehlgeschlagen";
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/documents")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              PDF-Reorganisation
            </h1>
            <p className="text-muted-foreground">
              Große PDFs automatisch nach Kategorien aufteilen
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/documents/agents">
              <Settings2 className="h-4 w-4 mr-2" />
              Agenten verwalten
            </Link>
          </Button>
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="start">Neue Reorganisation</TabsTrigger>
          <TabsTrigger value="jobs">
            Laufende Jobs
            {jobs.filter(j => !['completed', 'failed'].includes(j.status)).length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {jobs.filter(j => !['completed', 'failed'].includes(j.status)).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="results">
            Ergebnisse
            {reorganizedDocs.length > 0 && (
              <Badge variant="secondary" className="ml-2">{reorganizedDocs.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="start" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">1. Dokument auswählen</CardTitle>
                <CardDescription>
                  Wählen Sie das PDF, das reorganisiert werden soll
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gebäude (optional)</label>
                  <Select value={selectedBuilding || "all"} onValueChange={(val) => setSelectedBuilding(val === "all" ? "" : val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Alle Gebäude" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Gebäude</SelectItem>
                      {buildings.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} ({b.building_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Dokument</label>
                  <Select value={selectedDocument} onValueChange={setSelectedDocument}>
                    <SelectTrigger>
                      <SelectValue placeholder="Dokument auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredDocuments.length === 0 ? (
                        <SelectItem value="none" disabled>
                          Keine verarbeiteten Dokumente gefunden
                        </SelectItem>
                      ) : (
                        filteredDocuments.map(d => (
                          <SelectItem key={d.id} value={d.id}>
                            <TooltipProvider delayDuration={500}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 flex-shrink-0" />
                                    <span className="truncate max-w-[200px]">{d.file_name}</span>
                                    {d.page_count && (
                                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                                        {d.page_count} Seiten
                                      </Badge>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[400px]">
                                  <p className="break-all">{d.file_name}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">2. Preset auswählen</CardTitle>
                <CardDescription>
                  Welche Kategorien sollen erkannt werden?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Preset auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-4 w-4" />
                          <span>{p.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {p.agent_ids.length} Agenten
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedPreset && (
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    {presets.find(p => p.id === selectedPreset)?.description || 
                      `${presets.find(p => p.id === selectedPreset)?.agent_ids.length} spezialisierte Agenten werden das Dokument analysieren.`}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <Button 
                size="lg" 
                onClick={startReorganization}
                disabled={!selectedDocument || !selectedPreset || starting}
                className="w-full"
              >
                {starting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Wird gestartet...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Reorganisation starten
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Reorganisations-Jobs</CardTitle>
              <CardDescription>
                Übersicht aller laufenden und abgeschlossenen Jobs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Noch keine Jobs vorhanden</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {jobs.map(job => (
                    <div key={job.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(job.status)}
                          <div>
                            <p className="font-medium">
                              {job.source_document?.file_name || "Unbekanntes Dokument"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Preset: {job.preset?.name || "Unbekannt"}
                            </p>
                          </div>
                        </div>
                        <Badge variant={job.status === "failed" ? "destructive" : "secondary"}>
                          {getStatusLabel(job.status)}
                        </Badge>
                      </div>

                      {/* Progress for running jobs */}
                      {!['completed', 'failed', 'error', 'awaiting_review'].includes(job.status) && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{job.current_phase || "Wird verarbeitet..."}</span>
                            <span className="font-medium">{job.progress}%</span>
                          </div>
                          <Progress value={job.progress} />
                          {/* Cancel button for running jobs */}
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => cancelJob(job.id)}
                              disabled={cancellingJobId === job.id}
                              className="text-destructive hover:text-destructive"
                            >
                              {cancellingJobId === job.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <StopCircle className="h-4 w-4 mr-1" />
                              )}
                              Abbrechen
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Awaiting review state */}
                      {job.status === "awaiting_review" && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-amber-600">
                            <Eye className="h-4 w-4" />
                            <span>Mapping bereit zur Überprüfung</span>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => setReviewingJobId(job.id)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Überprüfen
                          </Button>
                        </div>
                      )}

                      {/* Error state with retry button */}
                      {(job.status === "failed" || job.status === "error") && (
                        <div className="space-y-2">
                          {job.error_message && (
                            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded">
                              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              <span>{job.error_message}</span>
                            </div>
                          )}
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteJob(job.id)}
                              disabled={deletingJobId === job.id}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              {deletingJobId === job.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 mr-1" />
                              )}
                              Löschen
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => retryJob(job)}
                              disabled={retryingJobId === job.id}
                            >
                              {retryingJobId === job.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4 mr-1" />
                              )}
                              Erneut versuchen
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Completed state */}
                      {job.status === "completed" && (
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{job.total_pages} Seiten verarbeitet</span>
                          {job.unassigned_pages.length > 0 && (
                            <Badge variant="outline" className="text-amber-600">
                              {job.unassigned_pages.length} nicht zugeordnet
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Reorganisierte Dokumente</CardTitle>
              <CardDescription>
                Alle erstellten Teil-PDFs zum Download
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reorganizedDocs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Noch keine reorganisierten Dokumente</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dateiname</TableHead>
                      <TableHead>Kategorie</TableHead>
                      <TableHead>Seiten</TableHead>
                      <TableHead>Erstellt</TableHead>
                      <TableHead className="text-right">Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reorganizedDocs.map(doc => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate max-w-[200px]">{doc.file_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{doc.category_label || "Unbekannt"}</Badge>
                        </TableCell>
                        <TableCell>{doc.page_count || doc.source_pages?.length || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(doc.created_at).toLocaleDateString("de-DE")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => downloadDocument(doc)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Mapping Preview Modal */}
      {reviewingJobId && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl">
            <MappingPreview
              jobId={reviewingJobId}
              onConfirm={() => {
                setReviewingJobId(null);
                loadJobs();
              }}
              onCancel={() => setReviewingJobId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
