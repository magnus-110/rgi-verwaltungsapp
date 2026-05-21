import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Shield, Calendar, MapPin, Building2, CheckCircle2, AlertTriangle,
  Vote, XCircle, MinusCircle, ChevronDown, Users, BarChart3, UserCheck,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";


export const EtvProxy = () => {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [votingItem, setVotingItem] = useState<any>(null);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessionUserId(data.session?.user?.id ?? null);
    });
  }, []);

  const handleRedeem = async () => {
    if (!token) return;
    setRedeeming(true);
    try {
      const res = await supabase.functions.invoke("redeem-proxy-token", {
        body: { token },
      });
      if (res.error) {
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
      toast({ title: "Vollmacht übernommen", description: "Sie wurden ins Owner-Portal weitergeleitet." });
      navigate("/weg-owner/meetings");
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setRedeeming(false);
    }
  };

  const { data, isLoading, error } = useQuery({

    queryKey: ["etv-proxy", token],
    queryFn: async () => {
      if (!token) throw new Error("Kein Token angegeben");
      const { data: result, error: rpcErr } = await supabase
        .rpc("get_attendee_by_proxy_token", { p_token: token });
      if (rpcErr) throw rpcErr;
      if (!result) throw new Error("INVALID_TOKEN");
      return result as any;
    },
    enabled: !!token,
    retry: false,
  });

  const meetingId = (data as any)?.etv_meetings?.id;
  const assignmentId = (data as any)?.assignment_id;
  const isSecretBallot = (data as any)?.etv_meetings?.is_secret_ballot ?? true;

  // Live votes for the current voting item
  const { data: liveVotes = [] } = useQuery({
    queryKey: ["proxy-live-votes", votingItem?.id],
    queryFn: async () => {
      if (!votingItem) return [];
      const { data, error } = await supabase
        .from("etv_votes")
        .select("vote, assignment_id, contact_building_assignments:assignment_id(unit_number, contacts:contact_id(first_name, last_name, company_name))")
        .eq("agenda_item_id", votingItem.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!votingItem,
  });

  // Live attendees for dashboard
  const { data: proxyAttendees = [] } = useQuery({
    queryKey: ["proxy-live-attendees", meetingId],
    queryFn: async () => {
      if (!meetingId) return [];
      const { data, error } = await supabase
        .from("etv_attendees")
        .select("id, attendance_type, checked_in_at")
        .eq("meeting_id", meetingId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!meetingId,
  });

  // Live agenda items
  const { data: proxyAgendaItems = [] } = useQuery({
    queryKey: ["proxy-live-agenda", meetingId],
    queryFn: async () => {
      if (!meetingId) return [];
      const { data, error } = await supabase
        .from("etv_agenda_items")
        .select("id, title, status, result")
        .eq("meeting_id", meetingId)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!meetingId,
  });

  // Check for active vote on load
  useEffect(() => {
    if (!meetingId) return;
    const checkActive = async () => {
      const { data: items } = await supabase
        .from("etv_agenda_items")
        .select("*")
        .eq("meeting_id", meetingId)
        .eq("status", "voting");
      if (items && items.length > 0) {
        const { data: existing } = await supabase
          .from("etv_votes")
          .select("id")
          .eq("agenda_item_id", items[0].id)
          .eq("assignment_id", assignmentId)
          .maybeSingle();
        if (!existing) {
          setVotingItem(items[0]);
          setHasVoted(false);
          setSelectedVote(null);
          setDescOpen(false);
        } else {
          // Already voted - show results
          setVotingItem(items[0]);
          setHasVoted(true);
        }
      }
    };
    checkActive();
  }, [meetingId, assignmentId]);

  // Realtime listener for agenda items
  useEffect(() => {
    if (!meetingId) return;
    const channel = supabase
      .channel(`proxy-voting-${token}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "etv_agenda_items" },
        async (payload) => {
          const newItem = payload.new as any;
          if (newItem.meeting_id !== meetingId) return;
          if (newItem.status === "voting") {
            const { data: existing } = await supabase
              .from("etv_votes")
              .select("id")
              .eq("agenda_item_id", newItem.id)
              .eq("assignment_id", assignmentId)
              .maybeSingle();
            if (!existing) {
              setVotingItem(newItem);
              setHasVoted(false);
              setSelectedVote(null);
              setDescOpen(false);
            } else {
              setVotingItem(newItem);
              setHasVoted(true);
            }
          } else if (
            payload.old &&
            (payload.old as any).status === "voting" &&
            newItem.status !== "voting"
          ) {
            if (votingItem?.id === newItem.id) {
              setVotingItem(null);
              setHasVoted(false);
            }
          }
          // Refresh agenda list
          queryClient.invalidateQueries({ queryKey: ["proxy-live-agenda", meetingId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [meetingId, assignmentId, token, votingItem?.id, queryClient]);

  // Realtime for votes
  useEffect(() => {
    if (!votingItem?.id) return;
    const channel = supabase
      .channel(`proxy-votes-${votingItem.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "etv_votes", filter: `agenda_item_id=eq.${votingItem.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["proxy-live-votes", votingItem.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [votingItem?.id, queryClient]);

  const castVoteMutation = useMutation({
    mutationFn: async (vote: string) => {
      if (!votingItem || !token) throw new Error("Missing data");
      const res = await supabase.functions.invoke("cast-proxy-vote", {
        body: { token, agenda_item_id: votingItem.id, vote },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      setHasVoted(true);
      // Don't auto-close - show live results
    },
  });

  const getContactName = (contact: any) => {
    if (!contact) return "Unbekannt";
    if (contact.company_name) return contact.company_name;
    return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unbenannt";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    const isInvalid = (error as any)?.message === "INVALID_TOKEN";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center space-y-3">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">
              {isInvalid ? "Ungültiger Link" : "Fehler"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isInvalid
                ? "Dieser Vollmacht-Link ist ungültig oder wurde zurückgezogen."
                : "Ein unerwarteter Fehler ist aufgetreten."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const meeting = (data as any).etv_meetings;
  const building = meeting?.buildings;
  const meetingDate = new Date(meeting.meeting_date);
  const isCompleted = meeting.status === "completed";
  const isActive = meeting.status === "in_progress";
  const tokenUsed = (data as any).proxy_token_used === true;

  // Token bereits eingelöst → klare Sackgasse
  if (tokenUsed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center space-y-3">
            <UserCheck className="h-12 w-12 text-primary mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Vollmacht bereits übernommen</h1>
            <p className="text-sm text-muted-foreground">
              Diese Vollmacht wurde bereits in das Konto eines anderen Eigentümers übernommen und kann über diesen Link nicht mehr genutzt werden. Bitte beim Vollmachtgeber einen neuen Link anfordern, falls erforderlich.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }


  const voteButtons = [
    { value: "yes", label: "Ja", icon: CheckCircle2, className: "bg-green-600 hover:bg-green-700 text-white" },
    { value: "no", label: "Nein", icon: XCircle, className: "bg-red-600 hover:bg-red-700 text-white" },
    { value: "abstain", label: "Enthaltung", icon: MinusCircle, className: "" },
  ];

  const yesCount = liveVotes.filter((v: any) => v.vote === "yes").length;
  const noCount = liveVotes.filter((v: any) => v.vote === "no").length;
  const abstainCount = liveVotes.filter((v: any) => v.vote === "abstain").length;

  const proxyPresentCount = proxyAttendees.filter(
    (a: any) => a.attendance_type === "present" || (a.attendance_type === "proxy" && a.checked_in_at)
  ).length;

  const activeAgendaItem = proxyAgendaItems.find((i: any) => i.status === "voting");
  const votedAgendaItems = proxyAgendaItems.filter((i: any) => i.status === "voted" || i.status === "closed");

  // Fullscreen voting overlay
  if (votingItem) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <div className="w-full max-w-lg space-y-5">
          <div className="flex items-center gap-2 justify-center">
            <Vote className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Abstimmung</h1>
          </div>

          {hasVoted ? (
            <div className="space-y-5">
              <div className="py-6 text-center space-y-3">
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                <p className="text-xl font-semibold">Stimme abgegeben!</p>
              </div>

              {/* Live Results */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold text-sm text-center">Live-Ergebnis</h3>
                  <div className="flex justify-center gap-6 text-base">
                    <span className="text-green-600 font-bold">Ja: {yesCount}</span>
                    <span className="text-red-600 font-bold">Nein: {noCount}</span>
                    <span className="text-muted-foreground font-semibold">Enth.: {abstainCount}</span>
                  </div>

                  {!isSecretBallot && liveVotes.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground text-center">Einzelstimmen</p>
                      {liveVotes.map((v: any, i: number) => {
                        const cba = v.contact_building_assignments;
                        const contact = cba?.contacts;
                        return (
                          <div key={i} className="flex items-center justify-between text-sm py-0.5">
                            <div className="flex items-center gap-1.5">
                              <span>{getContactName(contact)}</span>
                              {cba?.unit_number && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">E{cba.unit_number}</Badge>
                              )}
                            </div>
                            <span className={
                              v.vote === "yes" ? "text-green-600 font-semibold" :
                              v.vote === "no" ? "text-red-600 font-semibold" :
                              "text-muted-foreground"
                            }>
                              {v.vote === "yes" ? "Ja" : v.vote === "no" ? "Nein" : "Enthaltung"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <p className="text-xs text-center text-muted-foreground">
                Ergebnisse werden live aktualisiert. Die Ansicht wechselt automatisch, wenn die Abstimmung beendet wird.
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Tagesordnungspunkt</p>
                <p className="font-semibold text-lg">{votingItem.title}</p>
              </div>

              {votingItem.description && (
                <Collapsible open={descOpen} onOpenChange={setDescOpen}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-sm text-primary hover:underline">
                    <ChevronDown className={`h-4 w-4 transition-transform ${descOpen ? "rotate-180" : ""}`} />
                    Beschreibung anzeigen
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="text-sm bg-muted rounded-lg p-3 mt-2">{votingItem.description}</p>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {votingItem.resolution_text && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Beschlusstext</p>
                  <p className="text-sm bg-muted rounded-lg p-3">{votingItem.resolution_text}</p>
                </div>
              )}

              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                Abstimmung läuft
              </Badge>

              <div className="grid grid-cols-3 gap-3">
                {voteButtons.map(({ value, label, icon: Icon, className }) => (
                  <Button
                    key={value}
                    size="lg"
                    variant={value === "abstain" ? "outline" : "default"}
                    className={`h-24 flex-col gap-1.5 text-base transition-all ${
                      value !== "abstain" ? className : ""
                    } ${
                      selectedVote === value
                        ? "ring-4 ring-primary ring-offset-2 scale-105"
                        : "opacity-80 hover:opacity-100"
                    }`}
                    onClick={() => setSelectedVote(value)}
                    disabled={castVoteMutation.isPending}
                  >
                    <Icon className="h-8 w-8" />
                    <span>{label}</span>
                  </Button>
                ))}
              </div>

              {selectedVote && (
                <Button
                  size="lg"
                  className="w-full h-14 text-lg font-semibold"
                  onClick={() => castVoteMutation.mutate(selectedVote)}
                  disabled={castVoteMutation.isPending}
                >
                  {castVoteMutation.isPending ? "Wird gespeichert…" : "Stimme bestätigen"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 flex items-start justify-center pt-12">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2">
          <Shield className="h-10 w-10 text-primary mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Vollmacht zur Eigentümerversammlung</h1>
          {data.proxy_external_name && (
            <p className="text-muted-foreground">
              Bevollmächtigt: <strong>{data.proxy_external_name}</strong>
            </p>
          )}
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{building?.name}</span>
            </div>
            {building?.address && (
              <p className="text-xs text-muted-foreground ml-6">{building.address}</p>
            )}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {format(meetingDate, "dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: de })}
              </span>
            </div>
            {meeting.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{meeting.location}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge variant={isActive ? "default" : isCompleted ? "secondary" : "outline"}>
                {isActive ? "Läuft gerade" : isCompleted ? "Abgeschlossen" : "Geplant"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Live Dashboard for active meetings */}
        {isActive && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm text-foreground">Live-Dashboard</h3>
                <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {proxyPresentCount}/{proxyAttendees.length} anwesend
                </div>
              </div>

              {activeAgendaItem ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs">
                      <Vote className="h-3 w-3 mr-1" />
                      Abstimmung läuft
                    </Badge>
                    <span className="text-sm font-medium truncate">{activeAgendaItem.title}</span>
                  </div>
                </div>
              ) : votedAgendaItems.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    {votedAgendaItems.length} TOP(s) abgestimmt
                  </p>
                  {votedAgendaItems.slice(-3).map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between text-xs">
                      <span className="truncate">{item.title}</span>
                      <Badge variant={item.result === "passed" ? "default" : "destructive"} className="text-[10px] ml-2 shrink-0">
                        {item.result === "passed" ? "Angenommen" : "Abgelehnt"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Noch keine Abstimmung gestartet</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 text-center space-y-2">
            <h2 className="font-semibold">{meeting.title}</h2>
            {isActive ? (
              <div className="space-y-2">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Die Versammlung läuft. Ihre Vollmacht ist aktiv — sobald eine Abstimmung beginnt, erscheint hier automatisch die Abstimmungsansicht.
                </p>
              </div>
            ) : isCompleted ? (
              <p className="text-sm text-muted-foreground">
                Diese Versammlung ist bereits abgeschlossen.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Die Versammlung hat noch nicht begonnen. Sobald eine Abstimmung gestartet wird, erscheint hier automatisch die Abstimmungsansicht.
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          Dieser Link wurde Ihnen von einem Eigentümer übermittelt. Bei Fragen wenden Sie sich bitte an die zuständige Hausverwaltung.
        </p>
      </div>
    </div>
  );
};
