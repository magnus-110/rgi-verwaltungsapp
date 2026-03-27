import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, MapPin, Users, Plus, Building2, FileText, Upload, Trash2, ClipboardList, Clock, CheckCircle2, XCircle, Pause, Pencil, ExternalLink } from "lucide-react";
import { format as formatDate } from "date-fns";
import { de } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const statusLabels: Record<string, string> = {
  published: "Eingeladen",
  in_progress: "Laufend",
  completed: "Abgeschlossen",
};

const topStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Ausstehend", variant: "outline" },
  accepted: { label: "Aufgenommen", variant: "default" },
  rejected: { label: "Abgelehnt", variant: "destructive" },
  deferred: { label: "Zurückgestellt", variant: "secondary" },
};

export const WegOwnerMeetings = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [showSubmitTop, setShowSubmitTop] = useState(false);

  // TOP detail/edit
  const [selectedTopId, setSelectedTopId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleteTopId, setDeleteTopId] = useState<string | null>(null);

  // TOP submission form
  const [topTitle, setTopTitle] = useState("");
  const [topDescription, setTopDescription] = useState("");
  const [topFiles, setTopFiles] = useState<File[]>([]);

  // Fetch buildings
  const { data: buildings = [], isLoading: loadingBuildings } = useQuery({
    queryKey: ["weg-owner-buildings", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weg_owner_buildings")
        .select("building_id, buildings(id, name, address)")
        .eq("user_id", profile?.user_id);
      if (error) throw error;
      return (data || []).map((d: any) => d.buildings).filter(Boolean);
    },
    enabled: !!profile?.user_id,
  });

  const effectiveBuildingId = buildings.length === 1 ? buildings[0].id : selectedBuildingId;

  // Fetch meetings
  const { data: meetings = [], isLoading: loadingMeetings } = useQuery({
    queryKey: ["weg-owner-meetings", effectiveBuildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("*")
        .eq("building_id", effectiveBuildingId!)
        .in("status", ["published", "in_progress", "completed"])
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveBuildingId,
  });

  // Fetch own submitted TOPs
  const { data: submittedTops = [], isLoading: loadingTops } = useQuery({
    queryKey: ["weg-owner-submitted-tops", effectiveBuildingId, profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_submitted_tops")
        .select("*, etv_meetings(title)")
        .eq("building_id", effectiveBuildingId!)
        .eq("submitted_by_user_id", profile?.user_id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveBuildingId && !!profile?.user_id,
  });

  // Fetch agenda items for selected meeting
  const { data: agendaItems = [] } = useQuery({
    queryKey: ["weg-owner-agenda", selectedMeetingId],
    queryFn: async () => {
      if (!selectedMeetingId) return [];
      const { data, error } = await supabase
        .from("etv_agenda_items")
        .select("*")
        .eq("meeting_id", selectedMeetingId)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedMeetingId,
  });

  // Submit TOP
  const submitTopMutation = useMutation({
    mutationFn: async () => {
      let attachmentPaths: string[] = [];
      for (const file of topFiles) {
        const path = `etv-attachments/${effectiveBuildingId}/${Date.now()}-${file.name}`;
        const { error: uploadErr } = await supabase.storage.from("building-files").upload(path, file);
        if (uploadErr) throw uploadErr;
        attachmentPaths.push(path);
      }
      const { error } = await supabase.from("etv_submitted_tops").insert({
        building_id: effectiveBuildingId!,
        submitted_by_user_id: profile?.user_id!,
        title: topTitle,
        description: topDescription || null,
        attachment_paths: attachmentPaths.length > 0 ? attachmentPaths : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "TOP eingereicht", description: "Ihr Antrag wurde zur Prüfung eingereicht." });
      setTopTitle("");
      setTopDescription("");
      setTopFiles([]);
      setShowSubmitTop(false);
      queryClient.invalidateQueries({ queryKey: ["weg-owner-submitted-tops"] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  // Update TOP
  const updateTopMutation = useMutation({
    mutationFn: async ({ id, title, description }: { id: string; title: string; description: string }) => {
      const { error } = await supabase
        .from("etv_submitted_tops")
        .update({ title, description: description || null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Antrag aktualisiert" });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["weg-owner-submitted-tops"] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  // Delete TOP
  const deleteTopMutation = useMutation({
    mutationFn: async (id: string) => {
      const top = submittedTops.find((t: any) => t.id === id);
      // Delete attachments from storage
      if (top?.attachment_paths?.length) {
        for (const path of top.attachment_paths) {
          await supabase.storage.from("building-files").remove([path]);
        }
      }
      const { error } = await supabase.from("etv_submitted_tops").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Antrag gelöscht" });
      setDeleteTopId(null);
      setSelectedTopId(null);
      queryClient.invalidateQueries({ queryKey: ["weg-owner-submitted-tops"] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const selectedTop = submittedTops.find((t: any) => t.id === selectedTopId);
  const selectedMeeting = meetings.find((m: any) => m.id === selectedMeetingId);
  const selectedBuilding = buildings.find((b: any) => b.id === effectiveBuildingId);

  const getFileDownloadUrl = async (path: string) => {
    const { data } = await supabase.storage.from("building-files").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  // Building selector
  if (!effectiveBuildingId) {
    return (
      <div className="p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Versammlungen</h1>
          <p className="text-muted-foreground">Wählen Sie ein Gebäude aus</p>
        </div>
        {loadingBuildings ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : buildings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Keine Gebäude zugewiesen.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {buildings.map((b: any) => (
              <Card
                key={b.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedBuildingId(b.id)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Building2 className="h-8 w-8 text-primary flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold">{b.name}</h3>
                    <p className="text-sm text-muted-foreground">{b.address}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {buildings.length > 1 && (
            <Button variant="ghost" size="sm" className="mb-1 -ml-2 text-muted-foreground" onClick={() => setSelectedBuildingId(null)}>
              ← Gebäude wechseln
            </Button>
          )}
          <h1 className="text-2xl font-bold text-foreground">Versammlungen</h1>
          <p className="text-muted-foreground">{selectedBuilding?.name} — {selectedBuilding?.address}</p>
        </div>
        <Button onClick={() => setShowSubmitTop(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          TOP einreichen
        </Button>
      </div>

      <Tabs defaultValue="meetings">
        <TabsList>
          <TabsTrigger value="meetings" className="gap-2">
            <Users className="h-4 w-4" />
            Versammlungen
          </TabsTrigger>
          <TabsTrigger value="tops" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Meine Anträge
            {submittedTops.filter((t: any) => t.status === "pending").length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {submittedTops.filter((t: any) => t.status === "pending").length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="meetings" className="mt-4">
          {loadingMeetings ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : meetings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Keine Versammlungen vorhanden.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sie können jederzeit Tagesordnungspunkte einreichen — auch wenn noch keine Versammlung geplant ist.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {meetings.map((meeting: any) => (
                <Card
                  key={meeting.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedMeetingId(meeting.id)}
                >
                  <CardContent className="p-4 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{meeting.title}</h3>
                      <Badge variant="secondary">{statusLabels[meeting.status] || meeting.status}</Badge>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(new Date(meeting.meeting_date), "dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: de })}
                      </span>
                      {meeting.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {meeting.location}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tops" className="mt-4">
          {loadingTops ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : submittedTops.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Noch keine Anträge eingereicht.</p>
                <Button variant="outline" className="mt-4 gap-2" onClick={() => setShowSubmitTop(true)}>
                  <Plus className="h-4 w-4" />
                  Ersten TOP einreichen
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {submittedTops.map((top: any) => {
                const statusInfo = topStatusLabels[top.status] || topStatusLabels.pending;
                const StatusIcon = top.status === "accepted" ? CheckCircle2 
                  : top.status === "rejected" ? XCircle 
                  : top.status === "deferred" ? Pause 
                  : Clock;
                return (
                  <Card
                    key={top.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      setSelectedTopId(top.id);
                      setEditTitle(top.title);
                      setEditDescription(top.description || "");
                      setIsEditing(false);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <StatusIcon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                            top.status === "accepted" ? "text-green-500" 
                            : top.status === "rejected" ? "text-destructive" 
                            : "text-muted-foreground"
                          }`} />
                          <div>
                            <h4 className="font-semibold text-sm">{top.title}</h4>
                            {top.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{top.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(new Date(top.created_at), "dd.MM.yyyy", { locale: de })}
                              </span>
                              {top.etv_meetings?.title && (
                                <span className="text-xs text-muted-foreground">→ {top.etv_meetings.title}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {top.attachment_paths?.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <FileText className="h-3 w-3" />
                            {top.attachment_paths.length}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Meeting Detail Dialog */}
      <Dialog open={!!selectedMeetingId} onOpenChange={() => setSelectedMeetingId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedMeeting?.title}</DialogTitle>
          </DialogHeader>
          {selectedMeeting && (
            <div className="space-y-4">
              <div className="text-sm space-y-1 text-muted-foreground">
                <p><strong>Datum:</strong> {formatDate(new Date(selectedMeeting.meeting_date), "dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: de })}</p>
                {selectedMeeting.location && <p><strong>Ort:</strong> {selectedMeeting.location}</p>}
                <Badge variant="secondary">{statusLabels[selectedMeeting.status] || selectedMeeting.status}</Badge>
              </div>
              <h3 className="font-semibold text-foreground">Tagesordnung</h3>
              {agendaItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Tagesordnungspunkte.</p>
              ) : (
                <div className="space-y-3">
                  {agendaItems.map((item: any, idx: number) => (
                    <Card key={item.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <span className="text-primary font-bold text-sm">TOP {idx + 1}</span>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{item.title}</p>
                            {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                            {item.resolution_text && (
                              <div className="mt-2 p-2 bg-muted rounded text-xs italic">{item.resolution_text}</div>
                            )}
                            {item.result && (
                              <Badge variant={item.result === "passed" ? "default" : "destructive"} className="text-xs mt-1">
                                {item.result === "passed" ? "Angenommen" : "Abgelehnt"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* TOP Detail/Edit Dialog */}
      <Dialog open={!!selectedTopId} onOpenChange={() => setSelectedTopId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Antrag bearbeiten" : "Antragsdetails"}
            </DialogTitle>
          </DialogHeader>
          {selectedTop && (
            <div className="space-y-4">
              {isEditing ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Titel</Label>
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Begründung</Label>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsEditing(false)}>Abbrechen</Button>
                    <Button
                      onClick={() => updateTopMutation.mutate({ id: selectedTop.id, title: editTitle, description: editDescription })}
                      disabled={!editTitle || updateTopMutation.isPending}
                    >
                      Speichern
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h3 className="font-semibold">{selectedTop.title}</h3>
                    <Badge variant={topStatusLabels[selectedTop.status]?.variant || "outline"} className="mt-1">
                      {topStatusLabels[selectedTop.status]?.label || selectedTop.status}
                    </Badge>
                  </div>
                  {selectedTop.description && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Begründung</p>
                      <p className="text-sm">{selectedTop.description}</p>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Eingereicht am {formatDate(new Date(selectedTop.created_at), "dd.MM.yyyy 'um' HH:mm", { locale: de })}
                  </div>
                  {selectedTop.admin_notes && (
                    <div className="border-l-2 border-muted pl-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Anmerkung der Verwaltung</p>
                      <p className="text-sm italic">{selectedTop.admin_notes}</p>
                    </div>
                  )}
                  {selectedTop.etv_meetings?.title && (
                    <p className="text-xs text-muted-foreground">
                      Aufgenommen in: <strong>{selectedTop.etv_meetings.title}</strong>
                    </p>
                  )}
                  {/* Attachments */}
                  {selectedTop.attachment_paths?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Anhänge</p>
                      <div className="space-y-1">
                        {selectedTop.attachment_paths.map((path: string, i: number) => {
                          const fileName = path.split("/").pop()?.replace(/^\d+-/, "") || path;
                          return (
                            <Button
                              key={i}
                              variant="outline"
                              size="sm"
                              className="w-full justify-start gap-2 text-xs"
                              onClick={() => getFileDownloadUrl(path)}
                            >
                              <ExternalLink className="h-3 w-3" />
                              {fileName}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Actions for pending TOPs */}
                  {selectedTop.status === "pending" && (
                    <div className="flex justify-end gap-2 border-t pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => setIsEditing(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Bearbeiten
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-1"
                        onClick={() => setDeleteTopId(selectedTop.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Löschen
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTopId} onOpenChange={() => setDeleteTopId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Antrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Antrag und alle zugehörigen Anhänge werden unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTopId && deleteTopMutation.mutate(deleteTopId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submit TOP Dialog */}
      <Dialog open={showSubmitTop} onOpenChange={setShowSubmitTop}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tagesordnungspunkt einreichen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ihr Antrag wird dem Verwalter vorgelegt und kann in eine kommende Versammlung aufgenommen werden.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Titel *</Label>
              <Input
                placeholder="z.B. Antrag auf Sanierung der Tiefgarage"
                value={topTitle}
                onChange={(e) => setTopTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Begründung / Erläuterung</Label>
              <Textarea
                placeholder="Beschreiben Sie Ihren Antrag..."
                value={topDescription}
                onChange={(e) => setTopDescription(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Anhänge (optional)</Label>
              <div className="border border-dashed rounded-md p-3">
                <input
                  type="file"
                  multiple
                  className="hidden"
                  id="top-file-upload"
                  onChange={(e) => {
                    if (e.target.files) {
                      setTopFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                    }
                  }}
                />
                <label htmlFor="top-file-upload" className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  <Upload className="h-4 w-4" />
                  Dateien auswählen
                </label>
                {topFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {topFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1">
                        <span className="flex items-center gap-1 truncate">
                          <FileText className="h-3 w-3 flex-shrink-0" />
                          {file.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => setTopFiles((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSubmitTop(false)}>Abbrechen</Button>
              <Button
                onClick={() => submitTopMutation.mutate()}
                disabled={!topTitle || submitTopMutation.isPending}
              >
                {submitTopMutation.isPending ? "Wird eingereicht..." : "TOP einreichen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
