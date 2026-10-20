import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, CheckCircle2, Clock, Eye, KeyRound, Loader2, MinusCircle, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useManagementMode } from "@/hooks/useManagementMode";
import { ZugangsdatenSenden } from "@/components/benachrichtigungen/ZugangsdatenSenden";

const ART: Record<string, string> = {
  meldung_antwort: "Antwort auf Meldung",
  meldung_erledigt: "Meldung erledigt",
  einladung: "Einladung Versammlung",
  erinnerung: "Erinnerung Versammlung",
  terminumfrage: "Terminumfrage",
  terminumfrage_erinnerung: "Erinnerung Terminumfrage",
  umfrage: "Neue Umfrage",
  dokumente: "Neue Dokumente",
  aushang: "Aushang",
  lastschrift: "Lastschrift-Ankündigung",
  hausgeld: "Hausgeld ändert sich",
  angebot: "Neues Angebot",
  zugangsdaten: "Zugangsdaten",
  passwort_link: "Passwort-Link",
};
// Mails, die nicht vom Benachrichtigungs-Dienst kommen, aber trotzdem automatisch an Eigentümer gehen
const KONTO: Record<string, string> = { willkommen_weg: "zugangsdaten", passwort_link: "passwort_link" };
const SYSTEM: Record<string, string> = {
  willkommen_weg: "Zugangsdaten",
  passwort_link: "Passwort-Link",
  email_bestaetigen: "E-Mail bestätigen",
  anfrage_hinweis: "Hinweis neue Anfrage (an RGI)",
  schluessel_ausgabe: "Schlüsselübergabe",
  schluessel_erinnerung: "Erinnerung Schlüssel",
  schluessel_rueckgabe: "Schlüsselrückgabe",
};
const GRUND: Record<string, string> = {
  abgeschaltet: "vom Eigentümer abgeschaltet",
  "keine E-Mail-Adresse": "keine E-Mail-Adresse",
  "nichts zu melden": "nichts zu melden",
};

type Reiter = "benachrichtigungen" | "system";

/**
 * Eigentümer › Benachrichtigungen: alle automatischen E-Mails an Eigentümer –
 * was wann an wen ging (oder warum nicht), mit Vorschau der E-Mail.
 */
