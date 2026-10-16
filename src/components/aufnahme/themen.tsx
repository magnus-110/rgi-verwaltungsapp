/**
 * Aufnahme › Termin vor Ort: die Themen Heizung, Haus & Technik, Schlüssel,
 * Verwaltung & Geld sowie Beirat & Versammlung.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  HEIZARTEN,
  UNTERLAGEN,
  suchName,
  wjBeginn,
  type AufnahmeAntworten,
  type JaNein,
  type MitText,
  type Person,
  type PersonenFrage,
} from "@/lib/aufnahme";
import { Auswahl, Chip, Frage, Karte, TextFeld } from "./teile";
import type { Firma } from "./dienstleister";
import { labelZuKategorie } from "@/lib/aufnahme";

const JN = ["Ja", "Nein"] as const;
const JNW = ["Ja", "Nein", "Weiß nicht"] as const;

type Setze = <K extends keyof AufnahmeAntworten>(bereich: K, teil: Partial<NonNullable<AufnahmeAntworten[K]>>) => void;

async function gebaeudeAendern(buildingId: string, teil: Record<string, unknown>) {
  const { error } = await supabase.from("buildings").update(teil as any).eq("id", buildingId);
  if (error) toast.error("Gebäude konnte nicht aktualisiert werden: " + error.message);
}

/** Zeigt die Firma aus den Dienstleistern – oder einen Knopf zum Wählen */
function FirmaZeile({ firmen, label, frage, onWaehlen }: { firmen: Firma[]; label: string; frage: string; onWaehlen: (k: string) => void }) {
  const passend = firmen.filter((f) => f.zuordnungen.some((z) => z.kategorie === labelZuKategorie(label)));
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5">
      <span className="text-sm text-muted-foreground">{frage}</span>
      {passend.length ? (
        passend.map((f) => (
          <span key={f.contactId} className="rounded-full bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary">
            ✓ {f.name}
          </span>
        ))
      ) : (
        <span className="text-sm">Noch keine Firma</span>
      )}
      <button
        type="button"
        onClick={() => onWaehlen(label)}
        className="ml-auto h-11 rounded-lg border border-primary bg-background px-3.5 text-sm font-semibold text-primary"
      >
        {passend.length ? "Andere Firma" : "Firma wählen"}
      </button>
    </div>
  );
}

/* ───────────── Heizung ───────────── */

