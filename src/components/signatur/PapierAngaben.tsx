/**
 * „Angaben vom Papier übertragen“ auf der Seite „Papier-Unterschrift prüfen“.
 * Hat der Unterzeichner Ausfüllfelder (z. B. IBAN im SEPA-Mandat, Datum der Bestellung im
 * Verwaltervertrag), trägt das Büro die handschriftlichen Angaben hier ein. Sie gehen mit
 * accept_paper (werte) an sign-request und werden dort genauso geprüft wie beim Online-Ausfüllen.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface PapierFeld {
  id: string;
  feld_key: string;
  typ: "ankreuz" | "auswahl" | "datum" | "text" | "vorbelegt";
  beschriftung: string | null;
  gruppe: string | null;
  option: string | null;
  pflicht: boolean;
  abhaengig_von: { feld_key?: string; gruppe?: string; option?: string } | null;
  ausgangswert: string | null;
  page: number;
  y: number;
  x: number;
  reihenfolge: number | null;
}

export type PapierWerte = Record<string, string>;

export function usePapierFelder(requestId: string | undefined, signerId: string | undefined) {
  return useQuery({
    queryKey: ["signatur", "papier-felder", requestId, signerId],
    enabled: !!requestId && !!signerId,
    queryFn: async () => {
      const { data, error } = await db.from("sign_request_fields")
        .select("id, feld_key, typ, beschriftung, gruppe, option, pflicht, abhaengig_von, ausgangswert, page, y, x, reihenfolge")
        .eq("request_id", requestId).eq("signer_id", signerId).eq("ausfueller", "unterzeichner");
      if (error) throw error;
      return ((data ?? []) as PapierFeld[]).sort((a, b) =>
        (a.reihenfolge ?? 9999) - (b.reihenfolge ?? 9999) || a.page - b.page || a.y - b.y || a.x - b.x);
    },
  });
}

const aktiv = (f: PapierFeld, felder: PapierFeld[], w: PapierWerte) => {
  const a = f.abhaengig_von;
  if (!a) return true;
  if (a.feld_key) {
    const z = felder.find((x) => x.feld_key === a.feld_key);
    return !!z && w[z.id] === "ja";
  }
  const z = felder.find((x) => x.typ === "auswahl" && x.gruppe === a.gruppe && x.option === a.option);
  return !!z && w[z.id] === "ja";
};

/** Nur übermitteln, was eingetragen ist und gerade zutrifft (vorbelegt: nur wenn geändert). */
export function papierWerteFuerServer(felder: PapierFeld[], w: PapierWerte): Record<string, string | null> | null {
  const out: Record<string, string | null> = {};
  for (const f of felder) {
    const v = (w[f.id] ?? "").trim();
    if (f.typ === "vorbelegt") {
      if (v && v !== (f.ausgangswert ?? "").trim()) out[f.id] = v;
      continue;
    }
    if (!aktiv(f, felder, w)) continue;
    if (v) out[f.id] = v;
  }
  return Object.keys(out).length ? out : null;
}

export function PapierAngaben({
  felder, werte, setWerte, disabled,
}: {
  felder: PapierFeld[];
  werte: PapierWerte;
  setWerte: (fn: (w: PapierWerte) => PapierWerte) => void;
  disabled?: boolean;
}) {
  // Vorbelegte Angaben mit dem Text aus dem Dokument starten
  useEffect(() => {
    setWerte((w) => {
      const n = { ...w };
      for (const f of felder) if (f.typ === "vorbelegt" && n[f.id] === undefined) n[f.id] = f.ausgangswert ?? "";
      return n;
    });
  }, [felder, setWerte]);

  const gruppen = useMemo(() => {
    const g = new Map<string, PapierFeld[]>();
    for (const f of felder) if (f.typ === "auswahl" && f.gruppe) g.set(f.gruppe, [...(g.get(f.gruppe) ?? []), f]);
    return g;
  }, [felder]);

  if (!felder.length) return null;
  const gezeigt = new Set<string>();
  const label = "block text-[12.5px] font-semibold text-[#2B2B2B]";
  const eingabe = "mt-1 h-10 w-full rounded-lg border border-[#D6D6D6] bg-white px-3 text-[14px] outline-none focus:border-[#ee7202] disabled:bg-[#FAFAFA]";

  return (
    <div>
      <div className="mb-1 text-[13px] font-semibold">Angaben vom Papier übertragen</div>
      <p className="mb-2.5 text-[12.5px] leading-snug text-[#6B6B6B]">
        Was handschriftlich eingetragen wurde, hier übernehmen – es steht dann in der Endfassung, im Nachweis und
        (z. B. beim SEPA-Mandat) in den Stammdaten. Leer lassen, wenn nichts übernommen werden soll.
      </p>
      <div className="space-y-3">
        {felder.map((f) => {
          if (f.typ === "auswahl" && f.gruppe) {
            if (gezeigt.has(f.gruppe)) return null;
            gezeigt.add(f.gruppe);
            const opts = gruppen.get(f.gruppe) ?? [f];
            const gewaehlt = opts.find((o) => werte[o.id] === "ja")?.id ?? "";
            return (
              <fieldset key={f.gruppe} disabled={disabled}>
                <legend className={label}>{f.gruppe.charAt(0).toUpperCase() + f.gruppe.slice(1).replace(/_/g, " ")}{opts.some((o) => o.pflicht) && " *"}</legend>
                <div className="mt-1 space-y-1">
                  {opts.map((o) => (
                    <label key={o.id} className="flex items-start gap-2 text-[13.5px] leading-snug">
                      <input
                        type="radio"
                        className="mt-[3px] accent-[#B35300]"
                        name={`pp-${f.gruppe}`}
                        checked={gewaehlt === o.id}
                        onChange={() => setWerte((w) => {
                          const n = { ...w };
                          for (const x of opts) n[x.id] = x.id === o.id ? "ja" : "";
                          return n;
                        })}
                      />
                      {o.beschriftung || o.option}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          }
          if (!aktiv(f, felder, werte)) return null;
          if (f.typ === "ankreuz") {
            return (
              <label key={f.id} className="flex items-start gap-2 text-[13.5px] leading-snug">
                <input
                  type="checkbox"
                  className="mt-[3px] accent-[#B35300]"
                  disabled={disabled}
                  checked={werte[f.id] === "ja"}
                  onChange={(e) => setWerte((w) => ({ ...w, [f.id]: e.target.checked ? "ja" : "" }))}
                />
                {f.beschriftung || "Angekreuzt"}{f.pflicht && " *"}
              </label>
            );
          }
          return (
            <label key={f.id} className="block">
              <span className={label}>{f.beschriftung || (f.typ === "datum" ? "Datum" : "Angabe")}{f.pflicht && f.typ !== "vorbelegt" && " *"}</span>
              <input
                type={f.typ === "datum" ? "date" : "text"}
                className={eingabe}
                disabled={disabled}
                value={werte[f.id] ?? ""}
                onChange={(e) => setWerte((w) => ({ ...w, [f.id]: e.target.value }))}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
