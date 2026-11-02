// sign-public – öffentliche Seite „/unterschreiben/{token}“ (ohne Login, verify_jwt = false).
// Zugriff ausschließlich über den persönlichen Link-Token (48 Hex-Zeichen); gespeichert ist
// nur dessen SHA-256. Herausgegeben werden nur Daten des einen Unterzeichners/Vorgangs.
// Aktionen: get · sign · paper_upload · download (Vertrag: /home/claude/esig/API.md)
import {
  FIRMA,
  Fehler,
  TOKEN_RE,
  UNTERSCHREIBBAR,
  adminClient,
  base64ZuBytes,
  corsHeaders,
  dateiname,
  ereignis,
  ipAus,
  json,
  objektLabel,
  pfad,
  sha256Hex,
  signierteUrl,
  zeile,
  zustimmungsText,
} from "../_shared/signatur/basis.ts";
import {
  Signer,
  Vorgang,
  istEtv,
  kopieErstellen,
  nachUnterschrift,
  papierSpeichern,
  vorgangLaden,
} from "../_shared/signatur/ablauf.ts";
import { PDFDocument, istPng } from "../_shared/signatur/pdf.ts";

const MAX_PNG = 600 * 1024;
const MAX_BODY = 56 * 1024 * 1024; // 40 MB Dateien als base64 + Rand

type Zustand = "ok" | "abgelaufen" | "zurueckgezogen" | "unterschrieben" | "unbekannt" | "papier_eingegangen";

/** Token prüfen und Unterzeichner + Vorgang laden. */
async function aufloesen(db: ReturnType<typeof adminClient>, token: unknown) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const hash = await sha256Hex(new TextEncoder().encode(token));
  const { data: s } = await db.from("sign_request_signers").select("id, request_id").eq("token_hash", hash).maybeSingle();
  if (!s) return null;
  const { req, signers } = await vorgangLaden(db, s.request_id);
  const signer = signers.find((x: Signer) => x.id === s.id);
  return signer ? { req, signer } : null;
}

function zustand(req: Vorgang, s: Signer): Zustand {
  if (["unterschrieben", "papier_uebernommen"].includes(s.status)) return "unterschrieben";
  if (req.status === "zurueckgezogen" || s.status === "zurueckgezogen") return "zurueckgezogen";
  if (req.status === "abgeschlossen") return "unterschrieben";
  if (req.status === "abgelaufen" || (s.expires_at && new Date(s.expires_at) < new Date())) return "abgelaufen";
  if (s.status === "wartet") return "unbekannt";
  if (s.status === "papier_eingegangen") return "papier_eingegangen";
  return "ok";
}

/** Erste Seite (1-basiert) mit einem Unterschriftsfeld dieses Unterzeichners. */
function unterschriftsseite(req: Vorgang, s: Signer): number | null {
  const pl = Array.isArray(s.placements) ? s.placements : [];
  if (pl.length) return Math.min(...pl.map((p: { page: number }) => Number(p.page) || 0)) + 1;
  if (istEtv(req)) return req.seitenzahl ?? null; // angehängte Unterschriftsseite
  return null;
}

