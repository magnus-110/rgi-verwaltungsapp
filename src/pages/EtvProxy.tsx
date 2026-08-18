import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield, Calendar, MapPin, Building2, CheckCircle2, AlertTriangle,
  Vote, Users, BarChart3, UserCheck,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatGermanDateTime } from "@/lib/germanDateTime";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";


export const EtvProxy = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [meetingId, refetch, channelEpoch]);



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


  const activeAgendaItem = agendaItems.find((i: any) => i.status === "voting");
  const votedAgendaItems = agendaItems.filter((i: any) => i.status === "voted" || i.status === "closed");



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
                {formatGermanDateTime(meeting.meeting_date)}
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
                  Die Versammlung läuft. Ihre Vollmacht ist aktiv — die Abstimmungen werden vor Ort durch die Verwaltung erfasst.
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
