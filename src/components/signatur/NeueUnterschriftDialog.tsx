/**
 * „Neue Unterschrift“ von der Übersichtsseite aus: erst das Dokument wählen
 * (PDF hochladen oder aus den Dokumenten eines Objekts), dann öffnet sich der
 * bekannte Dialog „Unterschrift anfordern“.
 *
 * „Aus Dokumenten wählen“: Objekt-DMS; Administratoren zusätzlich das Firmen-DMS von RGI
 * (building_files.is_company, Eintrag „RGI Immobilien (Firmen-DMS)“ oben in der Objektauswahl).
 *
 * Upload: direkt in den Bucket building-files unter `_signaturen/_uploads/{uuid}.pdf`
 * (Büro-Nutzer dürfen dort laut Storage-RLS hochladen: user_has_admin_access).
 * Die Edge-Funktion kopiert die Datei beim Anlegen nach `_signaturen/{id}/quelle.pdf`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Check, ChevronLeft, ChevronRight, Eye, FileText, FolderOpen, Loader2, Search, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { dokumentartAusName, formatDate, titelAusDateiname, type QuelleTyp } from "@/lib/signatur";
import { getFileBucket } from "@/components/buildings/documents/types";
import { eingabeKlasse, FeldLabel, SigButton } from "./ui";
import { useIsRgiAdmin } from "@/hooks/useRgiAdmin";
import { UnterschriftAnfordernDialog, type UnterschriftStartInfo } from "./UnterschriftAnfordernDialog";
import { DokumentVorschauDialog, PdfAnsicht } from "@/components/shared/PdfAnsicht";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const MAX_BYTES = 20 * 1024 * 1024;
/** Nur aus diesen Speicherorten darf sign-request die Quelle lesen (wie ERLAUBTE_BUCKETS in _shared/signatur/vorgang.ts). */
const ERLAUBTE_BUCKETS = ["building-files", "email-attachments", "invoices"];
/** Auswahlwert für das Firmen-DMS von RGI (nur Administratoren). */
const FIRMA = "__rgi__";
const FIRMA_NAME = "RGI Immobilien (Firmen-DMS)";

type Schritt = "wahl" | "upload" | "dms";

interface Objekt {
  id: string;
  name: string;
  city: string | null;
}

interface DmsDatei {
  id: string;
  display_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  source: string | null;
  storage_bucket: string | null;
  created_at: string;
  /** Ordner (nur im Firmen-DMS angezeigt) */
  ordner?: { name: string } | null;
}

const istPdfDatei = (f: Pick<DmsDatei, "mime_type" | "display_name" | "file_path">) =>
  f.mime_type === "application/pdf" || /\.pdf$/i.test(f.display_name || "") || /\.pdf$/i.test(f.file_path || "");

const groesse = (b: number | null | undefined) => {
  if (!b) return "";
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
};

/** Prüft die ersten Bytes auf „%PDF“ (Endung allein reicht nicht). */
async function siehtAusWiePdf(file: File) {
  const kopf = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const text = String.fromCharCode(...kopf);
  return text.includes("%PDF");
}

