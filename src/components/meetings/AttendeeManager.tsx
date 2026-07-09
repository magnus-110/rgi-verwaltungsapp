import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  UserCheck, UserX, Shield, Link2, Copy, Lock, AlertTriangle, Loader2, RefreshCw, FileText, X
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface AttendeeManagerProps {
  meetingId: string;
  buildingId: string;
  lockTime: string | null;
}

interface Attendee {
  id: string;
  assignment_id: string;
  attendance_type: string;
  proxy_type: string | null;
  proxy_contact_id: string | null;
  proxy_token: string | null;
  proxy_token_used: boolean | null;
  proxy_external_name: string | null;
  proxy_document_file_id: string | null;
  proxy_document?: { id: string; display_name: string | null; file_path: string } | null;
  pre_vote_instructions: any;
  self_registered_at: string | null;
  checked_in_at: string | null;
  voting_banned_items: string[] | null;
  contact_building_assignments: {
    id: string;
    unit_number: string | null;
    role_in_building: string | null;
    contacts: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      company_name: string | null;
    };
  };
}

const roleLabels: Record<string, string> = {
  eigentuemer: "Eigentümer",
  mieter: "Mieter",
  verwalter: "Verwalter",
  beirat: "Beirat",
};

export const AttendeeManager = ({ meetingId, buildingId, lockTime }: AttendeeManagerProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [proxyDialog, setProxyDialog] = useState<string | null>(null);
  const [proxyType, setProxyType] = useState<string>("manager");
  const [proxyContactId, setProxyContactId] = useState<string>("");
  const [proxyFile, setProxyFile] = useState<File | null>(null);
  const [proxyGrantedVia, setProxyGrantedVia] = useState<string>("email");

  const isLocked = false; // 1h-Sperre entfernt

  // Load attendees with assignment details
  const { data: attendees = [], isLoading: loadingAttendees } = useQuery({
    queryKey: ["etv-attendees", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_attendees")
        .select(`
          *,
          contact_building_assignments!inner(
            id, unit_number, role_in_building,
            contacts!inner(id, first_name, last_name, company_name)
          ),
          proxy_document:building_files(id, display_name, file_path)
        `)
        .eq("meeting_id", meetingId);
      if (error) throw error;
      return (data || []) as unknown as Attendee[];
    },
  });

  // Load building owners (for initialization)
  const { data: owners = [] } = useQuery({
    queryKey: ["building-owners", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(`
          id, unit_number, role_in_building,
          contacts!inner(id, first_name, last_name, company_name)
        `)
        .eq("building_id", buildingId)
        .eq("role_in_building", "eigentuemer")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  // Load all contacts for proxy selection
  const { data: allContacts = [] } = useQuery({
    queryKey: ["building-contacts-proxy", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(`
          id,
          contacts!inner(id, first_name, last_name, company_name)
        `)
        .eq("building_id", buildingId)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  // Initialize attendees from building owners
  const initMutation = useMutation({
    mutationFn: async () => {
      const existingAssignmentIds = attendees.map((a) => a.assignment_id);
      const newAttendees = owners
        .filter((o: any) => !existingAssignmentIds.includes(o.id))
        .map((o: any) => ({
          meeting_id: meetingId,
          assignment_id: o.id,
          attendance_type: "absent",
        }));
      if (newAttendees.length === 0) return;
      const { error } = await supabase
        .from("etv_attendees")
        .upsert(newAttendees, { onConflict: "meeting_id,assignment_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-attendees", meetingId] });
      toast({ title: "Eigentümer geladen", description: `${owners.length} Eigentümer zur Teilnehmerliste hinzugefügt.` });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  // Update attendance type
  const updateAttendanceMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: string }) => {
      const { error } = await supabase
        .from("etv_attendees")
        .update({ attendance_type: type })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-attendees", meetingId] });
    },
  });

  // Set proxy
  const setProxyMutation = useMutation({
    mutationFn: async ({ attendeeId, type, contactId, file, grantedVia }: { attendeeId: string; type: string; contactId?: string; file?: File | null; grantedVia?: string }) => {
      const token = type === "external" ? crypto.randomUUID() : null;

      const { data: { user } } = await supabase.auth.getUser();

      // Optional: Vollmacht-Dokument ins DMS hochladen (Textform-Nachweis § 25 Abs. 3 WEG)
      let documentFileId: string | null = null;
      if (file) {
        if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name}: max. 50 MB`);
        const ext = file.name.split(".").pop();
        const path = `${buildingId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("building-files").upload(path, file);
        if (upErr) throw upErr;

        // Passende DMS-Kategorie suchen (falls vorhanden)
        const { data: cat } = await supabase
          .from("building_file_categories")
          .select("id")
          .eq("building_id", buildingId)
          .ilike("name", "%vollmacht%")
          .limit(1)
          .maybeSingle();

        const { data: inserted, error: insErr } = await (supabase.from("building_files") as any)
          .insert({
            display_name: file.name,
            file_path: path,
            file_size: file.size,
            mime_type: file.type,
            category_id: cat?.id || null,
            building_id: buildingId,
            uploaded_by: user?.id,
            management_mode: "weg",
            visibility_role: "intern",
            visible_to_users: false,
            source: "manual",
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        documentFileId = inserted.id;
      }

      // Determine if proxy holder is already present
      let proxyHolderPresent = false;
      if (type === "manager") {
        proxyHolderPresent = true; // manager always runs the meeting
      } else if (type === "owner" && contactId) {
        const holderAttendee = attendees.find(
          (a) => a.contact_building_assignments?.contacts?.id === contactId
        );
        proxyHolderPresent = holderAttendee?.attendance_type === "present";
      }

      const { error } = await (supabase
        .from("etv_attendees") as any)
        .update({
          proxy_type: type,
          proxy_contact_id: type !== "external" ? (contactId || null) : null,
          proxy_token: token,
          attendance_type: "proxy",
          checked_in_at: proxyHolderPresent ? new Date().toISOString() : null,
          ...(documentFileId ? { proxy_document_file_id: documentFileId } : {}),
          proxy_source: "admin_manual",
          proxy_granted_via: grantedVia || null,
          proxy_recorded_by: user?.id || null,
          proxy_recorded_at: new Date().toISOString(),
        })
        .eq("id", attendeeId);
      if (error) throw error;
      return token;
    },
    onSuccess: (token) => {
      queryClient.invalidateQueries({ queryKey: ["etv-attendees", meetingId] });
      queryClient.invalidateQueries({ queryKey: ["etv-attendees-live", meetingId] });
      setProxyDialog(null);
      setProxyFile(null);
      if (token) {
        const link = `${window.location.origin}/etv-proxy/${token}`;
        navigator.clipboard.writeText(link);
        toast({ title: "Vollmacht-Link kopiert", description: "Der externe Vollmacht-Link wurde in die Zwischenablage kopiert." });
      } else {
        toast({ title: "Vollmacht erteilt" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  // Auto-initialize attendees from owners when list is empty
  const autoInitRef = useRef<string | null>(null);
  useEffect(() => {
    if (attendees.length === 0 && owners.length > 0 && !loadingAttendees && !initMutation.isPending && autoInitRef.current !== meetingId) {
      autoInitRef.current = meetingId;
      initMutation.mutate();
    }
  }, [attendees.length, owners.length, loadingAttendees, meetingId]);

  const openProxyDocument = async (filePath: string) => {
    const { data, error } = await supabase.storage.from("building-files").createSignedUrl(filePath, 600);
    if (error || !data?.signedUrl) {
      toast({ title: "Fehler", description: "Dokument konnte nicht geöffnet werden.", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const getContactName = (contact: any) => {
    if (contact.company_name) return contact.company_name;
    return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unbenannt";
  };

  const attendanceBadge = (type: string) => {
    switch (type) {
      case "present": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Anwesend</Badge>;
      case "proxy": return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Vertreten</Badge>;
      default: return <Badge variant="secondary">Abwesend</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {isLocked && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="p-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <Lock className="h-4 w-4" />
            <span>Vollmachten und Weisungen sind gesperrt (1h-Regel). Änderungen sind nicht mehr möglich.</span>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {attendees.length} Teilnehmer | {attendees.filter((a) => a.attendance_type === "present").length} anwesend | {attendees.filter((a) => !!a.proxy_type).length} mit Vollmacht
        </p>
        {attendees.length === 0 && owners.length > 0 && (
          <Button onClick={() => initMutation.mutate()} disabled={initMutation.isPending} size="sm" className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${initMutation.isPending ? "animate-spin" : ""}`} />
            Eigentümer laden
          </Button>
        )}
      </div>

      {attendees.length === 0 && owners.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p>Keine Eigentümer für diese Liegenschaft gefunden.</p>
            <p className="text-xs">Bitte legen Sie zuerst Eigentümer unter Adressen an.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {attendees.map((attendee) => {
          const cba = attendee.contact_building_assignments as any;
          const contact = cba.contacts;
          const proxyContactName = attendee.proxy_type === "owner" && attendee.proxy_contact_id
            ? (() => {
                const proxyContact = allContacts.find((c: any) => c.contacts.id === attendee.proxy_contact_id);
                return proxyContact ? getContactName(proxyContact.contacts) : null;
              })()
            : null;
          return (
            <Card key={attendee.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {cba.unit_number ? `${cba.unit_number} – ` : ""}{getContactName(contact)}
                      </span>
                      {attendee.self_registered_at && (
                        <span
                          title={`Vom Eigentümer selbst gemeldet am ${format(new Date(attendee.self_registered_at), "dd.MM.yyyy 'um' HH:mm", { locale: de })}`}
                          className="inline-flex"
                        >
                          <UserCheck className="h-3.5 w-3.5 text-green-600" />
                        </span>
                      )}
                      {attendee.proxy_type === "manager" && (
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs">v.d. Verwalter</Badge>
                      )}
                      {attendee.proxy_type === "owner" && proxyContactName && (
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs">v.d. {proxyContactName}</Badge>
                      )}
                      {attendee.proxy_type === "external" && (
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs">v.d. {attendee.proxy_external_name || "Extern"}</Badge>
                      )}
                      {attendanceBadge(attendee.attendance_type)}
                    </div>
                    {attendee.proxy_type && (attendee.proxy_type !== "manager" || attendee.proxy_document) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Vollmacht: {attendee.proxy_type === "manager" ? "Verwalter" : attendee.proxy_type === "owner" ? (proxyContactName || "Eigentümer") : (attendee.proxy_external_name || "Extern")}
                        {attendee.proxy_document?.file_path && (
                          <button
                            className="ml-2 text-primary hover:underline inline-flex items-center gap-1"
                            title={attendee.proxy_document.display_name || "Vollmacht-Dokument"}
                            onClick={() => openProxyDocument(attendee.proxy_document!.file_path)}
                          >
                            <FileText className="h-3 w-3" />
                            Dokument öffnen
                          </button>
                        )}
                        {attendee.proxy_token && (
                          <button
                            className="ml-2 text-primary hover:underline inline-flex items-center gap-1"
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/etv-proxy/${attendee.proxy_token}`);
                              toast({ title: "Link kopiert" });
                            }}
                          >
                            <Copy className="h-3 w-3" />
                            Link kopieren
                          </button>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!isLocked && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Vollmacht erteilen"
                          onClick={() => {
                            setProxyDialog(attendee.id);
                            setProxyType("manager");
                            setProxyContactId("");
                            setProxyFile(null);
                            setProxyGrantedVia("email");
                          }}
                        >
                          <Shield className="h-4 w-4 text-blue-500" />
                        </Button>
                        {attendee.attendance_type !== "absent" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateAttendanceMutation.mutate({ id: attendee.id, type: "absent" })}
                          >
                            <UserX className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Proxy Dialog */}
      <Dialog open={!!proxyDialog} onOpenChange={() => setProxyDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vollmacht erteilen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Vollmacht-Typ</Label>
              <Select value={proxyType} onValueChange={setProxyType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">An Verwalter</SelectItem>
                  <SelectItem value="owner">An anderen Eigentümer</SelectItem>
                  <SelectItem value="external">An externe Person (Token-Link)</SelectItem>
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
                    {allContacts.map((c: any) => (
                      <SelectItem key={c.contacts.id} value={c.contacts.id}>
                        {getContactName(c.contacts)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {proxyType === "external" && (
              <p className="text-sm text-muted-foreground">
                Es wird ein einmaliger Token-Link generiert, den Sie an die externe Person weitergeben können.
              </p>
            )}

            <div className="space-y-2">
              <Label>Vollmacht erhalten per</Label>
              <Select value={proxyGrantedVia} onValueChange={setProxyGrantedVia}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">E-Mail</SelectItem>
                  <SelectItem value="paper">Papier</SelectItem>
                  <SelectItem value="app">App</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Vollmacht-Dokument (optional)</Label>
              {proxyFile ? (
                <div className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{proxyFile.name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setProxyFile(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.eml,.msg,.doc,.docx"
                  onChange={(e) => setProxyFile(e.target.files?.[0] || null)}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Nachweis der Vollmacht (Textform gem. § 25 Abs. 3 WEG), z. B. die per E-Mail erhaltene Vollmacht als PDF. Wird im DMS des Gebäudes abgelegt.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProxyDialog(null)}>Abbrechen</Button>
            <Button
              onClick={() => {
                if (proxyDialog) {
                  setProxyMutation.mutate({
                    attendeeId: proxyDialog,
                    type: proxyType,
                    contactId: proxyContactId || undefined,
                    file: proxyFile,
                    grantedVia: proxyGrantedVia,
                  });
                }
              }}
              disabled={setProxyMutation.isPending || (proxyType === "owner" && !proxyContactId)}
            >
              {setProxyMutation.isPending ? "Speichern..." : "Vollmacht erteilen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