export function HeizungThema({
  buildingId,
  antworten,
  setze,
  firmen,
  onFirma,
}: {
  buildingId: string;
  antworten: AufnahmeAntworten;
  setze: Setze;
  firmen: Firma[];
  onFirma: (k: string) => void;
}) {
  const h = antworten.heizung ?? {};
  const s = (t: Partial<NonNullable<AufnahmeAntworten["heizung"]>>) => setze("heizung", t);
  const oel = h.art === "Öl";
  return (
    <div className="space-y-3.5">
      <Karte className="py-4">
        <div className="mb-2.5 text-[15px] font-semibold">Womit wird geheizt?</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {HEIZARTEN.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={h.art === a}
              onClick={() => {
                const neu = h.art === a ? null : a;
                s({ art: neu });
                if (neu && neu !== "Sonstiges") gebaeudeAendern(buildingId, { heating_type: neu });
              }}
              className={cn(
                "h-14 rounded-xl border text-[15px]",
                h.art === a ? "border-2 border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted",
              )}
            >
              {a}
            </button>
          ))}
        </div>
        {oel && (
          <>
            <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                Ölstand jetzt (Liter)
                <input
                  inputMode="numeric"
                  value={h.oelStand ?? ""}
                  onChange={(e) => s({ oelStand: e.target.value })}
                  className="h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Tank fasst (Liter)
                <input
                  inputMode="numeric"
                  value={h.oelKapazitaet ?? ""}
                  onChange={(e) => s({ oelKapazitaet: e.target.value })}
                  className="h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
            </div>
            <div className="mt-2 border-t border-border/60">
              <Frage label="Stimmt die Anzeige mit dem Inhalt überein?">
                <Auswahl optionen={JNW} wert={h.oelAnzeige} onChange={(v) => s({ oelAnzeige: v as JaNein })} />
              </Frage>
              <Frage
                label="Wer meldet niedrigen Ölstand an die Verwaltung?"
                letzte
                folge={
                  h.oelMelder === "Andere" ? (
                    <TextFeld label="Wer meldet den Ölstand?" platzhalter="Name eintragen" wert={h.oelMelderName} onChange={(v) => s({ oelMelderName: v })} />
                  ) : undefined
                }
              >
                <Auswahl optionen={["Hausmeister", "Beirat", "Niemand", "Andere"] as const} wert={h.oelMelder as any} onChange={(v) => s({ oelMelder: v })} />
              </Frage>
            </div>
          </>
        )}
      </Karte>

      <Karte>
        <Frage
          label="Wartungsvertrag vorhanden?"
          folge={h.wartung === "Ja" ? <FirmaZeile firmen={firmen} label="Heizung" frage="Bei wem?" onWaehlen={onFirma} /> : undefined}
        >
          <Auswahl optionen={JNW} wert={h.wartung} onChange={(v) => s({ wartung: v as JaNein })} />
        </Frage>
        <Frage label="Enthärtungsanlage vorhanden?">
          <Auswahl optionen={JN} wert={h.enthaertung as any} onChange={(v) => s({ enthaertung: v as JaNein })} />
        </Frage>
        <Frage label="Zähler auf Funk umgestellt?">
          <Auswahl optionen={JNW} wert={h.funk} onChange={(v) => s({ funk: v as JaNein })} />
        </Frage>
        <Frage label="Letzte Legionellenprüfung" letzte>
          <input
            aria-label="Letzte Legionellenprüfung"
            value={h.legionellen ?? ""}
            onChange={(e) => s({ legionellen: e.target.value })}
            placeholder="MM/JJJJ"
            className="h-11 w-40 rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus:ring-2 focus:ring-primary"
          />
        </Frage>
      </Karte>

      <Karte titel="Besonderheiten" className="pb-4">
        <TextFeld mehrzeilig label="Besonderheiten Heizung" platzhalter="Tippen oder diktieren" wert={h.besonderheiten} onChange={(v) => s({ besonderheiten: v })} />
      </Karte>
    </div>
  );
}

/* ───────────── Haus & Technik ───────────── */

export function HausThema({ antworten, setze, firmen, onFirma }: { antworten: AufnahmeAntworten; setze: Setze; firmen: Firma[]; onFirma: (k: string) => void }) {
  const h = antworten.haus ?? {};
  const s = (t: Partial<NonNullable<AufnahmeAntworten["haus"]>>) => setze("haus", t);
  return (
    <div className="space-y-3.5">
      <Karte titel="Technik und Ordnung">
        <Frage label="Aufzug vorhanden?" folge={h.aufzug === "Ja" ? <FirmaZeile firmen={firmen} label="Aufzug" frage="Wartung bei?" onWaehlen={onFirma} /> : undefined}>
          <Auswahl optionen={JN} wert={h.aufzug as any} onChange={(v) => s({ aufzug: v as JaNein })} />
        </Frage>
        <Frage
          label="Gibt es eine Hausordnung?"
          letzte
          folge={h.hausordnung === "Ja" ? <TextFeld label="Wo hängt sie?" platzhalter="Wo hängt sie / wo liegt sie?" wert={h.hausordnungOrt} onChange={(v) => s({ hausordnungOrt: v })} /> : undefined}
        >
          <Auswahl optionen={JN} wert={h.hausordnung as any} onChange={(v) => s({ hausordnung: v as JaNein })} />
        </Frage>
      </Karte>
      <Karte titel="Besonderheiten am Gemeinschaftseigentum" className="pb-4">
        <TextFeld mehrzeilig label="Besonderheiten am Gemeinschaftseigentum" platzhalter="Tippen oder diktieren – Fotos über „Festhalten“" wert={h.besonderheiten} onChange={(v) => s({ besonderheiten: v })} />
      </Karte>
      <Karte titel="Weitere laufende Verträge" className="pb-4">
        <TextFeld mehrzeilig label="Weitere laufende Verträge" platzhalter="z. B. Kabelanschluss, Rauchmelder-Miete, Müllschleuse" wert={h.vertraege} onChange={(v) => s({ vertraege: v })} />
      </Karte>
    </div>
  );
}