function useObjekte(enabled: boolean) {
  return useQuery({
    queryKey: ["signatur", "objekte-auswahl"],
    enabled,
    queryFn: async (): Promise<Objekt[]> => {
      const { data, error } = await db.from("buildings").select("id, name, city").order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60_000,
  });
}

export function NeueUnterschriftDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const istAdmin = useIsRgiAdmin();
  const [schritt, setSchritt] = useState<Schritt>("wahl");
  const [start, setStart] = useState<{ quelleTyp: QuelleTyp; quelleId: string | null; info: UnterschriftStartInfo } | null>(null);
  const [anfordernOffen, setAnfordernOffen] = useState(false);
  // Auswahl merken, damit „‹ Anderes Dokument wählen“ dorthin zurückführt
  const [dmsObjekt, setDmsObjekt] = useState("");
  const [dmsSuche, setDmsSuche] = useState("");
  const [dmsVorschau, setDmsVorschau] = useState<DmsDatei | null>(null);
  const zurueckZu = useRef<Schritt | null>(null);

  useEffect(() => {
    if (!open) return;
    setSchritt(zurueckZu.current ?? "wahl");
    if (!zurueckZu.current) setDmsVorschau(null);
    zurueckZu.current = null;
  }, [open]);

  const weiter = (quelleTyp: QuelleTyp, quelleId: string | null, info: UnterschriftStartInfo) => {
    setStart({ quelleTyp, quelleId, info });
    setDmsVorschau(null);
    onOpenChange(false);
    setAnfordernOffen(true);
  };

  const anderesDokument = () => {
    zurueckZu.current = start?.quelleTyp === "building_file" ? "dms" : start?.quelleTyp === "upload" ? "upload" : "wahl";
    setAnfordernOffen(false);
    onOpenChange(true);
  };
  const breit = schritt === "dms" && !!dmsVorschau;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "flex max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden p-0 font-sans sm:w-[96vw] sm:rounded-xl",
            breit ? "h-[100dvh] sm:h-[90vh] sm:max-w-[900px]" : "sm:max-w-[560px]",
          )}
        >
          <div className="border-b border-[#E5E5E5] px-6 pb-4 pt-5 pr-12">
            <DialogTitle className="font-display text-[22px] font-normal leading-tight text-[#2B2B2B]">
              Welches Dokument soll unterschrieben werden?
            </DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-[#595959]">
              {schritt === "wahl"
                ? "Danach wählen Sie Unterzeichner, Frist und E-Mail wie gewohnt."
                : schritt === "upload"
                  ? "PDF vom Computer hochladen (höchstens 20 MB)."
                  : dmsVorschau
                    ? "Bitte prüfen, ob das das richtige Dokument ist."
                    : istAdmin
                      ? "PDF aus den Dokumenten eines Objekts oder aus dem Firmen-DMS von RGI wählen."
                      : "PDF aus den Dokumenten eines Objekts wählen."}
            </DialogDescription>
          </div>
          {schritt === "wahl" && (
            <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
              <WahlKarte
                icon={<Upload className="h-5 w-5" />}
                titel="PDF hochladen"
                text="Datei vom Computer wählen"
                onClick={() => setSchritt("upload")}
              />
              <WahlKarte
                icon={<FolderOpen className="h-5 w-5" />}
                titel="Aus Dokumenten wählen"
                text={istAdmin ? "PDF aus dem DMS eines Objekts oder von RGI" : "PDF aus dem DMS eines Objekts"}
                onClick={() => setSchritt("dms")}
              />
            </div>
          )}
          {schritt === "upload" && <UploadSchritt aktiv={open} onZurueck={() => setSchritt("wahl")} onWeiter={weiter} />}
          {schritt === "dms" && (
            <DmsSchritt
              aktiv={open}
              istAdmin={istAdmin}
              objekt={dmsObjekt}
              setObjekt={setDmsObjekt}
              suche={dmsSuche}
              setSuche={setDmsSuche}
              vorschau={dmsVorschau}
              setVorschau={setDmsVorschau}
              onZurueck={() => setSchritt("wahl")}
              onWeiter={weiter}
            />
          )}
        </DialogContent>
      </Dialog>

      {start && (
        <UnterschriftAnfordernDialog
          open={anfordernOffen}
          onOpenChange={setAnfordernOffen}
          quelleTyp={start.quelleTyp}
          quelleId={start.quelleId}
          startInfo={start.info}
          onAnderesDokument={anderesDokument}
        />
      )}
    </>
  );
}

