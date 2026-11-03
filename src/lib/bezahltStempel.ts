/**
 * „Bezahlt am …“-Stempel für Rechnungen.
 *
 * Grundsatz wie beim Unterschreiben: Das Original wird nie verändert
 * (gebuchte Rechnung, OCR und GoBD-Beleg bleiben unberührt). Der Stempel
 * erzeugt immer eine zusätzliche Kopie „…_bezahlt.pdf“ an derselben Stelle
 * wie das Original — als weiterer Anhang derselben E-Mail, im selben
 * DMS-Ordner oder als neuer Eintrag in der Büro-Ablage.
 */
import { supabase } from "@/integrations/supabase/client";
import { currentSigner, type BuildingFileLike } from "@/lib/documentSigning";
import { loadPdfLib, viewToPdfMatrix, type PdfLib } from "@/lib/pdfSign";

// building_files-Felder wie is_company sind (noch) nicht in den generierten Typen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** 2026-11-03 -> 03.11.2026 */
export const datumDe = (isoDatum: string) => {
  const [y, m, d] = isoDatum.split("-");
  return y && m && d ? `${d}.${m}.${y}` : isoDatum;
};

/** Heute als JJJJ-MM-TT in lokaler Zeit (für das Datumsfeld). */
export const heuteIso = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** „Rechnung.pdf“ -> „Rechnung_bezahlt.pdf“ */
export const bezahltDateiname = (name: string) => {
  const base = (name || "Rechnung").replace(/\.pdf$/i, "").replace(/_bezahlt$/i, "");
  return `${base}_bezahlt.pdf`;
};

/** Klammert den vorhandenen Seiteninhalt in q … Q ein (wie beim Unterschreiben). */
const wrapExistingContent = (lib: PdfLib, doc: PdfLib, page: PdfLib) => {
  try {
    const { PDFName, PDFArray, pushGraphicsState, popGraphicsState } = lib;
    const contents = page.node.get(PDFName.of("Contents"));
    if (!contents) return;
    const qRef = doc.context.register(doc.context.contentStream(pushGraphicsState()));
    const bigQRef = doc.context.register(doc.context.contentStream(popGraphicsState()));
    const arr = PDFArray.withContext(doc.context);
    arr.push(qRef);
    const resolved = doc.context.lookup(contents);
    if (resolved instanceof PDFArray) {
      for (let i = 0; i < resolved.size(); i++) arr.push(resolved.get(i));
    } else {
      arr.push(contents);
    }
    arr.push(bigQRef);
    page.node.set(PDFName.of("Contents"), arr);
  } catch {
    // Im Zweifel ohne Klammer weiter.
  }
};

/** Maße des Stempels in PDF-Punkten. */
const STEMPEL_B = 132;
const STEMPEL_H = 46;
const RAND = 22;

/**
 * Setzt den Stempel „BEZAHLT / am TT.MM.JJJJ“ oben rechts auf die erste Seite
 * und liefert die neue Datei. `lib` = pdf-lib (in Tests direkt übergeben).
 */
export const bezahltStempelSetzen = async (
  lib: PdfLib,
  quelle: Uint8Array | ArrayBuffer,
  datumText: string,
): Promise<Uint8Array> => {
  const { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = lib;
  const doc = await PDFDocument.load(quelle, { ignoreEncryption: true, updateMetadata: false });
  const page = doc.getPages()[0];
  if (!page) throw new Error("Das PDF hat keine Seite");

  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  wrapExistingContent(lib, doc, page);

  // Sichtbare Seite (bei gedrehten Seiten sind Breite/Höhe vertauscht)
  const crop = page.getCropBox();
  const drehung = (((page.getRotation().angle % 360) + 360) % 360) as number;
  const ansichtBreite = drehung === 90 || drehung === 270 ? crop.height : crop.width;
  const w = Math.min(STEMPEL_B, ansichtBreite - 2 * RAND);
  const x = ansichtBreite - RAND - w;
  const y = RAND;

  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(...viewToPdfMatrix(drehung, crop)),
    concatTransformationMatrix(1, 0, 0, -1, x, y + STEMPEL_H),
  );

  const rot = rgb(0.75, 0.11, 0.11);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: w,
    height: STEMPEL_H,
    borderColor: rot,
    borderWidth: 2,
    color: rgb(1, 1, 1),
    opacity: 0.6,
    borderOpacity: 1,
  });

  const zeile1 = "BEZAHLT";
  const zeile2 = `am ${datumText}`;
  const g1 = 16;
  const g2 = 10.5;
  page.drawText(zeile1, {
    x: (w - fett.widthOfTextAtSize(zeile1, g1)) / 2,
    y: STEMPEL_H - 8 - g1 * 0.75,
    size: g1,
    font: fett,
    color: rot,
  });
  page.drawText(zeile2, {
    x: (w - normal.widthOfTextAtSize(zeile2, g2)) / 2,
    y: 8,
    size: g2,
    font: normal,
    color: rot,
  });

  page.pushOperators(popGraphicsState());
  return doc.save({ useObjectStreams: false });
};

