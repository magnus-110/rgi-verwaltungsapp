import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, FileText, Inbox, Building2, ExternalLink, ChevronDown, ChevronRight, Mail, StickyNote, Plus, Pencil, Trash2 } from "lucide-react";
import { format as formatDate } from "date-fns";
import { de } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { EtvRelevantEmailsManager } from "./EtvRelevantEmailsManager";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

interface SubmittedTopsManagerProps {
  buildingFilter?: string;
}

export const SubmittedTopsManager = ({ buildingFilter: externalBuildingFilter }: SubmittedTopsManagerProps = {}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const filterBuildingId = externalBuildingFilter || "all";
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [acceptTopId, setAcceptTopId] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  const [detailTopId, setDetailTopId] = useState<string | null>(null);
  const [showProcessed, setShowProcessed] = useState(false);

  const { data: allTops = [], isLoading } = useQuery({
    queryKey: ["admin-submitted-tops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_submitted_tops")
        .select("*, buildings(id, name, address), profiles!etv_submitted_tops_submitted_by_user_id_fkey(first_name, last_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const buildingMap = new Map<string, any>();
  allTops.forEach((t: any) => {
    if (t.buildings) buildingMap.set(t.buildings.id, t.buildings);
  });
  const buildings = Array.from(buildingMap.values());

  const filteredTops = filterBuildingId === "all"
    ? allTops
    : allTops.filter((t: any) => t.building_id === filterBuildingId);

  const pendingTops = filteredTops.filter((t: any) => t.status === "pending");
  const acceptedTops = filteredTops.filter((t: any) => t.status === "accepted");
  const rejectedTops = filteredTops.filter((t: any) => t.status === "rejected" || t.status === "deferred");

  const acceptTop = allTops.find((t: any) => t.id === acceptTopId);
  const detailTop = allTops.find((t: any) => t.id === detailTopId);

  const { data: draftMeetings = [] } = useQuery({
    queryKey: ["draft-meetings-for-building", acceptTop?.building_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("id, title, meeting_date")
        .eq("building_id", acceptTop!.building_id)
        .in("status", ["draft", "published"])
        .order("meeting_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!acceptTop?.building_id,
  });

  const acceptMutation = useMutation({
    mutationFn: async (top: any) => {
      const { data: existingItems } = await supabase
        .from("etv_agenda_items")
        .select("sort_order")
        .eq("meeting_id", selectedMeetingId)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = ((existingItems?.[0]?.sort_order) || 0) + 1;

      const { error: insertErr } = await supabase.from("etv_agenda_items").insert({
        meeting_id: selectedMeetingId,
        title: top.title,
        description: top.description,
        sort_order: nextOrder,
        voting_principle: "mea",
        category: "sonstiges",
        attachment_paths: top.attachment_paths,
      });
      if (insertErr) throw insertErr;

      const { error: updateErr } = await supabase
        .from("etv_submitted_tops")
        .update({ status: "accepted", accepted_into_meeting_id: selectedMeetingId, updated_at: new Date().toISOString() })
        .eq("id", top.id);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      toast({ title: "TOP in Versammlung übernommen" });
      setAcceptTopId(null);
      setSelectedMeetingId("");
      queryClient.invalidateQueries({ queryKey: ["admin-submitted-tops"] });
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items"] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const { error } = await supabase
        .from("etv_submitted_tops")
        .update({ status: "rejected", admin_notes: note || null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Antrag abgelehnt" });
      setRejectId(null);
      setRejectNote("");
      queryClient.invalidateQueries({ queryKey: ["admin-submitted-tops"] });
    },
  });

  const getFileDownloadUrl = async (path: string) => {
    const { data } = await supabase.storage.from("building-files").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const getSubmitterName = (top: any) => {
    const s = top.profiles;
    return s ? `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Unbekannt" : "Unbekannt";
  };

  const renderTopCard = (top: any, showActions: boolean) => {
    const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Ausstehend", variant: "outline" },
      accepted: { label: "Aufgenommen", variant: "default" },
      rejected: { label: "Abgelehnt", variant: "destructive" },
      deferred: { label: "Zurückgestellt", variant: "secondary" },
    };
    const statusInfo = statusLabels[top.status] || statusLabels.pending;

    return (
      <Card
        key={top.id}
        className={`cursor-pointer hover:shadow-md transition-shadow ${showActions ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" : ""}`}
        onClick={() => setDetailTopId(top.id)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h5 className="font-semibold text-sm">{top.title}</h5>
                <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
              </div>
              {top.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{top.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {top.buildings?.name}
                </span>
                <span>•</span>
                <span>von {getSubmitterName(top)}</span>
                <span>•</span>
                <span>{formatDate(new Date(top.created_at), "dd.MM.yyyy", { locale: de })}</span>
                {top.attachment_paths?.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {top.attachment_paths.length}
                    </span>
                  </>
                )}
              </div>
            </div>
            {showActions && (
              <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="default"
                  className="gap-1 h-8"
                  onClick={() => { setAcceptTopId(top.id); setSelectedMeetingId(""); }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Übernehmen
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 h-8 text-destructive hover:text-destructive"
                  onClick={() => { setRejectId(top.id); setRejectNote(""); }}
                >
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="app">
        <TabsList>
          <TabsTrigger value="app" className="gap-1.5">
            <Inbox className="h-3.5 w-3.5" /> Anträge aus der App
            {pendingTops.length > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{pendingTops.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="emails" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" /> ETV-relevante E-Mails
          </TabsTrigger>
          <TabsTrigger value="weitere" className="gap-1.5">
            <StickyNote className="h-3.5 w-3.5" /> Weitere
          </TabsTrigger>
        </TabsList>

        <TabsContent value="app" className="space-y-4 mt-4">
          {/* Pending */}
          {pendingTops.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold">Offene Anträge ({pendingTops.length})</h3>
              </div>
              {pendingTops.map((top: any) => renderTopCard(top, true))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Keine offenen Anträge vorhanden.</p>
              </CardContent>
            </Card>
          )}

          {/* Processed - collapsible */}
          {(acceptedTops.length > 0 || rejectedTops.length > 0) && (
            <Collapsible open={showProcessed} onOpenChange={setShowProcessed}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="gap-2 text-muted-foreground w-full justify-start">
                  {showProcessed ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Bearbeitete Anträge ({acceptedTops.length + rejectedTops.length})
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-2">
                {acceptedTops.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      Angenommen ({acceptedTops.length})
                    </h4>
                    {acceptedTops.map((top: any) => renderTopCard(top, false))}
                  </div>
                )}
                {rejectedTops.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                      Abgelehnt ({rejectedTops.length})
                    </h4>
                    {rejectedTops.map((top: any) => renderTopCard(top, false))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
        </TabsContent>

        <TabsContent value="emails" className="mt-4">
          <EtvRelevantEmailsManager buildingFilter={filterBuildingId} />
        </TabsContent>

        <TabsContent value="weitere" className="mt-4">
          <ManualNotesSection buildingFilter={filterBuildingId} buildings={buildings} />
        </TabsContent>
      </Tabs>

      {/* Detail dialog */}
      <Dialog open={!!detailTopId} onOpenChange={() => setDetailTopId(null)}>
        <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Antragsdetails</DialogTitle>
          </DialogHeader>
          {detailTop && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold">{detailTop.title}</h3>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <Badge variant={detailTop.status === "accepted" ? "default" : detailTop.status === "rejected" ? "destructive" : "outline"} className="text-sm px-3 py-1">
                    {detailTop.status === "accepted" ? "Aufgenommen" : detailTop.status === "rejected" ? "Abgelehnt" : "Ausstehend"}
                  </Badge>
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    {detailTop.buildings?.name}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Eingereicht von</p>
                  <p>{getSubmitterName(detailTop)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Eingereicht am</p>
                  <p>{formatDate(new Date(detailTop.created_at), "dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: de })}</p>
                </div>
              </div>

              {detailTop.description && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-1">Begründung</p>
                  <p className="text-base leading-relaxed whitespace-pre-wrap">{detailTop.description}</p>
                </div>
              )}

              {detailTop.admin_notes && (
                <div className="border-l-4 border-primary/30 bg-primary/5 rounded-r-lg pl-4 pr-3 py-3">
                  <p className="text-sm font-semibold text-muted-foreground mb-1">Anmerkung der Verwaltung</p>
                  <p className="text-base italic">{detailTop.admin_notes}</p>
                </div>
              )}

              {detailTop.attachment_paths?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-2">Anhänge</p>
                  <div className="space-y-1.5">
                    {detailTop.attachment_paths.map((path: string, i: number) => {
                      const fileName = path.split("/").pop()?.replace(/^\d+-/, "") || path;
                      return (
                        <Button
                          key={i}
                          variant="outline"
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

              {detailTop.status === "pending" && (
                <div className="flex justify-end gap-2 border-t pt-4">
                  <Button
                    variant="ghost"
                    className="gap-1 text-destructive hover:text-destructive"
                    onClick={() => { setDetailTopId(null); setRejectId(detailTop.id); setRejectNote(""); }}
                  >
                    <XCircle className="h-4 w-4" />
                    Ablehnen
                  </Button>
                  <Button
                    className="gap-2"
                    onClick={() => { setDetailTopId(null); setAcceptTopId(detailTop.id); setSelectedMeetingId(""); }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    In Versammlung übernehmen
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Accept dialog */}
      <Dialog open={!!acceptTopId} onOpenChange={() => setAcceptTopId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>In Versammlung übernehmen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Wählen Sie die Versammlung, in welche der TOP aufgenommen werden soll.
            </p>
            {draftMeetings.length === 0 ? (
              <p className="text-sm text-destructive">
                Keine Versammlungen im Status "Entwurf" oder "Freigeschaltet" für dieses Gebäude vorhanden.
              </p>
            ) : (
              <Select value={selectedMeetingId} onValueChange={setSelectedMeetingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Versammlung wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {draftMeetings.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.title} — {formatDate(new Date(m.meeting_date), "dd.MM.yyyy", { locale: de })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAcceptTopId(null)}>Abbrechen</Button>
              <Button
                onClick={() => acceptMutation.mutate(acceptTop)}
                disabled={!selectedMeetingId || acceptMutation.isPending}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                Übernehmen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectId} onOpenChange={() => setRejectId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Antrag ablehnen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Begründung (optional, wird dem Eigentümer angezeigt)..."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectId(null)}>Abbrechen</Button>
              <Button
                variant="destructive"
                onClick={() => rejectMutation.mutate({ id: rejectId!, note: rejectNote })}
                disabled={rejectMutation.isPending}
              >
                Ablehnen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface ManualNotesSectionProps {
  buildingFilter: string;
  buildings: any[];
}

const ManualNotesSection = ({ buildingFilter, buildings }: ManualNotesSectionProps) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [buildingId, setBuildingId] = useState<string>("");

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["etv-manual-notes", buildingFilter],
    queryFn: async () => {
      let q = supabase
        .from("etv_manual_notes")
        .select("*, buildings(id, name)")
        .order("created_at", { ascending: false });
      if (buildingFilter !== "all") q = q.eq("building_id", buildingFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setBuildingId(buildingFilter !== "all" ? buildingFilter : "");
    setEditingId(null);
    setShowForm(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        building_id: buildingId || null,
      };
      if (editingId) {
        const { error } = await supabase.from("etv_manual_notes").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("etv_manual_notes").insert({ ...payload, created_by: profile?.user_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editingId ? "Notiz aktualisiert" : "Notiz gespeichert" });
      qc.invalidateQueries({ queryKey: ["etv-manual-notes"] });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("etv_manual_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Notiz gelöscht" });
      qc.invalidateQueries({ queryKey: ["etv-manual-notes"] });
    },
  });

  const startEdit = (n: any) => {
    setEditingId(n.id);
    setTitle(n.title);
    setDescription(n.description || "");
    setBuildingId(n.building_id || "");
    setShowForm(true);
  };

  const startNew = () => {
    resetForm();
    setBuildingId(buildingFilter !== "all" ? buildingFilter : "");
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Eigene Notizen mit Titel und Beschreibung (z. B. mündliche Anliegen).</p>
        {!showForm && (
          <Button size="sm" onClick={startNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> Neue Notiz
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Liegenschaft</Label>
              <Select value={buildingId} onValueChange={setBuildingId}>
                <SelectTrigger><SelectValue placeholder="Liegenschaft wählen..." /></SelectTrigger>
                <SelectContent>
                  {buildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Titel *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Hinweis von Frau Müller" />
            </div>
            <div className="space-y-1.5">
              <Label>Beschreibung</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Details der Notiz..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={resetForm}>Abbrechen</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!title.trim() || !buildingId || saveMutation.isPending}
              >
                {editingId ? "Speichern" : "Anlegen"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : notes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <StickyNote className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Noch keine Notizen vorhanden.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notes.map((n: any) => (
            <Card key={n.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h5 className="font-semibold text-sm">{n.title}</h5>
                    {n.description && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{n.description}</p>}
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                      {n.buildings?.name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {n.buildings.name}
                        </span>
                      )}
                      <span>•</span>
                      <span>{formatDate(new Date(n.created_at), "dd.MM.yyyy HH:mm", { locale: de })}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(n)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Notiz wirklich löschen?")) deleteMutation.mutate(n.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