function WahlKarte({ icon, titel, text, onClick }: { icon: ReactNode; titel: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-[#E5E5E5] bg-white px-4 py-4 text-left transition-colors hover:border-[#ee7202] hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ee7202]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFF7ED] text-[#B35300]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[#2B2B2B]">{titel}</span>
        <span className="block text-[12.5px] text-[#6B6B6B]">{text}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#B35300]" />
    </button>
  );
}

function ObjektAuswahl({
  id, value, onChange, optional, objekte, laedt, mitFirma,
}: { id: string; value: string; onChange: (v: string) => void; optional?: boolean; objekte: Objekt[]; laedt: boolean; mitFirma?: boolean }) {
  return (
    <div>
      <FeldLabel htmlFor={id}>
        {mitFirma ? "Ablage" : "Objekt"} {optional && <span className="font-normal text-[#6B6B6B]">(optional)</span>}
      </FeldLabel>
      <select id={id} className={eingabeKlasse} value={value} onChange={(e) => onChange(e.target.value)} disabled={laedt}>
        <option value="">{laedt ? "Lädt …" : optional ? "Ohne Objekt" : mitFirma ? "Objekt oder RGI wählen …" : "Objekt wählen …"}</option>
        {mitFirma && <option value={FIRMA}>{FIRMA_NAME}</option>}
        {mitFirma && <option disabled>──────────</option>}
        {objekte.map((o) => (
          <option key={o.id} value={o.id}>{o.name}{o.city && !o.name.includes(o.city) ? `, ${o.city}` : ""}</option>
        ))}
      </select>
    </div>
  );
}

function Fehler({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-[#FFF7ED] px-3 py-2 text-[13px] text-[#B35300]">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {text}
    </div>
  );
}

// ---------------------------------------------------------------- (a) PDF hochladen

function UploadSchritt({
  aktiv, onZurueck, onWeiter,
}: { aktiv: boolean; onZurueck: () => void; onWeiter: (t: QuelleTyp, id: string | null, info: UnterschriftStartInfo) => void }) {
  const { data: objekte = [], isLoading } = useObjekte(aktiv);
  const [datei, setDatei] = useState<File | null>(null);
  const [objekt, setObjekt] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ansehen, setAnsehen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const waehlen = async (f: File | null | undefined) => {
    setFehler(null);
    if (!f) return;
    if (!(f.type === "application/pdf" || /\.pdf$/i.test(f.name))) return setFehler("Bitte nur PDF-Dateien wählen.");
    if (f.size > MAX_BYTES) return setFehler("Die Datei ist größer als 20 MB.");
    if (f.size === 0 || !(await siehtAusWiePdf(f))) return setFehler("Die Datei ist kein gültiges PDF.");
    setDatei(f);
  };

  const hochladen = async () => {
    if (!datei) return setFehler("Bitte zuerst eine PDF-Datei wählen.");
    setBusy(true);
    setFehler(null);
    try {
      const pfad = `_signaturen/_uploads/${crypto.randomUUID()}.pdf`;
      const { error } = await supabase.storage.from("building-files").upload(pfad, datei, { contentType: "application/pdf", upsert: false });
      if (error) throw new Error(`Hochladen fehlgeschlagen: ${error.message}`);
      const o = objekte.find((x) => x.id === objekt);
      onWeiter("upload", null, {
        titel: titelAusDateiname(datei.name),
        building_id: o?.id ?? null,
        quelle_label: o ? `${o.name} · Upload` : `Upload · ${datei.name}`.slice(0, 200),
        source_bucket: "building-files",
        source_path: pfad,
        dokumentart: dokumentartAusName(datei.name),
      });
    } catch (e: any) {
      setFehler(e?.message || "Hochladen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-4 px-6 py-5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            waehlen(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ee7202]",
            datei ? "border-[#E5E5E5] bg-[#FAFAFA]" : "border-[#ee7202] bg-white hover:bg-[#FFF7ED]",
          )}
        >
          {datei ? (
            <div className="flex w-full items-center gap-3 text-left">
              <FileText className="h-8 w-8 shrink-0 text-[#B35300]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-[#2B2B2B]">{datei.name}</div>
                <div className="text-[12.5px] text-[#6B6B6B]">{groesse(datei.size)} · zum Ändern klicken</div>
              </div>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-semibold text-[#595959] hover:bg-white hover:text-[#B35300]"
                aria-label="Datei ansehen"
                onClick={(e) => {
                  e.stopPropagation();
                  setAnsehen(true);
                }}
              >
                <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Ansehen</span>
              </button>
              <button
                type="button"
                className="rounded p-1 text-[#595959] hover:bg-white"
                aria-label="Datei entfernen"
                onClick={(e) => {
                  e.stopPropagation();
                  setDatei(null);
                  if (input.current) input.current.value = "";
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="h-6 w-6 text-[#B35300]" />
              <div className="text-[14px] font-semibold text-[#B35300]">PDF wählen</div>
              <div className="text-[12.5px] text-[#6B6B6B]">oder hierher ziehen · nur PDF, höchstens 20 MB</div>
            </>
          )}
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => waehlen(e.target.files?.[0])}
          />
        </div>
        <ObjektAuswahl id="neu-objekt-upload" value={objekt} onChange={setObjekt} optional objekte={objekte} laedt={isLoading} />
        <p className="-mt-2 text-[12px] leading-snug text-[#6B6B6B]">
          Mit Objekt: Vorschläge aus Eigentümern/Beirat. Die Endfassung legen Sie nach Abschluss selbst im DMS ab – mit Vorschlag für Objekt und Ordner.
        </p>
        {fehler && <Fehler text={fehler} />}
      </div>
      <div className="flex justify-between gap-2.5 border-t border-[#E5E5E5] px-6 py-4">
        <SigButton onClick={onZurueck} disabled={busy}><ArrowLeft className="h-4 w-4" /> Zurück</SigButton>
        <SigButton variante="primaer" onClick={hochladen} loading={busy} disabled={!datei} className="px-5">Weiter</SigButton>
      </div>
      <DokumentVorschauDialog
        open={ansehen && !!datei}
        onOpenChange={setAnsehen}
        quelle={datei}
        dateiName={datei?.name ?? ""}
        mimeType="application/pdf"
      />
    </>
  );
}

// ---------------------------------------------------------------- (b) Aus Dokumenten wählen

const dateiName = (f: DmsDatei) => f.display_name || f.file_path.split("/").pop() || "Dokument";

async function signierteUrl(f: DmsDatei) {
  const { data, error } = await supabase.storage
    .from(getFileBucket(f.source, f.storage_bucket))
    .createSignedUrl(f.file_path, 900);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

function DmsSchritt({
  aktiv, istAdmin, objekt, setObjekt, suche, setSuche, vorschau, setVorschau, onZurueck, onWeiter,
}: {
  aktiv: boolean;
  istAdmin: boolean;
  objekt: string;
  setObjekt: (v: string) => void;
  suche: string;
  setSuche: (v: string) => void;
  vorschau: DmsDatei | null;
  setVorschau: (f: DmsDatei | null) => void;
  onZurueck: () => void;
  onWeiter: (t: QuelleTyp, id: string | null, info: UnterschriftStartInfo) => void;
}) {
  const { data: objekte = [], isLoading: objLaedt } = useObjekte(aktiv);
  // Firmen-DMS nur für Administratoren (RLS erlaubt es ohnehin nur ihnen)
  const firma = istAdmin && objekt === FIRMA;
  useEffect(() => {
    if (!istAdmin && objekt === FIRMA) setObjekt("");
  }, [istAdmin, objekt, setObjekt]);
  const [ansehen, setAnsehen] = useState<{ datei: DmsDatei; url: string } | null>(null);
  const [ansehenLaedt, setAnsehenLaedt] = useState<string | null>(null);
  const [ansehenFehler, setAnsehenFehler] = useState<string | null>(null);

  const { data: dateien = [], isLoading, error } = useQuery({
    queryKey: ["signatur", "dms-pdfs", objekt],
    enabled: aktiv && !!objekt && (objekt !== FIRMA || istAdmin),
    queryFn: async (): Promise<DmsDatei[]> => {
      let q = db
        .from("building_files")
        .select("id, display_name, file_path, file_size, mime_type, source, storage_bucket, created_at, ordner:building_file_categories(name)");
      q = objekt === FIRMA ? q.eq("is_company", true).is("archived_at", null) : q.eq("building_id", objekt);
      const { data, error } = await q
        .is("deleted_at", null)
        .eq("is_current_version", true)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return ((data ?? []) as DmsDatei[]).filter(
        (f) => istPdfDatei(f) && ERLAUBTE_BUCKETS.includes(getFileBucket(f.source, f.storage_bucket)),
      );
    },
    staleTime: 60_000,
  });

  // Signierte Adresse für die Vorschau-Seite im Dialog
  const { data: vorschauUrl, error: vorschauFehler } = useQuery({
    queryKey: ["signatur", "dms-vorschau-url", vorschau?.id],
    enabled: aktiv && !!vorschau,
    queryFn: () => signierteUrl(vorschau!),
    staleTime: 10 * 60_000,
  });

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return q
      ? dateien.filter((f) => `${f.display_name || f.file_path} ${f.ordner?.name ?? ""}`.toLowerCase().includes(q))
      : dateien;
  }, [dateien, suche]);

  const verwenden = (f: DmsDatei) => {
    const o = objekte.find((x) => x.id === objekt);
    const name = dateiName(f);
    onWeiter("building_file", f.id, {
      titel: titelAusDateiname(name),
      building_id: firma ? null : objekt,
      quelle_label: firma ? "RGI Immobilien · Firmen-DMS" : o ? `${o.name} · DMS` : "DMS",
      source_bucket: getFileBucket(f.source, f.storage_bucket),
      source_path: f.file_path,
      dokumentart: dokumentartAusName(name),
    });
  };

  const oeffneAnsicht = async (f: DmsDatei) => {
    setAnsehenFehler(null);
    setAnsehenLaedt(f.id);
    try {
      setAnsehen({ datei: f, url: await signierteUrl(f) });
    } catch (e: any) {
      setAnsehenFehler(e?.message || "Das Dokument konnte nicht geöffnet werden.");
    } finally {
      setAnsehenLaedt(null);
    }
  };

  // ---------- Vorschau-Seite: „Ist das das richtige Dokument?“ ----------
  if (vorschau) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-3 sm:px-6 sm:pt-4">
          <div className="mb-2 flex items-center gap-2 text-[13.5px]">
            <FileText className="h-4 w-4 shrink-0 text-[#B35300]" />
            <span className="min-w-0 truncate font-semibold text-[#2B2B2B]">{dateiName(vorschau)}</span>
            <span className="shrink-0 text-[12px] text-[#6B6B6B]">
              {formatDate(vorschau.created_at)}{vorschau.file_size ? ` · ${groesse(vorschau.file_size)}` : ""}
            </span>
          </div>
          <div className="min-h-[300px] flex-1 overflow-hidden rounded-lg border border-[#E5E5E5]">
            {vorschauFehler ? (
              <div className="p-4"><Fehler text={(vorschauFehler as Error).message || "Das Dokument kann nicht angezeigt werden."} /></div>
            ) : vorschauUrl ? (
              <PdfAnsicht quelle={vorschauUrl} dateiName={dateiName(vorschau)} />
            ) : (
              <div className="flex h-full items-center justify-center bg-[#EDEDED]"><Loader2 className="h-5 w-5 animate-spin text-[#6B6B6B]" /></div>
            )}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2.5 border-t border-[#E5E5E5] px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:flex-row sm:justify-between sm:px-6 sm:py-4">
          <SigButton onClick={() => setVorschau(null)}><ChevronLeft className="h-4 w-4" /> Zurück zur Auswahl</SigButton>
          <SigButton variante="primaer" className="px-5" onClick={() => verwenden(vorschau)}>
            <Check className="h-4 w-4" /> Dieses Dokument verwenden
          </SigButton>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-3 px-6 pt-5">
        <ObjektAuswahl
          id="neu-objekt-dms"
          value={objekt}
          onChange={(v) => { setObjekt(v); setSuche(""); }}
          objekte={objekte}
          laedt={objLaedt}
          mitFirma={istAdmin}
        />
        {objekt && (
          <div className="flex h-11 items-center gap-2 rounded-lg border border-[#D6D6D6] bg-white px-3 focus-within:border-[#ee7202] focus-within:ring-1 focus-within:ring-[#ee7202]">
            <Search className="h-4 w-4 text-[#6B6B6B]" />
            <input
              className="h-full flex-1 bg-transparent text-[14px] text-[#2B2B2B] outline-none"
              placeholder="Dokument suchen …"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              aria-label="Dokument suchen"
            />
          </div>
        )}
        {ansehenFehler && <Fehler text={ansehenFehler} />}
      </div>
      <div className="max-h-[46vh] min-h-[120px] overflow-y-auto px-6 py-3">
        {!objekt ? (
          <p className="py-6 text-center text-[13.5px] text-[#6B6B6B]">
            {istAdmin ? "Bitte zuerst ein Objekt oder das Firmen-DMS von RGI wählen." : "Bitte zuerst ein Objekt wählen."}
          </p>
        ) : isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#6B6B6B]" /></div>
        ) : error ? (
          <Fehler text={(error as Error).message || "Dokumente konnten nicht geladen werden."} />
        ) : gefiltert.length === 0 ? (
          <p className="py-6 text-center text-[13.5px] text-[#6B6B6B]">
            {dateien.length === 0
              ? firma ? "Im Firmen-DMS liegen keine PDF-Dokumente." : "Bei diesem Objekt liegen keine PDF-Dokumente."
              : "Nichts gefunden."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {gefiltert.map((f) => (
              <li key={f.id} className="flex items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={() => setVorschau(f)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] border border-[#E5E5E5] bg-white px-3 py-2.5 text-left hover:border-[#ee7202] hover:bg-[#FFF7ED]"
                >
                  <FileText className="h-5 w-5 shrink-0 text-[#B35300]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-[#2B2B2B]">{dateiName(f)}</span>
                    <span className="block text-[12px] text-[#6B6B6B]">
                      {firma && f.ordner?.name ? `${f.ordner.name} · ` : ""}
                      {formatDate(f.created_at)}{f.file_size ? ` · ${groesse(f.file_size)}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#B35300]" />
                </button>
                <button
                  type="button"
                  onClick={() => oeffneAnsicht(f)}
                  title="Ansehen"
                  aria-label={`${dateiName(f)} ansehen`}
                  className="flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[10px] border border-[#E5E5E5] bg-white text-[11px] font-semibold text-[#595959] hover:border-[#ee7202] hover:bg-[#FFF7ED] hover:text-[#B35300] sm:w-[76px]"
                >
                  {ansehenLaedt === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  <span className="hidden sm:block">Ansehen</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex justify-start border-t border-[#E5E5E5] px-6 py-4">
        <SigButton onClick={onZurueck}><ArrowLeft className="h-4 w-4" /> Zurück</SigButton>
      </div>

      <DokumentVorschauDialog
        open={!!ansehen}
        onOpenChange={(v) => !v && setAnsehen(null)}
        quelle={ansehen?.url ?? null}
        dateiName={ansehen ? dateiName(ansehen.datei) : ""}
        mimeType="application/pdf"
        aktionen={
          ansehen ? (
            <button
              type="button"
              onClick={() => {
                const f = ansehen.datei;
                setAnsehen(null);
                verwenden(f);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#B35300] px-3 text-[13px] font-semibold text-white hover:bg-[#9A4700] sm:h-9"
            >
              <Check className="h-4 w-4" /> <span className="hidden sm:inline">Dieses Dokument verwenden</span><span className="sm:hidden">Verwenden</span>
            </button>
          ) : undefined
        }
      />
    </>
  );
}
