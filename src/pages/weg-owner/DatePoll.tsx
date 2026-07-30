import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CalendarClock, Check, Minus, X, Save } from "lucide-react";
import { formatGermanDate, slotLabel, TIME_SLOTS, type PollChoice } from "@/lib/datePoll";

interface LocalAnswer {
  choice: PollChoice | null;
  earliest: string | null;
}

export const WegOwnerDatePoll = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

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

  const complete = useMemo(
    () =>
      (options as any[]).every((o) => {
        const a = answers[o.id];
        if (!a?.choice) return false;
        if (a.choice !== "no" && !a.earliest) return false;
        return true;
      }),
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

      const { error } = await supabase
        .from("etv_date_poll_responses")
        .upsert(rows, { onConflict: "option_id,contact_id" });
      if (error) throw error;

      const { error: noteErr } = await supabase
        .from("etv_date_poll_notes")
        .upsert({ poll_id: poll.id, contact_id: contactId, note: note || null }, { onConflict: "poll_id,contact_id" });
      if (noteErr) throw noteErr;

      toast({ title: "Gespeichert", description: "Ihre Rückmeldung wurde übermittelt." });
      queryClient.invalidateQueries({ queryKey: ["owner-date-poll-responses", poll.id, contactId] });
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

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Terminfindung für die Eigentümerversammlung</h1>
        <p className="text-muted-foreground">
          Bitte geben Sie zu jedem Tag an, ob Sie können, und ab wann.
        </p>
        {poll.intro_text && <p className="text-sm text-muted-foreground">{poll.intro_text}</p>}
      </div>

      {(options as any[]).map((opt) => {
        const a = answers[opt.id] || { choice: null, earliest: null };
        const disabled = a.choice === "no" || !a.choice;
        return (
          <Card key={opt.id}>
            <CardContent className="p-4 space-y-4">
              <p className="text-lg font-semibold">{formatGermanDate(opt.proposed_date)}</p>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "yes", label: "Ja, passt", icon: Check, cls: "bg-green-600 hover:bg-green-700 text-white" },
                    { key: "maybe", label: "Vielleicht", icon: Minus, cls: "bg-orange-500 hover:bg-orange-600 text-white" },
                    { key: "no", label: "Nein", icon: X, cls: "bg-destructive hover:bg-destructive/90 text-white" },
                  ] as const
                ).map(({ key, label, icon: Icon, cls }) => (
                  <Button
                    key={key}
                    type="button"
                    variant={a.choice === key ? "default" : "outline"}
                    className={`h-14 text-base gap-2 ${a.choice === key ? cls : ""}`}
                    onClick={() =>
                      setAnswers((prev) => ({
                        ...prev,
                        [opt.id]: { choice: key, earliest: key === "no" ? null : prev[opt.id]?.earliest ?? null },
                      }))
                    }
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </Button>
                ))}
              </div>

              <div className={disabled ? "opacity-40 pointer-events-none" : ""}>
                <Label className="text-sm text-muted-foreground">Ab wann können Sie frühestens?</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {TIME_SLOTS.map((slot) => (
                    <Button
                      key={slot}
                      type="button"
                      variant={a.earliest === slot ? "default" : "outline"}
                      className="h-12 text-base"
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          [opt.id]: { choice: prev[opt.id]?.choice ?? "yes", earliest: slot },
                        }))
                      }
                    >
                      {slotLabel(slot)}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="space-y-2">
        <Label htmlFor="poll-note">Anmerkung an die Verwaltung (optional)</Label>
        <Textarea id="poll-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <Button className="w-full h-14 text-base gap-2" onClick={save} disabled={saving || !complete}>
        <Save className="h-5 w-5" />
        {saving ? "Speichern..." : "Antwort speichern"}
      </Button>
      {!complete && (
        <p className="text-xs text-muted-foreground text-center">
          Bitte zu jedem Tag antworten und bei Ja/Vielleicht eine Uhrzeit wählen.
        </p>
      )}
    </div>
  );
};

export default WegOwnerDatePoll;
