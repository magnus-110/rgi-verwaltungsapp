import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  ExternalLink,
  FileText,
  Home,
  Loader2,
  Mail,
  Phone,
  Reply,
  Send,
  Star,
  StickyNote,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateContactDialog } from "@/components/contacts/CreateContactDialog";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";
import { BlurInput, LeadBadge, MaklerGuard, Rueckfrage } from "@/components/broker/MaklerUi";
import { AusgangDialog, BesichtigungDialog } from "@/components/broker/MaklerDialoge";
import {
  useBrokerAccess,
  useBrokerLead,
  useBrokerStaff,
  useLeadEmails,
  useLeadEvents,
  useMaklerNeuLaden,
} from "@/hooks/useMakler";
import {
  LEAD_LABEL,
  LEAD_SPALTEN,
  LEAD_STATUS,
  QUELLEN,
  datumZeit,
  db,
  fehler,
  istStill,
  kontaktLabel,
  leadName,
  leadStandSetzen,
  neuestesExpose,
  personName,
  schrittIndex,
  type BrokerLead,
  type LeadStatus,
} from "@/lib/makler";
import { cn } from "@/lib/utils";

export default function MaklerInteressent() {
  return (
    <MaklerGuard>
      <Inhalt />
    </MaklerGuard>
  );
}

function Inhalt() {
  const { id } = useParams<{ id: string }>();
  const { data: lead, isLoading } = useBrokerLead(id);
  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4">
        <Skeleton className="h-[480px] rounded-xl" />
        <Skeleton className="h-[480px] rounded-xl" />
      </div>
    );
  }
  if (!lead) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-xl border bg-card p-8 text-center">
        <h1 className="font-display text-xl font-semibold mb-2">Interessent nicht gefunden</h1>
        <p className="text-sm text-muted-foreground mb-6">Er wurde gelöscht, oder Sie haben keinen Zugriff.</p>
        <Button asChild className="h-11"><Link to="/makler/interessenten">Zu den Interessenten</Link></Button>
      </div>
    );
  }
  return <Detail lead={lead} />;
}

const EVENT_ICON: Record<string, typeof Phone> = {
  call: Phone,
  viewing: CalendarDays,
  email: Mail,
  note: StickyNote,
  offer: FileText,
  document_sent: Send,
  status_change: ArrowRight,
};
const EVENT_LABEL: Record<string, string> = {
  call: "Anruf",
  viewing: "Besichtigung",
  email: "E-Mail",
  note: "Notiz",
  offer: "Angebot",
  document_sent: "Unterlagen gesendet",
  status_change: "Stand geändert",
};

