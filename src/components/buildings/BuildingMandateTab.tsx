import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileText, Loader2, Pencil, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ibanFormatiert } from "@/lib/bankInfo";
import { ibanGueltig } from "@/lib/sepa";
import { ladeEigentuemer, mandatBereit, mandatVerfallen, type Eigentuemer, type Mandat } from "@/lib/eigentuemer";

type Filter = "alle" | "ohne" | "unvollstaendig";

/** Gläubiger-ID prüfen (DEkkZZZ…, Prüfziffer modulo 97). */
function glaeubigerIdGueltig(id: string): boolean {
  const i = id.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/.test(i)) return false;
  const kern = i.slice(7) + i.slice(0, 2) + "00";
  let rest = 0;
  for (const ch of kern) {
    const w = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const z of w) rest = (rest * 10 + Number(z)) % 97;
  }
  return String(98 - rest).padStart(2, "0") === i.slice(2, 4);
}

const datumDe = (d: string | null) => (d ? format(new Date(d), "dd.MM.yyyy") : "");
const datumIso = (t: string): string | null => {
  const m = t.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(t.trim()) ? t.trim() : null;
  const j = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${j}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};

/**
 * Gebäude › Mandate: eine Zeile je Eigentümer-Einheit, direkt bearbeitbar
 * wie eine Liste. Die Mandatsreferenz vergibt die App und ändert sie nie.
 * Kontoinhaber und IBAN werden aus den Angaben des Eigentümers übernommen.
 */
