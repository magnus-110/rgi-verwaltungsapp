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
import { Calendar, MapPin, Users, Plus, Building2, FileText, Upload, Trash2, ClipboardList, Clock, CheckCircle2, XCircle, Pause, Pencil, ExternalLink, Shield, Lock, UserX, Copy, Link2, ChevronRight, ChevronDown, Vote } from "lucide-react";
import { OwnerLiveDashboard } from "@/components/meetings/OwnerLiveDashboard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const [proxyAssignmentId, setProxyAssignmentId] = useState<string | null>(null);
  const [proxyType, setProxyType] = useState<string>("manager");
  const [proxyContactId, setProxyContactId] = useState<string>("");
  const [proxyExternalName, setProxyExternalName] = useState<string>("");
  const [proxyDetailAttendeeId, setProxyDetailAttendeeId] = useState<string | null>(null);
  const [withdrawAttendeeId, setWithdrawAttendeeId] = useState<string | null>(null);
  const [viewReceivedProxy, setViewReceivedProxy] = useState<any>(null);
  const [showInstructionsDialog, setShowInstructionsDialog] = useState(false);
  const [instructionsAttendeeId, setInstructionsAttendeeId] = useState<string | null>(null);
  const [votingInstructions, setVotingInstructions] = useState<Record<string, string>>({});
  const [createdProxyToken, setCreatedProxyToken] = useState<string | null>(null);
  const [proxyStep, setProxyStep] = useState(1);
  const [expandedTopIds, setExpandedTopIds] = useState<Set<string>>(new Set());
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false);
  const [redeemInput, setRedeemInput] = useState("");

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

  // Find user's contact ID
  const { data: myContactId } = useQuery({
    queryKey: ["my-contact-id", profile?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id")
        .eq("user_id", profile?.user_id!)
        .maybeSingle();
      return data?.id || null;
    },
    enabled: !!profile?.user_id,
  });

  // Find ALL user's contact assignments for this building (multi-unit support)
  const { data: myAssignments = [] } = useQuery({
    queryKey: ["my-contact-assignments", effectiveBuildingId, myContactId],
    queryFn: async () => {
      if (!myContactId) return [];
      const { data } = await supabase
        .from("contact_building_assignments")
        .select("id, unit_number, contact_building_shares(share_type, share_value)")
        .eq("contact_id", myContactId)
        .eq("building_id", effectiveBuildingId!)
        .eq("is_active", true)
        .order("unit_number");
      return data || [];
    },
    enabled: !!effectiveBuildingId && !!myContactId,
  });

  // Find ALL user's attendee records for the selected meeting (one per assignment)
  const { data: myAttendees = [], refetch: refetchAttendees } = useQuery({
    queryKey: ["my-attendees", selectedMeetingId, myAssignments.map(a => a.id).join(",")],
    queryFn: async () => {
      if (!myAssignments.length || !selectedMeetingId) return [];
      const assignmentIds = myAssignments.map(a => a.id);
      const { data } = await supabase
        .from("etv_attendees")
        .select("*, proxy_contact:contacts!etv_attendees_proxy_contact_id_fkey(first_name, last_name, company_name)")
        .eq("meeting_id", selectedMeetingId)
        .in("assignment_id", assignmentIds);
      return data || [];
    },
    enabled: !!selectedMeetingId && myAssignments.length > 0,
  });

  // Fetch proxies received BY this user (where proxy_contact_id = my contact)
  const { data: receivedProxies = [] } = useQuery({
    queryKey: ["received-proxies", selectedMeetingId, myContactId],
    queryFn: async () => {
      if (!myContactId || !selectedMeetingId) return [];
      const { data } = await supabase
        .from("etv_attendees")
        .select(`
          id, proxy_type, pre_vote_instructions,
          contact_building_assignments!inner(
            unit_number,
            contacts!inner(first_name, last_name, company_name)
          )
        `)
        .eq("meeting_id", selectedMeetingId)
        .eq("proxy_contact_id", myContactId);
      return data || [];
    },
    enabled: !!selectedMeetingId && !!myContactId,
  });

  useEffect(() => {
    if (!selectedMeetingId) return;
    const channel = supabase
      .channel(`owner-attendees-${selectedMeetingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etv_attendees', filter: `meeting_id=eq.${selectedMeetingId}` },
        () => queryClient.invalidateQueries({ queryKey: ["my-attendees"] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedMeetingId, queryClient]);

  // Auto-create attendee records for ALL assignments when owner views a published/in_progress meeting
  const autoRegisterRef = useRef(false);
  const autoRegisterMutation = useMutation({
    mutationFn: async () => {
      if (!myAssignments.length || !selectedMeetingId) throw new Error("Missing data");
      // Find which assignments don't have attendee records yet
      const existingAssignmentIds = myAttendees.map(a => a.assignment_id);
      const missingAssignments = myAssignments.filter(a => !existingAssignmentIds.includes(a.id));
      if (missingAssignments.length === 0) return;
      
      const rows = missingAssignments.map(a => ({
        meeting_id: selectedMeetingId,
        assignment_id: a.id,
        attendance_type: "absent" as const,
      }));
      const { error } = await supabase.from("etv_attendees").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchAttendees();
    },
  });

  const selectedMeetingForAutoReg = meetings.find((m: any) => m.id === selectedMeetingId);
  useEffect(() => {
    if (
      selectedMeetingId &&
      myAssignments.length > 0 &&
      selectedMeetingForAutoReg &&
      ["published", "in_progress"].includes(selectedMeetingForAutoReg.status) &&
      !autoRegisterMutation.isPending &&
      !autoRegisterRef.current
    ) {
      // Check if any assignments are missing attendee records
      const existingAssignmentIds = myAttendees.map(a => a.assignment_id);
      const hasMissing = myAssignments.some(a => !existingAssignmentIds.includes(a.id));
      if (hasMissing) {
        autoRegisterRef.current = true;
        autoRegisterMutation.mutate();
      }
    }
    if (!selectedMeetingId) {
      autoRegisterRef.current = false;
    }
  }, [selectedMeetingId, myAssignments.length, myAttendees.length, selectedMeetingForAutoReg?.status]);

  // Load other owners for proxy selection
  const myAssignmentIds = myAssignments.map(a => a.id);
  const { data: otherOwners = [] } = useQuery({
    queryKey: ["building-owners-proxy", effectiveBuildingId, myAssignmentIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("contact_building_assignments")
        .select(`id, unit_number, contacts!inner(id, first_name, last_name, company_name)`)
        .eq("building_id", effectiveBuildingId!)
        .eq("role_in_building", "eigentuemer")
        .eq("is_active", true);
      // Filter out current user's assignments
      return (data || []).filter((d: any) => !myAssignmentIds.includes(d.id));
    },
    enabled: !!effectiveBuildingId && myAssignments.length > 0,
  });

  // Set proxy mutation — now also saves voting instructions
  const setProxyMutation = useMutation({
    mutationFn: async ({ attendeeId, type, contactId, externalName, instructions }: { attendeeId: string; type: string; contactId?: string; externalName?: string; instructions?: Record<string, string> }) => {
      const token = type === "external" ? crypto.randomUUID() : null;
      // Filter instructions — only store actual votes, not "frei"
      let filteredInstructions: Record<string, string> | null = null;
      if (instructions) {
        const filtered: Record<string, string> = {};
        for (const [key, value] of Object.entries(instructions)) {
          if (value && value !== "frei") filtered[key] = value;
        }
        filteredInstructions = Object.keys(filtered).length > 0 ? filtered : null;
      }
      const { error } = await supabase
        .from("etv_attendees")
        .update({
          proxy_type: type,
          proxy_contact_id: type === "owner" ? (contactId || null) : null,
          proxy_token: token,
          proxy_external_name: type === "external" ? (externalName || null) : null,
          pre_vote_instructions: filteredInstructions,
        })
        .eq("id", attendeeId);
      if (error) throw error;
      return token;
    },
    onSuccess: (token) => {
      if (token) {
        // For external: show the link in the same dialog
        setCreatedProxyToken(token);
        const link = `${window.location.origin}/etv-proxy/${token}`;
        navigator.clipboard.writeText(link);
        toast({ title: "Vollmacht erteilt", description: "Der Vollmacht-Link wurde in die Zwischenablage kopiert." });
      } else {
        toast({ title: "Vollmacht erteilt" });
        setShowProxyDialog(false);
        setProxyAssignmentId(null);
      }
      refetchAttendees();
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  // Withdraw proxy mutation — clears token and external name too
  const withdrawProxyMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      const { error } = await supabase
        .from("etv_attendees")
        .update({
          proxy_type: null,
          proxy_contact_id: null,
          proxy_token: null,
          proxy_token_used: false,
          proxy_external_name: null,
        })
        .eq("id", attendeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Vollmacht zurückgezogen" });
      refetchAttendees();
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  // Save voting instructions mutation
  const saveInstructionsMutation = useMutation({
    mutationFn: async ({ attendeeId, instructions }: { attendeeId: string; instructions: Record<string, string> }) => {
      // Filter out "frei" entries — only store actual instructions
      const filtered: Record<string, string> = {};
      for (const [key, value] of Object.entries(instructions)) {
        if (value && value !== "frei") filtered[key] = value;
      }
      const { error } = await supabase
        .from("etv_attendees")
        .update({ pre_vote_instructions: Object.keys(filtered).length > 0 ? filtered : null })
        .eq("id", attendeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Weisungen gespeichert", description: "Ihre Abstimmungsweisungen wurden hinterlegt." });
      setShowInstructionsDialog(false);
      setInstructionsAttendeeId(null);
      refetchAttendees();
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const getContactName = (contact: any) => {
    if (contact.company_name) return contact.company_name;
    return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unbenannt";
  };

  // 1h-Sperre entfernt: Vollmachten können bis zur letzten Sekunde erteilt werden
  const isProxyLocked = (_meetingDate: string) => false;

  // Redeem external proxy token into this user's account
  const redeemProxyMutation = useMutation({
    mutationFn: async (rawToken: string) => {
      const res = await supabase.functions.invoke("redeem-proxy-token", {
        body: { token: rawToken },
      });
      if (res.error) {
        // Try to extract server error message
        let msg = res.error.message || "Einlösen fehlgeschlagen";
        try {
          const ctx: any = (res.error as any).context;
          if (ctx?.body) {
            const parsed = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (parsed?.error) msg = parsed.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if ((res.data as any)?.error) throw new Error((res.data as any).error);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: "Vollmacht übernommen", description: "Die Vollmacht ist jetzt in Ihrem Konto verfügbar." });
      setRedeemDialogOpen(false);
      setRedeemInput("");
      queryClient.invalidateQueries({ queryKey: ["received-proxies"] });
      refetchAttendees();
    },
    onError: (err: any) => {
      toast({ title: "Vollmacht konnte nicht eingelöst werden", description: err.message, variant: "destructive" });
    },
  });




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

              {/* Live Dashboard for in_progress meetings */}
              {selectedMeeting.status === "in_progress" && (
                <OwnerLiveDashboard meetingId={selectedMeeting.id} agendaItems={agendaItems} />
              )}

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
                              <Badge className={`text-xs mt-1 ${item.result === "passed" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}`}>
                                {item.result === "passed" ? "✓ Angenommen" : "✗ Abgelehnt"}
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

              {/* Vollmacht-Sektion — pro Einheit */}
              {["published", "in_progress"].includes(selectedMeeting.status) && myAssignments.length > 0 && (
                <div className="border-t pt-4 space-y-3">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Ihre Teilnahme & Vollmacht
                  </h3>

                  {isProxyLocked(selectedMeeting.meeting_date) && (
                    <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                      <CardContent className="p-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                        <Lock className="h-4 w-4" />
                        <span>Vollmachten sind gesperrt (1h vor Versammlungsbeginn).</span>
                      </CardContent>
                    </Card>
                  )}

                  {myAssignments.map((assignment: any) => {
                    const attendee = myAttendees.find((a: any) => a.assignment_id === assignment.id);
                    const hasProxy = !!attendee?.proxy_type;
                    const locked = isProxyLocked(selectedMeeting.meeting_date);

                    const getProxyLabel = () => {
                      if (!attendee || !hasProxy) return null;
                      if (attendee.proxy_type === "manager") return "Verwalter";
                      if (attendee.proxy_type === "external") return attendee.proxy_external_name || "Externe Person";
                      const pc = attendee.proxy_contact;
                      if (pc) {
                        return pc.company_name || [pc.first_name, pc.last_name].filter(Boolean).join(" ") || "Eigentümer";
                      }
                      return "Eigentümer";
                    };

                    return (
                      <Card
                        key={assignment.id}
                        className={`cursor-pointer transition-shadow hover:shadow-md ${hasProxy ? "border-blue-200 dark:border-blue-800" : ""}`}
                        onClick={() => {
                          if (locked) return;
                          if (hasProxy && attendee) {
                            setProxyDetailAttendeeId(attendee.id);
                          } else if (attendee) {
                            setProxyAssignmentId(assignment.id);
                            setProxyType("manager");
                            setProxyContactId("");
                            setProxyExternalName("");
                            setCreatedProxyToken(null);
                            // Initialize voting instructions
                            const initial: Record<string, string> = {};
                            agendaItems.forEach((item: any) => { initial[item.id] = "frei"; });
                            setVotingInstructions(initial);
                            setProxyStep(1);
                            setExpandedTopIds(new Set());
                            setShowProxyDialog(true);
                          }
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {assignment.unit_number ? `Einheit ${assignment.unit_number}` : "Zuordnung"}
                              </p>
                            </div>
                            <div className="shrink-0">
                              {!attendee ? (
                                <Badge variant="secondary">Wird geladen...</Badge>
                              ) : hasProxy ? (
                                <div className="flex items-center gap-1.5">
                                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 max-w-[200px] truncate">
                                    Vollmacht: {getProxyLabel()}
                                  </Badge>
                                  {attendee?.pre_vote_instructions && Object.keys(attendee.pre_vote_instructions).length > 0 && (
                                    <Badge variant="secondary" className="text-xs h-5 px-1.5">
                                      {Object.keys(attendee.pre_vote_instructions).length} W.
                                    </Badge>
                                  )}
                                </div>
                              ) : attendee.attendance_type === "present" ? (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Anwesend</Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  {locked ? "Offen" : "Vollmacht erteilen →"}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Received Proxies Section */}
              {receivedProxies.length > 0 && ["published", "in_progress"].includes(selectedMeeting.status) && (
                <div className="border-t pt-4 space-y-3">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Shield className="h-4 w-4 text-blue-500" />
                    Erhaltene Vollmachten
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Folgende Eigentümer haben Ihnen eine Vollmacht erteilt. Sie stimmen in deren Namen ab.
                  </p>
                  {receivedProxies.map((proxy: any) => {
                    const cba = proxy.contact_building_assignments;
                    const ownerContact = cba?.contacts;
                    const ownerName = ownerContact?.company_name || [ownerContact?.first_name, ownerContact?.last_name].filter(Boolean).join(" ") || "Unbekannt";
                    return (
                      <Card
                        key={proxy.id}
                        className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-950/40 transition-colors"
                        onClick={() => setViewReceivedProxy(proxy)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{ownerName}</p>
                              {cba?.unit_number && (
                                <p className="text-xs text-muted-foreground">Einheit {cba.unit_number}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                Vollmacht erhalten
                              </Badge>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Received Proxy Detail Dialog */}
              <Dialog open={!!viewReceivedProxy} onOpenChange={(open) => !open && setViewReceivedProxy(null)}>
                <DialogContent className="max-w-md">
                  {viewReceivedProxy && (() => {
                    const cba = viewReceivedProxy.contact_building_assignments;
                    const ownerContact = cba?.contacts;
                    const ownerName = ownerContact?.company_name || [ownerContact?.first_name, ownerContact?.last_name].filter(Boolean).join(" ") || "Unbekannt";
                    const hasInstructions = viewReceivedProxy.pre_vote_instructions && Object.keys(viewReceivedProxy.pre_vote_instructions).length > 0;
                    const shares = cba?.contact_building_shares || [];
                    const meaShare = shares.find((s: any) => s.share_type === "mea");
                    return (
                      <>
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-blue-500" />
                            Vollmacht
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 p-4 space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                                <Users className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">{ownerName}</p>
                                <p className="text-xs text-muted-foreground">hat Ihnen eine Vollmacht erteilt</p>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            {cba?.unit_number && (
                              <div className="rounded-lg bg-muted/40 p-3">
                                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Einheit</p>
                                <p className="text-sm font-semibold mt-0.5">{cba.unit_number}</p>
                              </div>
                            )}
                            {meaShare && (
                              <div className="rounded-lg bg-muted/40 p-3">
                                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">MEA-Anteil</p>
                                <p className="text-sm font-semibold mt-0.5">{meaShare.share_value} / 1000</p>
                              </div>
                            )}
                            <div className="rounded-lg bg-muted/40 p-3">
                              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Vollmacht-Typ</p>
                              <p className="text-sm font-semibold mt-0.5">{viewReceivedProxy.proxy_type === "manager" ? "Verwalter" : "Eigentümer"}</p>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-3">
                              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Status</p>
                              <p className="text-sm font-semibold mt-0.5 text-green-600">Aktiv</p>
                            </div>
                          </div>

                          {hasInstructions && (
                            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-4 space-y-2">
                              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Weisungen des Eigentümers</p>
                              <div className="space-y-1.5">
                                {Object.entries(viewReceivedProxy.pre_vote_instructions).map(([topId, instruction]: [string, any]) => {
                                  const topItem = agendaItems.find((a: any) => a.id === topId);
                                  const topIdx = topItem ? agendaItems.indexOf(topItem) + 1 : null;
                                  const voteLabel = instruction === "yes" ? "Ja" : instruction === "no" ? "Nein" : instruction === "abstain" ? "Enthaltung" : String(instruction);
                                  const voteColor = instruction === "yes" ? "text-green-700 dark:text-green-400" : instruction === "no" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400";
                                  return (
                                    <div key={topId} className="flex items-center justify-between text-sm">
                                      <span className="text-amber-700 dark:text-amber-400">
                                        {topIdx ? `TOP ${topIdx}` : "TOP"}: {topItem?.title || "Unbekannt"}
                                      </span>
                                      <Badge variant="outline" className={`text-xs ${voteColor}`}>{voteLabel}</Badge>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {!hasInstructions && (
                            <div className="rounded-lg border bg-muted/30 p-4 text-center">
                              <p className="text-sm text-muted-foreground">Keine Weisungen hinterlegt</p>
                              <p className="text-xs text-muted-foreground mt-1">Sie können frei im Namen des Eigentümers abstimmen.</p>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </DialogContent>
              </Dialog>

              {/* Show message when no assignments found */}
              {["published", "in_progress"].includes(selectedMeeting.status) && myAssignments.length === 0 && (
                <div className="border-t pt-4">
                  <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                    <CardContent className="p-4 text-sm text-amber-700 dark:text-amber-400">
                      Ihr Benutzerkonto ist noch nicht mit einem Eigentümer-Kontakt verknüpft. Bitte wenden Sie sich an Ihre Hausverwaltung.
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Agenda Item Detail Dialog */}
      <Dialog open={!!selectedAgendaItemId} onOpenChange={() => setSelectedAgendaItemId(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          {(() => {
            const item = agendaItems.find((a: any) => a.id === selectedAgendaItemId);
            if (!item) return null;
            const idx = agendaItems.indexOf(item);
            return (
              <>
                <DialogHeader>
                  <DialogTitle>TOP {idx + 1}: {item.title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {item.description && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Beschreibung</p>
                      <p className="text-sm leading-relaxed">{item.description}</p>
                    </div>
                  )}

                  {item.attachment_paths && item.attachment_paths.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">Anhänge</p>
                      <div className="space-y-1.5">
                        {item.attachment_paths.map((path: string, i: number) => {
                          const fileName = path.split("/").pop()?.replace(/^\d+-/, "") || path;
                          return (
                            <Button
                              key={i}
                              variant="outline"
                              size="sm"
                              className="w-full justify-start gap-2 text-sm"
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

                  {(item.status === "voted" || item.status === "closed") && (
                    <div className="border-t pt-3">
                      <p className="text-sm font-medium text-muted-foreground mb-2">Abstimmungsergebnis</p>
                      <div className="flex gap-6 text-sm">
                        <div className="text-center">
                          <div className="text-xl font-bold text-green-600">{item.yes_count}</div>
                          <div className="text-xs text-muted-foreground">Ja</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xl font-bold text-red-600">{item.no_count}</div>
                          <div className="text-xs text-muted-foreground">Nein</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xl font-bold text-muted-foreground">{item.abstain_count}</div>
                          <div className="text-xs text-muted-foreground">Enthaltung</div>
                        </div>
                      </div>
                      {item.result && (
                      <Badge className={`mt-2 ${item.result === "passed" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}`}>
                          {item.result === "passed" ? "✓ Angenommen" : "✗ Abgelehnt"}
                        </Badge>
                      )}
                    </div>
                  )}

                  {item.status === "voting" && (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      Abstimmung läuft gerade
                    </Badge>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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
        <DialogContent className="max-w-lg max-h-[95dvh] sm:max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="text-lg">Antrag einreichen</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
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
          </div>

          <div className="flex justify-end gap-3 border-t px-6 py-4 shrink-0 bg-background" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
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
        </DialogContent>
      </Dialog>

      {/* Proxy Dialog — Progressive Steps: Type → Person → Instructions → Create */}
      <Dialog open={showProxyDialog} onOpenChange={(open) => { if (!open) { setShowProxyDialog(false); setProxyAssignmentId(null); setCreatedProxyToken(null); setProxyStep(1); setExpandedTopIds(new Set()); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              {createdProxyToken ? "Vollmacht erteilt" : "Vollmacht erteilen"}
            </DialogTitle>
            {!createdProxyToken && (
              <div className="flex items-center gap-2 pt-2">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${proxyStep >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {s}
                    </div>
                    {s < 3 && <div className={`h-0.5 w-6 rounded transition-colors ${proxyStep > s ? "bg-primary" : "bg-muted"}`} />}
                  </div>
                ))}
                <span className="text-xs text-muted-foreground ml-2">
                  {proxyStep === 1 ? "Empfänger" : proxyStep === 2 ? "Person" : "Weisungen"}
                </span>
              </div>
            )}
          </DialogHeader>

          {/* After creation: show external link */}
          {createdProxyToken ? (() => {
            const proxyLink = `${window.location.origin}/etv-proxy/${createdProxyToken}`;
            return (
              <div className="space-y-4">
                <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-800 dark:text-blue-300">
                      <Link2 className="h-4 w-4" />
                      Abstimmungs-Link für {proxyExternalName || "externe Person"}
                    </div>
                    <p className="text-xs text-blue-700 dark:text-blue-400">
                      Teilen Sie diesen Link mit der bevollmächtigten Person. Über den Link kann sie an Abstimmungen teilnehmen.
                    </p>
                    <code className="block text-xs bg-white dark:bg-blue-900/50 px-2 py-2 rounded border border-blue-200 dark:border-blue-700 break-all">
                      {proxyLink}
                    </code>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={() => {
                          navigator.clipboard.writeText(proxyLink);
                          toast({ title: "Link kopiert" });
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Kopieren
                      </Button>
                      {typeof navigator.share === "function" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1.5"
                          onClick={() => {
                            navigator.share({
                              title: "Vollmacht-Link zur Eigentümerversammlung",
                              text: `Hallo ${proxyExternalName || ""}, hier ist Ihr Vollmacht-Link zur Abstimmung:`,
                              url: proxyLink,
                            }).catch(() => {});
                          }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Teilen
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Button className="w-full" onClick={() => { setShowProxyDialog(false); setProxyAssignmentId(null); setCreatedProxyToken(null); setProxyStep(1); }}>
                  Fertig
                </Button>
              </div>
            );
          })() : (
            <div className="space-y-5">
              {/* Step 1: Proxy type — Visual cards */}
              {proxyStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">An wen möchten Sie Ihre Vollmacht erteilen?</p>
                  <div className="grid gap-3">
                    {[
                      { value: "manager", icon: Shield, title: "Verwalter", desc: "Die Verwaltung stimmt für Sie ab" },
                      { value: "owner", icon: Users, title: "Eigentümer", desc: "Ein anderer Eigentümer im Haus" },
                      { value: "external", icon: ExternalLink, title: "Externe Person", desc: "Eine Person außerhalb der WEG" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        className={`flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all hover:shadow-md ${proxyType === opt.value ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"}`}
                        onClick={() => {
                          setProxyType(opt.value);
                          setProxyContactId("");
                          setProxyExternalName("");
                          if (opt.value === "manager") {
                            setProxyStep(3);
                          } else {
                            setProxyStep(2);
                          }
                        }}
                      >
                        <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 ${proxyType === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                          <opt.icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm">{opt.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Person selection */}
              {proxyStep === 2 && proxyType === "owner" && (
                <div className="space-y-3">
                  <Button variant="ghost" size="sm" className="gap-1 -ml-2 text-muted-foreground" onClick={() => setProxyStep(1)}>
                    ← Zurück
                  </Button>
                  <Label className="text-sm font-medium">Eigentümer auswählen</Label>
                  <Select value={proxyContactId} onValueChange={(v) => { setProxyContactId(v); setProxyStep(3); }}>
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

              {proxyStep === 2 && proxyType === "external" && (
                <div className="space-y-3">
                  <Button variant="ghost" size="sm" className="gap-1 -ml-2 text-muted-foreground" onClick={() => setProxyStep(1)}>
                    ← Zurück
                  </Button>
                  <Label className="text-sm font-medium">Name der externen Person</Label>
                  <Input
                    value={proxyExternalName}
                    onChange={(e) => setProxyExternalName(e.target.value)}
                    placeholder="Vor- und Nachname eingeben..."
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Es wird ein Link generiert, den Sie an die Person weitergeben können.
                  </p>
                  {proxyExternalName.trim() && (
                    <Button variant="outline" className="w-full gap-2" onClick={() => setProxyStep(3)}>
                      Weiter zu Weisungen
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}

              {/* Step 3: Voting instructions + submit */}
              {proxyStep === 3 && (
                <div className="space-y-4">
                  <Button variant="ghost" size="sm" className="gap-1 -ml-2 text-muted-foreground" onClick={() => setProxyStep(proxyType === "manager" ? 1 : 2)}>
                    ← Zurück
                  </Button>

                  {agendaItems.length > 0 && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium">Abstimmungsweisungen <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Legen Sie fest, wie abgestimmt werden soll. Bei „Frei" entscheidet der Bevollmächtigte.
                        </p>
                      </div>
                      <div className="space-y-2">
                        {agendaItems.map((item: any, idx: number) => {
                          const currentValue = votingInstructions[item.id] || "frei";
                          const isExpanded = expandedTopIds.has(item.id);
                          return (
                            <div key={item.id} className="rounded-lg border p-3 space-y-2">
                              <button
                                type="button"
                                className="flex items-start gap-2 w-full text-left"
                                onClick={() => {
                                  setExpandedTopIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(item.id)) next.delete(item.id);
                                    else next.add(item.id);
                                    return next;
                                  });
                                }}
                              >
                                <span className="text-primary font-bold text-sm shrink-0">TOP {idx + 1}</span>
                                <span className="text-sm flex-1">{item.title}</span>
                                <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </button>
                              {isExpanded && item.description && (
                                <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2.5 ml-6">
                                  {item.description}
                                </p>
                              )}
                              <div className="flex gap-1.5">
                                {[
                                  { value: "yes", label: "Ja", activeClass: "bg-green-600 text-white hover:bg-green-700 border-green-600" },
                                  { value: "no", label: "Nein", activeClass: "bg-red-600 text-white hover:bg-red-700 border-red-600" },
                                  { value: "abstain", label: "Enthaltung", activeClass: "bg-muted-foreground text-white hover:bg-muted-foreground/90 border-muted-foreground" },
                                  { value: "frei", label: "Frei", activeClass: "bg-primary text-primary-foreground hover:bg-primary/90 border-primary" },
                                ].map((option) => (
                                  <Button
                                    key={option.value}
                                    variant="outline"
                                    size="sm"
                                    className={`flex-1 text-xs h-8 ${currentValue === option.value ? option.activeClass : ""}`}
                                    onClick={() => setVotingInstructions(prev => ({ ...prev, [item.id]: option.value }))}
                                  >
                                    {option.label}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Create button */}
                  <div className="flex justify-end gap-3 border-t pt-4">
                    <Button variant="outline" onClick={() => { setShowProxyDialog(false); setProxyAssignmentId(null); setProxyStep(1); }}>Abbrechen</Button>
                    <Button
                      onClick={() => {
                        const attendee = myAttendees.find((a: any) => a.assignment_id === proxyAssignmentId);
                        if (!attendee) return;
                        setProxyMutation.mutate({
                          attendeeId: attendee.id,
                          type: proxyType,
                          contactId: proxyContactId || undefined,
                          externalName: proxyExternalName || undefined,
                          instructions: votingInstructions,
                        });
                      }}
                      disabled={setProxyMutation.isPending || (proxyType === "owner" && !proxyContactId) || (proxyType === "external" && !proxyExternalName.trim())}
                    >
                      {setProxyMutation.isPending ? "Wird gespeichert..." : "Vollmacht erteilen"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Proxy Detail Dialog */}
      <Dialog open={!!proxyDetailAttendeeId} onOpenChange={() => setProxyDetailAttendeeId(null)}>
        <DialogContent className="max-w-md">
          {(() => {
            const attendee = myAttendees.find((a: any) => a.id === proxyDetailAttendeeId);
            if (!attendee) return null;
            const assignment = myAssignments.find((a: any) => a.id === attendee.assignment_id);
            const proxyLabel = attendee.proxy_type === "manager" ? "Verwalter" 
              : attendee.proxy_type === "external" ? (attendee.proxy_external_name || "Externe Person")
              : (() => {
                  const pc = attendee.proxy_contact;
                  if (pc) return pc.company_name || [pc.first_name, pc.last_name].filter(Boolean).join(" ") || "Eigentümer";
                  return "Eigentümer";
                })();
            const proxyTypeLabel = attendee.proxy_type === "manager" ? "Verwalter" : attendee.proxy_type === "external" ? "Externe Person" : "Anderer Eigentümer";
            const proxyLink = attendee.proxy_type === "external" && attendee.proxy_token ? `${window.location.origin}/etv-proxy/${attendee.proxy_token}` : null;

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Vollmacht — {assignment?.unit_number ? `Einheit ${assignment.unit_number}` : "Zuordnung"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Art</span>
                      <Badge variant="secondary">{proxyTypeLabel}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Bevollmächtigt</span>
                      <span className="text-sm font-medium">{proxyLabel}</span>
                    </div>
                  </div>

                  {proxyLink && (
                    <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
                      <CardContent className="p-3 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-blue-800 dark:text-blue-300">
                          <Link2 className="h-4 w-4" />
                          Abstimmungs-Link
                        </div>
                        <p className="text-xs text-blue-700 dark:text-blue-400">
                          Teilen Sie diesen Link mit der bevollmächtigten Person. Über den Link kann sie an Abstimmungen teilnehmen und Ergebnisse einsehen. Der Link ist gültig, bis die Vollmacht zurückgezogen wird.
                        </p>
                        <code className="block text-xs bg-white dark:bg-blue-900/50 px-2 py-2 rounded border border-blue-200 dark:border-blue-700 break-all">
                          {proxyLink}
                        </code>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 gap-1.5"
                            onClick={() => {
                              navigator.clipboard.writeText(proxyLink);
                              toast({ title: "Link kopiert" });
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Kopieren
                          </Button>
                          {typeof navigator.share === "function" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 gap-1.5"
                              onClick={() => {
                                navigator.share({
                                  title: "Vollmacht-Link zur Eigentümerversammlung",
                                  text: `Hallo ${attendee.proxy_external_name || ""}, hier ist Ihr Vollmacht-Link zur Abstimmung:`,
                                  url: proxyLink,
                                }).catch(() => {});
                              }}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Teilen
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Weisungen bearbeiten button */}
                  {selectedMeeting && agendaItems.length > 0 && (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => {
                        const existing = attendee.pre_vote_instructions || {};
                        const initial: Record<string, string> = {};
                        agendaItems.forEach((item: any) => {
                          initial[item.id] = existing[item.id] || "frei";
                        });
                        setVotingInstructions(initial);
                        setInstructionsAttendeeId(attendee.id);
                        setShowInstructionsDialog(true);
                      }}
                      disabled={isProxyLocked(selectedMeeting.meeting_date)}
                    >
                      <Vote className="h-4 w-4" />
                      Weisungen bearbeiten
                      {attendee.pre_vote_instructions && Object.keys(attendee.pre_vote_instructions).length > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                          {Object.keys(attendee.pre_vote_instructions).length}
                        </Badge>
                      )}
                    </Button>
                  )}

                  {selectedMeeting && !isProxyLocked(selectedMeeting.meeting_date) && (
                    <Button
                      variant="outline"
                      className="w-full gap-2 text-destructive hover:text-destructive"
                      onClick={() => {
                        setProxyDetailAttendeeId(null);
                        setWithdrawAttendeeId(attendee.id);
                      }}
                    >
                      <UserX className="h-4 w-4" />
                      Vollmacht zurückziehen
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Withdraw Confirmation AlertDialog */}
      <AlertDialog open={!!withdrawAttendeeId} onOpenChange={(open) => { if (!open) setWithdrawAttendeeId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vollmacht zurückziehen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die bevollmächtigte Person kann danach nicht mehr in Ihrem Namen abstimmen. Ein eventuell geteilter Link wird ungültig.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (withdrawAttendeeId) {
                  withdrawProxyMutation.mutate(withdrawAttendeeId);
                  setWithdrawAttendeeId(null);
                }
              }}
            >
              Zurückziehen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Voting Instructions Dialog */}
      <Dialog open={showInstructionsDialog} onOpenChange={(open) => { if (!open) { setShowInstructionsDialog(false); setInstructionsAttendeeId(null); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Vote className="h-5 w-5 text-primary" />
              Abstimmungsweisungen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Legen Sie fest, wie Ihr Bevollmächtigter bei den einzelnen Tagesordnungspunkten abstimmen soll. Bei „Frei" kann der Bevollmächtigte nach eigenem Ermessen abstimmen.
            </p>

            <div className="space-y-3">
              {agendaItems.map((item: any, idx: number) => {
                const currentValue = votingInstructions[item.id] || "frei";
                return (
                  <div key={item.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-primary font-bold text-sm shrink-0">TOP {idx + 1}</span>
                      <span className="text-sm font-medium">{item.title}</span>
                    </div>
                    <div className="flex gap-1.5">
                      {[
                        { value: "yes", label: "Ja", activeClass: "bg-green-600 text-white hover:bg-green-700 border-green-600" },
                        { value: "no", label: "Nein", activeClass: "bg-red-600 text-white hover:bg-red-700 border-red-600" },
                        { value: "abstain", label: "Enthaltung", activeClass: "bg-muted-foreground text-white hover:bg-muted-foreground/90 border-muted-foreground" },
                        { value: "frei", label: "Frei", activeClass: "bg-primary text-primary-foreground hover:bg-primary/90 border-primary" },
                      ].map((option) => (
                        <Button
                          key={option.value}
                          variant="outline"
                          size="sm"
                          className={`flex-1 text-xs h-8 ${currentValue === option.value ? option.activeClass : ""}`}
                          onClick={() => setVotingInstructions(prev => ({ ...prev, [item.id]: option.value }))}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {agendaItems.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                Noch keine Tagesordnungspunkte vorhanden.
              </div>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => { setShowInstructionsDialog(false); setInstructionsAttendeeId(null); }}>
                Abbrechen
              </Button>
              <Button
                onClick={() => {
                  if (instructionsAttendeeId) {
                    saveInstructionsMutation.mutate({ attendeeId: instructionsAttendeeId, instructions: votingInstructions });
                  }
                }}
                disabled={saveInstructionsMutation.isPending || !instructionsAttendeeId}
              >
                {saveInstructionsMutation.isPending ? "Wird gespeichert..." : "Weisungen speichern"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
