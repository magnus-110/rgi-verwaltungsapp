import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Shield, Calendar, MapPin, Building2, CheckCircle2, AlertTriangle,
  Vote, XCircle, MinusCircle, ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export const EtvProxy = () => {
  const { token } = useParams<{ token: string }>();
  const [votingItem, setVotingItem] = useState<any>(null);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

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
        }
      }
    };
    checkActive();
  }, [meetingId, assignmentId]);

  // Realtime listener
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
            }
          } else if (
            payload.old &&
            (payload.old as any).status === "voting" &&
            newItem.status !== "voting"
          ) {
            if (votingItem?.id === newItem.id) {
              setVotingItem(null);
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [meetingId, assignmentId, token, votingItem?.id]);

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
      setTimeout(() => {
        setVotingItem(null);
        setHasVoted(false);
        setSelectedVote(null);
      }, 2000);
    },
  });

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

  const voteButtons = [
    { value: "yes", label: "Ja", icon: CheckCircle2, className: "bg-green-600 hover:bg-green-700 text-white" },
    { value: "no", label: "Nein", icon: XCircle, className: "bg-red-600 hover:bg-red-700 text-white" },
    { value: "abstain", label: "Enthaltung", icon: MinusCircle, className: "" },
  ];

  // Voting overlay
  if (votingItem) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Vote className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Abstimmung</h1>
            </div>

            {hasVoted ? (
              <div className="py-10 text-center space-y-3">
                <CheckCircle2 className="h-20 w-20 text-green-500 mx-auto" />
                <p className="text-xl font-semibold">Stimme abgegeben!</p>
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
                      className={`h-20 flex-col gap-1.5 text-base transition-all ${
                        value !== "abstain" ? className : ""
                      } ${
                        selectedVote === value
                          ? "ring-4 ring-primary ring-offset-2 scale-105"
                          : "opacity-80 hover:opacity-100"
                      }`}
                      onClick={() => setSelectedVote(value)}
                      disabled={castVoteMutation.isPending}
                    >
                      <Icon className="h-7 w-7" />
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
          </CardContent>
        </Card>
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