export function BuildingMandateTab({ buildingId }: { buildingId: string }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("alle");
  const [gidEdit, setGidEdit] = useState<string | null>(null);
  const [laedtHoch, setLaedtHoch] = useState<string | null>(null);
  const datei = useRef<HTMLInputElement>(null);
  const uploadFuer = useRef<Eigentuemer | null>(null);

  const { data: haus } = useQuery({
    queryKey: ["building-detail", buildingId, "glaeubiger"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("buildings").select("id, name, creditor_id").eq("id", buildingId).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: liste = [], isLoading } = useQuery({
    queryKey: ["mandate", buildingId],
    queryFn: () => ladeEigentuemer(buildingId),
  });
  const neuLaden = () => queryClient.invalidateQueries({ queryKey: ["mandate", buildingId] });

  const zeilen = useMemo(
    () =>
      liste.map((e) => {
        const m = e.mandat;
        const bereit = mandatBereit(m);
        const ohne = !m || !m.iban;
        const ibanGeaendert = !!m?.iban && !!e.iban && m.iban !== e.iban;
        return { e, m, bereit, ohne, ibanGeaendert, verfallen: !!m && mandatVerfallen(m) };
      }),
    [liste],
  );
  const sichtbar = zeilen.filter((z) => filter === "alle" || (filter === "ohne" && z.ohne) || (filter === "unvollstaendig" && !z.ohne && !z.bereit));
  const mitMandat = zeilen.filter((z) => z.bereit).length;
  const unvollstaendig = zeilen.filter((z) => !z.ohne && !z.bereit).length;

  /** Mandat anlegen (falls nötig) und ein Feld speichern. */
  const speichern = async (e: Eigentuemer, feld: "kontoinhaber" | "iban" | "unterschrieben_am", wert: string) => {
    let v: string | null = wert.trim() || null;
    if (feld === "iban" && v) {
      v = v.replace(/\s/g, "").toUpperCase();
      if (!ibanGueltig(v)) {
        toast.error("Die IBAN ist nicht gültig");
        return;
      }
    }
    if (feld === "unterschrieben_am" && v) {
      v = datumIso(v);
      if (!v) {
        toast.error("Datum bitte als TT.MM.JJJJ");
        return;
      }
    }
    if (e.mandat) {
      if ((e.mandat as any)[feld] === v) return;
      const { error } = await (supabase as any).from("sepa_mandates").update({ [feld]: v, updated_at: new Date().toISOString() }).eq("id", e.mandat.id);
      if (error) toast.error("Konnte nicht gespeichert werden");
    } else {
      if (!v) return;
      const { data: ref, error: e1 } = await (supabase as any).rpc("neue_mandatsreferenz", { p_building: buildingId, p_unit: e.einheit });
      if (e1) {
        toast.error("Mandatsreferenz konnte nicht vergeben werden");
        return;
      }
      const { error } = await (supabase as any).from("sepa_mandates").insert({
        building_id: buildingId,
        assignment_id: e.assignmentId,
        contact_id: e.contactId,
        mandatsreferenz: ref,
        kontoinhaber: e.kontoinhaber ?? e.name,
        iban: e.iban,
        bic: e.bic,
        quelle: "buero",
        [feld]: v,
      });
      if (error) toast.error("Mandat konnte nicht angelegt werden");
    }
    neuLaden();
  };

  /** Neues Mandat, z. B. nach IBAN-Wechsel: das alte gilt als ersetzt. */
  const neuesMandat = async (e: Eigentuemer) => {
    const { data: ref } = await (supabase as any).rpc("neue_mandatsreferenz", { p_building: buildingId, p_unit: e.einheit });
    if (e.mandat) await (supabase as any).from("sepa_mandates").update({ status: "ersetzt" }).eq("id", e.mandat.id);
    await (supabase as any).from("sepa_mandates").insert({
      building_id: buildingId,
      assignment_id: e.assignmentId,
      contact_id: e.contactId,
      mandatsreferenz: ref,
      kontoinhaber: e.kontoinhaber ?? e.name,
      iban: e.iban,
      bic: e.bic,
      quelle: "buero",
    });
    toast.success("Neues Mandat angelegt – bitte Unterschriftsdatum und Dokument ergänzen");
    neuLaden();
  };

  const hochladen = async (f: File) => {
    const e = uploadFuer.current;
    if (!e) return;
    setLaedtHoch(e.assignmentId);
    try {
      let m: Mandat | null = e.mandat;
      if (!m) {
        const { data: ref } = await (supabase as any).rpc("neue_mandatsreferenz", { p_building: buildingId, p_unit: e.einheit });
        const { data, error } = await (supabase as any)
          .from("sepa_mandates")
          .insert({ building_id: buildingId, assignment_id: e.assignmentId, contact_id: e.contactId, mandatsreferenz: ref, kontoinhaber: e.kontoinhaber ?? e.name, iban: e.iban, bic: e.bic, quelle: "scan" })
          .select("*")
          .single();
        if (error) throw error;
        m = data;
      }
      const endung = (f.name.split(".").pop() || "pdf").toLowerCase();
      const pfad = `${buildingId}/${m!.id}-${Date.now()}.${endung}`;
      const { error: e2 } = await supabase.storage.from("sepa-mandates").upload(pfad, f, { upsert: true, contentType: f.type || undefined });
      if (e2) throw e2;
      await (supabase as any).from("sepa_mandates").update({ dokument_pfad: pfad, dokument_name: f.name }).eq("id", m!.id);
      toast.success("Dokument gespeichert");
      neuLaden();
    } catch (err: any) {
      toast.error(err?.message || "Hochladen fehlgeschlagen");
    } finally {
      setLaedtHoch(null);
      uploadFuer.current = null;
    }
  };

  const oeffnen = async (pfad: string) => {
    const { data, error } = await supabase.storage.from("sepa-mandates").createSignedUrl(pfad, 120);
    if (error || !data) {
      toast.error("Dokument konnte nicht geöffnet werden");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const gidSpeichern = async () => {
    if (gidEdit == null) return;
    const v = gidEdit.replace(/\s/g, "").toUpperCase() || null;
    if (v && !glaeubigerIdGueltig(v)) {
      toast.error("Die Gläubiger-ID ist nicht gültig (Aufbau DE..ZZZ...)");
      return;
    }
    const { error } = await (supabase as any).from("buildings").update({ creditor_id: v }).eq("id", buildingId);
    if (error) {
      toast.error("Konnte nicht gespeichert werden");
      return;
    }
    setGidEdit(null);
    queryClient.invalidateQueries({ queryKey: ["building-detail", buildingId] });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    // inline-size-Eingrenzung: die breite Tabelle scrollt in ihrem Kasten statt die Seite zu verbreitern
    <div className="space-y-5 [contain:inline-size]">
      <input
        ref={datei}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          if (f) hochladen(f);
          ev.target.value = "";
        }}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm text-muted-foreground">Mit Mandat</div>
          <div className="mt-0.5 text-2xl font-bold">
            {mitMandat} von {zeilen.length}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-2 bg-green-600" style={{ width: `${zeilen.length ? Math.round((mitMandat / zeilen.length) * 100) : 0}%` }} />
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm text-muted-foreground">Unvollständig</div>
          <div className="mt-0.5 text-2xl font-bold">{unvollstaendig}</div>
          <div className="mt-1 text-xs text-muted-foreground">Datum oder IBAN fehlt</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm text-muted-foreground">Gläubiger-ID der WEG</div>
          {gidEdit != null ? (
            <div className="mt-1 flex gap-2">
              <Input autoFocus value={gidEdit} onChange={(e) => setGidEdit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && gidSpeichern()} placeholder="DE98ZZZ…" className="h-9 font-mono" />
              <Button size="sm" className="h-9" onClick={gidSpeichern}>
                OK
              </Button>
            </div>
          ) : (
            <button type="button" onClick={() => setGidEdit(haus?.creditor_id ?? "")} className="mt-1 inline-flex items-center gap-1.5 font-mono text-lg font-bold hover:underline">
              {haus?.creditor_id || <span className="font-sans text-base font-medium text-amber-700">fehlt – eintragen</span>}
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          <div className="mt-1 text-xs text-muted-foreground">Ohne Gläubiger-ID kein Einzug</div>
        </div>
      </section>

      <div className="inline-flex flex-wrap gap-0.5 rounded-xl bg-muted p-1" role="group" aria-label="Filter">
        {(
          [
            ["alle", "Alle"],
            ["ohne", "Ohne Mandat"],
            ["unvollstaendig", "Unvollständig"],
          ] as [Filter, string][]
        ).map(([f, t]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn("min-h-[40px] rounded-lg px-4 text-sm font-medium", filter === f ? "bg-background font-semibold shadow-sm" : "text-muted-foreground")}
          >
            {t}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="w-16 px-3 py-2.5 font-medium">Einheit</th>
                <th className="px-3 py-2.5 font-medium">Eigentümer</th>
                <th className="w-48 px-3 py-2.5 font-medium">Kontoinhaber</th>
                <th className="w-64 px-3 py-2.5 font-medium">IBAN</th>
                <th className="px-3 py-2.5 font-medium">Mandatsreferenz</th>
                <th className="w-32 px-3 py-2.5 font-medium">Unterschrift am</th>
                <th className="px-3 py-2.5 font-medium">Dokument</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.map(({ e, m, bereit, ohne, ibanGeaendert, verfallen }) => (
                <tr key={e.assignmentId} className="border-b last:border-0">
                  <td className="px-3 py-1.5 font-semibold">{e.einheit || "–"}</td>
                  <td className="px-3 py-1.5">
                    <div className="whitespace-nowrap font-medium">{e.name}</div>
                    {m?.quelle === "eigentuemer" && <span className="whitespace-nowrap rounded bg-orange-50 px-1.5 py-0.5 text-[11px] text-orange-800 dark:bg-orange-950 dark:text-orange-200">selbst eingetragen</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <Zelle wert={m?.kontoinhaber ?? ""} platzhalter={e.kontoinhaber ?? e.name} label="Kontoinhaber" onSpeichern={(v) => speichern(e, "kontoinhaber", v)} />
                  </td>
                  <td className="min-w-[250px] px-2 py-1.5">
                    <Zelle wert={m?.iban ? ibanFormatiert(m.iban) : ""} platzhalter={e.iban ? ibanFormatiert(e.iban) : "DE…"} label="IBAN" mono onSpeichern={(v) => speichern(e, "iban", v)} />
                    {ibanGeaendert && (
                      <div className="px-2.5 pt-0.5 text-xs text-amber-800 dark:text-amber-300">
                        IBAN beim Eigentümer geändert ({ibanFormatiert(e.iban!)}) –{" "}
                        <button type="button" className="underline" onClick={() => neuesMandat(e)}>
                          neues Mandat anlegen
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-muted-foreground">{m?.mandatsreferenz ?? "wird vergeben"}</td>
                  <td className="px-2 py-1.5">
                    <Zelle wert={datumDe(m?.unterschrieben_am ?? null)} platzhalter="TT.MM.JJJJ" label="Unterschrift am" onSpeichern={(v) => speichern(e, "unterschrieben_am", v)} />
                  </td>
                  <td className="px-3 py-1.5">
                    {m?.dokument_pfad ? (
                      <button type="button" onClick={() => oeffnen(m.dokument_pfad!)} className="inline-flex max-w-[160px] items-center gap-1 truncate rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-800 hover:underline dark:bg-green-950 dark:text-green-200">
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="truncate">{m.dokument_name || "Mandat"}</span>
                      </button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={laedtHoch === e.assignmentId}
                        onClick={() => {
                          uploadFuer.current = e;
                          datei.current?.click();
                        }}
                      >
                        {laedtHoch === e.assignmentId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                        Hochladen
                      </Button>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        "inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        bereit ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" : ohne ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
                      )}
                    >
                      {verfallen ? "verfallen (36 Monate)" : bereit ? "aktiv" : ohne ? "kein Mandat" : "unvollständig"}
                    </span>
                  </td>
                </tr>
              ))}
              {sichtbar.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    {zeilen.length === 0 ? "Keine Eigentümer hinterlegt (Reiter „Personen“)." : "Keine Einträge für diesen Filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          Eigentümer und Einheiten kommen aus „Personen“. Kontoinhaber und IBAN schlägt die App aus den Angaben des Eigentümers vor (grau). Die Mandatsreferenz vergibt die App und ändert sie nie.
          Ein Mandat verfällt, wenn es 36 Monate nicht genutzt wurde.
        </div>
      </section>
    </div>
  );
}

/** Eingabefeld, das beim Verlassen speichert. */
function Zelle({ wert, platzhalter, label, mono, onSpeichern }: { wert: string; platzhalter?: string; label: string; mono?: boolean; onSpeichern: (v: string) => void }) {
  const [v, setV] = useState(wert);
  const [fokus, setFokus] = useState(false);
  const anzeige = fokus ? v : wert;
  return (
    <input
      aria-label={label}
      value={anzeige}
      placeholder={platzhalter}
      onFocus={() => {
        setV(wert);
        setFokus(true);
      }}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setFokus(false);
        if (v !== wert) onSpeichern(v);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cn(
        "h-9 w-full rounded-md border border-transparent bg-transparent px-2.5 text-sm hover:border-border hover:bg-background focus:border-primary focus:bg-background focus:outline-none",
        mono && "tabular-nums",
      )}
    />
  );
}
