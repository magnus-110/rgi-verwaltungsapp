import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, MapPin, Users, Plus, Building2, FileText, Upload, Trash2, ClipboardList, Clock, CheckCircle2, XCircle, Pause, Pencil, ExternalLink, Shield, Lock, UserX } from "lucide-react";
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
  const [selectedAgendaItemId, setSelectedAgendaItemId] = useState<string | null>(null);
  const [showSubmitTop, setShowSubmitTop] = useState(false);

  // TOP detail/edit
  const [selectedTopId, setSelectedTopId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
  const [editRemovedPaths, setEditRemovedPaths] = useState<string[]>([]);
  const [deleteTopId, setDeleteTopId] = useState<string | null>(null);
  const [showProxyDialog, setShowProxyDialog] = useState(false);
  const [proxyType, setProxyType] = useState<string>("manager");
  const [proxyContactId, setProxyContactId] = useState<string>("");

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

  // Find user's contact assignment for this building
  const { data: myAssignment } = useQuery({
    queryKey: ["my-contact-assignment", effectiveBuildingId, profile?.user_id],
    queryFn: async () => {
      // Find the contact linked to this user
      const { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("user_id", profile?.user_id!)
        .maybeSingle();
      if (!contact) return null;
      
      const { data } = await supabase
        .from("contact_building_assignments")
        .select("id")
        .eq("contact_id", contact.id)
        .eq("building_id", effectiveBuildingId!)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!effectiveBuildingId && !!profile?.user_id,
  });

  // Find user's attendee record for the selected meeting
  const { data: myAttendee, refetch: refetchAttendee } = useQuery({
    queryKey: ["my-attendee", selectedMeetingId, myAssignment?.id],
    queryFn: async () => {
      if (!myAssignment?.id || !selectedMeetingId) return null;
      const { data } = await supabase
        .from("etv_attendees")
        .select("*")
        .eq("meeting_id", selectedMeetingId)
        .eq("assignment_id", myAssignment.id)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedMeetingId && !!myAssignment?.id,
  });

  // Auto-create attendee record when owner views a published/in_progress meeting
  const autoRegisterRef = useRef(false);
  const autoRegisterMutation = useMutation({
    mutationFn: async () => {
      if (!myAssignment?.id || !selectedMeetingId) throw new Error("Missing data");
      const { error } = await supabase.from("etv_attendees").insert({
        meeting_id: selectedMeetingId,
        assignment_id: myAssignment.id,
        attendance_type: "absent",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refetchAttendee();
    },
  });

  const selectedMeetingForAutoReg = meetings.find((m: any) => m.id === selectedMeetingId);
  useEffect(() => {
    if (
      selectedMeetingId &&
      myAssignment?.id &&
      myAttendee === null &&
      selectedMeetingForAutoReg &&
      ["published", "in_progress"].includes(selectedMeetingForAutoReg.status) &&
      !autoRegisterMutation.isPending &&
      !autoRegisterRef.current
    ) {
      autoRegisterRef.current = true;
      autoRegisterMutation.mutate();
    }
    if (!selectedMeetingId) {
      autoRegisterRef.current = false;
    }
  }, [selectedMeetingId, myAssignment?.id, myAttendee, selectedMeetingForAutoReg?.status]);

  // Load other owners for proxy selection
  const { data: otherOwners = [] } = useQuery({
    queryKey: ["building-owners-proxy", effectiveBuildingId, profile?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("contact_building_assignments")
        .select(`id, unit_number, contacts!inner(id, first_name, last_name, company_name)`)
        .eq("building_id", effectiveBuildingId!)
        .eq("role_in_building", "eigentuemer")
        .eq("is_active", true);
      // Filter out current user's assignment
      return (data || []).filter((d: any) => d.id !== myAssignment?.id);
    },
    enabled: !!effectiveBuildingId && !!myAssignment?.id,
  });

  // Set proxy mutation
  const setProxyMutation = useMutation({
    mutationFn: async ({ type, contactId }: { type: string; contactId?: string }) => {
      if (!myAttendee?.id) throw new Error("Kein Teilnehmer-Eintrag gefunden");
      const { error } = await supabase
        .from("etv_attendees")
        .update({
          attendance_type: "proxy",
          proxy_type: type,
          proxy_contact_id: type === "owner" ? (contactId || null) : null,
        })
        .eq("id", myAttendee.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Vollmacht erteilt" });
      setShowProxyDialog(false);
      refetchAttendee();
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  // Withdraw proxy mutation
  const withdrawProxyMutation = useMutation({
    mutationFn: async () => {
      if (!myAttendee?.id) throw new Error("Kein Teilnehmer-Eintrag gefunden");
      const { error } = await supabase
        .from("etv_attendees")
        .update({
          attendance_type: "absent",
          proxy_type: null,
          proxy_contact_id: null,
        })
        .eq("id", myAttendee.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Vollmacht zurückgezogen" });
      refetchAttendee();
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const getContactName = (contact: any) => {
    if (contact.company_name) return contact.company_name;
    return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unbenannt";
  };

  const isProxyLocked = (meetingDate: string) => {
    const lockTime = new Date(meetingDate);
    lockTime.setHours(lockTime.getHours() - 1);
    return new Date() >= lockTime;
  };


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
      const top = submittedTops.find((t: any) => t.id === id);
      let currentPaths: string[] = (top?.attachment_paths || []).filter((p: string) => !editRemovedPaths.includes(p));

      // Delete removed files from storage
      if (editRemovedPaths.length > 0) {
        await supabase.storage.from("building-files").remove(editRemovedPaths);
      }

      // Upload new files
      for (const file of editNewFiles) {
        const path = `etv-attachments/${effectiveBuildingId}/${Date.now()}-${file.name}`;
        const { error: uploadErr } = await supabase.storage.from("building-files").upload(path, file);
        if (uploadErr) throw uploadErr;
        currentPaths.push(path);
      }

      const { error } = await supabase
        .from("etv_submitted_tops")
        .update({
          title,
          description: description || null,
          attachment_paths: currentPaths.length > 0 ? currentPaths : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Antrag aktualisiert" });
      setIsEditing(false);
      setEditNewFiles([]);
      setEditRemovedPaths([]);
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
                      setEditNewFiles([]);
                      setEditRemovedPaths([]);
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
                    <Card 
                      key={item.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedAgendaItemId(item.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <span className="text-primary font-bold text-sm">TOP {idx + 1}</span>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{item.title}</p>
                            {item.result && (
                              <Badge variant={item.result === "passed" ? "default" : "destructive"} className="text-xs mt-1">
                                {item.result === "passed" ? "Angenommen" : "Abgelehnt"}
                              </Badge>
                            )}
                            {selectedMeeting?.status === "in_progress" && item.status === "voted" && (
                              <div className="flex gap-3 mt-2 text-xs">
                                <span className="text-green-600 font-medium">Ja: {item.yes_count}</span>
                                <span className="text-red-600 font-medium">Nein: {item.no_count}</span>
                                <span className="text-muted-foreground">Enthaltung: {item.abstain_count}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Vollmacht-Sektion */}
              {["published", "in_progress"].includes(selectedMeeting.status) && myAssignment && (
                <div className="border-t pt-4 space-y-3">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Ihre Teilnahme & Vollmacht
                  </h3>

                  {isProxyLocked(selectedMeeting.meeting_date) && (
                    <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                      <CardContent className="p-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                        <Lock className="h-4 w-4" />
                        <span>Vollmachten sind gesperrt (1h vor Versammlungsbeginn). Änderungen sind nicht mehr möglich.</span>
                      </CardContent>
                    </Card>
                  )}

                  {!myAttendee ? (
                    <Card>
                      <CardContent className="p-4 text-sm text-muted-foreground">
                        Teilnehmer-Status wird geladen...
                      </CardContent>
                    </Card>
                  ) : (
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Aktueller Status</p>
                          <div className="mt-1">
                            {myAttendee.attendance_type === "proxy" ? (
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                Vertreten — {myAttendee.proxy_type === "manager" ? "durch Verwalter" : "durch Eigentümer"}
                              </Badge>
                            ) : myAttendee.attendance_type === "present" ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Anwesend</Badge>
                            ) : (
                              <Badge variant="secondary">Nicht teilgenommen / Offen</Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {!isProxyLocked(selectedMeeting.meeting_date) && (
                        <div className="flex gap-2 pt-1">
                          {myAttendee.attendance_type !== "proxy" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => {
                                setProxyType("manager");
                                setProxyContactId("");
                                setShowProxyDialog(true);
                              }}
                            >
                              <Shield className="h-3.5 w-3.5" />
                              Vollmacht erteilen
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => withdrawProxyMutation.mutate()}
                              disabled={withdrawProxyMutation.isPending}
                            >
                              <UserX className="h-3.5 w-3.5" />
                              {withdrawProxyMutation.isPending ? "Wird zurückgezogen..." : "Vollmacht zurückziehen"}
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  )}
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
            <DialogTitle className="text-xl">
              {isEditing ? "Antrag bearbeiten" : "Ihr Antrag"}
            </DialogTitle>
          </DialogHeader>
          {selectedTop && (
            <div className="space-y-5">
              {isEditing ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Titel *</Label>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-11"
                      placeholder="z.B. Sanierung der Tiefgarage"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Beschreibung <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={6}
                      placeholder="Begründung oder Erläuterung..."
                    />
                  </div>

                  {/* Existing attachments */}
                  {(() => {
                    const remainingPaths = (selectedTop.attachment_paths || []).filter((p: string) => !editRemovedPaths.includes(p));
                    return remainingPaths.length > 0 ? (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Vorhandene Anhänge</Label>
                        <div className="space-y-1.5">
                          {remainingPaths.map((path: string, i: number) => {
                            const fileName = path.split("/").pop()?.replace(/^\d+-/, "") || path;
                            return (
                              <div key={i} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                                <span className="flex items-center gap-2 text-sm truncate">
                                  <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                  {fileName}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setEditRemovedPaths((prev) => [...prev, path])}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* New file upload */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Anhänge hinzufügen <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <div
                      className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => document.getElementById("edit-top-file-upload")?.click()}
                    >
                      <Upload className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Dateien auswählen</p>
                    </div>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      id="edit-top-file-upload"
                      onChange={(e) => {
                        if (e.target.files) setEditNewFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                      }}
                    />
                    {editNewFiles.length > 0 && (
                      <div className="space-y-1.5">
                        {editNewFiles.map((file, i) => (
                          <div key={i} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                            <span className="flex items-center gap-2 text-sm truncate">
                              <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                              {file.name}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setEditNewFiles((prev) => prev.filter((_, j) => j !== i))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 border-t pt-4">
                    <Button variant="outline" size="lg" onClick={() => { setIsEditing(false); setEditNewFiles([]); setEditRemovedPaths([]); }}>
                      Abbrechen
                    </Button>
                    <Button
                      size="lg"
                      onClick={() => updateTopMutation.mutate({ id: selectedTop.id, title: editTitle, description: editDescription })}
                      disabled={!editTitle || updateTopMutation.isPending}
                    >
                      {updateTopMutation.isPending ? "Wird gespeichert..." : "Änderungen speichern"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h3 className="text-lg font-semibold">{selectedTop.title}</h3>
                    <Badge variant={topStatusLabels[selectedTop.status]?.variant || "outline"} className="mt-2 text-sm px-3 py-1">
                      {topStatusLabels[selectedTop.status]?.label || selectedTop.status}
                    </Badge>
                  </div>
                  {selectedTop.description && (
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-1">Begründung</p>
                      <p className="text-base leading-relaxed">{selectedTop.description}</p>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Eingereicht am {formatDate(new Date(selectedTop.created_at), "dd.MM.yyyy 'um' HH:mm", { locale: de })}
                  </p>
                  {selectedTop.admin_notes && (
                    <div className="border-l-4 border-primary/30 bg-primary/5 rounded-r-lg pl-4 pr-3 py-3">
                      <p className="text-sm font-semibold text-muted-foreground mb-1">Anmerkung der Verwaltung</p>
                      <p className="text-base italic">{selectedTop.admin_notes}</p>
                    </div>
                  )}
                  {selectedTop.etv_meetings?.title && (
                    <p className="text-sm text-muted-foreground">
                      Aufgenommen in: <strong>{selectedTop.etv_meetings.title}</strong>
                    </p>
                  )}
                  {selectedTop.attachment_paths?.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-2">Anhänge</p>
                      <div className="space-y-1.5">
                        {selectedTop.attachment_paths.map((path: string, i: number) => {
                          const fileName = path.split("/").pop()?.replace(/^\d+-/, "") || path;
                          return (
                            <Button
                              key={i}
                              variant="outline"
                              size="lg"
                              className="w-full justify-start gap-2 text-sm h-11"
                              onClick={() => getFileDownloadUrl(path)}
                            >
                              <ExternalLink className="h-4 w-4" />
                              {fileName}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {selectedTop.status === "pending" && (
                    <div className="flex justify-end gap-3 border-t pt-4">
                      <Button
                        variant="outline"
                        size="lg"
                        className="gap-2"
                        onClick={() => setIsEditing(true)}
                      >
                        <Pencil className="h-4 w-4" />
                        Bearbeiten
                      </Button>
                      <Button
                        variant="destructive"
                        size="lg"
                        className="gap-2"
                        onClick={() => setDeleteTopId(selectedTop.id)}
                      >
                        <Trash2 className="h-4 w-4" />
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
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg">Antrag einreichen</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Ihr Antrag wird der Hausverwaltung zur Prüfung vorgelegt.
            </p>

            <div className="bg-muted/40 rounded-lg p-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Titel *</Label>
                <Input
                  placeholder="z.B. Sanierung der Tiefgarage"
                  value={topTitle}
                  onChange={(e) => setTopTitle(e.target.value)}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Beschreibung <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea
                  placeholder="Begründung oder Erläuterung..."
                  value={topDescription}
                  onChange={(e) => setTopDescription(e.target.value)}
                  rows={6}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Anhänge <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <div
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => document.getElementById("top-file-upload")?.click()}
              >
                <Upload className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Dateien auswählen</p>
                <p className="text-xs text-muted-foreground mt-0.5">z.B. Fotos, Angebote, Gutachten</p>
              </div>
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
              {topFiles.length > 0 && (
                <div className="space-y-1.5">
                  {topFiles.map((file, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                      <span className="flex items-center gap-2 text-sm truncate">
                        <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        {file.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setTopFiles((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => setShowSubmitTop(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={() => submitTopMutation.mutate()}
                disabled={!topTitle || submitTopMutation.isPending}
              >
                {submitTopMutation.isPending ? "Wird eingereicht..." : "Einreichen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Proxy Dialog */}
      <Dialog open={showProxyDialog} onOpenChange={setShowProxyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vollmacht erteilen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Vollmacht an</Label>
              <Select value={proxyType} onValueChange={(v) => { setProxyType(v); setProxyContactId(""); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Verwalter</SelectItem>
                  <SelectItem value="owner">Anderen Eigentümer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {proxyType === "owner" && (
              <div className="space-y-2">
                <Label>Eigentümer auswählen</Label>
                <Select value={proxyContactId} onValueChange={setProxyContactId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Eigentümer wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {otherOwners.map((o: any) => (
                      <SelectItem key={o.contacts.id} value={o.contacts.id}>
                        {getContactName(o.contacts)}{o.unit_number ? ` (Einheit ${o.unit_number})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProxyDialog(false)}>Abbrechen</Button>
            <Button
              onClick={() => setProxyMutation.mutate({ type: proxyType, contactId: proxyContactId || undefined })}
              disabled={setProxyMutation.isPending || (proxyType === "owner" && !proxyContactId)}
            >
              {setProxyMutation.isPending ? "Wird gespeichert..." : "Vollmacht erteilen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
