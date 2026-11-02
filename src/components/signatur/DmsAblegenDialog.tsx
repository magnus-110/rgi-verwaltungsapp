/**
 * „Im DMS ablegen“ – unterschriebene Endfassung eines ausgehenden Vorgangs von Hand ablegen.
 *
 * Ablauf wie beim Postfach (SaveAttachmentToBuildingDialog): Beim Öffnen wird ein Vorschlag
 * geladen (sign_requests.dms_vorschlag, sonst einmal von der Edge-Funktion dms-vorschlag
 * berechnen lassen) und vorausgewählt – Objekt bzw. für Administratoren „RGI Immobilien“
 * (Firmen-DMS), Ordner und Dateiname. Alles lässt sich ändern, dann „Ablegen“
 * (sign-request dms_ablegen).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, FolderPlus, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useIsRgiAdmin } from "@/hooks/useRgiAdmin";
import { signAction, useSignInvalidate, type DmsVorschlag, type SignRequest } from "@/lib/signatur";
import { eingabeKlasse, FeldLabel, SigButton } from "./ui";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Auswahlwert für das Firmen-DMS von RGI (nur Administratoren). */
const FIRMA = "__rgi__";
export const FIRMA_NAME = "RGI Immobilien (Firmen-DMS)";

interface Ordner {
  id: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
  sort_order: number | null;
  building_id?: string | null;
}

export interface DmsAblageErgebnis {
  file_id: string;
  ziel: string;
  ordner: string | null;
  dateiname: string;
  building_id: string | null;
  firma: boolean;
}

const mitPdf = (n: string) => (/\.pdf$/i.test(n.trim()) ? n.trim() : `${n.trim()}.pdf`);
const standardName = (titel: string) => `${titel.replace(/\.pdf$/i, "").trim()} (unterschrieben).pdf`;

/** Ordnerbaum als eingerückte Liste (wie im Postfach-Dialog). */
function flach(ordner: Ordner[]) {
  const nachEltern: Record<string, Ordner[]> = {};
  ordner.forEach((o) => (nachEltern[o.parent_id || "root"] ||= []).push(o));
  const out: { id: string; label: string }[] = [];
  const gehe = (pid: string | null, tiefe: number) => {
    (nachEltern[pid || "root"] || []).forEach((o) => {
      out.push({ id: o.id, label: `${"   ".repeat(tiefe)}${o.name}` });
      gehe(o.id, tiefe + 1);
    });
  };
  gehe(null, 0);
  return out;
}