/* ───────────── Schlüssel ───────────── */

const SCHLUESSEL_VORSCHLAEGE = ["Hausmeister", "Beirat", "Vorverwaltung", "Reinigungsfirma", "Heizungsfirma", "Schornsteinfeger", "Feuerwehr-Schlüsseldepot"];

export function SchluesselThema({ antworten, setze }: { antworten: AufnahmeAntworten; setze: Setze }) {
  const sch = antworten.schluessel ?? {};
  const halter = sch.halter ?? [];
  const s = (t: Partial<NonNullable<AufnahmeAntworten["schluessel"]>>) => setze("schluessel", t);
  const [neu, setNeu] = useState("");
  const aendern = (i: number, d: number) =>
    s({ halter: halter.map((h, j) => (j === i ? { ...h, anzahl: Math.max(0, h.anzahl + d) } : h)).filter((h) => h.anzahl > 0) });
  const dazu = (name: string) => {
    const n = name.trim();
    if (!n) return;
    s({ halter: [...halter, { name: n, anzahl: 1 }] });
    setNeu("");
  };
  const summe = halter.reduce((x, h) => x + h.anzahl, 0);
  return (
    <div className="space-y-3.5">
      <Karte>
        <Frage
          label="Gibt es eine Schließanlage?"
          letzte
          folge={sch.anlage === "Ja" ? <TextFeld label="Wo ist die Sicherungskarte?" platzhalter="Wo ist die Sicherungskarte?" wert={sch.karte} onChange={(v) => s({ karte: v })} /> : undefined}
        >
          <Auswahl optionen={JN} wert={sch.anlage as any} onChange={(v) => s({ anlage: v as JaNein })} />
        </Frage>
      </Karte>
      <Karte className="pb-4">
        <div className="flex items-center justify-between pb-1.5 pt-3">
          <span className="text-[15px] font-semibold">Wer hat Schlüssel?</span>
          <span className="text-sm text-muted-foreground">{summe} Schlüssel unterwegs</span>
        </div>
        {halter.map((h, i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-t border-border/60 py-2">
            <span className="text-[15px] font-medium">{h.name}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => aendern(i, -1)} aria-label="Einen weniger" className="flex h-11 w-11 items-center justify-center rounded-lg border hover:bg-muted">
                <Minus className="h-5 w-5" />
              </button>
              <span className="w-7 text-center text-[17px] font-semibold">{h.anzahl}</span>
              <button type="button" onClick={() => aendern(i, 1)} aria-label="Einen mehr" className="flex h-11 w-11 items-center justify-center rounded-lg border hover:bg-muted">
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>
        ))}
        <div className="mb-2 mt-3 text-[13px] text-muted-foreground">Hinzufügen</div>
        <div className="flex flex-wrap gap-2">
          {SCHLUESSEL_VORSCHLAEGE.filter((v) => !halter.some((h) => h.name === v)).map((v) => (
            <Chip key={v} gestrichelt onClick={() => dazu(v)}>
              + {v}
            </Chip>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            dazu(neu);
          }}
        >
          <input
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
            placeholder="Andere Person, z. B. Frau Huber"
            aria-label="Andere Person"
            className="h-12 min-w-0 flex-1 rounded-xl border border-input bg-background px-3.5 text-base outline-none focus:ring-2 focus:ring-primary"
          />
          <button type="submit" className="h-12 rounded-xl border px-4 text-sm font-medium hover:bg-muted">
            Hinzufügen
          </button>
        </form>
      </Karte>
    </div>
  );
}