/** Eigene Kopie (bzw. Endfassung) oder Quelle – je nach Stand. */
function eigenesPdf(req: Vorgang, s: Signer): { path: string; name: string } {
  if (req.status === "abgeschlossen" && req.final_path && s.status === "unterschrieben") {
    return { path: req.final_path, name: dateiname(`${req.titel} (unterschrieben)`) };
  }
  if (s.status === "unterschrieben") return { path: pfad.kopie(req.id, s.id), name: dateiname(`${req.titel} – unterschrieben`) };
  return { path: pfad.quelle(req.id), name: dateiname(req.titel) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Nur POST erlaubt." }, 405);
  const db = adminClient();
  try {
    const laenge = Number(req.headers.get("content-length") || 0);
    if (laenge > MAX_BODY) return json({ error: "Die Dateien sind zusammen größer als 40 MB." }, 413);
    // deno-lint-ignore no-explicit-any
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Ungültige Anfrage." }, 400);
    }
    const action = String(body?.action || "");
    const r = await aufloesen(db, body?.token);

    // ------------------------------------------------------------ get
    if (action === "get") {
      if (!r) return json({ zustand: "unbekannt", telefon: FIRMA.telefon, papier_erlaubt: true });
      const { req: v, signer: s } = r;
      const z = zustand(v, s);
      if (z === "ok" && !s.geoeffnet_at) {
        await db.from("sign_request_signers").update({
          geoeffnet_at: new Date().toISOString(),
          ...(s.status === "offen" ? { status: "geoeffnet" } : {}),
        }).eq("id", s.id);
        await ereignis(db, v.id, "geoeffnet", `${s.name} hat das Dokument geöffnet`, { signerId: s.id });
      }
      const pdfQuelle = ["ok", "unterschrieben", "papier_eingegangen"].includes(z) ? eigenesPdf(v, s) : null;
      return json({
        zustand: z,
        nummer: v.nummer,
        titel: v.titel,
        objekt: objektLabel(v.buildings),
        seitenzahl: v.seitenzahl,
        frist: v.frist,
        name: s.name,
        anrede: await anredeErmitteln(db, s),
        email: s.email,
        dokumentart: v.dokumentart,
        typ: v.typ,
        unterschriftsseite: unterschriftsseite(v, s),
        pdf_url: pdfQuelle ? await signierteUrl(db, pdfQuelle.path, 3600) : null,
        papier_erlaubt: true,
        telefon: FIRMA.telefon,
        signed_at: s.signed_at ?? null,
        papier_eingegangen: s.status === "papier_eingegangen",
        zustimmung_text: zustimmungsText(v.titel),
      });
    }

    if (!r) return json({ error: "Der Link ist ungültig.", zustand: "unbekannt" }, 404);
    const { req: v, signer: s } = r;
    const z = zustand(v, s);

    // ------------------------------------------------------------ sign
    if (action === "sign") {
      if (z === "papier_eingegangen") {
        return json({ error: "Ihre Papier-Unterschrift ist bereits eingegangen und wird gerade geprüft.", zustand: z }, 409);
      }
      if (z !== "ok") return json({ error: meldungZustand(z), zustand: z }, 409);
      if (!UNTERSCHREIBBAR.includes(s.status)) return json({ error: "Unterschrift ist derzeit nicht möglich." }, 409);
      const name = zeile(body.typed_name, 120);
      if (name.length < 2) return json({ error: "Bitte geben Sie Ihren vollständigen Namen ein." }, 400);
      if (body.consent !== true) return json({ error: "Bitte bestätigen Sie die Zustimmungserklärung." }, 400);
      let png: string | null = null;
      if (body.signature_png != null && body.signature_png !== "") {
        const p = String(body.signature_png);
        if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(p)) {
          return json({ error: "Die gezeichnete Unterschrift hat ein ungültiges Format." }, 400);
        }
        const bytes = base64ZuBytes(p);
        if (bytes.byteLength > MAX_PNG) return json({ error: "Die gezeichnete Unterschrift ist zu groß." }, 413);
        if (!istPng(bytes)) return json({ error: "Die gezeichnete Unterschrift ist kein PNG-Bild." }, 400);
        // Prüfen, ob das Bild später ins PDF eingesetzt werden kann (beschädigte Daten früh ablehnen)
        try {
          await (await PDFDocument.create()).embedPng(bytes);
        } catch {
          return json({ error: "Die gezeichnete Unterschrift konnte nicht gelesen werden. Bitte zeichnen Sie erneut." }, 400);
        }
        png = p;
      }
      const jetzt = new Date().toISOString();
      // Bedingtes Update: verhindert doppeltes Unterschreiben bei parallelen Klicks
      const { data: upd } = await db.from("sign_request_signers").update({
        status: "unterschrieben",
        methode: "online",
        typed_name: name,
        signature_png: png,
        consent_text: zustimmungsText(v.titel),
        ip: ipAus(req),
        user_agent: zeile(req.headers.get("user-agent"), 400) || null,
        signed_at: jetzt,
      }).eq("id", s.id).in("status", UNTERSCHREIBBAR).select("id");
      if (!upd?.length) return json({ error: "Dieses Dokument wurde bereits unterschrieben.", zustand: "unterschrieben" }, 409);
      await ereignis(db, v.id, "unterschrieben", `${s.name} hat unterschrieben`, {
        signerId: s.id,
        details: { methode: "online", gezeichnet: !!png, name },
      });

      // Kopie (immer erzeugen – Download; Mail nur außerhalb von ETV-Protokollen)
      let kopieAn: string | null = null;
      try {
        kopieAn = await kopieErstellen(db, v.id, s.id);
      } catch (e) {
        console.error("[sign-public] Kopie fehlgeschlagen:", e);
        await ereignis(db, v.id, "fehler", `Kopie für ${s.name} konnte nicht erstellt werden`, {
          signerId: s.id,
          details: { fehler: String(e instanceof Error ? e.message : e).slice(0, 300) },
        });
      }
      try {
        await nachUnterschrift(db, v.id);
      } catch (e) {
        console.error("[sign-public] Weiterschalten/Abschluss fehlgeschlagen:", e);
      }
      const { req: v2 } = await vorgangLaden(db, v.id);
      const eig = eigenesPdf(v2, { ...s, status: "unterschrieben" });
      return json({
        ok: true,
        signed_at: jetzt,
        nummer: v.nummer,
        kopie_an: istEtv(v) ? null : kopieAn,
        download_url: await signierteUrl(db, eig.path, 3600, eig.name),
      });
    }

    // ------------------------------------------------------------ paper_upload
    if (action === "paper_upload") {
      if (z !== "ok" && z !== "papier_eingegangen") return json({ error: meldungZustand(z), zustand: z }, 409);
      if (![...UNTERSCHREIBBAR, "papier_eingegangen"].includes(s.status)) {
        return json({ error: "Eine Papier-Rücksendung ist derzeit nicht möglich." }, 409);
      }
      const dateien = Array.isArray(body.dateien) ? body.dateien : [];
      if (!dateien.length) return json({ error: "Bitte fügen Sie die Seiten des Dokuments hinzu." }, 400);
      if (dateien.length > 80) return json({ error: "Zu viele Dateien (höchstens 80)." }, 400);
      const liste = [];
      for (const d of dateien) {
        const mime = String(d?.mime || "").toLowerCase();
        const nm = zeile(d?.name || "Datei", 120);
        if (/heic|heif/.test(mime) || /\.(heic|heif)$/i.test(nm)) {
          return json({ error: "Bitte als JPG oder PDF senden (HEIC-Fotos werden nicht unterstützt)." }, 400);
        }
        if (typeof d?.base64 !== "string" || !d.base64) return json({ error: `„${nm}“ ist leer.` }, 400);
        let bytes: Uint8Array;
        try {
          bytes = base64ZuBytes(d.base64);
        } catch {
          return json({ error: `„${nm}“ konnte nicht gelesen werden.` }, 400);
        }
        liste.push({ name: nm, bytes });
      }
      const erg = await papierSpeichern(db, v, s, liste, { eingang: "upload", streng: true });
      return json({ ok: true, seiten: erg.seiten });
    }

    // ------------------------------------------------------------ download
    if (action === "download") {
      if (!["ok", "unterschrieben", "papier_eingegangen"].includes(z)) return json({ error: meldungZustand(z), zustand: z }, 409);
      const eig = eigenesPdf(v, s);
      const { data: schon } = await db.from("sign_request_events").select("id").eq("signer_id", s.id).eq("ereignis", "heruntergeladen").limit(1);
      if (!schon?.length) await ereignis(db, v.id, "heruntergeladen", `${s.name} hat das PDF heruntergeladen`, { signerId: s.id });
      return json({ url: await signierteUrl(db, eig.path, 3600, eig.name) });
    }

    return json({ error: "Unbekannte Aktion." }, 400);
  } catch (e) {
    if (e instanceof Fehler) return json({ error: e.message }, e.status);
    console.error("[sign-public] Fehler:", e);
    return json({ error: "Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut oder rufen Sie uns an: " + FIRMA.telefon }, 500);
  }
});

