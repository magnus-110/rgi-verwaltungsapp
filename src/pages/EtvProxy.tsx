import { useState, useEffect, useRef } from "react";
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
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
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

  // Single source of truth: security-definer RPC. We poll manually (not via React Query's
  // refetchInterval) because Safari iOS throttles/pauses RQ's internal timer when the tab
  // briefly loses focus or the display dims, and never resumes it. A bare setInterval +
  // visibilitychange/pageshow/focus listeners is much more reliable on iPhone.
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { data: state, isLoading, error, refetch } = useQuery({
    queryKey: ["proxy-state", token],
    queryFn: async () => {
      if (!token) throw new Error("Kein Token angegeben");
      const { data, error } = await supabase.rpc("get_proxy_meeting_state", { p_token: token });
      if (error) throw error;
      if (!data || (data as any).error === "INVALID_TOKEN") throw new Error("INVALID_TOKEN");
      setLastUpdate(new Date());
      return data as any;
    },
    enabled: !!token,
    retry: false,
  });

  // Track previous voting item id to reset local state on changes
  const prevVotingIdRef = useRef<string | null>(null);
  const activeVotingId: string | null = state?.active_voting_item?.id ?? null;
  useEffect(() => {
    if (prevVotingIdRef.current !== activeVotingId) {
      setSelectedVote(null);
      setDescOpen(false);
      prevVotingIdRef.current = activeVotingId;
    }
  }, [activeVotingId]);

  // iOS-safe polling: own setInterval + wake-up hooks (visibilitychange / pageshow / focus / online)
  const [channelEpoch, setChannelEpoch] = useState(0);
  const meetingStatus: string | undefined = state?.meeting?.status;
  const isMeetingLive = meetingStatus === "in_progress";
  useEffect(() => {
    if (!token) return;
    const intervalMs = isMeetingLive ? 2000 : 5000;
    const tick = () => { refetch(); };
    const interval = window.setInterval(tick, intervalMs);

    const wake = () => { refetch(); setChannelEpoch((n) => n + 1); };
    const onVisible = () => { if (document.visibilityState === "visible") wake(); };
    const onPageShow = () => wake();
    const onFocus = () => refetch();
    const onOnline = () => wake();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [token, refetch, isMeetingLive]);

  // Broadcast listener for instant push from admin (start/reopen voting).
  const meetingId: string | undefined = state?.meeting?.id;
  useEffect(() => {
    if (!meetingId) return;
    const channel = supabase
      .channel(`meeting-broadcast-${meetingId}-${channelEpoch}`)
      .on("broadcast", { event: "voting-changed" }, () => { refetch(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [meetingId, refetch, channelEpoch]);

  // Postgres-Realtime fallback (same mechanism as the logged-in owner portal).
  // More reliable on iOS Safari than broadcast alone.
  useEffect(() => {
    if (!meetingId) return;
    const channel = supabase
      .channel(`proxy-db-${meetingId}-${channelEpoch}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "etv_agenda_items", filter: `meeting_id=eq.${meetingId}` }, () => { refetch(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "etv_meetings", filter: `id=eq.${meetingId}` }, () => { refetch(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "etv_votes" }, () => { refetch(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [meetingId, refetch, channelEpoch]);


  const castVoteMutation = useMutation({
    mutationFn: async (vote: string) => {
      if (!activeVotingId || !token) throw new Error("Missing data");
      const res = await supabase.functions.invoke("cast-proxy-vote", {
        body: { token, agenda_item_id: activeVotingId, vote },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proxy-state", token] });
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

  if (error || !state) {
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
                : ((error as any)?.message || "Ein unerwarteter Fehler ist aufgetreten.")}
            </p>
            {!isInvalid && (
              <Button size="sm" variant="outline" onClick={() => refetch()}>Erneut versuchen</Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const meeting = state.meeting;
  const meetingDate = new Date(meeting.meeting_date);
  const isCompleted = meeting.status === "completed";
  const isActive = meeting.status === "in_progress";
  const tokenUsed = state.proxy_token_used === true;
  const assignmentInfo = state.assignment;
  const isSecretBallot = meeting.is_secret_ballot ?? true;

  const votingItem = state.active_voting_item;
  const hasVoted = !!state.has_voted;
  const counts = state.live_counts || { yes: 0, no: 0, abstain: 0, yes_mea: 0, no_mea: 0, abstain_mea: 0 };
  const singleVotes: any[] = state.single_votes || [];
  const agendaItems: any[] = state.agenda || [];
  const attendeeStats = state.attendees || { present: 0, total: 0 };

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

  const activeAgendaItem = agendaItems.find((i: any) => i.status === "voting");
  const votedAgendaItems = agendaItems.filter((i: any) => i.status === "voted" || i.status === "closed");

  const fmtMea = (n: number) => Number(n || 0).toLocaleString("de-DE", { maximumFractionDigits: 6 });

  // Fullscreen voting overlay
  if (votingItem) {
    return (
      <div className="min-h-screen bg-background overflow-y-auto">
        <div className="min-h-screen flex items-start sm:items-center justify-center p-4 py-6">
          <div className="w-full max-w-lg space-y-4 sm:space-y-5">
            <div className="flex items-center gap-2 justify-center">
              <Vote className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
              <h1 className="text-xl sm:text-2xl font-bold">Abstimmung</h1>
            </div>
            {assignmentInfo?.unit_number && (
              <div className="text-center">
                <Badge variant="outline" className="text-sm px-3 py-1 border-primary/30">
                  Einheit {assignmentInfo.unit_number}
                </Badge>
              </div>
            )}



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
                    <span className="text-green-600 font-bold">Ja: {counts.yes}</span>
                    <span className="text-red-600 font-bold">Nein: {counts.no}</span>
                    <span className="text-muted-foreground font-semibold">Enth.: {counts.abstain}</span>
                  </div>
                  {votingItem.voting_principle === "mea" && (
                    <div className="flex justify-center gap-6 text-xs text-muted-foreground">
                      <span>MEA Ja: {fmtMea(counts.yes_mea)}</span>
                      <span>MEA Nein: {fmtMea(counts.no_mea)}</span>
                      <span>MEA Enth.: {fmtMea(counts.abstain_mea)}</span>
                    </div>
                  )}

                  {!isSecretBallot && singleVotes.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground text-center">Einzelstimmen</p>
                      {singleVotes.map((v: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm py-0.5">
                          <div className="flex items-center gap-1.5">
                            <span>{getContactName(v)}</span>
                            {v?.unit_number && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0">E{v.unit_number}</Badge>
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
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <p className="text-xs text-center text-muted-foreground">
                Ergebnisse werden live aktualisiert. Die Ansicht wechselt automatisch, wenn die Abstimmung beendet wird.
              </p>
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="text-[11px] text-muted-foreground">
                  {lastUpdate ? `Aktualisiert ${lastUpdate.toLocaleTimeString("de-DE")}` : "—"}
                </p>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => refetch()}>
                  Jetzt aktualisieren
                </Button>
              </div>

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

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {voteButtons.map(({ value, label, icon: Icon, className }) => (
                  <Button
                    key={value}
                    size="lg"
                    variant={value === "abstain" ? "outline" : "default"}
                    className={`h-20 sm:h-24 flex-col gap-1 sm:gap-1.5 text-xs sm:text-base transition-all ${
                      value !== "abstain" ? className : ""
                    } ${
                      selectedVote === value
                        ? "ring-4 ring-primary ring-offset-2 scale-105"
                        : "opacity-80 hover:opacity-100"
                    }`}
                    onClick={() => setSelectedVote(value)}
                    disabled={castVoteMutation.isPending}
                  >
                    <Icon className="h-6 w-6 sm:h-8 sm:w-8" />
                    <span>{label}</span>
                  </Button>
                ))}
              </div>

              {selectedVote && (
                <Button
                  size="lg"
                  className="w-full h-12 sm:h-14 text-base sm:text-lg font-semibold"
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
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-background p-4 flex items-start justify-center pt-12">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2">
          <Shield className="h-10 w-10 text-primary mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Vollmacht zur Eigentümerversammlung</h1>
          {state.proxy_external_name && (
            <p className="text-muted-foreground">
              Bevollmächtigt: <strong>{state.proxy_external_name}</strong>
            </p>
          )}
        </div>

        {sessionUserId && !isCompleted && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-2">
                <UserCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">In Ihr Konto übernehmen?</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sie sind bereits angemeldet. Übernehmen Sie diese Vollmacht direkt in Ihr Owner-Portal – dann müssen Sie nicht zwischen Link und App wechseln.
                  </p>
                </div>
              </div>
              <Button className="w-full" onClick={handleRedeem} disabled={redeeming}>
                {redeeming ? "Wird übernommen…" : "Vollmacht in mein Konto übernehmen"}
              </Button>
            </CardContent>
          </Card>
        )}


        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{meeting.building_name}</span>
            </div>
            {meeting.building_address && (
              <p className="text-xs text-muted-foreground ml-6">{meeting.building_address}</p>
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
                  {attendeeStats.present}/{attendeeStats.total} anwesend
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

        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-[11px] text-muted-foreground">
            {lastUpdate ? `Aktualisiert ${lastUpdate.toLocaleTimeString("de-DE")}` : "—"}
          </p>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => refetch()}>
            Jetzt aktualisieren
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Dieser Link wurde Ihnen von einem Eigentümer übermittelt. Bei Fragen wenden Sie sich bitte an die zuständige Hausverwaltung.
        </p>

      </div>
    </div>
  );
};
