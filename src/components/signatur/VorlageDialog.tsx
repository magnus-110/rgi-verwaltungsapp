/**
 * „Neue Unterschrift“ › „Aus Vorlage“: fertige Vorlagen der App
 * (SEPA-Lastschriftmandat, Eigentümer-Stammdatenblatt) für mehrere Eigentümer auf einmal.
 *
 * Ablauf: Vorlage → Objekt → Eigentümer (Mehrfachauswahl, Versand je Eigentümer) → Vorschau → Anlegen.
 * Je Eigentümer entsteht ein eigener Vorgang; das PDF erzeugt sign-request (aus_vorlage) mit exakt
 * gesetzten Ausfüll- und Unterschriftsfeldern. Vor dem Mailversand an mehrere wird nachgefragt.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Check, CheckCircle2, ChevronRight, FileSignature, Landmark, Loader2, Mail, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { addDaysIso, signAction, useMailTemplates, useSignInvalidate, VORLAGE_LABEL, type VorlageArt } from "@/lib/signatur";
import { PdfAnsicht } from "@/components/shared/PdfAnsicht";
import { LinkHinweis, LinkZeile } from "./LinkKopieren";
import { eingabeKlasse, FeldLabel, SigButton } from "./ui";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Schritt = "vorlage" | "objekt" | "eigentuemer" | "vorschau" | "ergebnis";

interface Objekt {
  id: string;
  name: string;
  city: string | null;
  creditor_id: string | null;
}

export interface VorlageEigentuemer {
  contact_id: string;
  name: string;
  email: string | null;
  einheiten: { assignment_id: string; nr: string; art: string; lage: string }[];
  personen: { name: string; email: string | null }[];
  mandat: { mandatsreferenz: string; status: string; mit_iban: boolean } | null;
  laufend: { id: string; nummer: string; dokumentart: string }[];
}

interface Auswahl {
  versand: "mail" | "link";
  beide: boolean;
}

interface Ergebnis {
  contact_id?: string;
  name?: string;
  einheiten?: string[];
  ok: boolean;
  fehler?: string;
  id?: string;
  nummer?: string;
  titel?: string;
  versand?: { name: string; art: "mail" | "link"; email: string | null }[];
  links?: { signer_id: string; name: string; url: string }[];
  versand_fehler?: string[];
}

const VORLAGE_TEXT: Record<VorlageArt, string> = {
  sepa_mandat: "Mandat für den Hausgeld-Einzug. Gläubiger-ID und Mandatsreferenz kommen aus der App, der Eigentümer ergänzt die Bankverbindung.",
  stammdatenblatt: "Eigentümer prüfen Anschrift, Telefon, E-Mail, Zustellung und Bankverbindung – alles Vorausgefüllte ist änderbar.",
};

const einheitenText = (e: Pick<VorlageEigentuemer, "einheiten">) =>
  e.einheiten.map((u) => `${u.nr}${u.lage ? ` · ${u.lage}` : ""}`).join(", ");

function base64ZuBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}

export function VorlageDialog({
  open, onOpenChange, onZurueck, startVorlage, startObjekt, startKontakt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Zurück zur Auswahl in „Neue Unterschrift“ */
  onZurueck?: () => void;
  /** Direkt starten (z. B. aus der Gebäude-/Eigentümeransicht) */
  startVorlage?: VorlageArt;
  startObjekt?: string;
  startKontakt?: string;
}) {
  const invalidate = useSignInvalidate();
  const { data: vorlagen = [] } = useMailTemplates();
  const [schritt, setSchritt] = useState<Schritt>("vorlage");
  const [art, setArt] = useState<VorlageArt | null>(null);
  const [objektId, setObjektId] = useState("");
  const [auswahl, setAuswahl] = useState<Record<string, Auswahl>>({});
  const [frist, setFrist] = useState(addDaysIso(21));
  const [vorschauFuer, setVorschauFuer] = useState<string | null>(null);
  const [fragen, setFragen] = useState(false);
  const [anlegen, setAnlegen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<{ angelegt: number; fehler: number; ergebnisse: Ergebnis[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    setArt(startVorlage ?? null);
    setObjektId(startObjekt ?? "");
    setAuswahl({});
    setFehler(null);
    setErgebnis(null);
    setVorschauFuer(null);
    setSchritt(startVorlage && startObjekt ? "eigentuemer" : startVorlage ? "objekt" : "vorlage");
  }, [open, startVorlage, startObjekt]);

  // Frist aus der Mailvorlage der Dokumentart
  useEffect(() => {
    const v = art ? vorlagen.find((t) => t.dokumentart === art) : null;
    setFrist(addDaysIso(v?.frist_tage || 21));
  }, [art, vorlagen]);

  const { data: objekte = [], isLoading: objekteLaden } = useQuery({
    queryKey: ["signatur", "vorlage-objekte"],
    enabled: open,
    queryFn: async (): Promise<Objekt[]> => {
      const { data, error } = await db.from("buildings").select("id, name, city, creditor_id").order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60_000,
  });
  const objekt = objekte.find((o) => o.id === objektId) ?? null;

  const { data: liste, isLoading: listeLaedt, error: listeFehler } = useQuery({
    queryKey: ["signatur", "vorlage-eigentuemer", objektId],
    enabled: open && !!objektId && (schritt === "eigentuemer" || schritt === "vorschau"),
    queryFn: () => signAction<{ objekt: { label: string; glaeubiger_id: string | null }; eigentuemer: VorlageEigentuemer[] }>("vorlage_eigentuemer", { building_id: objektId }),
    staleTime: 60_000,
  });
  const eigentuemer = useMemo(() => liste?.eigentuemer ?? [], [liste]);

  // Aus der Eigentümeransicht: diesen Kontakt vorauswählen
  useEffect(() => {
    if (!startKontakt || !eigentuemer.length) return;
    const e = eigentuemer.find((x) => x.contact_id === startKontakt);
    if (e) setAuswahl({ [e.contact_id]: { versand: e.email ? "mail" : "link", beide: false } });
  }, [startKontakt, eigentuemer]);

  const gewaehlt = eigentuemer.filter((e) => auswahl[e.contact_id]);
  const alleGewaehlt = eigentuemer.length > 0 && gewaehlt.length === eigentuemer.length;
  const mitMail = gewaehlt.filter((e) => auswahl[e.contact_id].versand === "mail");
  const mailAnzahl = mitMail.reduce((n, e) => n + (auswahl[e.contact_id].beide && e.personen.length >= 2 ? e.personen.slice(0, 2).filter((p) => p.email || e.email).length : 1), 0);

  const umschalten = (e: VorlageEigentuemer, an: boolean) =>
    setAuswahl((prev) => {
      const n = { ...prev };
      if (an) n[e.contact_id] = prev[e.contact_id] ?? { versand: e.email ? "mail" : "link", beide: false };
      else delete n[e.contact_id];
      return n;
    });
  const alleUmschalten = (an: boolean) =>
    setAuswahl(an ? Object.fromEntries(eigentuemer.map((e) => [e.contact_id, auswahl[e.contact_id] ?? { versand: e.email ? "mail" : "link", beide: false }])) : {});
  const alleVersand = (v: "mail" | "link") =>
    setAuswahl((prev) => Object.fromEntries(Object.entries(prev).map(([k, a]) => {
      const e = eigentuemer.find((x) => x.contact_id === k);
      return [k, { ...a, versand: v === "mail" && e?.email ? "mail" : "link" }];
    })));

  // ---------- Vorschau ----------
  const vorschauKontakt = vorschauFuer && auswahl[vorschauFuer] ? vorschauFuer : gewaehlt[0]?.contact_id ?? null;
  const { data: vorschau, isFetching: vorschauLaedt, error: vorschauFehler } = useQuery({
    queryKey: ["signatur", "vorlage-vorschau", art, objektId, vorschauKontakt, vorschauKontakt ? auswahl[vorschauKontakt]?.beide : false],
    enabled: open && schritt === "vorschau" && !!art && !!vorschauKontakt,
    queryFn: async () => {
      const r = await signAction<{ titel: string; pdf_base64: string; felder: number; unterschriftsfelder: number; mandatsreferenz: string | null; unterzeichner: { name: string; email: string | null }[] }>(
        "vorlage_vorschau", { vorlage: art, building_id: objektId, contact_id: vorschauKontakt, beide: !!auswahl[vorschauKontakt!]?.beide },
      );
      return { ...r, blob: base64ZuBlob(r.pdf_base64) };
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const anlegenJetzt = async () => {
    if (!art) return;
    setFragen(false);
    setAnlegen(true);
    setFehler(null);
    try {
      const r = await signAction<{ angelegt: number; fehler: number; ergebnisse: Ergebnis[] }>("aus_vorlage", {
        vorlage: art,
        building_id: objektId,
        frist,
        eintraege: gewaehlt.map((e) => ({ contact_id: e.contact_id, versand: auswahl[e.contact_id].versand, beide: auswahl[e.contact_id].beide })),
      });
      setErgebnis(r);
      setSchritt("ergebnis");
      await invalidate();
    } catch (e: any) {
      setFehler(e?.message || "Anlegen fehlgeschlagen");
    } finally {
      setAnlegen(false);
    }
  };
  const anlegenKlick = () => {
    if (!gewaehlt.length) return setFehler("Bitte mindestens einen Eigentümer auswählen.");
    if (!frist || frist <= addDaysIso(0)) return setFehler("Die Frist muss in der Zukunft liegen.");
    // Vor dem Mailversand immer nachfragen (sofort raus, nicht rückholbar)
    if (mailAnzahl > 0) setFragen(true);
    else anlegenJetzt();
  };

  const titel = schritt === "ergebnis" ? "Vorgänge angelegt" : art ? `${VORLAGE_LABEL[art]} zur Unterschrift` : "Aus Vorlage";
  const beschreibung: Record<Schritt, string> = {
    vorlage: "Fertige Vorlage wählen – Angaben aus der App werden eingesetzt, Felder sind schon platziert.",
    objekt: "Für welches Objekt?",
    eigentuemer: "Eigentümer auswählen und festlegen, wie sie den Link bekommen.",
    vorschau: "So sieht das Dokument aus. Für jeden Eigentümer entsteht ein eigener Vorgang.",
    ergebnis: "Jeder Eigentümer hat einen eigenen Vorgang. Links bitte jetzt kopieren – sie werden nur einmal angezeigt.",
  };
  const zurueck = () => {
    setFehler(null);
    if (schritt === "vorlage") onZurueck?.();
    else if (schritt === "objekt") setSchritt("vorlage");
    else if (schritt === "eigentuemer") setSchritt(startObjekt ? "vorlage" : "objekt");
    else if (schritt === "vorschau") setSchritt("eigentuemer");
  };
  const breit = schritt === "vorschau" || schritt === "eigentuemer";

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !anlegen && onOpenChange(v)}>
        <DialogContent
          className={cn(
            "flex max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden p-0 font-sans sm:w-[96vw] sm:rounded-xl",
            breit ? "h-[100dvh] sm:h-[90vh] sm:max-w-[1000px]" : "sm:max-w-[600px]",
          )}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="border-b border-[#E5E5E5] px-6 pb-4 pt-5 pr-12">
            <DialogTitle className="font-display text-[22px] font-normal leading-tight text-[#2B2B2B]">{titel}</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-[#595959]">
              {objekt && schritt !== "vorlage" && schritt !== "objekt" ? `${objekt.name}${objekt.city && !objekt.name.includes(objekt.city) ? `, ${objekt.city}` : ""} · ` : ""}
              {beschreibung[schritt]}
            </DialogDescription>
          </div>

          {/* ---------- 1. Vorlage ---------- */}
          {schritt === "vorlage" && (
            <div className="grid gap-3 px-6 py-5">
              {(["sepa_mandat", "stammdatenblatt"] as VorlageArt[]).map((a) => (
                <WahlZeile
                  key={a}
                  icon={a === "sepa_mandat" ? <Landmark className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
                  titel={VORLAGE_LABEL[a]}
                  text={VORLAGE_TEXT[a]}
                  onClick={() => {
                    setArt(a);
                    setSchritt(objektId ? "eigentuemer" : "objekt");
                  }}
                />
              ))}
            </div>
          )}

          {/* ---------- 2. Objekt ---------- */}
          {schritt === "objekt" && (
            <div className="space-y-3 px-6 py-5">
              <div>
                <FeldLabel htmlFor="vl-objekt">Objekt</FeldLabel>
                <select id="vl-objekt" className={eingabeKlasse} value={objektId} disabled={objekteLaden} onChange={(e) => setObjektId(e.target.value)}>
                  <option value="">{objekteLaden ? "Lädt …" : "Objekt wählen …"}</option>
                  {objekte.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}{o.city && !o.name.includes(o.city) ? `, ${o.city}` : ""}</option>
                  ))}
                </select>
              </div>
              {art === "sepa_mandat" && objekt && !objekt.creditor_id && (
                <Hinweis>Für dieses Objekt ist keine Gläubiger-ID hinterlegt. Bitte zuerst unter Objekt › Mandate eintragen.</Hinweis>
              )}
              {art === "sepa_mandat" && objekt?.creditor_id && (
                <p className="text-[12.5px] text-[#6B6B6B]">Gläubiger-ID: <span className="font-mono text-[#2B2B2B]">{objekt.creditor_id}</span></p>
              )}
            </div>
          )}

          {/* ---------- 3. Eigentümer ---------- */}
          {schritt === "eigentuemer" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#E5E5E5] px-6 py-3">
                <label className="flex items-center gap-2 text-[13.5px] font-semibold text-[#2B2B2B]">
                  <Checkbox
                    checked={alleGewaehlt}
                    onCheckedChange={(v) => alleUmschalten(!!v)}
                    disabled={!eigentuemer.length}
                    className="data-[state=checked]:border-[#B35300] data-[state=checked]:bg-[#B35300]"
                    aria-label="Alle auswählen"
                  />
                  Alle ({eigentuemer.length})
                </label>
                <span className="text-[12.5px] text-[#6B6B6B]">{gewaehlt.length} ausgewählt</span>
                <span className="ml-auto flex items-center gap-1.5 text-[12.5px] text-[#595959]">
                  Für alle:
                  <button type="button" className="h-8 rounded-full border border-[#E5E5E5] px-3 font-medium hover:bg-[#FFF7ED]" onClick={() => alleVersand("mail")} disabled={!gewaehlt.length}>
                    E-Mail, wenn vorhanden
                  </button>
                  <button type="button" className="h-8 rounded-full border border-[#E5E5E5] px-3 font-medium hover:bg-[#FFF7ED]" onClick={() => alleVersand("link")} disabled={!gewaehlt.length}>
                    Link selbst verschicken
                  </button>
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 sm:px-6">
                {listeLaedt ? (
                  <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#6B6B6B]" /></div>
                ) : listeFehler ? (
                  <div className="py-6"><Hinweis>{(listeFehler as Error).message}</Hinweis></div>
                ) : !eigentuemer.length ? (
                  <div className="py-16 text-center text-[13.5px] text-[#6B6B6B]">Für dieses Objekt sind keine Eigentümer hinterlegt.</div>
                ) : (
                  <ul className="divide-y divide-[#EEEEEE]">
                    {eigentuemer.map((e) => (
                      <EigentuemerZeile
                        key={e.contact_id}
                        e={e}
                        art={art}
                        auswahl={auswahl[e.contact_id] ?? null}
                        onAn={(an) => umschalten(e, an)}
                        onAendern={(p) => setAuswahl((prev) => ({ ...prev, [e.contact_id]: { ...prev[e.contact_id], ...p } }))}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ---------- 4. Vorschau ---------- */}
          {schritt === "vorschau" && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:flex-row md:overflow-hidden md:p-6">
              <div className="flex min-h-[420px] flex-[1.3] flex-col overflow-hidden rounded-xl bg-[#EDEDED] md:min-h-0">
                {vorschauFehler ? (
                  <div className="p-6"><Hinweis>{(vorschauFehler as Error).message}</Hinweis></div>
                ) : vorschauLaedt || !vorschau ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[13px] text-[#6B6B6B]"><Loader2 className="h-6 w-6 animate-spin" /> Dokument wird erzeugt …</div>
                ) : (
                  <PdfAnsicht quelle={vorschau.blob} dateiName={`${vorschau.titel}.pdf`} className="flex-1" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-3 md:max-w-[360px] md:overflow-y-auto">
                <div>
                  <FeldLabel htmlFor="vl-vorschau">Vorschau für</FeldLabel>
                  <select id="vl-vorschau" className={eingabeKlasse} value={vorschauKontakt ?? ""} onChange={(e) => setVorschauFuer(e.target.value)}>
                    {gewaehlt.map((e) => (
                      <option key={e.contact_id} value={e.contact_id}>{einheitenText(e)} · {e.name}</option>
                    ))}
                  </select>
                </div>
                {vorschau && (
                  <div className="rounded-xl border border-[#E5E5E5] bg-white p-3 text-[13px] leading-relaxed text-[#2B2B2B]">
                    <div className="font-semibold">{vorschau.titel}</div>
                    <div className="text-[#595959]">
                      {vorschau.felder} Ausfüllfelder · {vorschau.unterschriftsfelder} Unterschriftsfeld{vorschau.unterschriftsfelder === 1 ? "" : "er"}
                      {vorschau.mandatsreferenz ? ` · Mandatsreferenz ${vorschau.mandatsreferenz}` : ""}
                    </div>
                    <div className="mt-1 text-[#595959]">Unterschreibt: {vorschau.unterzeichner.map((u) => u.name).join(", ")}</div>
                  </div>
                )}
                <div>
                  <FeldLabel htmlFor="vl-frist">Frist</FeldLabel>
                  <input id="vl-frist" type="date" className={eingabeKlasse} value={frist} min={addDaysIso(1)} onChange={(e) => setFrist(e.target.value)} />
                </div>
                <div className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-3 text-[13px] leading-relaxed text-[#2B2B2B]">
                  <div className="font-semibold">{gewaehlt.length} Vorgang{gewaehlt.length === 1 ? "" : "e"} werden angelegt</div>
                  <div className="text-[#595959]">
                    {mailAnzahl > 0 ? `${mailAnzahl} Einladung${mailAnzahl === 1 ? "" : "en"} per E-Mail (sofort)` : "Keine E-Mail"}
                    {gewaehlt.length - mitMail.length > 0 ? ` · ${gewaehlt.length - mitMail.length}× Link selbst verschicken` : ""}
                  </div>
                  <div className="mt-1 text-[12px] text-[#6B6B6B]">E-Mail-Text aus der Vorlage „{art ? VORLAGE_LABEL[art] : ""}“ (Einstellungen › Unterschriften).</div>
                </div>
              </div>
            </div>
          )}

          {/* ---------- 5. Ergebnis ---------- */}
          {schritt === "ergebnis" && ergebnis && (
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-6 py-4">
              <div className="flex items-center gap-2 rounded-lg bg-[#D4EDDA] px-3 py-2 text-[13.5px] font-semibold text-[#1E6B34]">
                <CheckCircle2 className="h-4 w-4" /> {ergebnis.angelegt} Vorgang{ergebnis.angelegt === 1 ? "" : "e"} angelegt
                {ergebnis.fehler > 0 && <span className="font-normal text-[#B35300]">· {ergebnis.fehler} nicht möglich</span>}
              </div>
              {ergebnis.ergebnisse.map((r, i) => (
                <div key={r.id ?? `f-${i}`} className="rounded-xl border border-[#E5E5E5] bg-white p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[14px] font-semibold text-[#2B2B2B]">{r.einheiten?.join(", ")}{r.einheiten?.length ? " · " : ""}{r.name}</span>
                    {r.ok ? <span className="shrink-0 font-mono text-[12px] text-[#6B6B6B]">{r.nummer}</span> : <span className="shrink-0 text-[12px] font-semibold text-[#B35300]">nicht angelegt</span>}
                  </div>
                  {!r.ok && <p className="mt-1 text-[12.5px] text-[#B35300]">{r.fehler}</p>}
                  {r.ok && (r.versand ?? []).filter((v) => v.art === "mail").map((v) => (
                    <p key={v.name} className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[#595959]"><Mail className="h-3.5 w-3.5" /> Einladung an {v.name} ({v.email}) gesendet</p>
                  ))}
                  {r.ok && (r.links ?? []).length > 0 && (
                    <div className="mt-2 space-y-2">
                      {r.links!.map((l) => <LinkZeile key={l.signer_id} name={l.name} url={l.url} zusatz={r.versand?.find((v) => v.name === l.name)?.email || "ohne E-Mail"} />)}
                    </div>
                  )}
                  {r.versand_fehler?.length ? <p className="mt-1 text-[12.5px] text-[#B35300]">{r.versand_fehler.join(" · ")}</p> : null}
                </div>
              ))}
              {ergebnis.ergebnisse.some((r) => r.links?.length) && <LinkHinweis />}
            </div>
          )}

          {/* ---------- Fuß ---------- */}
          <div className="border-t border-[#E5E5E5] px-6 py-4">
            {fehler && (
              <div className="mb-3"><Hinweis>{fehler}</Hinweis></div>
            )}
            {schritt === "ergebnis" ? (
              <div className="flex justify-end">
                <SigButton variante="primaer" className="px-6" onClick={() => onOpenChange(false)}>Fertig</SigButton>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2.5">
                {schritt !== "vorlage" || onZurueck ? (
                  <SigButton onClick={zurueck} disabled={anlegen}><ArrowLeft className="h-4 w-4" /> Zurück</SigButton>
                ) : <span />}
                {schritt === "objekt" && (
                  <SigButton variante="primaer" disabled={!objektId || (art === "sepa_mandat" && !objekt?.creditor_id)} onClick={() => setSchritt("eigentuemer")}>
                    Weiter <ChevronRight className="h-4 w-4" />
                  </SigButton>
                )}
                {schritt === "eigentuemer" && (
                  <SigButton variante="primaer" disabled={!gewaehlt.length} onClick={() => { setVorschauFuer(null); setSchritt("vorschau"); }}>
                    Vorschau ({gewaehlt.length}) <ChevronRight className="h-4 w-4" />
                  </SigButton>
                )}
                {schritt === "vorschau" && (
                  <SigButton variante="primaer" loading={anlegen} disabled={!gewaehlt.length || !!vorschauFehler} onClick={anlegenKlick} className="px-5">
                    <FileSignature className="h-4 w-4" /> Anlegen ({gewaehlt.length})
                  </SigButton>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={fragen} onOpenChange={setFragen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{mailAnzahl} E-Mail{mailAnzahl === 1 ? "" : "s"} jetzt verschicken?</AlertDialogTitle>
            <AlertDialogDescription>
              Es werden {gewaehlt.length} Vorgänge angelegt. {mailAnzahl} Eigentümer bekommen sofort eine Einladung per E-Mail
              {gewaehlt.length - mitMail.length > 0 ? `, für ${gewaehlt.length - mitMail.length} erhalten Sie Links zum Selbstverschicken` : ""}.
              Verschickte E-Mails lassen sich nicht zurückholen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="bg-[#B35300] hover:bg-[#9A4700]" onClick={anlegenJetzt}>
              Anlegen und {mailAnzahl} E-Mail{mailAnzahl === 1 ? "" : "s"} senden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function WahlZeile({ icon, titel, text, onClick }: { icon: ReactNode; titel: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-[#E5E5E5] bg-white px-4 py-4 text-left transition-colors hover:border-[#ee7202] hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ee7202]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFF7ED] text-[#B35300]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[#2B2B2B]">{titel}</span>
        <span className="block text-[12.5px] leading-snug text-[#6B6B6B]">{text}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#B35300]" />
    </button>
  );
}

function Hinweis({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-[#FFF7ED] px-3 py-2 text-[13px] text-[#B35300]">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{children}</span>
    </div>
  );
}

function EigentuemerZeile({
  e, art, auswahl, onAn, onAendern,
}: {
  e: VorlageEigentuemer;
  art: VorlageArt | null;
  auswahl: Auswahl | null;
  onAn: (an: boolean) => void;
  onAendern: (p: Partial<Auswahl>) => void;
}) {
  const an = !!auswahl;
  const laufend = e.laufend.filter((l) => l.dokumentart === art);
  return (
    <li className={cn("flex flex-col gap-2 px-2 py-2.5 sm:flex-row sm:items-center sm:gap-3", an && "bg-[#FFFBF6]")}>
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
        <Checkbox
          checked={an}
          onCheckedChange={(v) => onAn(!!v)}
          className="mt-0.5 data-[state=checked]:border-[#B35300] data-[state=checked]:bg-[#B35300]"
          aria-label={`${e.name} auswählen`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[14px] font-semibold text-[#2B2B2B]">{e.name}</span>
            <span className="text-[12.5px] text-[#6B6B6B]">Einheit {einheitenText(e)}</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-[12.5px]">
            {e.email ? (
              <span className="inline-flex items-center gap-1 text-[#1E6B34]"><Check className="h-3.5 w-3.5" /> {e.email}</span>
            ) : (
              <span className="text-[#B35300]">keine E-Mail hinterlegt</span>
            )}
            {art === "sepa_mandat" && e.mandat && (
              <span className="text-[#6B6B6B]">· Mandat {e.mandat.mandatsreferenz}{e.mandat.mit_iban ? "" : " (ohne IBAN)"}</span>
            )}
            {laufend.length > 0 && <span className="font-semibold text-[#B35300]">· läuft schon ({laufend.map((l) => l.nummer).join(", ")})</span>}
          </span>
        </span>
      </label>
      {an && (
        <div className="flex flex-wrap items-center gap-1.5 pl-8 sm:pl-0">
          {e.personen.length >= 2 && (
            <label className="mr-1 flex items-center gap-1.5 text-[12.5px] text-[#595959]" title={e.personen.slice(0, 2).map((p) => p.name).join(" und ")}>
              <Checkbox
                checked={auswahl!.beide}
                onCheckedChange={(v) => onAendern({ beide: !!v })}
                className="data-[state=checked]:border-[#B35300] data-[state=checked]:bg-[#B35300]"
              />
              beide unterschreiben
            </label>
          )}
          <div className="flex gap-1" role="radiogroup" aria-label={`Versand an ${e.name}`}>
            {([["mail", "Per E-Mail"], ["link", "Link selbst"]] as const).map(([w, t]) => {
              const aktiv = auswahl!.versand === w;
              const gesperrt = w === "mail" && !e.email;
              return (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={aktiv}
                  disabled={gesperrt}
                  title={gesperrt ? "Keine E-Mail-Adresse hinterlegt" : undefined}
                  onClick={() => onAendern({ versand: w })}
                  className={cn(
                    "h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    aktiv ? "border-[#ee7202] bg-[#FFF7ED] text-[#B35300]" : "border-[#E5E5E5] bg-white text-[#595959] hover:bg-[#FAFAFA]",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </li>
  );
}
