/**
 * Reiter „Von uns zu unterschreiben“ (Mockup v10, Fall B).
 *
 * Links die eingehenden Dokumente (aus „Zur Unterschrift“ in der Mail-Ansicht),
 * in der Mitte das PDF mit verschiebbarem Unterschriftsfeld (gestrichelt orange,
 * davor auf Wunsch „Ort, Datum“), rechts „Selbst unterschreiben“: hinterlegte
 * Unterschrift, Antwort-Mail an den Absender und DMS-Ablage.
 *
 * Gestempelt wird im Browser (src/lib/pdfSign.ts, wie „Unterschreiben“ am Mail-Anhang),
 * gespeichert, abgelegt und versendet über sign-request › complete_incoming.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMySignature } from "@/lib/documentSigning";
import { normalizeSignatureFields } from "@/lib/emailSignature";
import { loadPdfLib, stampPdf, TEXT_LINE_HEIGHT, trimSignatureDataUrl, type SignItem } from "@/lib/pdfSign";
import { cn } from "@/lib/utils";
import { formatDate, signAction, useSignInvalidate, type Dokumentart, type SignRequest } from "@/lib/signatur";
import { Abschnitt, SigButton } from "./ui";
import { LazySeite, PdfDocument, PdfPage, seitenGroessen, useElementBreite } from "./pdf";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** DMS-Ordner je Dokumentart (wie supabase/functions/_shared/signatur/basis.ts DMS_SLUG). */
const DMS_SLUG: Record<Dokumentart, string> = {
  verwaltervertrag: "stammakte-verwaltervertrag",
  protokoll: "versammlung-protokolle",
  vollmacht: "versammlung",
  umlaufbeschluss: "versammlung-beschluesse",
  angebot: "dienstleister-angebote",
  dienstleistervertrag: "dienstleister-wartung",
  abnahme: "dienstleister-pruefberichte",
  sonstiges: "schriftverkehr",
  sepa_mandat: "stammakte-bank",
  stammdatenblatt: "eigentuemer",
};

const ORT_KEY = "rgi-sign-place";
const leseOrt = () => {
  try {
    return localStorage.getItem(ORT_KEY) || "Pfronten";
  } catch {
    return "Pfronten";
  }
};
const heute = () => new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

const ORT_SCHRIFT = 10; // pt
const FELD_BREITE = 150; // pt
const FELD_MAX_HOEHE = 56; // pt

let messCtx: CanvasRenderingContext2D | null = null;
const textBreite = (text: string, size: number) => {
  if (!messCtx) messCtx = document.createElement("canvas").getContext("2d");
  if (!messCtx) return text.length * size * 0.55;
  messCtx.font = `${size}px Helvetica, Arial, sans-serif`;
  return Math.max(size, messCtx.measureText(text || " ").width);
};

/** „Auftragsbestätigung Dachrinne.pdf“ → „Auftragsbestaetigung_Dachrinne_unterschrieben.pdf“ (wie der Server). */
const unterschriebenName = (name: string) => {
  const basis = String(name || "Dokument").replace(/\.pdf$/i, "").replace(/_unterschrieben$/i, "");
  const sauber = basis.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue").replace(/ß/g, "ss").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 90);
  return `${sauber || "Dokument"}_unterschrieben.pdf`;
};

const aw = (betreff: string | null | undefined) => {
  const b = (betreff || "").trim();
  if (!b) return "AW: Unterschriebenes Dokument";
  return /^(aw|re|antw)\s*:/i.test(b) ? b : `AW: ${b}`;
};

const zuBase64 = (bytes: Uint8Array) => {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
};