export default function Benachrichtigungen() {
  const qc = useQueryClient();
  const [reiter, setReiter] = useState<Reiter>("benachrichtigungen");
  const [art, setArt] = useState("alle");
  const [status, setStatus] = useState("alle");
  const [suche, setSuche] = useState("");
  const [ansicht, setAnsicht] = useState<any | null>(null);
  const [prueft, setPrueft] = useState(false);
  const [gebaeude, setGebaeude] = useState("alle");
  const [zugang, setZugang] = useState(false);
  const { managementMode } = useManagementMode();

  // Gebäude und wer dort Eigentümer mit App-Zugang ist
  const { data: haeuser = { liste: [] as { id: string; name: string }[], zuordnung: new Map<string, Set<string>>() } } = useQuery({
    queryKey: ["benachrichtigungen-gebaeude", managementMode],
    queryFn: async () => {
      const [{ data: b }, { data: wob }] = await Promise.all([
        supabase.from("buildings").select("id, name, management_mode").order("name"),
        (supabase as any).from("weg_owner_buildings").select("user_id, building_id"),
      ]);
      const zuordnung = new Map<string, Set<string>>();
      (wob ?? []).forEach((r: any) => {
        const s = zuordnung.get(r.building_id) ?? new Set<string>();
        s.add(r.user_id);
        zuordnung.set(r.building_id, s);
      });
      const liste = (b ?? []).filter((x: any) => (x.management_mode ?? "weg") === managementMode).map((x: any) => ({ id: x.id, name: x.name }));
      return { liste, zuordnung };
    },
  });
  const imGebaeude = (uid: string | null | undefined) => gebaeude === "alle" || (!!uid && !!haeuser.zuordnung.get(gebaeude)?.has(uid));

  const { data: zeilen = [], isLoading } = useQuery({
    queryKey: ["benachrichtigungen-protokoll"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("benachrichtigungen")
        .select("id, user_id, art, status, fehler, empfaenger, betreff, senden_ab, gesendet_am, created_at, html, daten")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const { data: konto } = await (supabase as any)
        .from("system_mail_log")
        .select("id, kind, recipient, subject, status, error, created_at, ref_id, html")
        .in("kind", Object.keys(KONTO))
        .order("created_at", { ascending: false })
        .limit(500);
      const kontoZeilen = (konto ?? []).map((k: any) => ({
        id: `s-${k.id}`,
        user_id: k.ref_id,
        art: KONTO[k.kind],
        status: k.status,
        fehler: k.error,
        empfaenger: k.recipient,
        betreff: k.subject,
        gesendet_am: k.status === "gesendet" ? k.created_at : null,
        created_at: k.created_at,
        html: k.html,
      }));
      const ids = [...new Set([...(data ?? []), ...kontoZeilen].map((z: any) => z.user_id).filter(Boolean))];
      const namen = new Map<string, any>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data: p } = await supabase.from("profiles").select("user_id, first_name, last_name, email").in("user_id", ids.slice(i, i + 200) as string[]);
        (p ?? []).forEach((x: any) => namen.set(x.user_id, x));
      }
      return [...(data ?? []), ...kontoZeilen]
        .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
        .map((z: any) => {
        const p = namen.get(z.user_id);
        return { ...z, name: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Eigentümer", email: z.empfaenger ?? p?.email ?? "" };
      });
    },
    refetchInterval: 60_000,
  });

  const { data: system = [], isLoading: laedtSystem } = useQuery({
    queryKey: ["system-mail-protokoll"],
    enabled: reiter === "system",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("system_mail_log")
        .select("id, kind, recipient, subject, status, error, created_at, ref_id, html")
        .not("kind", "like", "benachrichtigung_%")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const heute = new Date().toISOString().slice(0, 10);
  const alleZeilen = zeilen;
  const zahlen = useMemo(
    () => {
      const zeilen = alleZeilen.filter((z: any) => imGebaeude(z.user_id));
      return {
      heute: zeilen.filter((z: any) => z.status === "gesendet" && (z.gesendet_am ?? "").slice(0, 10) === heute).length,
      geplant: zeilen.filter((z: any) => z.status === "offen").length,
      fehler: zeilen.filter((z: any) => z.status === "fehler").length,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alleZeilen, heute, gebaeude, haeuser],
  );

  const q = suche.trim().toLowerCase();
  const liste = zeilen.filter(
    (z: any) =>
      imGebaeude(z.user_id) &&
      (art === "alle" || z.art === art) &&
      (status === "alle" || z.status === status) &&
      (!q || [z.name, z.email, z.betreff, ART[z.art]].some((t) => String(t ?? "").toLowerCase().includes(q))),
  );

  const jetztPruefen = async () => {
    setPrueft(true);
    try {
      const { data, error } = await supabase.functions.invoke("benachrichtigungen", { body: {} });
      if (error) throw error;
      const n = data?.senden?.gesendet ?? 0;
      toast.success(data?.senden?.grund === "Nachtruhe" ? "Geprüft – zwischen 21 und 7 Uhr wird nichts verschickt" : `Geprüft – ${n} E-Mail${n === 1 ? "" : "s"} verschickt`);
      qc.invalidateQueries({ queryKey: ["benachrichtigungen-protokoll"] });
    } catch (e: any) {
      toast.error(e?.message || "Prüfen fehlgeschlagen");
    } finally {
      setPrueft(false);
    }
  };

  const chip = (z: any) => {
    if (z.status === "gesendet")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> gesendet
        </span>
      );
    if (z.status === "offen")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-300">
          <Clock className="h-3.5 w-3.5" /> geplant
        </span>
      );
    if (z.status === "fehler")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="h-3.5 w-3.5" /> Fehler
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <MinusCircle className="h-3.5 w-3.5" /> nicht gesendet
      </span>
    );
  };

  const reiterKnopf = (r: Reiter, text: string) => (
    <button
      type="button"
      onClick={() => setReiter(r)}
      aria-current={reiter === r ? "page" : undefined}
      className={cn("h-10 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors", reiter === r ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
    >
      {text}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-3 md:p-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Benachrichtigungen</h1>
          <p className="mt-1.5 text-sm text-muted-foreground md:text-base">Alle automatischen E-Mails an Eigentümer – was wann an wen ging, mit Vorschau.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" onClick={jetztPruefen} disabled={prueft}>
            {prueft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Jetzt prüfen
          </Button>
          <Button className="h-11" onClick={() => setZugang(true)}>
            <KeyRound className="mr-2 h-4 w-4" /> Zugangsdaten senden
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Heute gesendet</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{zahlen.heute}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Geplant</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{zahlen.geplant}</div>
        </div>
        <button type="button" onClick={() => { setReiter("benachrichtigungen"); setStatus("fehler"); }} className="rounded-xl border bg-card p-4 text-left hover:border-foreground/30">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fehler</div>
          <div className={cn("mt-1 text-2xl font-bold tabular-nums", zahlen.fehler > 0 && "text-red-700 dark:text-red-400")}>{zahlen.fehler}</div>
        </button>
      </div>

      <nav aria-label="Reiter" className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
        <div className="inline-flex gap-1.5 rounded-full bg-muted p-1.5">
          {reiterKnopf("benachrichtigungen", "An Eigentümer")}
          {reiterKnopf("system", "Weitere automatische Mails")}
        </div>
      </nav>

      {reiter === "benachrichtigungen" && (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-[2]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name, E-Mail oder Betreff …" className="h-11 pl-9" aria-label="Suchen" />
            </div>
            <Select value={gebaeude} onValueChange={setGebaeude}>
              <SelectTrigger className="h-11 w-56" aria-label="Gebäude">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Gebäude</SelectItem>
                {haeuser.liste.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={art} onValueChange={setArt}>
              <SelectTrigger className="h-11 w-56" aria-label="Art">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Arten</SelectItem>
                {Object.entries(ART).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11 w-44" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle</SelectItem>
                <SelectItem value="gesendet">Gesendet</SelectItem>
                <SelectItem value="offen">Geplant</SelectItem>
                <SelectItem value="fehler">Fehler</SelectItem>
                <SelectItem value="uebersprungen">Nicht gesendet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <section className="overflow-hidden rounded-xl border bg-card">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !liste.length ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">Noch keine automatischen E-Mails.</div>
            ) : (
              liste.map((z: any) => (
                <div key={z.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3 last:border-0">
                  <div className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {format(new Date(z.gesendet_am ?? (z.status === "offen" ? z.senden_ab : z.created_at)), "dd.MM.yy HH:mm")}
                  </div>
                  <div className="min-w-[220px] flex-1">
                    <div className="font-semibold">{z.betreff || ART[z.art] || z.art}</div>
                    <div className="text-sm text-muted-foreground">
                      {ART[z.art] ?? z.art} · {z.name}
                      {z.email ? ` · ${z.email}` : ""}
                    </div>
                    {z.status === "uebersprungen" && z.fehler && <div className="text-xs text-muted-foreground">Grund: {GRUND[z.fehler] ?? z.fehler}</div>}
                    {z.status === "fehler" && z.fehler && <div className="text-xs text-red-700 dark:text-red-400">{z.fehler}</div>}
                  </div>
                  {chip(z)}
                  <Button variant="outline" size="sm" className="h-9" disabled={!z.html} onClick={() => setAnsicht(z)}>
                    <Eye className="mr-1.5 h-4 w-4" /> Ansehen
                  </Button>
                </div>
              ))
            )}
          </section>
          <p className="text-xs text-muted-foreground">Zwischen 21 und 7 Uhr wird nichts verschickt. Die App prüft alle 5 Minuten, ob es etwas Neues gibt.</p>
        </>
      )}

      {reiter === "system" && (
        <div className="flex flex-wrap gap-3">
          <Select value={gebaeude} onValueChange={setGebaeude}>
            <SelectTrigger className="h-11 w-56" aria-label="Gebäude">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Gebäude</SelectItem>
              {haeuser.liste.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {reiter === "system" && (
        <section className="overflow-hidden rounded-xl border bg-card">
          {laedtSystem ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !system.filter((z: any) => gebaeude === "alle" || imGebaeude(z.ref_id)).length ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">Keine weiteren automatischen E-Mails.</div>
          ) : (
            system.filter((z: any) => gebaeude === "alle" || imGebaeude(z.ref_id)).map((z: any) => (
              <div key={z.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3 last:border-0">
                <div className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">{format(new Date(z.created_at), "dd.MM.yy HH:mm")}</div>
                <div className="min-w-[220px] flex-1">
                  <div className="font-semibold">{z.subject || SYSTEM[z.kind] || z.kind}</div>
                  <div className="text-sm text-muted-foreground">
                    {SYSTEM[z.kind] ?? z.kind} · {z.recipient}
                  </div>
                  {z.error && <div className="text-xs text-red-700 dark:text-red-400">{z.error}</div>}
                </div>
                {chip({ status: z.status })}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={!z.html}
                  onClick={() => setAnsicht({ betreff: z.subject, name: SYSTEM[z.kind] ?? z.kind, email: z.recipient, gesendet_am: z.created_at, html: z.html })}
                >
                  <Eye className="mr-1.5 h-4 w-4" /> Ansehen
                </Button>
              </div>
            ))
          )}
        </section>
      )}

      <ZugangsdatenSenden offen={zugang} onOffen={setZugang} gebaeude={haeuser.liste} startGebaeude={gebaeude} />

      <Sheet open={!!ansicht} onOpenChange={(o) => !o && setAnsicht(null)}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-[720px]">
          <SheetHeader className="border-b px-5 py-4 text-left">
            <SheetTitle>{ansicht?.betreff}</SheetTitle>
            <SheetDescription>
              An {ansicht?.name}{ansicht?.email ? ` (${ansicht.email})` : ""} · {ansicht?.gesendet_am ? format(new Date(ansicht.gesendet_am), "dd.MM.yyyy, HH:mm 'Uhr'") : ""}
            </SheetDescription>
          </SheetHeader>
          {ansicht?.html && <iframe title="Vorschau der E-Mail" srcDoc={ansicht.html} sandbox="" className="h-[calc(100vh-96px)] w-full border-0 bg-[#F6F2ED]" />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