/** „Herr Mustermann“ / „Frau Mustermann“ aus dem Kontakt (salutation + last_name) bzw. der Anrede des Vorgangs, sonst null. */
async function anredeErmitteln(db: ReturnType<typeof adminClient>, s: Signer): Promise<string | null> {
  if (s.contact_id) {
    const { data: k } = await db.from("contacts").select("salutation, last_name").eq("id", s.contact_id).maybeSingle();
    const sal = String(k?.salutation || "").trim();
    const nach = String(k?.last_name || "").trim();
    if (/^(herr|frau)\b/i.test(sal) && nach) return `${/^herr/i.test(sal) ? "Herr" : "Frau"} ${nach}`;
  }
  const m = String(s.anrede || "").match(/\b(Herr|Frau)\s+([^,]+)/);
  return m ? `${m[1]} ${m[2].trim()}` : null;
}

function meldungZustand(z: Zustand): string {
  switch (z) {
    case "papier_eingegangen":
      return "Ihre Papier-Unterschrift ist bereits eingegangen und wird gerade geprüft.";
    case "abgelaufen":
      return `Der Link ist abgelaufen. Bitte rufen Sie uns an: ${FIRMA.telefon}.`;
    case "zurueckgezogen":
      return `Dieser Vorgang wurde zurückgezogen. Bei Fragen: ${FIRMA.telefon}.`;
    case "unterschrieben":
      return "Dieses Dokument wurde bereits unterschrieben.";
    default:
      return "Der Link ist ungültig.";
  }
}