interface Feld {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

// =====================================================================

export function EingehendAnsicht({
  vorgaenge, auswahl, onAuswahl,
}: {
  vorgaenge: SignRequest[];
  auswahl: string | null;
  onAuswahl: (id: string | null) => void;
}) {
  const { user } = useAuth();
  const offen = useMemo(
    () =>
      [...vorgaenge]
        .filter((v) => v.status === "offen")
        .sort(
          (a, b) =>
            Number(b.zugewiesen_an === user?.id) - Number(a.zugewiesen_an === user?.id) ||
            (a.frist ?? "9999").localeCompare(b.frist ?? "9999"),
        ),
    [vorgaenge, user?.id],
  );
  const aktiv = offen.find((v) => v.id === auswahl) ?? offen[0] ?? null;

  useEffect(() => {
    if (aktiv && aktiv.id !== auswahl) onAuswahl(aktiv.id);
  }, [aktiv, auswahl, onAuswahl]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_400px]">
      {/* ---------- Liste ---------- */}
      <div className="space-y-3">
        {offen.map((v) => {
          const an = v.id === aktiv?.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onAuswahl(v.id)}
              className={cn(
                "block w-full rounded-xl bg-white text-left transition-colors",
                an ? "border-2 border-[#ee7202] px-[15px] py-[11px]" : "border border-[#E5E5E5] px-4 py-3 hover:bg-[#FAFAFA]",
              )}
            >
              <div className="break-words text-[14px] font-semibold leading-snug text-[#2B2B2B]">{v.titel}</div>
              <div className="mt-1 truncate text-[12.5px] leading-snug text-[#595959]">von {v.quelle_label || v.antwort_an || "unbekannt"}</div>
              <div className="truncate text-[12.5px] leading-snug text-[#595959]">
                {[v.building?.name, v.frist ? `bis ${formatDate(v.frist)}` : null].filter(Boolean).join(" · ")}
              </div>
            </button>
          );
        })}
        <p className="px-0.5 text-[12.5px] leading-relaxed text-[#6B6B6B]">
          Neue Einträge entstehen über „Zur Unterschrift“ in der E-Mail-Ansicht.
        </p>
        {aktiv && <EntfernenLink r={aktiv} />}
      </div>

      {aktiv ? (
        <Arbeitsflaeche key={aktiv.id} r={aktiv} onFertig={() => onAuswahl(offen.find((v) => v.id !== aktiv.id)?.id ?? null)} />
      ) : (
        <div className="flex min-h-[420px] items-center justify-center rounded-xl bg-[#EDEDED] px-6 text-center text-[14px] text-[#595959] xl:col-span-2">
          Zurzeit liegt nichts zur Unterschrift vor.
        </div>
      )}
    </div>
  );
}

/** Eintrag zurückziehen, wenn die Unterschrift nicht mehr nötig ist (z. B. per DocuSign erledigt). */
function EntfernenLink({ r }: { r: SignRequest }) {
  const invalidate = useSignInvalidate();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="px-0.5 text-[12px] text-[#6B6B6B] underline underline-offset-2 hover:text-[#2B2B2B] disabled:opacity-50"
      onClick={async () => {
        if (!confirm(`„${r.titel}“ aus der Liste entfernen? Es wird nichts unterschrieben oder versendet.`)) return;
        setBusy(true);
        try {
          await signAction("withdraw", { request_id: r.id });
          toast.success("Eintrag entfernt");
          await invalidate();
        } catch (e: any) {
          toast.error(e?.message || "Entfernen fehlgeschlagen");
        } finally {
          setBusy(false);
        }
      }}
    >
      Ausgewählten Eintrag entfernen
    </button>
  );
}

// =====================================================================

