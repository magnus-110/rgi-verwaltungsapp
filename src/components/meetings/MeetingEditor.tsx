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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AgendaItemEditor } from "./AgendaItemEditor";
import { MeetingInvitationPdf } from "./MeetingInvitationPdf";
import { AttendeeManager } from "./AttendeeManager";
import { LiveVotingManager } from "./LiveVotingManager";
import { Save, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";

interface MeetingEditorProps {
  meetingId: string | null;
  onSaved: () => void;
  onCancel: () => void;
}

export const MeetingEditor = ({ meetingId, onSaved, onCancel }: MeetingEditorProps) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [openSteps, setOpenSteps] = useState<Record<number, boolean>>({ 0: true });
  const [savedMeetingId, setSavedMeetingId] = useState<string | null>(meetingId);

  // Form state
  const [title, setTitle] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("18:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  // Load WEG buildings
  const { data: buildings = [] } = useQuery({
    queryKey: ["weg-buildings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address")
        .eq("management_mode", "weg")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Load existing meeting
  const { data: existingMeeting } = useQuery({
    queryKey: ["etv-meeting", meetingId],
    queryFn: async () => {
      if (!meetingId) return null;
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("*")
        .eq("id", meetingId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!meetingId,
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
      setSavedMeetingId(existingMeeting.id);
      // Open step 1 (agenda) if meeting exists
      setStep(1);
      setOpenSteps({ 0: false, 1: true });
    }
  }, [existingMeeting]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const meetingDateTime = new Date(`${meetingDate}T${meetingTime}:00`).toISOString();
      const lockTime = new Date(new Date(`${meetingDate}T${meetingTime}:00`).getTime() - 60 * 60 * 1000).toISOString();

      const payload = {
        title,
        building_id: buildingId,
        meeting_date: meetingDateTime,
        location: location || null,
        notes: notes || null,
        lock_time: lockTime,
        created_by: profile?.user_id,
      };

      if (savedMeetingId) {
        const { error } = await supabase
          .from("etv_meetings")
          .update(payload)
          .eq("id", savedMeetingId);
        if (error) throw error;
        return savedMeetingId;
      } else {
        const { data, error } = await supabase
          .from("etv_meetings")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      }
    },
    onSuccess: (id) => {
      setSavedMeetingId(id);
      toast({ title: "Gespeichert", description: "Versammlung wurde gespeichert." });
      queryClient.invalidateQueries({ queryKey: ["etv-meetings"] });
      // Move to next step
      setStep(1);
      setOpenSteps({ 0: false, 1: true });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const toggleStep = (s: number) => {
    setOpenSteps((prev) => ({ ...prev, [s]: !prev[s] }));
  };

  const isStep0Valid = title && buildingId && meetingDate && meetingTime;

  const steps = [
    {
      title: "1. Grunddaten",
      description: "Datum, Uhrzeit, Ort und Liegenschaft",
      complete: !!savedMeetingId,
    },
    {
      title: "2. Tagesordnung",
      description: "TOPs anlegen und sortieren",
      complete: false,
    },
    {
      title: "3. Einladung",
      description: "Vorschau und PDF generieren",
      complete: false,
    },
    {
      title: "4. Vollmachten & Teilnehmer",
      description: "Anwesenheit, Vollmachten und Stimmverbote",
      complete: false,
    },
    {
      title: "5. Live-Versammlung",
      description: "Check-in, Quorum und Abstimmungen",
      complete: false,
    },
  ];

  return (
    <div className="space-y-4 max-w-4xl">
      <h2 className="text-xl font-bold text-foreground">
        {meetingId ? "Versammlung bearbeiten" : "Neue Versammlung erstellen"}
      </h2>

      {/* Step 0: Grunddaten */}
      <Collapsible open={openSteps[0]} onOpenChange={() => toggleStep(0)}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {steps[0].complete && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                  <div>
                    <CardTitle className="text-base">{steps[0].title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{steps[0].description}</p>
                  </div>
                </div>
                {openSteps[0] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Titel *</Label>
                  <Input
                    id="title"
                    placeholder="z.B. Ordentliche Eigentümerversammlung 2026"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="building">Liegenschaft *</Label>
                  <Select value={buildingId} onValueChange={setBuildingId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Liegenschaft wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {buildings.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} — {b.address}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Datum *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Uhrzeit *</Label>
                  <Input
                    id="time"
                    type="time"
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Ort</Label>
                  <Input
                    id="location"
                    placeholder="z.B. Gemeinschaftsraum, Musterstraße 1"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Bemerkungen</Label>
                <Textarea
                  id="notes"
                  placeholder="Interne Notizen zur Versammlung..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!isStep0Valid || saveMutation.isPending}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? "Speichern..." : "Speichern & Weiter"}
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Step 1: Tagesordnung */}
      <Collapsible open={openSteps[1]} onOpenChange={() => toggleStep(1)}>
        <Card className={!savedMeetingId ? "opacity-50 pointer-events-none" : ""}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{steps[1].title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{steps[1].description}</p>
                </div>
                {openSteps[1] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {savedMeetingId && <AgendaItemEditor meetingId={savedMeetingId} />}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Step 2: Einladung */}
      <Collapsible open={openSteps[2]} onOpenChange={() => toggleStep(2)}>
        <Card className={!savedMeetingId ? "opacity-50 pointer-events-none" : ""}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{steps[2].title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{steps[2].description}</p>
                </div>
                {openSteps[2] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {savedMeetingId && (
                <MeetingInvitationPdf meetingId={savedMeetingId} buildingId={buildingId} />
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Step 3: Vollmachten & Teilnehmer */}
      <Collapsible open={openSteps[3]} onOpenChange={() => toggleStep(3)}>
        <Card className={!savedMeetingId ? "opacity-50 pointer-events-none" : ""}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{steps[3].title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{steps[3].description}</p>
                </div>
                {openSteps[3] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {savedMeetingId && (
                <AttendeeManager
                  meetingId={savedMeetingId}
                  buildingId={buildingId}
                  lockTime={existingMeeting?.lock_time || null}
                />
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Step 4: Live-Versammlung */}
      <Collapsible open={openSteps[4]} onOpenChange={() => toggleStep(4)}>
        <Card className={!savedMeetingId ? "opacity-50 pointer-events-none" : ""}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{steps[4].title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{steps[4].description}</p>
                </div>
                {openSteps[4] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {savedMeetingId && (
                <LiveVotingManager meetingId={savedMeetingId} buildingId={buildingId} />
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
};