/** Lädt eine Datei aus dem Speicher und liefert die gestempelte Fassung als Blob. */
export const bezahltStempelAusSpeicher = async (bucket: string, pfad: string, isoDatum: string): Promise<Blob> => {
  const { data, error } = await supabase.storage.from(bucket).download(pfad);
  if (error || !data) throw new Error("Datei konnte nicht geladen werden");
  const lib = await loadPdfLib();
  const bytes = await bezahltStempelSetzen(lib, await data.arrayBuffer(), datumDe(isoDatum));
  return new Blob([bytes], { type: "application/pdf" });
};

/** E-Mail-Anhang: gestempelte Kopie als zusätzlichen Anhang derselben E-Mail ablegen. */
export const bezahltAlsMailAnhang = async (p: { emailId: string; blob: Blob; fileName: string }) => {
  const path = `${p.emailId}/bezahlt_${crypto.randomUUID()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("email-attachments")
    .upload(path, p.blob, { contentType: "application/pdf" });
  if (upErr) throw upErr;
  const { error: insErr } = await supabase.from("email_attachments").insert({
    email_id: p.emailId,
    file_name: p.fileName,
    file_path: path,
    file_size: p.blob.size,
    mime_type: "application/pdf",
    is_inline: false,
  });
  if (insErr) {
    await supabase.storage.from("email-attachments").remove([path]);
    throw insErr;
  }
};

/** DMS-Dokument: gestempelte Kopie als neue Datei im selben Ordner anlegen. */
export const bezahltAlsDmsDokument = async (p: { file: BuildingFileLike; blob: Blob; fileName: string; isoDatum: string }) => {
  const user = await currentSigner();
  const f = p.file;
  const isCompany = !!f.is_company || (!f.building_id && f.file_path.startsWith("rgi/"));
  const folder = isCompany ? "rgi" : f.building_id || "allgemein";
  const path = `${folder}/${crypto.randomUUID()}.pdf`;

  const { error: upErr } = await supabase.storage
    .from("building-files")
    .upload(path, p.blob, { contentType: "application/pdf" });
  if (upErr) throw upErr;

  const visibility = (f.visibility_role as string) || "intern";
  const { data: inserted, error: insErr } = await db
    .from("building_files")
    .insert({
      display_name: p.fileName,
      description: `Kopie mit Stempel „Bezahlt am ${datumDe(p.isoDatum)}“ – gesetzt von ${user.name}.`,
      file_path: path,
      file_size: p.blob.size,
      mime_type: "application/pdf",
      category_id: f.category_id,
      building_id: isCompany ? null : f.building_id,
      ...(isCompany ? { is_company: true } : {}),
      management_mode: f.management_mode || "weg",
      // Personen-Freigaben werden bewusst nicht übernommen: im Zweifel intern.
      visibility_role: visibility === "personen" ? "intern" : visibility,
      visible_to_users: visibility === "alle",
      fiscal_year: f.fiscal_year ?? null,
      source: "manual",
      uploaded_by: user.id,
    })
    .select("id")
    .single();
  if (insErr) {
    await supabase.storage.from("building-files").remove([path]);
    throw insErr;
  }
  try {
    await supabase.from("building_file_activity").insert({
      file_id: inserted.id,
      user_id: user.id,
      action: "uploaded",
      details: { bezahlt_stempel_von: f.id } as never,
    });
  } catch {
    /* Verlauf ist nur Zusatz */
  }
};
