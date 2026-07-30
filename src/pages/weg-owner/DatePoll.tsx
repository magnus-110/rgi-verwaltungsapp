import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarClock, Check, Minus, X, Save, CheckCircle2, ArrowRight } from "lucide-react";
import { formatGermanDate, slotShort, TIME_SLOTS, type PollChoice } from "@/lib/datePoll";

interface LocalAnswer {
  choice: PollChoice | null;
  earliest: string | null;
}

export const WegOwnerDatePoll = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [started, setStarted] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);

  const { data: contactId } = useQuery({
    queryKey: ["owner-contact-id", profile?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id")
        .eq("user_id", profile!.user_id)
        .limit(1)
        .maybeSingle();
      return data?.id as string | undefined;
    },
    enabled: !!profile?.user_id,
  });

  const { data: polls = [], isLoading } = useQuery({
    queryKey: ["owner-date-polls", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_date_polls")
        .select("id, status, closes_at, intro_text, building_id, buildings(name)")
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).filter((p: any) => new Date(p.closes_at) >= new Date(new Date().toDateString()));
    },
    enabled: !!profile?.user_id,
  });

  const poll: any = polls[0];

  const { data: options = [] } = useQuery({
    queryKey: ["owner-date-poll-options", poll?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_date_poll_options")
        .select("id, proposed_date, sort_order")
        .eq("poll_id", poll.id)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!poll?.id,
  });

  const { data: existing = [] } = useQuery({
    queryKey: ["owner-date-poll-responses", poll?.id, contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_date_poll_responses")
        .select("option_id, choice, earliest_time")
        .eq("poll_id", poll.id)
        .eq("contact_id", contactId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!poll?.id && !!contactId,
  });

  const { data: existingNote } = useQuery({
    queryKey: ["owner-date-poll-note", poll?.id, contactId],
    queryFn: async () => {
      const { data } = await supabase
        .from("etv_date_poll_notes")
        .select("note")
        .eq("poll_id", poll.id)
        .eq("contact_id", contactId!)
        .maybeSingle();
      return data?.note || "";
    },
    enabled: !!poll?.id && !!contactId,
  });

  useEffect(() => {
    if (!existing.length) return;
    const map: Record<string, LocalAnswer> = {};
    existing.forEach((r: any) => {
      map[r.option_id] = { choice: r.choice, earliest: r.earliest_time };
    });
    setAnswers(map);
  }, [existing]);

  useEffect(() => {
    if (typeof existingNote === "string") setNote(existingNote);
  }, [existingNote]);

  const answeredCount = useMemo(
    () => (options as any[]).filter((o) => answers[o.id]?.choice).length,
    [options, answers],
  );

  const save = async () => {
    if (!poll?.id || !contactId) return;
    setSaving(true);
    try {
      const rows = (options as any[])
        .filter((o) => answers[o.id]?.choice)
        .map((o) => ({
          poll_id: poll.id,
          option_id: o.id,
          contact_id: contactId,
          choice: answers[o.id].choice,
          earliest_time: answers[o.id].choice === "no" ? null : answers[o.id].earliest,
        }));

      if (rows.length) {
        const { error } = await supabase
          .from("etv_date_poll_responses")
          .upsert(rows, { onConflict: "option_id,contact_id" });
        if (error) throw error;
      }

      const { error: noteErr } = await supabase
        .from("etv_date_poll_notes")
        .upsert({ poll_id: poll.id, contact_id: contactId, note: note || null }, { onConflict: "poll_id,contact_id" });
      if (noteErr) throw noteErr;

      queryClient.invalidateQueries({ queryKey: ["owner-date-poll-responses", poll.id, contactId] });
      setDoneOpen(true);
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Wird geladen...</div>;

  if (!poll) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center space-y-3">
        <CalendarClock className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-bold">Terminabfrage</h1>
        <p className="text-muted-foreground">Aktuell läuft keine Terminabfrage.</p>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="p-4 md:p-6 max-w-xl mx-auto">
        <Card className="border-border/60">
          <CardContent className="p-6 space-y-4 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <CalendarClock className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight">Terminfindung Eigentümerversammlung</h1>
              <p className="text-sm text-muted-foreground">
                {(options as any[]).length} Terminvorschläge · Rückmeldung bis{" "}
                {new Date(poll.closes_at).toLocaleDateString("de-DE")}
              </p>
              {poll.intro_text && <p className="text-sm text-muted-foreground">{poll.intro_text}</p>}
            </div>
            <Button className="w-full h-12 gap-2" onClick={() => setStarted(true)}>
              {existing.length ? "Antwort ansehen / ändern" : "Jetzt abstimmen"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 pb-28">
      <div className="space-y-1">
        <h1 className="text-lg md:text-xl font-semibold tracking-tight">Terminfindung</h1>
        <p className="text-sm text-muted-foreground">
          Bitte geben Sie an, ob Sie können – und ab wann.
        </p>
      </div>

      {(options as any[]).map((opt) => {
        const a = answers[opt.id] || { choice: null, earliest: null };
        const disabled = a.choice === "no" || !a.choice;
        return (
          <Card key={opt.id} className="border-border/60">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold">{formatGermanDate(opt.proposed_date)}</p>

              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { key: "yes", label: "Ja", icon: Check },
                    { key: "maybe", label: "Vielleicht", icon: Minus },
                    { key: "no", label: "Nein", icon: X },
                  ] as const
                ).map(({ key, label, icon: Icon }) => {
                  const active = a.choice === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          [opt.id]: { choice: key, earliest: key === "no" ? null : prev[opt.id]?.earliest ?? null },
                        }))
                      }
                      className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className={disabled ? "opacity-40 pointer-events-none" : ""}>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Frühestens</p>
                <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                  {TIME_SLOTS.map((slot) => {
                    const active = a.earliest === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() =>
                          setAnswers((prev) => ({
                            ...prev,
                            [opt.id]: { choice: prev[opt.id]?.choice ?? "yes", earliest: slot },
                          }))
                        }
                        className={`rounded-lg border px-2 py-2 text-xs transition-colors ${
                          active
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border bg-background text-muted-foreground hover:bg-muted/60"
                        }`}
                      >
                        {slotShort(slot)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="space-y-1.5">
        <Label htmlFor="poll-note" className="text-sm">
          Anmerkung an die Verwaltung (optional)
        </Label>
        <Textarea id="poll-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur p-3 md:static md:border-0 md:bg-transparent md:p-0">
        <div className="max-w-2xl mx-auto space-y-1">
          <Button className="w-full h-12 gap-2" onClick={save} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Speichern..." : "Antwort speichern"}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            {answeredCount} von {(options as any[]).length} Terminen beantwortet – Sie können jederzeit speichern.
          </p>
        </div>
      </div>

      <Dialog open={doneOpen} onOpenChange={setDoneOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-center">Vielen Dank</DialogTitle>
            <DialogDescription className="text-center">
              Ihre Rückmeldung wurde gespeichert. Die Verwaltung wertet alle Antworten aus und legt den Termin fest.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full"
              onClick={() => {
                setDoneOpen(false);
                navigate("/weg-owner");
              }}
            >
              Fertig
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setDoneOpen(false)}>
              Antwort weiter bearbeiten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WegOwnerDatePoll;