export function DmsAblegenDialog({
  request: r, open, onOpenChange, erneut, onAbgelegt,
}: {
  request: SignRequest;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Liegt schon im DMS – bewusst eine weitere Ablage anlegen */
  erneut?: boolean;
  onAbgelegt?: (e: DmsAblageErgebnis) => void;
}) {
  const istAdmin = useIsRgiAdmin();
  const invalidate = useSignInvalidate();
  const [ziel, setZiel] = useState<string>("");
  const [ordnerId, setOrdnerId] = useState<string>("");
  const [name, setName] = useState("");
  const [sichtbarkeit, setSichtbarkeit] = useState<"intern" | "alle">("intern");
  const [benachrichtigen, setBenachrichtigen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vorschlag, setVorschlag] = useState<DmsVorschlag | null>(null);
  const [vorschlagLaedt, setVorschlagLaedt] = useState(false);
  const ordnerVorwahl = useRef<{ slug: string | null; id: string | null } | null>(null);
  const [neuOffen, setNeuOffen] = useState(false);
  const [neuName, setNeuName] = useState("");
  const [neuEltern, setNeuEltern] = useState("");
  const [neuBusy, setNeuBusy] = useState(false);

  const firma = ziel === FIRMA;

  const { data: objekte = [], isLoading: objLaedt } = useQuery({
    queryKey: ["signatur", "dms-ablage-objekte"],
    enabled: open,
    queryFn: async (): Promise<{ id: string; name: string; city: string | null }[]> => {
      const { data, error } = await db.from("buildings").select("id, name, city").order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60_000,
  });

  const { data: ordner = [], isFetching: ordnerLaedt, refetch: ordnerNeu } = useQuery({
    queryKey: ["signatur", "dms-ablage-ordner", ziel],
    enabled: open && !!ziel && (ziel !== FIRMA || istAdmin),
    queryFn: async (): Promise<Ordner[]> => {
      if (ziel === FIRMA) {
        try {
          await db.rpc("ensure_rgi_categories");
        } catch {
          /* vorhandene Ordner trotzdem lesen */
        }
        const { data, error } = await db
          .from("building_file_categories")
          .select("id, name, slug, parent_id, sort_order")
          .eq("is_company", true)
          .is("archived_at", null)
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("name");
        if (error) throw error;
        return data ?? [];
      }
      await db.rpc("ensure_stammakte_categories", { p_building_id: ziel });
      const { data, error } = await db
        .from("building_file_categories")
        .select("id, name, slug, parent_id, sort_order, building_id")
        .eq("building_id", ziel)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // Beim Öffnen: Grundwerte setzen und Vorschlag laden (oder einmal erzeugen lassen)
  useEffect(() => {
    if (!open) return;
    setFehler(null);
    setNeuOffen(false);
    setNeuName("");
    setSichtbarkeit("intern");
    setBenachrichtigen(true);
    setZiel(r.building_id ?? "");
    setOrdnerId("");
    setName(standardName(r.titel));
    setVorschlag(null);
    ordnerVorwahl.current = null;

    let abbruch = false;
    const anwenden = (v: DmsVorschlag) => {
      setVorschlag(v);
      if (v.dateiname) setName(v.dateiname);
      if (v.ziel === "firma") {
        if (!istAdmin) return; // Firmen-DMS nur für Administratoren
        setZiel(FIRMA);
        ordnerVorwahl.current = { slug: null, id: v.category_id };
      } else {
        if (v.building_id) setZiel(v.building_id);
        ordnerVorwahl.current = { slug: v.category_slug, id: null };
      }
    };
    if (r.dms_vorschlag) {
      anwenden(r.dms_vorschlag);
      return;
    }
    setVorschlagLaedt(true);
    (async () => {
      try {
        const res = await supabase.functions.invoke("dms-vorschlag", { body: { sign_request_id: r.id } });
        const v = (res.data as { vorschlag?: DmsVorschlag } | null)?.vorschlag;
        if (!abbruch && v) anwenden(v);
      } catch {
        /* ohne Vorschlag weiter – alles von Hand wählbar */
      } finally {
        if (!abbruch) setVorschlagLaedt(false);
      }
    })();
    return () => {
      abbruch = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, r.id]);

  // Vorgeschlagenen Ordner wählen, sobald die Ordner des Ziels geladen sind
  useEffect(() => {
    const v = ordnerVorwahl.current;
    if (!v || !ordner.length || ordnerLaedt) return;
    const passend = firma ? ordner[0] && ordner.every((o) => !o.building_id) : ordner[0]?.building_id === ziel;
    if (!passend) return;
    const k = v.id ? ordner.find((o) => o.id === v.id) : v.slug ? ordner.find((o) => o.slug === v.slug) : null;
    if (k) setOrdnerId(k.id);
    ordnerVorwahl.current = null;
  }, [ordner, ordnerLaedt, ziel, firma]);

  const liste = useMemo(() => flach(ordner), [ordner]);

  const zielWechseln = (v: string) => {
    setZiel(v);
    setOrdnerId("");
    setNeuOffen(false);
    // Ordner-Vorschlag (Schlüssel) auch beim anderen Objekt anwenden, wenn es ihn dort gibt
    if (vorschlag?.category_slug && v !== FIRMA) ordnerVorwahl.current = { slug: vorschlag.category_slug, id: null };
    else if (vorschlag?.ziel === "firma" && v === FIRMA) ordnerVorwahl.current = { slug: null, id: vorschlag.category_id };
  };

  const ordnerAnlegen = async () => {
    const n = neuName.trim();
    if (!n || !ziel) return;
    setNeuBusy(true);
    try {
      const eltern = neuEltern || null;
      const geschwister = ordner.filter((o) => (o.parent_id || null) === eltern);
      const sort = geschwister.reduce((m, o) => Math.max(m, o.sort_order || 0), 0) + 10;
      let modus = "weg";
      if (!firma) {
        const { data: b } = await db.from("buildings").select("management_mode").eq("id", ziel).maybeSingle();
        modus = b?.management_mode || "weg";
      }
      const { data, error } = await db
        .from("building_file_categories")
        .insert(
          firma
            ? { name: n, parent_id: eltern, building_id: null, is_company: true, management_mode: "weg", sort_order: sort }
            : { name: n, parent_id: eltern, building_id: ziel, management_mode: modus, sort_order: sort, is_recommended: false, auto_rag_enabled: false },
        )
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Ordner angelegt");
      await ordnerNeu();
      setOrdnerId(data.id);
      setNeuName("");
      setNeuOffen(false);
    } catch (e: any) {
      toast.error(`Anlegen fehlgeschlagen: ${e?.message ?? e}`);
    } finally {
      setNeuBusy(false);
    }
  };

  const ablegen = async () => {
    if (!ziel) return setFehler("Bitte wählen, wo die Endfassung abgelegt wird.");
    if (!name.trim()) return setFehler("Bitte einen Dateinamen angeben.");
    setBusy(true);
    setFehler(null);
    try {
      const res = await signAction<DmsAblageErgebnis>("dms_ablegen", {
        request_id: r.id,
        building_id: firma ? null : ziel,
        category_id: ordnerId || null,
        dateiname: mitPdf(name),
        sichtbarkeit: firma ? "intern" : sichtbarkeit,
        benachrichtigen: !firma && sichtbarkeit !== "intern" && benachrichtigen,
        erneut: !!erneut,
      });
      toast.success(`Im DMS abgelegt: ${res.ziel}${res.ordner ? ` › ${res.ordner}` : ""}`);
      await invalidate();
      onAbgelegt?.(res);
      onOpenChange(false);
    } catch (e: any) {
      setFehler(e?.message || "Ablegen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const vorschlagText = (() => {
    if (!vorschlag) return null;
    if (vorschlag.ziel === "firma" && !istAdmin) return null;
    return vorschlag.quelle === "ki" || vorschlag.quelle === "ohne_text"
      ? "Automatisch vorgeschlagen (KI) – bitte prüfen und bei Bedarf ändern."
      : "Automatisch vorgeschlagen – bitte prüfen und bei Bedarf ändern.";
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="flex max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden p-0 font-sans sm:w-[96vw] sm:max-w-[560px] sm:rounded-xl">
        <div className="border-b border-[#E5E5E5] px-6 pb-4 pt-5 pr-12">
          <DialogTitle className="flex items-center gap-2 font-display text-[22px] font-normal leading-tight text-[#2B2B2B]">
            {erneut ? "Erneut im DMS ablegen" : "Im DMS ablegen"}
            {vorschlagLaedt && <Loader2 className="h-4 w-4 animate-spin text-[#6B6B6B]" />}
          </DialogTitle>
          <DialogDescription className="mt-1 truncate text-[13px] text-[#595959]">
            {r.nummer} · {r.titel} – unterschriebene Endfassung
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {vorschlagLaedt ? (
            <div className="flex items-center gap-2 rounded-lg bg-[#FAFAFA] px-3 py-2 text-[13px] text-[#595959]">
              <Loader2 className="h-4 w-4 animate-spin" /> Vorschlag wird ermittelt …
            </div>
          ) : vorschlagText ? (
            <div className="flex items-start gap-2 rounded-lg bg-[#FFF7ED] px-3 py-2 text-[13px] leading-snug text-[#2B2B2B]">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#ee7202]" /> {vorschlagText}
            </div>
          ) : null}

          {erneut && (
            <div className="flex items-start gap-2 rounded-lg bg-[#FAFAFA] px-3 py-2 text-[13px] leading-snug text-[#595959]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B35300]" />
              Die Endfassung liegt schon im DMS. Es wird eine weitere Datei angelegt – die bisherige bleibt, wo sie ist.
            </div>
          )}

          <div>
            <FeldLabel htmlFor="dms-ziel">{istAdmin ? "Objekt oder RGI" : "Objekt"}</FeldLabel>
            <select id="dms-ziel" className={eingabeKlasse} value={ziel} onChange={(e) => zielWechseln(e.target.value)} disabled={objLaedt}>
              <option value="">{objLaedt ? "Lädt …" : istAdmin ? "Objekt oder RGI wählen …" : "Objekt wählen …"}</option>
              {istAdmin && <option value={FIRMA}>{FIRMA_NAME}</option>}
              {istAdmin && <option disabled>──────────</option>}
              {objekte.map((o) => (
                <option key={o.id} value={o.id}>{o.name}{o.city && !o.name.includes(o.city) ? `, ${o.city}` : ""}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <FeldLabel htmlFor="dms-ordner" className="mb-0">Ordner</FeldLabel>
              <button
                type="button"
                disabled={!ziel}
                onClick={() => {
                  setNeuEltern(ordnerId);
                  setNeuOffen((v) => !v);
                }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] font-semibold text-[#B35300] hover:bg-[#FFF7ED] disabled:text-[#9A9A9A] disabled:hover:bg-transparent"
              >
                <FolderPlus className="h-3.5 w-3.5" /> {neuOffen ? "Abbrechen" : "Neuer Ordner"}
              </button>
            </div>
            <select
              id="dms-ordner"
              className={eingabeKlasse}
              value={ordnerId}
              onChange={(e) => setOrdnerId(e.target.value)}
              disabled={!ziel || ordnerLaedt}
            >
              <option value="">{!ziel ? "Zuerst oben wählen" : ordnerLaedt ? "Lädt …" : "Ohne Ordner"}</option>
              {liste.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            {neuOffen && (
              <div className="mt-2 space-y-2 rounded-[10px] border border-[#E5E5E5] bg-[#FAFAFA] p-3">
                <div>
                  <FeldLabel htmlFor="dms-neu-eltern" className="text-[12.5px]">Übergeordneter Ordner</FeldLabel>
                  <select id="dms-neu-eltern" className={eingabeKlasse} value={neuEltern} onChange={(e) => setNeuEltern(e.target.value)}>
                    <option value="">— Hauptebene —</option>
                    {liste.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    className={eingabeKlasse}
                    value={neuName}
                    onChange={(e) => setNeuName(e.target.value)}
                    placeholder="Name des Ordners"
                    aria-label="Name des neuen Ordners"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        ordnerAnlegen();
                      }
                    }}
                  />
                  <SigButton variante="primaer" onClick={ordnerAnlegen} loading={neuBusy} disabled={!neuName.trim()}>
                    Anlegen
                  </SigButton>
                </div>
              </div>
            )}
          </div>

          <div>
            <FeldLabel htmlFor="dms-name">Dateiname</FeldLabel>
            <input id="dms-name" className={eingabeKlasse} value={name} onChange={(e) => setName(e.target.value)} maxLength={140} />
          </div>

          {!firma && (
            <div>
              <FeldLabel htmlFor="dms-sicht">Sichtbarkeit</FeldLabel>
              <select
                id="dms-sicht"
                className={eingabeKlasse}
                value={sichtbarkeit}
                onChange={(e) => setSichtbarkeit(e.target.value as "intern" | "alle")}
              >
                <option value="intern">Nur Verwaltung</option>
                <option value="alle">Alle (Eigentümer und Mieter in der App)</option>
              </select>
              {sichtbarkeit !== "intern" && (
                <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 text-[13.5px] text-[#2B2B2B]">
                  <Checkbox
                    checked={benachrichtigen}
                    onCheckedChange={(v) => setBenachrichtigen(v === true)}
                    className="mt-0.5 data-[state=checked]:border-[#B35300] data-[state=checked]:bg-[#B35300]"
                  />
                  <span>
                    Eigentümer per E-Mail benachrichtigen
                    <span className="block text-[12px] text-[#6B6B6B]">Einmal am Tag zusammengefasst – nur an Eigentümer, die „Neue Dokumente“ eingeschaltet haben.</span>
                  </span>
                </label>
              )}
            </div>
          )}
          {firma && (
            <p className="text-[12.5px] leading-snug text-[#6B6B6B]">Im Firmen-DMS sehen die Datei nur Administratoren.</p>
          )}

          {fehler && (
            <div className="flex items-start gap-2 rounded-lg bg-[#FFF7ED] px-3 py-2 text-[13px] text-[#B35300]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {fehler}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-[#E5E5E5] px-6 py-4">
          <SigButton onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</SigButton>
          <SigButton variante="primaer" className="px-5" onClick={ablegen} loading={busy} disabled={!ziel || !name.trim()}>
            Ablegen
          </SigButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