function Arbeitsflaeche({ r, onFertig }: { r: SignRequest; onFertig: () => void }) {
  const { user } = useAuth();
  const invalidate = useSignInvalidate();
  const { data: meineUnterschrift, isLoading: unterschriftLaedt } = useMySignature();
  const signer = r.signers.find((s) => s.methode === "intern") ?? null;
  const fremd = !!signer?.user_id && signer.user_id !== user?.id;

  // ---------- Daten ----------
  const { data: quelleUrl, error: urlFehler } = useQuery({
    queryKey: ["signatur", "eingehend-url", r.id],
    queryFn: async () => (await signAction<{ quelle: string | null }>("urls", { request_id: r.id }))?.quelle ?? null,
    staleTime: 8 * 60_000,
  });
  const { data: mail } = useQuery({
    queryKey: ["signatur", "eingehend-mail", r.email_id],
    enabled: !!r.email_id,
    queryFn: async () => {
      const { data: e } = await db.from("emails").select("id, subject, account_id, from_address").eq("id", r.email_id).maybeSingle();
      let gruss: string | null = null;
      if (e?.account_id) {
        const { data: a } = await db.from("email_accounts").select("signature_fields, email_address").eq("id", e.account_id).maybeSingle();
        if (a?.signature_fields) gruss = normalizeSignatureFields(a.signature_fields, a.email_address).greeting.trim() || null;
      }
      return { subject: (e?.subject as string | null) ?? null, gruss };
    },
    staleTime: 10 * 60_000,
  });
  const { data: anhangName } = useQuery({
    queryKey: ["signatur", "eingehend-anhang", r.quelle_id],
    enabled: !!r.quelle_id,
    queryFn: async () => {
      const { data } = await db.from("email_attachments").select("file_name").eq("id", r.quelle_id).maybeSingle();
      return (data?.file_name as string | undefined) ?? `${r.titel}.pdf`;
    },
    staleTime: Infinity,
  });
  const { data: ordner = [] } = useQuery({
    queryKey: ["signatur", "dms-ordner", r.building_id],
    enabled: !!r.building_id,
    queryFn: async () => {
      const { data } = await db.from("building_file_categories").select("id, name, slug, parent_id").eq("building_id", r.building_id);
      const liste = (data ?? []) as { id: string; name: string; slug: string | null; parent_id: string | null }[];
      const byId = new Map(liste.map((c) => [c.id, c]));
      return liste
        .map((c) => ({ ...c, pfad: c.parent_id && byId.get(c.parent_id) ? `${byId.get(c.parent_id)!.name} › ${c.name}` : c.name }))
        .sort((a, b) => a.pfad.localeCompare(b.pfad, "de"));
    },
    staleTime: 10 * 60_000,
  });

  // ---------- Unterschrift (zugeschnitten) ----------
  const [sig, setSig] = useState<{ dataUrl: string; aspect: number } | null>(null);
  useEffect(() => {
    let weg = false;
    if (!meineUnterschrift) {
      setSig(null);
      return;
    }
    trimSignatureDataUrl(meineUnterschrift)
      .then((t) => !weg && setSig({ dataUrl: t.dataUrl, aspect: t.width / Math.max(1, t.height) }))
      .catch(() => !weg && setSig({ dataUrl: meineUnterschrift, aspect: 3 }));
    return () => {
      weg = true;
    };
  }, [meineUnterschrift]);

  // ---------- Formular ----------
  const [ortDatum, setOrtDatum] = useState(true);
  const [ort, setOrt] = useState(leseOrt);
  const [ortBearbeiten, setOrtBearbeiten] = useState(false);
  const [an, setAn] = useState(r.antwort_an ?? "");
  const [betreff, setBetreff] = useState(aw(r.mail_betreff));
  const [text, setText] = useState(`Sehr geehrte Damen und Herren,\n\nanbei die unterschriebene ${r.titel} zurück.\n\nMit freundlichen Grüßen`);
  const textGesetzt = useRef(false);
  useEffect(() => {
    if (!mail || textGesetzt.current) return;
    textGesetzt.current = true;
    if (mail.subject) setBetreff(aw(mail.subject));
    if (mail.gruss) setText(`Sehr geehrte Damen und Herren,\n\nanbei die unterschriebene ${r.titel} zurück.\n\n${mail.gruss}`);
  }, [mail, r.titel]);
  const [dms, setDms] = useState(!!r.building_id);
  const [ordnerId, setOrdnerId] = useState<string>("");
  const [ordnerWahl, setOrdnerWahl] = useState(false);
  useEffect(() => {
    if (ordnerId || !ordner.length) return;
    const slug = DMS_SLUG[r.dokumentart] ?? "schriftverkehr";
    setOrdnerId((ordner.find((o) => o.slug === slug) ?? ordner.find((o) => o.slug === "schriftverkehr"))?.id ?? "");
  }, [ordner, ordnerId, r.dokumentart]);
  const ordnerName = ordner.find((o) => o.id === ordnerId)?.name;
  const [busy, setBusy] = useState<"senden" | "speichern" | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  // ---------- PDF + Feld ----------
  const [seiten, setSeiten] = useState<{ w: number; h: number }[]>([]);
  const [pdfFehler, setPdfFehler] = useState<string | null>(null);
  const box = useElementBreite<HTMLDivElement>();
  const maxW = Math.max(1, ...seiten.map((s) => s.w));
  const scale = box.breite > 0 ? Math.min(1.4, (box.breite - 40) / maxW) : 0.7;
  const [feld, setFeld] = useState<Feld | null>(null);

  const feldGroesse = (aspect: number) => {
    let w = FELD_BREITE;
    let h = w / aspect;
    if (h > FELD_MAX_HOEHE) {
      h = FELD_MAX_HOEHE;
      w = h * aspect;
    }
    return { w, h };
  };

  // Startposition: letzte Seite, unten links (wie im Mockup)
  useEffect(() => {
    if (feld || !seiten.length || !sig) return;
    const page = seiten.length - 1;
    const s = seiten[page];
    const { w, h } = feldGroesse(sig.aspect);
    setFeld({ page, w, h, x: Math.round(s.w * 0.12), y: Math.round(Math.min(s.h - h - 40, s.h * 0.72)) });
  }, [seiten, sig, feld]);

  // Beim Wechsel zur letzten Seite scrollen, damit das Feld sichtbar ist
  const gescrollt = useRef(false);
  useEffect(() => {
    if (!feld || gescrollt.current || !box.el.current) return;
    gescrollt.current = true;
    const el = box.el.current.querySelector<HTMLElement>(`[data-seite="${feld.page}"]`);
    if (el && feld.page > 0) box.el.current.scrollTop = el.offsetTop + feld.y * scale - box.el.current.clientHeight / 2;
  }, [feld, scale, box.el]);

  const ortText = `${ort.trim() || "Pfronten"}, ${heute()}`;
  const ortH = ORT_SCHRIFT * TEXT_LINE_HEIGHT;
  const ortW = textBreite(ortText, ORT_SCHRIFT);

  const drag = useRef<{ mode: "move" | "resize"; sx: number; sy: number; orig: Feld } | null>(null);
  const onDown = (e: React.PointerEvent, mode: "move" | "resize") => {
    if (!feld) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* egal */
    }
    drag.current = { mode, sx: e.clientX, sy: e.clientY, orig: { ...feld } };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = seiten[d.orig.page];
    if (!s) return;
    const dx = (e.clientX - d.sx) / scale;
    const dy = (e.clientY - d.sy) / scale;
    if (d.mode === "move") {
      const minY = ortDatum ? ortH + 2 : 0;
      setFeld({
        ...d.orig,
        x: Math.max(0, Math.min(s.w - d.orig.w, d.orig.x + dx)),
        y: Math.max(minY, Math.min(s.h - d.orig.h, d.orig.y + dy)),
      });
    } else {
      const aspect = d.orig.w / d.orig.h;
      const w = Math.max(40, Math.min(s.w - d.orig.x, d.orig.w + dx));
      const h = Math.min(s.h - d.orig.y, w / aspect);
      setFeld({ ...d.orig, w: h * aspect, h });
    }
  };
  const onUp = () => {
    drag.current = null;
  };
  /** Klick auf eine Seite setzt das Feld dorthin. */
  const setzen = (page: number, px: number, py: number) => {
    if (!feld) return;
    const s = seiten[page];
    if (!s) return;
    const minY = ortDatum ? ortH + 2 : 0;
    setFeld({
      ...feld,
      page,
      x: Math.max(0, Math.min(s.w - feld.w, px - feld.w / 2)),
      y: Math.max(minY, Math.min(s.h - feld.h, py - feld.h / 2)),
    });
  };

  // ---------- Unterschreiben ----------
  const ausfuehren = async (senden: boolean) => {
    setFehler(null);
    if (!sig) return setFehler("Bitte zuerst eine eigene Unterschrift hinterlegen.");
    if (!feld) return setFehler("Bitte das Unterschriftsfeld im Dokument platzieren.");
    if (senden && !an.trim()) return setFehler("Bitte eine Empfänger-Adresse angeben.");
    if (senden && !text.trim()) return setFehler("Bitte einen Text für die Antwort eingeben.");
    setBusy(senden ? "senden" : "speichern");
    try {
      const url = (await signAction<{ quelle: string | null }>("urls", { request_id: r.id }))?.quelle;
      if (!url) throw new Error("Dokument konnte nicht geladen werden.");
      const res = await fetch(url);
      if (!res.ok) throw new Error("Dokument konnte nicht geladen werden.");
      const quelle = new Uint8Array(await res.arrayBuffer());
      const items: SignItem[] = [{ id: "sig", kind: "image", dataUrl: sig.dataUrl, ...feld }];
      if (ortDatum) {
        items.push({
          id: "ort", kind: "text", text: ortText, fontSize: ORT_SCHRIFT, page: feld.page,
          x: feld.x, y: Math.max(0, feld.y - ortH - 2), w: ortW, h: ortH,
        });
      }
      const lib = await loadPdfLib();
      const out = await stampPdf(lib, quelle, items);
      const ergebnis = await signAction<{ ok: boolean; nummer: string; gesendet: boolean; file_id: string | null }>("complete_incoming", {
        request_id: r.id,
        pdf_base64: zuBase64(out),
        placements: items.map(({ id: _id, ...p }) => ({
          kind: p.kind, page: p.page, x: p.x, y: p.y, w: p.w, h: p.h, ...(p.kind === "text" ? { text: p.text } : {}),
        })),
        ort_datum: ortDatum ? ortText : null,
        dms: dms && !!r.building_id,
        dms_kategorie_id: ordnerId || null,
        antwort: { senden, an: an.trim(), betreff: betreff.trim(), text },
      });
      try {
        localStorage.setItem(ORT_KEY, ort.trim() || "Pfronten");
      } catch {
        /* egal */
      }
      toast.success(
        ergebnis.gesendet ? `Unterschrieben an ${an.trim()} zurückgesendet` : "Unterschrieben und gespeichert",
        { description: [r.nummer, ergebnis.file_id ? "im DMS abgelegt" : null].filter(Boolean).join(" · ") },
      );
      await invalidate();
      onFertig();
    } catch (e: any) {
      setFehler(e?.message || "Unterschreiben fehlgeschlagen");
      toast.error(e?.message || "Unterschreiben fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  };

  const gesperrt = fremd || !sig || !!busy;
  const dateiErgebnis = unterschriebenName(anhangName ?? `${r.titel}.pdf`);

  return (
    <>
      {/* ---------- PDF ---------- */}
      <div
        ref={box.ref}
        className="relative h-[calc(100vh-290px)] min-h-[560px] overflow-auto rounded-xl bg-[#EDEDED] px-5 py-6"
      >
        {urlFehler || pdfFehler ? (
          <div className="flex flex-col items-center gap-2 py-20 text-center text-sm text-[#595959]">
            <AlertCircle className="h-8 w-8 text-[#B35300]" />
            Das Dokument kann nicht angezeigt werden.
            <span className="text-xs text-[#6B6B6B]">{pdfFehler || (urlFehler as Error)?.message}</span>
          </div>
        ) : !quelleUrl ? (
          <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#6B6B6B]" /></div>
        ) : (
          <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#6B6B6B]" /></div>}>
            <PdfDocument
              file={quelleUrl}
              onLoadSuccess={async (pdf: any) => {
                try {
                  setSeiten(await seitenGroessen(pdf));
                } catch (e: any) {
                  setPdfFehler(e?.message || "PDF konnte nicht gelesen werden");
                }
              }}
              onLoadError={(e: Error) => setPdfFehler(e?.message || "PDF konnte nicht gelesen werden")}
              loading={<div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#6B6B6B]" /></div>}
              className="flex flex-col items-center gap-5"
            >
              {seiten.map((size, idx) => (
                <div key={idx} data-seite={idx} className="relative" style={{ width: size.w * scale, height: size.h * scale }}>
                  <LazySeite width={size.w * scale} height={size.h * scale} rootEl={box.el.current}>
                    <PdfPage
                      pageNumber={idx + 1}
                      width={size.w * scale}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      loading={<div style={{ width: size.w * scale, height: size.h * scale }} className="bg-white" />}
                    />
                  </LazySeite>
                  <div
                    className={cn("absolute inset-0", !gesperrt && "cursor-crosshair")}
                    onClick={(e) => {
                      if (gesperrt) return;
                      const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setzen(idx, (e.clientX - b.left) / scale, (e.clientY - b.top) / scale);
                    }}
                  >
                    {feld && feld.page === idx && sig && (
                      <>
                        {ortDatum && (
                          ortBearbeiten ? (
                            <input
                              autoFocus
                              className="absolute rounded-sm border border-[#ee7202] bg-white px-0.5 text-[#0A0A1F] outline-none"
                              style={{
                                left: feld.x * scale, top: (feld.y - ortH - 2) * scale - 2, width: Math.max(ortW, 90) * scale + 8,
                                height: ortH * scale + 4, fontSize: ORT_SCHRIFT * scale, fontFamily: "Helvetica, Arial, sans-serif",
                              }}
                              value={ort}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setOrt(e.target.value)}
                              onBlur={() => setOrtBearbeiten(false)}
                              onKeyDown={(e) => e.key === "Enter" && setOrtBearbeiten(false)}
                              aria-label="Ort"
                            />
                          ) : (
                            <button
                              type="button"
                              title="Ort ändern"
                              className="absolute whitespace-nowrap text-left leading-none text-[#0A0A1F] hover:bg-[#FFF7ED]"
                              style={{
                                left: feld.x * scale, top: (feld.y - ortH - 2) * scale, height: ortH * scale,
                                fontSize: ORT_SCHRIFT * scale, fontFamily: "Helvetica, Arial, sans-serif",
                                lineHeight: `${ortH * scale}px`,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!gesperrt) setOrtBearbeiten(true);
                              }}
                            >
                              {ortText}
                            </button>
                          )
                        )}
                        <div
                          className={cn("absolute select-none touch-none rounded-[3px] border-2 border-dashed border-[#ee7202]", !gesperrt && "cursor-move")}
                          style={{ left: feld.x * scale - 4, top: feld.y * scale - 4, width: feld.w * scale + 8, height: feld.h * scale + 8 }}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => !gesperrt && onDown(e, "move")}
                          onPointerMove={onMove}
                          onPointerUp={onUp}
                          onPointerCancel={onUp}
                          title="Unterschrift verschieben"
                        >
                          <img src={sig.dataUrl} alt="Unterschrift" draggable={false} className="pointer-events-none absolute" style={{ left: 2, top: 2, width: feld.w * scale, height: feld.h * scale }} />
                          {!gesperrt && (
                            <div
                              className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border-2 border-white bg-[#ee7202] shadow"
                              style={{ cursor: "nwse-resize" }}
                              onPointerDown={(e) => onDown(e, "resize")}
                              onPointerMove={onMove}
                              onPointerUp={onUp}
                              onPointerCancel={onUp}
                              title="Größe ändern"
                            />
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </PdfDocument>
          </Suspense>
        )}
      </div>

      {/* ---------- Selbst unterschreiben ---------- */}
      <div className="flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-[#E5E5E5] bg-white lg:col-span-2 xl:col-span-1 xl:h-[calc(100vh-290px)]">
        <div className="border-b border-[#E5E5E5] px-5 pb-3.5 pt-4">
          <h2 className="font-display text-[20px] font-normal leading-tight text-[#2B2B2B]">Selbst unterschreiben</h2>
          <p className="mt-1 text-[13px] text-[#595959]">Feld im Dokument ziehen, Unterschrift wird eingesetzt.</p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {fremd && (
            <div className="rounded-lg bg-[#FFF7ED] px-3.5 py-2.5 text-[13px] leading-snug text-[#2B2B2B]">
              Zugewiesen an <strong>{signer?.name}</strong>. Unterschreiben kann nur, wer zugewiesen ist – mit der eigenen hinterlegten Unterschrift.
            </div>
          )}

          <div className="flex items-center gap-4 rounded-xl border border-[#E5E5E5] px-4 py-3">
            <div className="flex h-[64px] w-[130px] shrink-0 items-center justify-center">
              {unterschriftLaedt ? (
                <Loader2 className="h-5 w-5 animate-spin text-[#6B6B6B]" />
              ) : sig ? (
                <img src={sig.dataUrl} alt="Meine hinterlegte Unterschrift" className="max-h-[64px] max-w-[130px] object-contain" />
              ) : (
                <span className="text-[12.5px] text-[#6B6B6B]">keine</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold leading-snug text-[#2B2B2B]">Meine hinterlegte Unterschrift</div>
              <Link to="/settings?tab=profil" className="text-[12.5px] font-medium text-[#B35300] underline underline-offset-2">
                {sig ? "ändern" : "jetzt hinterlegen"}
              </Link>
            </div>
          </div>

          <label className="flex items-center gap-3 text-[14px] text-[#2B2B2B]">
            <Checkbox
              checked={ortDatum}
              onCheckedChange={(v) => setOrtDatum(!!v)}
              className="h-5 w-5 rounded-[4px] border-[#B35300] data-[state=checked]:border-[#B35300] data-[state=checked]:bg-[#B35300]"
            />
            Ort und Datum davor setzen
          </label>

          <div>
            <Abschnitt className="mb-2">Antwort-Mail</Abschnitt>
            <div className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] px-4 py-3 text-[13.5px] text-[#2B2B2B]">
              <label className="flex items-baseline gap-1">
                <span className="shrink-0 text-[#6B6B6B]">An:</span>
                <input
                  className="min-w-0 flex-1 bg-transparent outline-none focus:underline focus:decoration-[#ee7202]"
                  value={an}
                  onChange={(e) => setAn(e.target.value)}
                  placeholder="E-Mail-Adresse"
                  aria-label="Empfänger"
                />
              </label>
              <label className="mt-1.5 flex items-baseline gap-1">
                <span className="shrink-0 text-[#6B6B6B]">Betreff:</span>
                <input
                  className="min-w-0 flex-1 bg-transparent outline-none focus:underline focus:decoration-[#ee7202]"
                  value={betreff}
                  onChange={(e) => setBetreff(e.target.value)}
                  aria-label="Betreff"
                />
              </label>
              <div className="my-2.5 border-t border-[#E5E5E5]" />
              <textarea
                className="block w-full resize-none bg-transparent leading-relaxed outline-none"
                rows={Math.min(9, Math.max(4, text.split("\n").length + 1))}
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label="Text der Antwort"
              />
              <div className="mt-1.5 break-all text-[13px] font-semibold text-[#B35300]">Anhang: {dateiErgebnis}</div>
            </div>
          </div>

          <div>
            <label className={cn("flex items-start gap-3 text-[14px] leading-snug", r.building_id ? "text-[#2B2B2B]" : "text-[#9A9A9A]")}>
              <Checkbox
                checked={dms && !!r.building_id}
                disabled={!r.building_id}
                onCheckedChange={(v) => setDms(!!v)}
                className="mt-0.5 h-5 w-5 rounded-[4px] border-[#B35300] data-[state=checked]:border-[#B35300] data-[state=checked]:bg-[#B35300]"
              />
              <span>
                {r.building_id ? (
                  <>
                    Im DMS ablegen ({r.building?.name}
                    {ordnerName && (
                      <>
                        {" › "}
                        <button
                          type="button"
                          className="hover:text-[#B35300] hover:underline"
                          title="Ordner ändern"
                          onClick={(e) => {
                            e.preventDefault();
                            setOrdnerWahl((x) => !x);
                          }}
                        >
                          {ordnerName}
                        </button>
                      </>
                    )}
                    )
                  </>
                ) : (
                  "Im DMS ablegen (kein Objekt zugeordnet)"
                )}
              </span>
            </label>
            {ordnerWahl && r.building_id && (
              <select
                className="ml-8 mt-2 h-9 w-[calc(100%-2rem)] rounded-lg border border-[#D6D6D6] bg-white px-2 text-[13px] outline-none focus:border-[#ee7202]"
                value={ordnerId}
                onChange={(e) => {
                  setOrdnerId(e.target.value);
                  setOrdnerWahl(false);
                }}
                aria-label="DMS-Ordner"
              >
                {ordner.map((o) => (
                  <option key={o.id} value={o.id}>{o.pfad}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="border-t border-[#E5E5E5] px-5 py-4">
          {fehler && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-[#FFF7ED] px-3 py-2 text-[13px] text-[#B35300]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {fehler}
            </div>
          )}
          <div className="flex gap-2.5">
            <SigButton className="w-[120px] shrink-0 leading-tight" onClick={() => ausfuehren(false)} loading={busy === "speichern"} disabled={gesperrt}>
              Nur speichern
            </SigButton>
            <SigButton variante="primaer" className="flex-1 leading-tight" onClick={() => ausfuehren(true)} loading={busy === "senden"} disabled={gesperrt}>
              Unterschrieben zurücksenden
            </SigButton>
          </div>
        </div>
      </div>
    </>
  );
}
