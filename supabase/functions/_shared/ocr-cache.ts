// Texterkennung (Mistral OCR) mit gemeinsamem Speicher: jede Datei wird nur
// EINMAL gelesen. Der Schlüssel ist ein Fingerabdruck (SHA-256) des
// Dateiinhalts – gleiche Datei = gleicher Text, egal ob sie als Mail-Anhang,
// Rechnung, DMS-Dokument oder Kontoauszug in die App kommt.

const MAX_HASH_BYTES = 40 * 1024 * 1024;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
}

export interface OcrErgebnis {
  /** Markdown je Seite, in Seitenreihenfolge */
  seiten: string[];
  ausCache: boolean;
  sha: string | null;
}

/**
 * Liest eine Datei per OCR – oder nimmt den schon gespeicherten Text.
 * Übergib `url` (signierter Link) und/oder `bytes`. Ohne `bytes` wird die
 * Datei einmal geladen, um den Fingerabdruck zu bilden.
 */
export async function ocrMitCache(
  db: any,
  opts: { url?: string; bytes?: Uint8Array; bild?: boolean; mime?: string; quelle: string; apiKey: string },
): Promise<OcrErgebnis> {
  let bytes = opts.bytes;
  if (!bytes && opts.url) {
    try {
      const r = await fetch(opts.url);
      if (r.ok) {
        const laenge = Number(r.headers.get("content-length") ?? 0);
        if (!laenge || laenge <= MAX_HASH_BYTES) bytes = new Uint8Array(await r.arrayBuffer());
      }
    } catch (_) { /* ohne Fingerabdruck weiter */ }
  }
  const sha = bytes && bytes.length <= MAX_HASH_BYTES ? await sha256Hex(bytes) : null;

  if (sha) {
    const { data: treffer } = await db.from("ocr_cache").select("seiten").eq("sha256", sha).maybeSingle();
    if (treffer?.seiten) {
      db.rpc("ocr_cache_treffer", { p_sha: sha }).then(() => {}, () => {});
      return { seiten: treffer.seiten as string[], ausCache: true, sha };
    }
  }

  const mime = opts.mime ?? (opts.bild ? "image/jpeg" : "application/pdf");
  const quelleUrl = opts.url ?? (bytes ? `data:${mime};base64,${base64(bytes)}` : null);
  if (!quelleUrl) throw new Error("Keine Datei für die Texterkennung");
  const r = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: opts.bild ? { type: "image_url", image_url: quelleUrl } : { type: "document_url", document_url: quelleUrl },
      include_image_base64: false,
    }),
  });
  if (!r.ok) throw new Error(`OCR fehlgeschlagen (${r.status}): ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const seiten: string[] = Array.isArray(d.pages)
    ? [...d.pages].sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0)).map((p: any) => String(p.markdown ?? p.text ?? ""))
    : [String(d.text ?? d.markdown ?? "")];

  if (sha) {
    await db.from("ocr_cache").upsert(
      { sha256: sha, seiten, seitenzahl: seiten.length, groesse: bytes?.length ?? null, quelle: opts.quelle },
      { onConflict: "sha256", ignoreDuplicates: true },
    );
  }
  return { seiten, ausCache: false, sha };
}

/** Seiten als ein Text: „--- Seite n ---“ vor jeder Seite (bei mehreren Seiten). */
export function seitenAlsText(seiten: string[], immerKopf = true): string {
  if (!immerKopf && seiten.length <= 1) return (seiten[0] ?? "").trim();
  return seiten.map((s, i) => `\n\n--- Seite ${i + 1} ---\n\n${s}`).join("").trim();
}
