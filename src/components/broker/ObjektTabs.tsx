import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, Mail, Pencil, Plus, StickyNote, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LeadBadge, LeerHinweis, QuelleChip, Rueckfrage } from "./MaklerUi";
import { NeuerInteressentDialog } from "./MaklerDialoge";
import { useBrokerAccess, useBrokerLeads, useBrokerStaff, useMaklerNeuLaden, usePropertyEmails } from "@/hooks/useMakler";
import { datum, datumZeit, db, fehler, istStill, leadName, personName } from "@/lib/makler";

// ---------------------------------------------------------------------------
// Interessenten eines Objekts
// ---------------------------------------------------------------------------
export function ObjektInteressenten({ propertyId }: { propertyId: string }) {
  const navigate = useNavigate();
  const { data: leads = [], isLoading } = useBrokerLeads(propertyId);
  const [neu, setNeu] = useState(false);

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-base font-semibold">Interessenten</h2>
        <Button className="h-11" onClick={() => setNeu(true)}><Plus className="h-4 w-4 mr-1.5" />Interessent</Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Wird geladen…</p>
      ) : leads.length === 0 ? (
        <LeerHinweis icon={Users} titel="Noch keine Interessenten" text="Neue Anfragen erscheinen hier – oder legen Sie selbst jemanden an." />
      ) : (
        <ul className="rounded-lg border divide-y">
          {leads.map((l) => {
            const still = istStill(l);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/makler/interessenten/${l.id}`)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 min-h-[56px] text-left hover:bg-muted/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{leadName(l)}</span>
                      <QuelleChip quelle={l.source} />
                    </span>
                    <span className={still ? "block text-xs text-red-700" : "block text-xs text-muted-foreground"}>
                      {still ? `Seit ${still} Tagen still` : l.last_contact_at ? `Letzter Kontakt ${datum(l.last_contact_at)}` : `Angelegt ${datum(l.created_at)}`}
                    </span>
                  </span>
                  <LeadBadge status={l.status} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <NeuerInteressentDialog open={neu} onOpenChange={setNeu} propertyId={propertyId} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Verlauf: interne Notizen + zugeordnete E-Mails
// ---------------------------------------------------------------------------
interface Notiz {
  id: string;
  property_id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function ObjektVerlauf({ propertyId }: { propertyId: string }) {
  const navigate = useNavigate();
  const { userId } = useBrokerAccess();
  const neuLaden = useMaklerNeuLaden();
  const { nachId } = useBrokerStaff();
  const { data: mails = [], isLoading: ml } = usePropertyEmails(propertyId);
  const { data: notizen = [], isLoading: nl, error } = useQuery({
    queryKey: ["broker", "notes", propertyId],
    queryFn: async () => {
      const { data, error } = await db
        .from("broker_property_notes")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Notiz[];
    },
  });
  useEffect(() => {
    if (error) fehler("Notizen konnten nicht geladen werden", error);
  }, [error]);

  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<{ id: string; body: string } | null>(null);
  const [loeschen, setLoeschen] = useState<Notiz | null>(null);

  const speichern = async () => {
    if (!text.trim()) return;
    setLaeuft(true);
    const { error } = await db.from("broker_property_notes").insert({ property_id: propertyId, body: text.trim(), created_by: userId });
    setLaeuft(false);
    if (error) return fehler("Notiz konnte nicht gespeichert werden", error);
    setText("");
    neuLaden();
  };

  const aendern = async () => {
    if (!bearbeiten || !bearbeiten.body.trim()) return;
    const { error } = await db
      .from("broker_property_notes")
      .update({ body: bearbeiten.body.trim(), updated_at: new Date().toISOString() })
      .eq("id", bearbeiten.id);
    if (error) return fehler("Notiz konnte nicht geändert werden", error);
    setBearbeiten(null);
    neuLaden();
  };

  const entfernen = async (n: Notiz) => {
    setLoeschen(null);
    const { error } = await db.from("broker_property_notes").delete().eq("id", n.id);
    if (error) return fehler("Notiz konnte nicht gelöscht werden", error);
    toast.success("Notiz gelöscht");
    neuLaden();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold mb-1">Interne Notizen</h2>
        <p className="text-xs text-muted-foreground mb-3">Nur für das Büro – erscheinen nirgends öffentlich.</p>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Notiz schreiben…" />
        <div className="flex justify-end mt-2">
          <Button className="h-11" onClick={speichern} disabled={laeuft || !text.trim()}>
            {laeuft && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Notiz speichern
          </Button>
        </div>
        <ul className="mt-4 space-y-3">
          {nl ? (
            <li className="text-sm text-muted-foreground">Wird geladen…</li>
          ) : notizen.length === 0 ? (
            <li className="text-sm text-muted-foreground">Noch keine Notizen.</li>
          ) : (
            notizen.map((n) => (
              <li key={n.id} className="rounded-lg border bg-background p-3">
                <div className="flex items-start gap-2">
                  <StickyNote className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    {bearbeiten?.id === n.id ? (
                      <>
                        <Textarea rows={3} value={bearbeiten.body} onChange={(e) => setBearbeiten({ id: n.id, body: e.target.value })} />
                        <div className="flex justify-end gap-2 mt-2">
                          <Button variant="outline" className="h-10" onClick={() => setBearbeiten(null)}>Abbrechen</Button>
                          <Button className="h-10" onClick={aendern}>Speichern</Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap break-words">{n.body}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {personName(n.created_by ? nachId.get(n.created_by) : null) || "Unbekannt"} · {datumZeit(n.created_at)}
                      {n.updated_at && n.updated_at.slice(0, 16) !== n.created_at.slice(0, 16) ? " · geändert" : ""}
                    </p>
                  </div>
                  {bearbeiten?.id !== n.id && (
                    <div className="flex shrink-0">
                      <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Notiz bearbeiten" onClick={() => setBearbeiten({ id: n.id, body: n.body })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive hover:text-destructive" aria-label="Notiz löschen" onClick={() => setLoeschen(n)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold mb-1">E-Mails zu diesem Objekt</h2>
        <p className="text-xs text-muted-foreground mb-3">Im Postfach über „Makler zuordnen" verknüpft.</p>
        {ml ? (
          <p className="text-sm text-muted-foreground">Wird geladen…</p>
        ) : mails.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine E-Mails zugeordnet.</p>
        ) : (
          <ul className="rounded-lg border divide-y">
            {mails.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/postfach?email=${m.id}`)}
                  className="flex w-full items-start gap-3 px-3 py-2.5 min-h-[56px] text-left hover:bg-muted/50"
                >
                  <Mail className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.subject || "(ohne Betreff)"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{m.from_name || m.from_address} · {datumZeit(m.date)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Rueckfrage
        open={!!loeschen}
        onOpenChange={(o) => !o && setLoeschen(null)}
        titel="Notiz löschen?"
        onJa={() => loeschen && entfernen(loeschen)}
      />
    </div>
  );
}