/* ───────────── Verwaltung & Geld ───────────── */

export function VerwaltungThema({ buildingId, antworten, setze }: { buildingId: string; antworten: AufnahmeAntworten; setze: Setze }) {
  const v = antworten.verwaltung ?? {};
  const s = (t: Partial<NonNullable<AufnahmeAntworten["verwaltung"]>>) => setze("verwaltung", t);
  const { data: geb } = useQuery({
    queryKey: ["aufnahme-gebaeude-glaeubiger", buildingId],
    queryFn: async () => {
      const { data } = await supabase.from("buildings").select("creditor_id").eq("id", buildingId).maybeSingle();
      return data;
    },
  });
  const [gid, setGid] = useState<string | null>(null);
  useEffect(() => {
    if (geb && gid === null) setGid(geb.creditor_id ?? "");
  }, [geb, gid]);

  const mitText = (key: "kredite" | "vermoegen" | "angestellte" | "bau", label: string, detail: string, platz: string, letzte?: boolean) => {
    const m: MitText = v[key] ?? {};
    return (
      <Frage
        label={label}
        letzte={letzte}
        folge={m.wert === "Ja" ? <TextFeld label={detail} platzhalter={platz} wert={m.text} onChange={(t) => s({ [key]: { ...m, text: t } } as any)} /> : undefined}
      >
        <Auswahl optionen={JNW} wert={m.wert} onChange={(w) => s({ [key]: { ...m, wert: w as JaNein } } as any)} />
      </Frage>
    );
  };

  const offen = v.offen ?? {};
  const zeilen = offen.zeilen ?? [];
  const unterlagen = v.unterlagen ?? [];

  return (
    <div className="space-y-3.5">
      <Karte titel="Grunddaten">
        <Frage
          label="Wirtschaftsjahr"
          folge={v.wj === "Anders" ? <TextFeld label="Welches Wirtschaftsjahr?" platzhalter="z. B. 01.10. – 30.09." wert={v.wjAnders} onChange={(t) => s({ wjAnders: t })} /> : undefined}
        >
          <Auswahl
            optionen={["Kalenderjahr", "01.07. – 30.06.", "Anders"] as const}
            wert={v.wj as any}
            onChange={(w) => {
              s({ wj: w });
              const b = wjBeginn(w);
              if (b) gebaeudeAendern(buildingId, { fiscal_year_start_day: b.tag, fiscal_year_start_month: b.monat });
            }}
          />
        </Frage>
        <Frage label="Gläubiger-ID der WEG" letzte>
          <input
            aria-label="Gläubiger-ID der WEG"
            value={gid ?? ""}
            onChange={(e) => setGid(e.target.value.toUpperCase().replace(/\s/g, ""))}
            onBlur={() => {
              if ((gid ?? "") !== (geb?.creditor_id ?? "")) gebaeudeAendern(buildingId, { creditor_id: gid || null });
            }}
            placeholder="DE00ZZZ00000000000"
            className="h-11 w-full max-w-xs rounded-lg border border-input bg-background px-3 font-mono text-[15px] outline-none focus:ring-2 focus:ring-primary"
          />
        </Frage>
      </Karte>

      <Karte titel="Geld und Verpflichtungen">
        {mitText("kredite", "Laufende Kredite der WEG?", "Kredite", "Bank, Höhe, Laufzeit")}
        {mitText("vermoegen", "Vermögen außer Bankkonten und Heizöl?", "Welches Vermögen?", "z. B. Rasenmäher, Streugut, Ersatzteile")}
        {mitText("angestellte", "Hat die WEG Angestellte?", "Wer macht die Lohnbuchhaltung?", "Wer macht die Lohnbuchhaltung?")}
        {mitText("bau", "Sind Baumaßnahmen geplant?", "Geplante Baumaßnahmen", "Was und wann?")}
        <Frage
          label="Gibt es offene Beschlüsse oder Vorgänge?"
          letzte
          folge={
            offen.wert === "Ja" ? (
              <div className="space-y-2">
                {zeilen.map((z, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-6 pt-3.5 text-right text-sm text-muted-foreground">{i + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <TextFeld
                        label="Offener Punkt"
                        platzhalter="Was ist offen? Tippen oder diktieren"
                        wert={z}
                        onChange={(t) => s({ offen: { ...offen, zeilen: zeilen.map((x, j) => (j === i ? t : x)) } })}
                        onEntfernen={() => s({ offen: { ...offen, zeilen: zeilen.filter((_, j) => j !== i) } })}
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => s({ offen: { ...offen, zeilen: [...zeilen, ""] } })}
                  className="ml-8 h-11 rounded-full border border-dashed px-4 text-sm font-medium hover:bg-muted"
                >
                  + {zeilen.length ? "Weitere Zeile" : "Ersten Punkt eintragen"}
                </button>
              </div>
            ) : undefined
          }
        >
          <Auswahl optionen={JNW} wert={offen.wert} onChange={(w) => s({ offen: { ...offen, wert: w as JaNein } })} />
        </Frage>
      </Karte>

      <Karte className="pb-4">
        <div className="flex items-center justify-between pb-2 pt-3">
          <span className="text-[15px] font-semibold">Was hat die Vorverwaltung schon übergeben?</span>
          <span className="text-sm text-muted-foreground">
            {unterlagen.length} von {UNTERLAGEN.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {UNTERLAGEN.map((u) => {
            const an = unterlagen.includes(u);
            return (
              <button
                key={u}
                type="button"
                aria-pressed={an}
                onClick={() => s({ unterlagen: an ? unterlagen.filter((x) => x !== u) : [...unterlagen, u] })}
                className={cn(
                  "h-11 rounded-full border px-4 text-sm",
                  an ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "border-dashed hover:bg-muted",
                )}
              >
                {an && <Check className="mr-1 inline h-4 w-4" />}
                {u}
              </button>
            );
          })}
        </div>
      </Karte>
    </div>
  );
}

/* ───────────── Beirat & Versammlung ───────────── */

interface Eigentuemer {
  assignmentId: string;
  name: string;
  einheit: string | null;
}

function useEigentuemerListe(buildingId: string) {
  return useQuery({
    queryKey: ["aufnahme-eigentuemer", buildingId],
    queryFn: async (): Promise<Eigentuemer[]> => {
      const { data } = await supabase
        .from("contact_building_assignments")
        .select("id, unit_number, first_name_override, last_name_override, company_name_override, contacts(first_name, last_name, company_name)")
        .eq("building_id", buildingId)
        .eq("role_in_building", "eigentuemer" as any)
        .neq("is_active", false);
      return (data ?? []).map((z: any) => ({
        assignmentId: z.id,
        einheit: z.unit_number,
        name:
          z.company_name_override ||
          [z.first_name_override, z.last_name_override].filter(Boolean).join(" ") ||
          z.contacts?.company_name ||
          [z.contacts?.first_name, z.contacts?.last_name].filter(Boolean).join(" ") ||
          "Eigentümer",
      }));
    },
  });
}

function PersonenListe({
  frage,
  wert,
  onChange,
  eigentuemer,
  flagge,
}: {
  frage: string;
  wert: PersonenFrage;
  onChange: (w: PersonenFrage) => void;
  eigentuemer: Eigentuemer[];
  flagge?: "is_beirat" | "is_cash_auditor";
}) {
  const personen = wert.personen ?? [];
  const setzen = (liste: Person[]) => onChange({ ...wert, personen: liste });
  const markieren = async (assignmentId: string, an: boolean) => {
    if (!flagge) return;
    const { error } = await supabase.from("contact_building_assignments").update({ [flagge]: an } as any).eq("id", assignmentId);
    if (error) toast.error("Konnte beim Eigentümer nicht vermerkt werden: " + error.message);
  };
  return (
    <div className="space-y-2.5">
      <div className="text-[13px] text-muted-foreground">{frage}</div>
      {personen.map((p, i) => {
        const q = suchName(p.name);
        const zugeordnet = p.assignmentId ? eigentuemer.find((e) => e.assignmentId === p.assignmentId) : null;
        const treffer = !zugeordnet && q.length >= 3 ? eigentuemer.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 3) : [];
        return (
          <div key={i}>
            <div className="flex flex-wrap items-start gap-2">
              <input
                aria-label="Name"
                value={p.name}
                onChange={(e) => setzen(personen.map((x, j) => (j === i ? { ...x, name: e.target.value, assignmentId: null } : x)))}
                onFocus={() => undefined}
                placeholder="Name, z. B. Herr Wolf"
                className="h-12 min-w-[180px] flex-1 rounded-xl border border-input bg-background px-3.5 text-base outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                aria-label="Wohnung"
                value={p.whg ?? ""}
                onChange={(e) => setzen(personen.map((x, j) => (j === i ? { ...x, whg: e.target.value } : x)))}
                placeholder="Wohnung (falls bekannt)"
                className="h-12 w-44 rounded-xl border border-input bg-background px-3.5 text-base outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                aria-label="Person entfernen"
                onClick={() => {
                  if (p.assignmentId) markieren(p.assignmentId, false);
                  setzen(personen.filter((_, j) => j !== i));
                }}
                className="flex h-12 w-12 items-center justify-center rounded-xl border text-muted-foreground hover:bg-muted"
              >
                ×
              </button>
            </div>
            {zugeordnet ? (
              <div className="ml-1 mt-1.5 text-[13px] text-emerald-700 dark:text-emerald-400">
                ✓ Zugeordnet: {zugeordnet.name}
                {zugeordnet.einheit ? ` · Wohnung ${zugeordnet.einheit}` : ""}
              </div>
            ) : treffer.length ? (
              <div className="ml-1 mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-muted-foreground">In der Eigentümerliste:</span>
                {treffer.map((t) => (
                  <button
                    key={t.assignmentId}
                    type="button"
                    onClick={() => {
                      setzen(personen.map((x, j) => (j === i ? { ...x, name: t.name, whg: t.einheit ?? x.whg, assignmentId: t.assignmentId } : x)));
                      markieren(t.assignmentId, true);
                    }}
                    className="h-9 rounded-full border border-emerald-600 px-3 text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300"
                  >
                    {t.name}
                    {t.einheit ? ` · ${t.einheit}` : ""}
                  </button>
                ))}
              </div>
            ) : p.name.trim() ? (
              <div className="ml-1 mt-1.5 text-[13px] text-muted-foreground">Noch nicht im System – wird zugeordnet, sobald die Eigentümerliste da ist</div>
            ) : null}
          </div>
        );
      })}
      <button type="button" onClick={() => setzen([...personen, { name: "" }])} className="h-11 rounded-full border border-dashed px-4 text-sm font-medium hover:bg-muted">
        + {personen.length ? "Weitere Person" : "Person eintragen"}
      </button>
    </div>
  );
}

export function BeiratThema({ buildingId, antworten, setze }: { buildingId: string; antworten: AufnahmeAntworten; setze: Setze }) {
  const b = antworten.beirat ?? {};
  const s = (t: Partial<NonNullable<AufnahmeAntworten["beirat"]>>) => setze("beirat", t);
  const { data: eigentuemer = [] } = useEigentuemerListe(buildingId);
  const [ort, setOrt] = useState<string | null>(null);
  useEffect(() => {
    if (ort === null) setOrt(b.etvOrt ?? "");
  }, [b.etvOrt, ort]);
  const ortSpeichern = (o: string) => {
    s({ etvOrt: o });
    gebaeudeAendern(buildingId, { etv_default_location: o || null });
  };

  const gruppe = (key: "beirat" | "kasse" | "ansprech", label: string, frage: string, flagge?: "is_beirat" | "is_cash_auditor") => {
    const w: PersonenFrage = b[key] ?? {};
    return (
      <Karte key={key}>
        <Frage
          label={label}
          letzte
          folge={w.wert === "Ja" ? <PersonenListe frage={frage} wert={w} onChange={(n) => s({ [key]: n } as any)} eigentuemer={eigentuemer} flagge={flagge} /> : undefined}
        >
          <Auswahl optionen={JN} wert={w.wert} onChange={(v) => s({ [key]: { ...w, wert: v as "Ja" | "Nein" } } as any)} />
        </Frage>
      </Karte>
    );
  };

  return (
    <div className="space-y-3.5">
      {gruppe("beirat", "Gibt es einen Beirat?", "Wer ist im Beirat?", "is_beirat")}
      {gruppe("kasse", "Gibt es Kassenprüfer?", "Wer prüft die Kasse?", "is_cash_auditor")}
      {gruppe("ansprech", "Gibt es einen Hauptansprechpartner?", "Wer ist es?")}

      <Karte titel="Eigentümerversammlung" className="pb-4">
        <label htmlFor="etv-ort" className="mb-2 mt-1 block text-[15px] font-medium">
          Wo fand die Versammlung bisher statt?
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="etv-ort"
            value={ort ?? ""}
            onChange={(e) => setOrt(e.target.value)}
            onBlur={() => (ort ?? "") !== (b.etvOrt ?? "") && ortSpeichern(ort ?? "")}
            placeholder="z. B. Gasthof Krone, Pfronten"
            className="h-12 min-w-[240px] flex-1 rounded-xl border border-input bg-background px-3.5 text-base outline-none focus:ring-2 focus:ring-primary"
          />
          {["Büro RGI", "Im Haus"].map((o) => (
            <Chip
              key={o}
              gestrichelt
              onClick={() => {
                setOrt(o);
                ortSpeichern(o);
              }}
            >
              {o}
            </Chip>
          ))}
        </div>
        <div className="mt-3 border-t border-border/60">
          <Frage label="Wann passt es den meisten?" letzte>
            <Auswahl optionen={["Vormittags", "Nachmittags", "Abends"] as const} wert={b.etvZeit as any} onChange={(v) => s({ etvZeit: v })} />
          </Frage>
        </div>
      </Karte>

      <Karte titel="Stimmung in der Gemeinschaft" className="pb-4">
        <TextFeld
          mehrzeilig
          label="Stimmung in der Gemeinschaft"
          platzhalter="Gibt es Streit, schwierige Themen oder Wünsche an die neue Verwaltung? Nur für euch sichtbar."
          wert={b.stimmung}
          onChange={(v) => s({ stimmung: v })}
        />
      </Karte>
    </div>
  );
}

export function AltAntworten({ antworten }: { antworten: AufnahmeAntworten }) {
  const alt = antworten.alt ?? [];
  const [offen, setOffen] = useState(false);
  const liste = useMemo(() => alt, [alt]);
  if (!liste.length) return null;
  return (
    <div className="rounded-2xl border border-dashed px-4 py-3">
      <button type="button" onClick={() => setOffen(!offen)} className="flex w-full items-center justify-between text-left text-sm">
        <span>
          <span className="font-medium">Aus der früheren Übernahme</span>
          <span className="text-muted-foreground"> · {liste.length} Antworten zum Nachlesen</span>
        </span>
        <span className="text-muted-foreground">{offen ? "Zuklappen" : "Anzeigen"}</span>
      </button>
      {offen && (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {liste.map((x, i) => (
            <div key={i}>
              <dt className="text-muted-foreground">{x.frage}</dt>
              <dd className="whitespace-pre-line">{x.antwort}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
