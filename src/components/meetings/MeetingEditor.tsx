import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AgendaItemEditor } from "./AgendaItemEditor";
import { MeetingDatePollPanel } from "./MeetingDatePollPanel";
import { MeetingInvitationPdf } from "./MeetingInvitationPdf";
import { MeetingLiveSession } from "./MeetingLiveSession";
import { MeetingProtocol } from "./MeetingProtocol";

import { Save, ChevronDown, ChevronUp, CheckCircle2, Globe } from "lucide-react";

interface MeetingEditorProps {
  meetingId: string | null;
  initialBuildingId?: string;
  onSaved: () => void;
  onCancel: () => void;
}

export const MeetingEditor = ({ meetingId, initialBuildingId, onSaved, onCancel }: MeetingEditorProps) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("vorbereitung");
  const [openSteps, setOpenSteps] = useState<Record<number, boolean>>(meetingId ? {} : { 0: true });
  const [savedMeetingId, setSavedMeetingId] = useState<string | null>(meetingId);

  // Form state
  const [title, setTitle] = useState("Eigentümerversammlung");
  const [buildingId, setBuildingId] = useState(initialBuildingId || "");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("18:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [meetingChair, setMeetingChair] = useState("");
  const [minutesTaker, setMinutesTaker] = useState("");

  // Load WEG buildings (incl. default location)
  const { data: buildings = [] } = useQuery({
    queryKey: ["weg-buildings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address, etv_default_location")
        .eq("management_mode", "weg")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Auto-fill location when building changes (only if location is empty and no existing meeting)
  useEffect(() => {
    if (!buildingId || savedMeetingId) return;
    const b = buildings.find((x: any) => x.id === buildingId);
    if (b && !location) {
      const def = (b as any).etv_default_location || b.address;
      if (def) setLocation(def);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId, buildings]);

  // Load existing meeting
  const { data: existingMeeting } = useQuery({
    queryKey: ["etv-meeting", savedMeetingId],
    queryFn: async () => {
      if (!savedMeetingId) return null;
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("*")
        .eq("id", savedMeetingId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!savedMeetingId,
  });

  useEffect(() => {
    if (existingMeeting) {
      setTitle(existingMeeting.title);
      setBuildingId(existingMeeting.building_id);
      const d = new Date(existingMeeting.meeting_date);
      setMeetingDate(d.toISOString().split("T")[0]);
      setMeetingTime(d.toTimeString().slice(0, 5));
      setLocation(existingMeeting.location || "");
      setNotes(existingMeeting.notes || "");
      setMeetingChair((existingMeeting as any).meeting_chair || "");
      setMinutesTaker((existingMeeting as any).minutes_taker || "");
      setSavedMeetingId(existingMeeting.id);
    }
  }, [existingMeeting]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let meetingDateTime: string | null = null;
      if (meetingDate) {
        const time = meetingTime || "00:00";
        meetingDateTime = new Date(`${meetingDate}T${time}:00`).toISOString();
      }

      const payload: any = {
        title,
        building_id: buildingId,
        meeting_date: meetingDateTime,
        location: location || null,
        notes: notes || null,
        lock_time: null,
        created_by: profile?.user_id,
        meeting_chair: meetingChair || null,
        minutes_taker: minutesTaker || null,
      };

      if (savedMeetingId) {
        const { error } = await supabase.from("etv_meetings").update(payload).eq("id", savedMeetingId);
        if (error) throw error;
        return savedMeetingId;
      } else {
        const { data, error } = await supabase.from("etv_meetings").insert(payload).select("id").single();
        if (error) throw error;
        return data.id;
      }
    },
    onSuccess: (id) => {
      setSavedMeetingId(id);
      toast({ title: "Gespeichert", description: "Versammlung wurde gespeichert." });
      queryClient.invalidateQueries({ queryKey: ["etv-meetings"] });
      setOpenSteps({ 0: false, 1: true });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const toggleStep = (s: number) => {
    setOpenSteps((prev) => ({ ...prev, [s]: !prev[s] }));
  };

  const isStep0Valid = title && buildingId;

  return (
    <div className="space-y-4 max-w-4xl">
      <h2 className="text-xl font-bold text-foreground">
        {meetingId ? "Versammlung bearbeiten" : "Neue Versammlung erstellen"}
      </h2>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="segment" className="w-full">
          <TabsTrigger value="vorbereitung" variant="segment" className="flex-1">
            Vorbereitung
          </TabsTrigger>
          <TabsTrigger value="durchfuehrung" variant="segment" className="flex-1" disabled={!savedMeetingId}>
            Durchführung
          </TabsTrigger>
          <TabsTrigger value="nachbereitung" variant="segment" className="flex-1" disabled={!savedMeetingId}>
            Nachbereitung
          </TabsTrigger>
        </TabsList>

        {/* ============ TAB 1: VORBEREITUNG ============ */}
        <TabsContent value="vorbereitung" className="space-y-4">
          {/* Grunddaten */}
          <Collapsible open={openSteps[0]} onOpenChange={() => toggleStep(0)}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {savedMeetingId && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                      <div>
                        <CardTitle className="text-base">1. Grunddaten</CardTitle>
                        <p className="text-sm text-muted-foreground">Datum, Uhrzeit, Ort und Liegenschaft</p>
                      </div>
                    </div>
                    {openSteps[0] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4">
                  {savedMeetingId && buildingId && (
                    <MeetingDatePollPanel
                      meetingId={savedMeetingId}
                      buildingId={buildingId}
                      onApplyDate={(date, time) => {
                        setMeetingDate(date);
                        setMeetingTime(time);
                        toast({ title: "Termin übernommen", description: "Bitte noch speichern." });
                      }}
                    />
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Titel *</Label>
                      <Input id="title" placeholder="z.B. Ordentliche Eigentümerversammlung 2026" value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="building">Liegenschaft *</Label>
                      <Select value={buildingId} onValueChange={setBuildingId}>
                        <SelectTrigger><SelectValue placeholder="Liegenschaft wählen..." /></SelectTrigger>
                        <SelectContent>
                          {buildings.map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.name} — {b.address}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date">Datum</Label>
                      <Input id="date" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="time">Uhrzeit</Label>
                      <Input id="time" type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location">Ort</Label>
                      <Input id="location" placeholder="z.B. Gemeinschaftsraum, Musterstraße 1" value={location} onChange={(e) => setLocation(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="meetingChair">Versammlungsführer (optional)</Label>
                      <Input id="meetingChair" placeholder="z.B. Max Mustermann" value={meetingChair} onChange={(e) => setMeetingChair(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="minutesTaker">Protokollführer (optional)</Label>
                      <Input id="minutesTaker" placeholder="z.B. Erika Musterfrau" value={minutesTaker} onChange={(e) => setMinutesTaker(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Bemerkungen</Label>
                    <Textarea id="notes" placeholder="Interne Notizen zur Versammlung..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => saveMutation.mutate()} disabled={!isStep0Valid || saveMutation.isPending} className="gap-2">
                      <Save className="h-4 w-4" />
                      {saveMutation.isPending ? "Speichern..." : "Speichern & Weiter"}
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Tagesordnung */}
          <Collapsible open={openSteps[1]} onOpenChange={() => toggleStep(1)}>
            <Card className={!savedMeetingId ? "opacity-50 pointer-events-none" : ""}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">2. Tagesordnung</CardTitle>
                      <p className="text-sm text-muted-foreground">TOPs anlegen und sortieren</p>
                    </div>
                    {openSteps[1] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  {savedMeetingId && <AgendaItemEditor meetingId={savedMeetingId} buildingId={buildingId} />}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Einladung */}
          <Collapsible open={openSteps[2]} onOpenChange={() => toggleStep(2)}>
            <Card className={!savedMeetingId ? "opacity-50 pointer-events-none" : ""}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">3. Einladung</CardTitle>
                      <p className="text-sm text-muted-foreground">Vorschau und PDF generieren</p>
                    </div>
                    {openSteps[2] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4">
                  {savedMeetingId && <MeetingInvitationPdf meetingId={savedMeetingId} buildingId={buildingId} />}
                  {savedMeetingId && existingMeeting?.status === "draft" && (
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold">Für Eigentümer freischalten</h4>
                          <p className="text-xs text-muted-foreground">Nach der Freischaltung wird die Versammlung im Eigentümer-Portal sichtbar.</p>
                        </div>
                        <Button className="gap-2" onClick={async () => {
                          const { error } = await supabase.from("etv_meetings").update({ status: "published" }).eq("id", savedMeetingId);
                          if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
                          
                          // Auto-create attendee records for all owners in this building
                          if (existingMeeting?.building_id) {
                            const { data: owners } = await supabase
                              .from("contact_building_assignments")
                              .select("id")
                              .eq("building_id", existingMeeting.building_id)
                              .eq("role_in_building", "eigentuemer")
                              .eq("is_active", true);
                            
                            if (owners && owners.length > 0) {
                              const { data: existingAttendees } = await supabase
                                .from("etv_attendees")
                                .select("assignment_id")
                                .eq("meeting_id", savedMeetingId);
                              
                              const existingIds = (existingAttendees || []).map((a: any) => a.assignment_id);
                              const newAttendees = owners
                                .filter(o => !existingIds.includes(o.id))
                                .map(o => ({
                                  meeting_id: savedMeetingId,
                                  assignment_id: o.id,
                                  attendance_type: "absent" as const,
                                }));
                              
                              if (newAttendees.length > 0) {
                                await supabase.from("etv_attendees").insert(newAttendees);
                              }
                            }
                          }
                          
                          toast({ title: "Versammlung freigeschaltet" });
                          queryClient.invalidateQueries({ queryKey: ["etv-meeting", savedMeetingId] });
                          queryClient.invalidateQueries({ queryKey: ["etv-meetings"] });
                        }}>
                          <Globe className="h-4 w-4" /> Freischalten
                        </Button>
                      </div>
                    </div>
                  )}
                  {existingMeeting?.status === "published" && (
                    <div className="flex items-center justify-between border-t pt-4 gap-3 flex-wrap">
                      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" /> Versammlung ist für Eigentümer freigeschaltet.
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={async () => {
                          if (!confirm("Freischaltung zurückziehen? Die Versammlung ist dann im Eigentümer-Portal nicht mehr sichtbar.")) return;
                          const { error } = await supabase.from("etv_meetings").update({ status: "draft" }).eq("id", savedMeetingId);
                          if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
                          toast({ title: "Freischaltung zurückgezogen" });
                          queryClient.invalidateQueries({ queryKey: ["etv-meeting", savedMeetingId] });
                          queryClient.invalidateQueries({ queryKey: ["etv-meetings"] });
                        }}
                      >
                        Freischaltung zurückziehen
                      </Button>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </TabsContent>

        {/* ============ TAB 2: DURCHFÜHRUNG ============ */}
        <TabsContent value="durchfuehrung">
          {savedMeetingId && (
            <MeetingLiveSession meetingId={savedMeetingId} buildingId={buildingId} />
          )}
        </TabsContent>

        {/* ============ TAB 3: NACHBEREITUNG ============ */}
        <TabsContent value="nachbereitung">
          {savedMeetingId && (
            <MeetingProtocol meetingId={savedMeetingId} buildingId={buildingId} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