function Detail({ lead }: { lead: BrokerLead }) {
  const navigate = useNavigate();
  const { userId } = useBrokerAccess();
  const neuLaden = useMaklerNeuLaden();
  const { openCompose } = useComposeEmail();
  const name = leadName(lead);
  const objektTitel = lead.broker_properties?.title ?? "Objekt";
  const [besichtigung, setBesichtigung] = useState(false);
  const [ausgang, setAusgang] = useState<{ nurAbsage?: boolean } | null>(null);
  const [kontaktNeu, setKontaktNeu] = useState(false);
  const [exposeHinweis, setExposeHinweis] = useState(false);
  const [loeschFrage, setLoeschFrage] = useState(false);

  const aendern = async (patch: Record<string, unknown>, ok?: string) => {
    const { data, error } = await db.from("broker_leads").update(patch).eq("id", lead.id).select("id");
    if (error) return fehler("Änderung konnte nicht gespeichert werden", error);
    if (!data || data.length === 0) return void toast.error("Keine Berechtigung für diesen Interessenten.");
    if (ok) toast.success(ok);
    neuLaden();
  };

  const ereignis = async (event_type: string, title: string | null, body?: string | null) => {
    const { error } = await db.from("broker_lead_events").insert({
      lead_id: lead.id,
      event_type,
      title,
      body: body ?? null,
      occurred_at: new Date().toISOString(),
      created_by: userId,
    });
    if (error) {
      fehler("Eintrag konnte nicht gespeichert werden", error);
      return false;
    }
    neuLaden();
    return true;
  };

  const standSetzen = async (status: LeadStatus, grund?: string) => {
    if (status === lead.status && status !== "absage") return;
    try {
      await leadStandSetzen(lead.id, status, userId, grund);
      toast.success(`Stand: ${LEAD_LABEL[status]}`);
    } catch (e) {
      fehler("Stand konnte nicht geändert werden", e);
    }
    neuLaden();
  };
  const waehleStand = (s: LeadStatus | "abgeschlossen") => {
    if (s === "abgeschlossen") return setAusgang({});
    if (s === "absage") return setAusgang({ nurAbsage: true });
    void standSetzen(s);
  };

  const antworten = () => {
    if (!lead.external_email) return void toast.error("Keine E-Mail-Adresse hinterlegt.");
    openCompose({ prefill: { to: lead.external_email, subject: `Ihre Anfrage: ${objektTitel}` } });
  };
  const exposeSenden = async () => {
    if (!lead.external_email) return void toast.error("Keine E-Mail-Adresse hinterlegt.");
    const datei = lead.property_id ? await neuestesExpose(lead.property_id) : null;
    if (!datei) toast.info("Für dieses Objekt ist noch kein Exposé hochgeladen. Bitte beim Objekt „Exposé hochladen“.");
    openCompose({
      attachments: datei ? [datei] : [],
      prefill: {
        to: lead.external_email,
        subject: `Exposé: ${objektTitel}`,
        bodyText: `Guten Tag${lead.external_name ? ` ${lead.external_name}` : ""},\n\nvielen Dank für Ihr Interesse an „${objektTitel}". Im Anhang finden Sie das Exposé mit allen Angaben und Bildern.\n\nGerne vereinbaren wir einen Besichtigungstermin. Melden Sie sich einfach bei uns.\n\nMit freundlichen Grüßen\nRGI Immobilien GmbH & Co. KG\nTelefon +49 8363 960656\n`,
      },
    });
    setExposeHinweis(true);
  };

  const loeschen = async () => {
    setLoeschFrage(false);
    const { data, error } = await db.from("broker_leads").delete().eq("id", lead.id).select("id");
    if (error) return fehler("Interessent konnte nicht gelöscht werden", error);
    if (!data || data.length === 0) return void toast.error("Keine Berechtigung zum Löschen.");
    toast.success("Interessent gelöscht");
    neuLaden();
    navigate("/makler/interessenten", { replace: true });
  };

  const schritt = schrittIndex(lead.status);
  const still = istStill(lead);
  const namensTeile = (lead.external_name ?? "").trim().split(/\s+/);

  return (
    <div className="max-w-6xl mx-auto">
      <button type="button" onClick={() => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate("/makler/interessenten"))} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground min-h-11 -ml-1 px-1 mb-1">
        <ArrowLeft className="h-4 w-4" />Zurück
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)] gap-4 items-start">
        {/* Links: Person, Aktionen, Stand */}
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <h1 className="font-display text-xl font-semibold break-words">{name}</h1>
              <LeadBadge status={lead.status} className="shrink-0" />
            </div>
            {still != null && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Seit {still} Tagen nichts gehört – nachfassen?</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="l-name">Name</Label>
              <BlurInput id="l-name" value={lead.external_name} placeholder={kontaktLabel(lead.contacts) || "Name"} onSave={(v) => aendern({ external_name: v || null })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-mail">E-Mail</Label>
              <BlurInput id="l-mail" type="email" inputMode="email" value={lead.external_email} onSave={(v) => aendern({ external_email: v || null })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-tel">Telefon</Label>
              <BlurInput id="l-tel" type="tel" inputMode="tel" value={lead.external_phone} onSave={(v) => aendern({ external_phone: v || null })} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11" onClick={antworten} disabled={!lead.external_email}>
                <Reply className="h-4 w-4 mr-1.5" />Antworten
              </Button>
              {lead.external_phone ? (
                <Button variant="outline" className="h-11" asChild>
                  <a href={`tel:${lead.external_phone.replace(/[^\d+]/g, "")}`}><Phone className="h-4 w-4 mr-1.5" />Anrufen</a>
                </Button>
              ) : (
                <Button variant="outline" className="h-11" disabled><Phone className="h-4 w-4 mr-1.5" />Anrufen</Button>
              )}
              <Button variant="outline" className="h-11" onClick={() => setBesichtigung(true)}>
                <CalendarDays className="h-4 w-4 mr-1.5" />Besichtigung
              </Button>
              <Button variant="outline" className="h-11" onClick={exposeSenden} disabled={!lead.external_email}>
                <Send className="h-4 w-4 mr-1.5" />Exposé senden
              </Button>
            </div>
            {exposeHinweis && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
                <p>Das Exposé hängt an der E-Mail. Nach dem Senden hier vermerken:</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="h-10"
                    onClick={async () => {
                      if (await ereignis("document_sent", "Exposé gesendet")) {
                        toast.success("Als gesendet vermerkt");
                        setExposeHinweis(false);
                      }
                    }}
                  >
                    Als gesendet vermerken
                  </Button>
                </div>
              </div>
            )}

            <div className="border-t pt-4 space-y-3 text-sm">
              <Link to={`/makler/objekte/${lead.property_id}`} className="flex items-center gap-2 min-h-11 font-medium hover:text-primary">
                <Home className="h-4 w-4 text-muted-foreground" />
                <span className="truncate flex-1">{objektTitel}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <div className="space-y-1.5">
                <Label>Herkunft</Label>
                <Select value={lead.source ?? "manuell"} onValueChange={(v) => aendern({ source: v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QUELLEN.map((q) => <SelectItem key={q.key} value={q.key} className="min-h-10">{q.label}</SelectItem>)}
                    {lead.source && !QUELLEN.some((q) => q.key === lead.source) && (
                      <SelectItem value={lead.source} className="min-h-10">{lead.source}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {lead.contact_id ? (
                <Link to={`/contacts?id=${lead.contact_id}`} className="flex items-center gap-2 min-h-11 text-primary font-medium">
                  <ExternalLink className="h-4 w-4" />In Adressen öffnen{kontaktLabel(lead.contacts) ? `: ${kontaktLabel(lead.contacts)}` : ""}
                </Link>
              ) : (
                <Button variant="outline" className="h-11 w-full" onClick={() => setKontaktNeu(true)}>
                  <UserPlus className="h-4 w-4 mr-1.5" />Als Kontakt anlegen
                </Button>
              )}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="font-display text-base font-semibold mb-3">Stand</h2>
            <ol className="grid grid-cols-5 gap-1 mb-3" aria-label="Fortschritt">
              {LEAD_SPALTEN.map((s, i) => (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => waehleStand(s.key === "abgeschlossen" ? "abgeschlossen" : (s.key as LeadStatus))}
                    className="group w-full min-h-11 flex flex-col items-center gap-1"
                    title={s.label}
                  >
                    <span
                      className={cn(
                        "h-2 w-full rounded-full transition-colors",
                        i <= schritt ? (lead.status === "absage" ? "bg-red-400" : "bg-primary") : "bg-muted group-hover:bg-primary/30",
                      )}
                    />
                    <span className={cn("text-[10px] sm:text-[11px] leading-tight text-center", i === schritt ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {s.key === "abgeschlossen" && (lead.status === "abschluss" || lead.status === "absage") ? LEAD_LABEL[lead.status] : s.label}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <Select value={lead.status} onValueChange={(v) => waehleStand(v as LeadStatus)}>
              <SelectTrigger className="h-11" aria-label="Stand"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUS.map((s) => <SelectItem key={s} value={s} className="min-h-10">{LEAD_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            {lead.status === "absage" && lead.outcome_reason && (
              <p className="text-sm text-muted-foreground mt-2">Grund: {lead.outcome_reason}</p>
            )}

            <div className="mt-4 border-t pt-4">
              <Label>Bewertung (optional)</Label>
              <div className="flex gap-0.5 mt-1" role="radiogroup" aria-label="Bewertung">
                {[1, 2, 3, 4, 5].map((n) => {
                  const an = (lead.rating ?? 0) >= n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={lead.rating === n}
                      aria-label={`${n} Sterne`}
                      onClick={() => aendern({ rating: lead.rating === n ? 0 : n })}
                      className="h-11 w-11 flex items-center justify-center"
                    >
                      <Star className={cn("h-6 w-6", an ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <Button variant="ghost" className="h-11 w-full text-destructive hover:text-destructive" onClick={() => setLoeschFrage(true)}>
            <Trash2 className="h-4 w-4 mr-1.5" />Interessent löschen
          </Button>
        </div>

        {/* Rechts: Verlauf */}
        <Verlauf lead={lead} onNotiz={(t) => ereignis("note", null, t)} />
      </div>

      <BesichtigungDialog open={besichtigung} onOpenChange={setBesichtigung} lead={lead} objektTitel={objektTitel} leadName={name} />
      <AusgangDialog
        open={!!ausgang}
        nurAbsage={ausgang?.nurAbsage}
        onOpenChange={(o) => !o && setAusgang(null)}
        onWahl={async (s, grund) => {
          setAusgang(null);
          await standSetzen(s, grund);
        }}
      />
      <CreateContactDialog
        open={kontaktNeu}
        onOpenChange={setKontaktNeu}
        title="Als Kontakt anlegen"
        prefill={{
          contactType: "person",
          firstName: namensTeile.length > 1 ? namensTeile.slice(0, -1).join(" ") : null,
          lastName: namensTeile.length > 0 ? namensTeile[namensTeile.length - 1] || null : null,
          email: lead.external_email,
          phone: lead.external_phone,
          notes: `Interessent für „${objektTitel}"`,
        }}
        onCreated={async (cid) => {
          if (cid) await aendern({ contact_id: cid }, "Kontakt angelegt und verknüpft");
        }}
      />
      <Rueckfrage
        open={loeschFrage}
        onOpenChange={setLoeschFrage}
        titel="Interessent löschen?"
        text="Der Interessent und sein Verlauf werden endgültig gelöscht. E-Mails bleiben im Postfach."
        onJa={loeschen}
      />
    </div>
  );
}

type Eintrag =
  | { art: "event"; id: string; zeit: string; typ: string; titel: string | null; text: string | null; emailId: string | null; von: string | null }
  | { art: "mail"; id: string; zeit: string; betreff: string; von: string; eingehend: boolean };

function Verlauf({ lead, onNotiz }: { lead: BrokerLead; onNotiz: (t: string) => Promise<boolean> }) {
  const navigate = useNavigate();
  const { nachId } = useBrokerStaff();
  const { data: events = [], isLoading: el } = useLeadEvents(lead.id);
  const { data: mails = [], isLoading: ml } = useLeadEmails(lead.id, lead.external_email);
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const eintraege = useMemo(() => {
    const verknuepft = new Set(events.map((e) => e.email_id).filter(Boolean));
    const liste: Eintrag[] = [
      ...events.map((e): Eintrag => ({
        art: "event", id: e.id, zeit: e.occurred_at, typ: e.event_type, titel: e.title, text: e.body, emailId: e.email_id,
        von: e.created_by ? personName(nachId.get(e.created_by)) : null,
      })),
      ...mails.filter((m) => !verknuepft.has(m.id)).map((m): Eintrag => ({
        art: "mail", id: m.id, zeit: m.date ?? "", betreff: m.subject || "(ohne Betreff)",
        von: m.from_name || m.from_address || "",
        eingehend: !!lead.external_email && (m.from_address ?? "").toLowerCase() === lead.external_email.toLowerCase(),
      })),
    ];
    return liste.sort((a, b) => b.zeit.localeCompare(a.zeit)).slice(0, 50);
  }, [events, mails, nachId, lead.external_email]);

  const speichern = async () => {
    if (!text.trim()) return;
    setLaeuft(true);
    const ok = await onNotiz(text.trim());
    setLaeuft(false);
    if (ok) setText("");
  };

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold mb-3">Verlauf</h2>
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Kurze Notiz, z. B. „Rückruf am Freitag vereinbart“" />
      <div className="flex justify-end mt-2">
        <Button className="h-11" onClick={speichern} disabled={laeuft || !text.trim()}>
          {laeuft && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Notiz speichern
        </Button>
      </div>

      <ol className="mt-5 relative border-l border-border ml-4 space-y-4">
        {(el || ml) && eintraege.length === 0 ? (
          <li className="pl-6 text-sm text-muted-foreground">Wird geladen…</li>
        ) : eintraege.length === 0 ? (
          <li className="pl-6 text-sm text-muted-foreground">Noch nichts passiert.</li>
        ) : (
          eintraege.map((e) => {
            const Icon = e.art === "mail" ? Mail : EVENT_ICON[e.typ] ?? StickyNote;
            const mailId = e.art === "mail" ? e.id : e.emailId;
            const inhalt = (
              <>
                <span className="absolute -left-[17px] top-0.5 flex h-8 w-8 items-center justify-center rounded-full border bg-background">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <div className="text-xs text-muted-foreground">
                  {datumZeit(e.zeit)}
                  {e.art === "event" ? ` · ${EVENT_LABEL[e.typ] ?? e.typ}${e.von ? ` · ${e.von}` : ""}` : e.eingehend ? " · E-Mail erhalten" : " · E-Mail"}
                </div>
                {e.art === "event" ? (
                  <>
                    {e.titel && <div className="text-sm font-medium">{e.titel}</div>}
                    {e.text && <div className="text-sm whitespace-pre-wrap break-words">{e.text}</div>}
                  </>
                ) : (
                  <div className="text-sm">
                    <span className="font-medium">{e.betreff}</span>
                    <span className="text-muted-foreground"> · {e.von}</span>
                  </div>
                )}
              </>
            );
            return (
              <li key={`${e.art}-${e.id}`} className="relative pl-6">
                {mailId ? (
                  <button type="button" onClick={() => navigate(`/postfach?email=${mailId}`)} className="block w-full text-left rounded-md hover:bg-muted/50 -my-1 py-1 min-h-11">
                    {inhalt}
                    <span className="text-xs text-primary font-medium">Im Postfach öffnen</span>
                  </button>
                ) : (
                  inhalt
                )}
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
}
