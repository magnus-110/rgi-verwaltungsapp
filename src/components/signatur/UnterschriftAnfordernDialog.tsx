/**
 * Dialog „Unterschrift anfordern“ (Mockup v01).
 *
 * Links die echte Dokumentvorschau (react-pdf) mit optionalem Platzieren
 * von Unterschriftsfeldern je Unterzeichner, rechts Unterzeichner, Frist,
 * Reihenfolge, Dokumentart und die E-Mail aus der Vorlage.
 * Versand ausschließlich über die Edge-Funktion `sign-request` (create).
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Loader2, Plus, Search, X, MousePointerClick, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  addDaysIso, DOKUMENTART_LABEL, signAction, todayIso, useBueroMitarbeiter, useMailTemplates,
  useSignInvalidate, type CreateErgebnis, type Dokumentart, type QuelleTyp, type SignPlacement, type SignTyp,
  type SignerVersand,
} from "@/lib/signatur";
import { LinkHinweis, LinkZeile } from "./LinkKopieren";
import { Abschnitt, eingabeKlasse, FeldLabel, NummerKreis, SigButton, SIGNER_FARBEN } from "./ui";
import { LazySeite, PdfDocument, PdfPage, seitenGroessen, useElementBreite } from "./pdf";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface VorschlagOption {
  name: string;
  email: string | null;
  contact_id?: string | null;
  anrede?: string | null;
  /** Zusatz in der Auswahl, z. B. „war anwesend“ */
  hinweis?: string | null;
}

export interface VorschlagSigner {
  name: string;
  email?: string | null;
  rolle?: string | null;
  contact_id?: string | null;
  anrede?: string | null;
  /** „intern“ = RGI-Mitarbeiter unterschreibt in der App (user_id); Standard „online“. */
  methode?: "online" | "intern";
  /** Nur bei „online“: „link“ = keine Einladungsmail, Link wird angezeigt und selbst verschickt. */
  versand?: SignerVersand;
  user_id?: string | null;
  /** Fester Rollenschlüssel (ETV: leiter · protokollant · eigentuemer · beirat). */
  rolle_key?: string | null;
  /** Auswahlliste, solange noch niemand feststeht (z. B. Eigentümer aus den Teilnehmern). */
  optionen?: VorschlagOption[];
}

export interface UnterschriftStartInfo {
  titel: string;
  building_id?: string | null;
  quelle_label?: string | null;
  source_bucket: string;
  source_path: string;
  dokumentart: Dokumentart;
  /** Fertige Vorschläge oder „beirat“ = Beirat des Objekts vorbelegen. */
  vorschlagUnterzeichner?: VorschlagSigner[] | "beirat";
  /** Optional: zugehörige E-Mail (Mail-Anhang) */
  email_id?: string | null;
  /** Vorgangsart; Standard „ausgehend“. Bei „etv_protokoll“ keine Kopien, Rollen aus der Versammlung. */
  typ?: SignTyp;
  /** Zeile „RGI Immobilien (Verwaltung) unterschreibt auch“ anzeigen (Standard: ja). */
  rgiZeile?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quelleTyp: QuelleTyp;
  quelleId: string | null;
  startInfo: UnterschriftStartInfo;
  onSent?: (r: { id: string; nummer: string }) => void;
}

interface EntwurfSigner {
  key: string;
  name: string;
  email: string;
  rolle: string;
  contact_id?: string | null;
  anrede?: string | null;
  methode: "online" | "intern";
  versand: SignerVersand;
  user_id?: string | null;
  rolle_key?: string | null;
  optionen?: VorschlagOption[];
}

/** Auswahl „Wie wird unterschrieben?“ → methode + versand */
type Weg = "mail" | "link" | "intern";
const wegVon = (s: Pick<EntwurfSigner, "methode" | "versand">): Weg => (s.methode === "intern" ? "intern" : s.versand === "link" ? "link" : "mail");

/** ETV: Rollenschlüssel aus der angezeigten Rolle ableiten (Kontakte aus der Auswahl). */
const etvRolleKey = (rolle: string): string => {
  const r = rolle.toLowerCase();
  if (r.includes("beirat")) return "beirat";
  if (r.includes("leit")) return "leiter";
  if (r.includes("protokoll")) return "protokollant";
  return "eigentuemer";
};

interface KontaktTreffer {
  contact_id: string;
  name: string;
  email: string | null;
  rolle: string;
  anrede: string | null;
  vorschlag?: boolean;
  beirat?: 0 | 1 | 2; // 2 = Vorsitz
}

const INTERN_KEY = "__rgi__";
const FELD_W = 170;
const FELD_H = 46;

const neuerKey = () => Math.random().toString(36).slice(2, 10);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const kontaktName = (c: any) =>
  [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() || c?.company_name || c?.short_name || "Unbenannt";

const kontaktAnrede = (c: any): string | null => {
  const s = (c?.salutation || "").trim().toLowerCase();
  if (c?.last_name && (s === "herr" || s === "hr." || s === "hr")) return `Guten Tag Herr ${c.last_name}`;
  if (c?.last_name && (s === "frau" || s === "fr." || s === "fr")) return `Guten Tag Frau ${c.last_name}`;
  return `Guten Tag ${kontaktName(c)}`;
};

const ersteMail = (c: any): string | null => {
  const mails = (c?.contact_emails ?? []) as { email: string; is_primary: boolean | null }[];
  return (mails.find((m) => m.is_primary) ?? mails[0])?.email ?? null;
};

const alleMails = (c: any): string[] => ((c?.contact_emails ?? []) as { email: string }[]).map((m) => m.email);

const RGI_STANDARD: Dokumentart[] = ["verwaltervertrag", "dienstleistervertrag", "angebot"];

export function UnterschriftAnfordernDialog({ open, onOpenChange, quelleTyp, quelleId, startInfo, onSent }: Props) {
  const { user, profile } = useAuth();
  const typ: SignTyp = startInfo.typ ?? "ausgehend";
  const etv = typ === "etv_protokoll";
  const mitRgiZeile = startInfo.rgiZeile !== false;
  const invalidate = useSignInvalidate();
  const { data: vorlagen = [] } = useMailTemplates();
  const { data: mitarbeiter = [] } = useBueroMitarbeiter();

  const [dokumentart, setDokumentart] = useState<Dokumentart>(startInfo.dokumentart);
  const [vorlage, setVorlage] = useState<Dokumentart>(startInfo.dokumentart);
  const [signer, setSigner] = useState<EntwurfSigner[]>([]);
  const [rgiAuch, setRgiAuch] = useState(RGI_STANDARD.includes(startInfo.dokumentart));
  const [rgiUser, setRgiUser] = useState<string>("");
  const [frist, setFrist] = useState(addDaysIso(14));
  const [reihenfolge, setReihenfolge] = useState<"gleichzeitig" | "nacheinander">("gleichzeitig");
  const [betreff, setBetreff] = useState("");
  const [text, setText] = useState("");
  const [erinnerung, setErinnerung] = useState(true);
  const [kopieDms, setKopieDms] = useState(true);
  const [placements, setPlacements] = useState<Record<string, SignPlacement[]>>({});
  const [platzieren, setPlatzieren] = useState(false);
  const [aktivFeldSigner, setAktivFeldSigner] = useState<string | null>(null);
  const [senden, setSenden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState<{ subject: string; html: string } | null>(null);
  const [vorschauLaedt, setVorschauLaedt] = useState(false);
  /** Nach dem Anlegen: Links zum Verschicken („Nur Link“), nur jetzt sichtbar. */
  const [ergebnis, setErgebnis] = useState<CreateErgebnis | null>(null);
  const vorbelegt = useRef(false);

  // ---------- Zurücksetzen beim Öffnen ----------
  useEffect(() => {
    if (!open) return;
    vorbelegt.current = false;
    setDokumentart(startInfo.dokumentart);
    setVorlage(startInfo.dokumentart);
    setRgiAuch(startInfo.rgiZeile !== false && RGI_STANDARD.includes(startInfo.dokumentart));
    setReihenfolge("gleichzeitig");
    setErinnerung(true);
    setKopieDms(true);
    setPlacements({});
    setPlatzieren(false);
    setFrist(addDaysIso(startInfo.typ === "etv_protokoll" ? 7 : 14));
    setAktivFeldSigner(null);
    setFehler(null);
    setErgebnis(null);
    setSigner(
      Array.isArray(startInfo.vorschlagUnterzeichner)
        ? startInfo.vorschlagUnterzeichner
            .filter((v) => v.name || v.optionen?.length || v.rolle)
            .map((v) => ({
              key: neuerKey(), name: v.name, email: v.email ?? "", rolle: v.rolle ?? "",
              contact_id: v.contact_id ?? null, anrede: v.anrede ?? null,
              methode: v.methode === "intern" ? "intern" : "online",
              versand: v.methode !== "intern" && v.versand === "link" ? "link" : "mail",
              user_id: v.user_id ?? null, rolle_key: v.rolle_key ?? null, optionen: v.optionen,
            }))
        : [],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!rgiUser && user?.id) setRgiUser(user.id);
  }, [user?.id, rgiUser]);

  // Vorlage → Betreff, Text, Frist
  const vorlageAnwenden = (art: Dokumentart) => {
    const v = vorlagen.find((t) => t.dokumentart === art);
    setVorlage(art);
    if (!v) return;
    setBetreff(v.betreff);
    setText(v.text);
    setFrist(addDaysIso(v.frist_tage || (etv ? 7 : 14)));
  };
  useEffect(() => {
    if (open && vorlagen.length) vorlageAnwenden(startInfo.dokumentart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vorlagen.length]);

  // ---------- Vorschläge aus dem Objekt (Eigentümer/Beirat) ----------
  const { data: objektKontakte = [] } = useQuery({
    queryKey: ["signatur", "objekt-kontakte", startInfo.building_id],
    enabled: open && !!startInfo.building_id,
    queryFn: async (): Promise<KontaktTreffer[]> => {
      const { data, error } = await db
        .from("contact_building_assignments")
        .select(
          "contact_id, role_in_building, is_beirat, is_beirat_vorsitz, is_active, valid_to, unit_number, contacts(id, first_name, last_name, company_name, short_name, salutation, contact_emails(email, is_primary))",
        )
        .eq("building_id", startInfo.building_id);
      if (error) throw error;
      const heute = todayIso();
      const gesehen = new Set<string>();
      const out: KontaktTreffer[] = [];
      for (const a of data ?? []) {
        if (a.is_active === false) continue;
        if (a.valid_to && a.valid_to < heute) continue;
        if (!(a.role_in_building === "eigentuemer" || a.role_in_building === "beirat" || a.is_beirat || a.is_beirat_vorsitz)) continue;
        if (!a.contacts || gesehen.has(a.contact_id)) continue;
        gesehen.add(a.contact_id);
        const beirat: 0 | 1 | 2 = a.is_beirat_vorsitz ? 2 : a.is_beirat || a.role_in_building === "beirat" ? 1 : 0;
        out.push({
          contact_id: a.contact_id,
          name: kontaktName(a.contacts),
          email: ersteMail(a.contacts),
          rolle: beirat === 2 ? "Beiratsvorsitz" : beirat === 1 ? "Beirat" : "Eigentümer",
          anrede: kontaktAnrede(a.contacts),
          vorschlag: true,
          beirat,
        });
      }
      return out.sort((x, y) => (y.beirat ?? 0) - (x.beirat ?? 0) || x.name.localeCompare(y.name, "de"));
    },
    staleTime: 5 * 60_000,
  });

  // Beirat vorbelegen (z. B. Verwaltervertrag)
  useEffect(() => {
    if (!open || vorbelegt.current || startInfo.vorschlagUnterzeichner !== "beirat") return;
    if (!objektKontakte.length) return;
    vorbelegt.current = true;
    const beirat = objektKontakte.filter((k) => (k.beirat ?? 0) > 0);
    setSigner(
      beirat.map((k) => ({
        key: neuerKey(), name: k.name, email: k.email ?? "", rolle: k.rolle, contact_id: k.contact_id, anrede: k.anrede,
        methode: "online" as const, versand: "mail" as const,
      })),
    );
  }, [open, objektKontakte, startInfo.vorschlagUnterzeichner]);

  // ---------- Dokument laden ----------
  const { data: quelleUrl, error: urlFehler } = useQuery({
    queryKey: ["signatur", "quelle-url", startInfo.source_bucket, startInfo.source_path],
    enabled: open && !!startInfo.source_path,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(startInfo.source_bucket).createSignedUrl(startInfo.source_path, 900);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 10 * 60_000,
  });
  const [seiten, setSeiten] = useState<{ w: number; h: number }[]>([]);
  const [pdfFehler, setPdfFehler] = useState<string | null>(null);
  const vorschauBox = useElementBreite<HTMLDivElement>();
  const maxW = useMemo(() => Math.max(1, ...seiten.map((s) => s.w)), [seiten]);
  const scale = vorschauBox.breite > 0 ? Math.min(1.25, (vorschauBox.breite - 64) / maxW) : 0.7;
  useEffect(() => {
    setSeiten([]);
    setPdfFehler(null);
  }, [quelleUrl]);

  // ---------- Unterzeichner ----------
  const externe = signer;
  const mitLink = externe.some((s) => s.methode !== "intern" && s.versand === "link");
  const nurLinks = mitLink && externe.every((s) => s.methode === "intern" || s.versand === "link");
  const rgiName = mitarbeiter.find((m) => m.user_id === rgiUser)?.name
    || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "RGI Immobilien";
  const feldSigner = [
    ...externe.map((s, i) => ({ key: s.key, nr: i + 1, name: s.name || s.rolle || "Unterzeichner" })),
    ...(rgiAuch && mitRgiZeile ? [{ key: INTERN_KEY, nr: externe.length + 1, name: "RGI Immobilien" }] : []),
  ];
  const farbeFuer = (key: string) => {
    const i = feldSigner.findIndex((f) => f.key === key);
    return SIGNER_FARBEN[(i < 0 ? 0 : i) % SIGNER_FARBEN.length];
  };
  const nrFuer = (key: string) => feldSigner.find((f) => f.key === key)?.nr ?? 0;

  const hinzufuegen = (t: { name: string; email: string; rolle: string; contact_id?: string | null; anrede?: string | null }) => {
    setSigner((prev) => {
      // Ehepaare mit gleicher Mail sind zwei Unterzeichner → nur exakt gleiche Person (Kontakt + Name) überspringen
      if (prev.some((p) => p.contact_id && p.contact_id === t.contact_id && p.name === t.name)) return prev;
      // Ohne E-Mail-Adresse bleibt nur „Nur Link erstellen“ (E-Mail kann noch ergänzt werden)
      return [...prev, {
        key: neuerKey(), ...t, methode: "online" as const, versand: t.email.trim() ? "mail" as const : "link" as const,
        rolle_key: etv ? etvRolleKey(t.rolle) : null,
      }];
    });
    setFehler(null);
  };
  const entfernen = (key: string) => {
    setSigner((prev) => prev.filter((p) => p.key !== key));
    setPlacements((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
    if (aktivFeldSigner === key) setAktivFeldSigner(null);
  };
  const aendern = (key: string, patch: Partial<EntwurfSigner>) =>
    setSigner((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  // ---------- Felder platzieren ----------
  const aktiverFeldKey = aktivFeldSigner && feldSigner.some((f) => f.key === aktivFeldSigner)
    ? aktivFeldSigner
    : feldSigner[0]?.key ?? null;

  const feldSetzen = (page: number, px: number, py: number) => {
    if (!platzieren || !aktiverFeldKey) return;
    const size = seiten[page];
    if (!size) return;
    const p: SignPlacement = {
      page,
      w: FELD_W,
      h: FELD_H,
      x: Math.max(0, Math.min(size.w - FELD_W, px - FELD_W / 2)),
      y: Math.max(0, Math.min(size.h - FELD_H, py - FELD_H / 2)),
    };
    setPlacements((prev) => ({ ...prev, [aktiverFeldKey]: [...(prev[aktiverFeldKey] ?? []), p] }));
  };
  const feldAendern = (key: string, idx: number, patch: Partial<SignPlacement>) =>
    setPlacements((prev) => ({ ...prev, [key]: (prev[key] ?? []).map((p, i) => (i === idx ? { ...p, ...patch } : p)) }));
  const feldEntfernen = (key: string, idx: number) =>
    setPlacements((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((_, i) => i !== idx) }));

  const drag = useRef<{ key: string; idx: number; mode: "move" | "resize"; sx: number; sy: number; orig: SignPlacement } | null>(null);
  const onFeldDown = (e: React.PointerEvent, key: string, idx: number, mode: "move" | "resize") => {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* egal */
    }
    drag.current = { key, idx, mode, sx: e.clientX, sy: e.clientY, orig: { ...placements[key][idx] } };
  };
  const onFeldMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const size = seiten[d.orig.page];
    if (!size) return;
    const dx = (e.clientX - d.sx) / scale;
    const dy = (e.clientY - d.sy) / scale;
    if (d.mode === "move") {
      feldAendern(d.key, d.idx, {
        x: Math.max(0, Math.min(size.w - d.orig.w, d.orig.x + dx)),
        y: Math.max(0, Math.min(size.h - d.orig.h, d.orig.y + dy)),
      });
    } else {
      feldAendern(d.key, d.idx, {
        w: Math.max(60, Math.min(size.w - d.orig.x, d.orig.w + dx)),
        h: Math.max(20, Math.min(size.h - d.orig.y, d.orig.h + dy)),
      });
    }
  };
  const onFeldUp = () => {
    drag.current = null;
  };

  // ---------- Prüfen & Senden ----------
  const pruefen = (): string | null => {
    const rgiZaehlt = rgiAuch && mitRgiZeile;
    if (externe.length === 0 && !rgiZaehlt) return "Bitte mindestens einen Unterzeichner hinzufügen.";
    if (!etv && externe.filter((s) => s.methode !== "intern").length === 0) return "Bitte mindestens einen Unterzeichner außer RGI hinzufügen.";
    for (const s of externe) {
      if (!s.name.trim()) return s.rolle ? `Bitte für „${s.rolle}“ eine Person auswählen.` : "Bitte bei jedem Unterzeichner einen Namen angeben.";
      if (s.methode === "intern") {
        if (!s.user_id) return `Bitte für „${s.rolle || s.name}“ einen Mitarbeiter auswählen.`;
        continue;
      }
      if (!s.email.trim()) {
        if (s.versand === "link") continue; // E-Mail optional
        return `Für ${s.name} fehlt die E-Mail-Adresse (oder „Nur Link erstellen“ wählen).`;
      }
      if (!EMAIL_RE.test(s.email.trim())) return `Die E-Mail-Adresse von ${s.name} ist ungültig.`;
    }
    if (rgiZaehlt && !rgiUser) return "Bitte auswählen, wer bei RGI unterschreibt.";
    if (!frist || frist <= todayIso()) return "Die Frist muss in der Zukunft liegen.";
    if (!betreff.trim()) return "Bitte einen Betreff eingeben.";
    if (!text.trim()) return "Bitte einen E-Mail-Text eingeben.";
    return null;
  };

  const absenden = async () => {
    const f = pruefen();
    setFehler(f);
    if (f) return;
    setSenden(true);
    try {
      const signers = [
        ...externe.map((s) =>
          s.methode === "intern"
            ? {
                name: s.name.trim(),
                user_id: s.user_id!,
                rolle: s.rolle || "RGI Immobilien",
                rolle_key: s.rolle_key || (etv ? etvRolleKey(s.rolle) : "verwaltung"),
                methode: "intern" as const,
                placements: placements[s.key]?.length ? placements[s.key] : undefined,
              }
            : {
                name: s.name.trim(),
                email: s.email.trim() || undefined,
                versand: s.versand,
                contact_id: s.contact_id ?? undefined,
                rolle: s.rolle || undefined,
                rolle_key: s.rolle_key || (etv ? etvRolleKey(s.rolle) : undefined),
                methode: "online" as const,
                anrede: s.anrede || undefined,
                placements: placements[s.key]?.length ? placements[s.key] : undefined,
              },
        ),
        ...(rgiAuch && mitRgiZeile
          ? [{
              name: rgiName,
              user_id: rgiUser,
              rolle: "RGI Immobilien",
              rolle_key: "verwaltung",
              methode: "intern" as const,
              placements: placements[INTERN_KEY]?.length ? placements[INTERN_KEY] : undefined,
            }]
          : []),
      ];
      const res = await signAction<CreateErgebnis>("create", {
        typ,
        dokumentart,
        titel: startInfo.titel,
        building_id: startInfo.building_id ?? undefined,
        quelle_typ: quelleTyp,
        quelle_id: quelleId ?? undefined,
        quelle_label: startInfo.quelle_label ?? undefined,
        source_bucket: startInfo.source_bucket,
        source_path: startInfo.source_path,
        email_id: startInfo.email_id ?? undefined,
        frist,
        reihenfolge,
        mail_betreff: betreff,
        mail_text: text,
        erinnerung,
        kopie_dms: kopieDms,
        signers,
      });
      const nurLinks = externe.every((s) => s.methode === "intern" || s.versand === "link");
      toast.success(nurLinks ? `Vorgang angelegt (${res.nummer})` : `Zur Unterschrift gesendet (${res.nummer})`);
      if (res.versand_fehler?.length) toast.error(res.versand_fehler.join(" · "));
      await invalidate();
      onSent?.(res);
      // „Nur Link“: Links jetzt anzeigen (danach nie wieder im Klartext abrufbar)
      if (res.links?.length) setErgebnis(res);
      else onOpenChange(false);
    } catch (e: any) {
      setFehler(e?.message || "Senden fehlgeschlagen");
      toast.error(e?.message || "Senden fehlgeschlagen");
    } finally {
      setSenden(false);
    }
  };

  const zeigeVorschau = async () => {
    setVorschauLaedt(true);
    try {
      const erster = externe.find((s) => s.methode !== "intern" && s.name) ?? externe[0];
      const r = await signAction<{ subject: string; html: string }>("preview_mail", {
        typ,
        dokumentart,
        titel: startInfo.titel,
        objekt: startInfo.quelle_label ?? "",
        frist,
        mail_betreff: betreff,
        mail_text: text,
        signer: { name: erster?.name || "Max Mustermann", anrede: erster?.anrede || undefined },
      });
      setVorschau(r);
    } catch (e: any) {
      toast.error(e?.message || "Vorschau nicht möglich");
    } finally {
      setVorschauLaedt(false);
    }
  };

  // ---------- Darstellung ----------
  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !senden && onOpenChange(v)}>
        {ergebnis ? (
          <DialogContent
            className="max-h-[100dvh] w-screen max-w-none gap-0 overflow-y-auto p-0 font-sans sm:w-[96vw] sm:max-w-[600px] sm:rounded-xl"
            onInteractOutside={(e) => e.preventDefault()}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="border-b border-[#E5E5E5] px-6 pb-4 pt-5 pr-12">
              <DialogTitle className="font-display text-[22px] font-normal leading-tight text-[#2B2B2B]">Links zum Verschicken</DialogTitle>
              <DialogDescription className="mt-1 text-[13px] text-[#595959]">
                {startInfo.titel} · {ergebnis.nummer}. Bitte jedem Unterzeichner seinen eigenen Link schicken (z. B. per WhatsApp, SMS oder eigener E-Mail).
              </DialogDescription>
            </div>
            <div className="space-y-2.5 px-6 py-4">
              {ergebnis.links!.map((l) => {
                const e = externe.find((x) => x.name.trim() === l.name)?.email.trim();
                return <LinkZeile key={l.signer_id} name={l.name} url={l.url} zusatz={e || "ohne E-Mail"} />;
              })}
              <LinkHinweis />
              {reihenfolge === "nacheinander" && externe.some((s, i) => i > 0 && s.methode !== "intern" && s.versand === "link") && (
                <p className="text-[12.5px] leading-snug text-[#595959]">
                  Reihenfolge „nacheinander“: Für spätere Unterzeichner erhalten Sie eine Benachrichtigung, sobald sie an der Reihe sind. Dann den Link unter „Unterschriften“ erstellen.
                </p>
              )}
            </div>
            <div className="flex justify-end border-t border-[#E5E5E5] px-6 py-4">
              <SigButton variante="primaer" className="px-6" onClick={() => onOpenChange(false)}>Fertig</SigButton>
            </div>
          </DialogContent>
        ) : (
        <DialogContent
          className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden border-0 bg-[#F5F4F0] p-0 font-sans sm:h-[85vh] sm:w-[96vw] sm:max-w-[1200px] sm:rounded-xl sm:border"
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogDescription className="sr-only">Unterschrift für {startInfo.titel} anfordern</DialogDescription>
          <div className="flex min-h-0 flex-1 gap-6 p-4 md:p-6">
            {/* ---------- Links: Dokumentvorschau ---------- */}
            <div className="hidden min-w-0 flex-[1.05] flex-col overflow-hidden rounded-xl bg-[#EDEDED] md:flex">
              {etv ? (
                <div className="px-4 pt-3 text-[12.5px] text-[#595959]">
                  Die Unterschriftsseite für alle Rollen wird automatisch angehängt.
                </div>
              ) : (
              <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
                <button
                  type="button"
                  onClick={() => setPlatzieren((v) => !v)}
                  disabled={!seiten.length || feldSigner.length === 0}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                    platzieren ? "border-[#ee7202] bg-[#FFF7ED] text-[#B35300]" : "border-[#D6D6D6] bg-white text-[#2B2B2B]"
                  }`}
                  title={feldSigner.length === 0 ? "Zuerst Unterzeichner hinzufügen" : undefined}
                >
                  <MousePointerClick className="h-4 w-4" />
                  {platzieren ? "Fertig mit Feldern" : "Unterschriftsfelder platzieren"}
                </button>
                {platzieren && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {feldSigner.map((f) => {
                      const an = f.key === aktiverFeldKey;
                      const farbe = farbeFuer(f.key);
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setAktivFeldSigner(f.key)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-white px-2.5 text-[12.5px] font-medium"
                          style={{ borderColor: an ? farbe : "#D6D6D6", boxShadow: an ? `0 0 0 1px ${farbe}` : undefined }}
                        >
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: farbe }}>
                            {f.nr}
                          </span>
                          <span className="max-w-[120px] truncate">{f.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {!platzieren && (
                  <span className="text-[12px] text-[#6B6B6B]">
                    Optional. Ohne Felder wird ein Prüfblatt angehängt.
                  </span>
                )}
              </div>
              )}
              {platzieren && (
                <div className="px-4 pt-2 text-[12.5px] text-[#B35300]">
                  Auf die Stelle im Dokument klicken, an der {feldSigner.find((f) => f.key === aktiverFeldKey)?.name ?? "der Unterzeichner"} unterschreiben soll.
                </div>
              )}
              <div ref={vorschauBox.ref} className="min-h-0 flex-1 overflow-auto px-6 py-4">
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
                        <div key={idx} className="relative" style={{ width: size.w * scale, height: size.h * scale }}>
                          <LazySeite width={size.w * scale} height={size.h * scale} rootEl={vorschauBox.el.current}>
                            <PdfPage
                              pageNumber={idx + 1}
                              width={size.w * scale}
                              renderTextLayer={false}
                              renderAnnotationLayer={false}
                              loading={<div style={{ width: size.w * scale, height: size.h * scale }} className="bg-white" />}
                            />
                          </LazySeite>
                          <div
                            className={`absolute inset-0 ${platzieren ? "cursor-crosshair" : ""}`}
                            onClick={(e) => {
                              if (!platzieren) return;
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              feldSetzen(idx, (e.clientX - r.left) / scale, (e.clientY - r.top) / scale);
                            }}
                          >
                            {platzieren && <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-[#ee7202]/40" />}
                            {Object.entries(placements).flatMap(([key, list]) =>
                              list.map((p, i) => (p.page !== idx ? null : (
                                <div
                                  key={`${key}-${i}`}
                                  className="absolute select-none touch-none rounded-[3px] border-2 border-dashed"
                                  style={{
                                    left: p.x * scale, top: p.y * scale, width: p.w * scale, height: p.h * scale,
                                    borderColor: farbeFuer(key), backgroundColor: farbeFuer(key) + "1A",
                                    cursor: platzieren ? "move" : "default",
                                    pointerEvents: platzieren ? "auto" : "none",
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => onFeldDown(e, key, i, "move")}
                                  onPointerMove={onFeldMove}
                                  onPointerUp={onFeldUp}
                                  onPointerCancel={onFeldUp}
                                >
                                  <span
                                    className="absolute left-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                                    style={{ backgroundColor: farbeFuer(key) }}
                                  >
                                    {nrFuer(key)}
                                  </span>
                                  <span className="absolute bottom-0.5 left-1 right-1 truncate text-[10px] font-medium" style={{ color: farbeFuer(key) }}>
                                    {feldSigner.find((f) => f.key === key)?.name}
                                  </span>
                                  {platzieren && (
                                    <>
                                      <button
                                        type="button"
                                        className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#2B2B2B] text-white shadow"
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          feldEntfernen(key, i);
                                        }}
                                        title="Feld entfernen"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                      <div
                                        className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border-2 border-white shadow"
                                        style={{ backgroundColor: farbeFuer(key), cursor: "nwse-resize" }}
                                        onPointerDown={(e) => onFeldDown(e, key, i, "resize")}
                                        onPointerMove={onFeldMove}
                                        onPointerUp={onFeldUp}
                                        onPointerCancel={onFeldUp}
                                        title="Größe ändern"
                                      />
                                    </>
                                  )}
                                </div>
                              ))),
                            )}
                          </div>
                        </div>
                      ))}
                    </PdfDocument>
                  </Suspense>
                )}
              </div>
            </div>

            {/* ---------- Rechts: Formular ---------- */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#E5E5E5] bg-white md:max-w-[520px]">
              <div className="border-b border-[#E5E5E5] px-6 pb-4 pt-5 pr-12">
                <DialogTitle className="font-display text-[22px] font-normal leading-tight text-[#2B2B2B]">
                  Unterschrift anfordern
                </DialogTitle>
                <p className="mt-1 text-[13px] text-[#595959]">Elektronisch in Textform (§ 126b BGB)</p>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                {/* UNTERZEICHNER */}
                <div className="space-y-2">
                  <Abschnitt>Unterzeichner</Abschnitt>
                  {externe.map((s, i) => (
                    <SignerKarte
                      key={s.key}
                      nr={i + 1}
                      signer={s}
                      mitarbeiter={mitarbeiter}
                      farbe={platzieren ? farbeFuer(s.key) : undefined}
                      felder={placements[s.key]?.length ?? 0}
                      onRemove={() => entfernen(s.key)}
                      onChange={(patch) => aendern(s.key, patch)}
                    />
                  ))}

                  {/* RGI intern */}
                  {mitRgiZeile && (
                  <div className={`rounded-lg border border-[#E5E5E5] px-3 py-2.5 ${rgiAuch ? "bg-[#FAFAFA]" : "bg-white"}`}>
                    <div className="flex items-center gap-3">
                      {rgiAuch ? <NummerKreis n={externe.length + 1} dunkel /> : <span className="h-7 w-7 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className={`text-[14px] font-semibold ${rgiAuch ? "text-[#2B2B2B]" : "text-[#6B6B6B]"}`}>RGI Immobilien (Verwaltung)</div>
                        <div className="text-[12.5px] text-[#6B6B6B]">
                          {rgiAuch ? "unterschreibt zuletzt intern in der App" : "unterschreibt nicht mit"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3 pl-10">
                      <label className="flex shrink-0 items-center gap-2 text-[12.5px] text-[#595959]">
                        <Switch checked={rgiAuch} onCheckedChange={setRgiAuch} aria-label="RGI unterschreibt auch" />
                        RGI unterschreibt auch
                      </label>
                    {rgiAuch && (
                      <div className="min-w-0 flex-1">
                        <select
                          className={`${eingabeKlasse} h-9 text-[13px]`}
                          value={rgiUser}
                          onChange={(e) => setRgiUser(e.target.value)}
                          aria-label="Wer unterschreibt bei RGI?"
                        >
                          {!mitarbeiter.some((m) => m.user_id === rgiUser) && rgiUser && <option value={rgiUser}>{rgiName}</option>}
                          {mitarbeiter.map((m) => (
                            <option key={m.user_id} value={m.user_id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    </div>
                  </div>
                  )}

                  <KontaktAuswahl
                    objektKontakte={objektKontakte}
                    vorhandene={externe}
                    onAdd={hinzufuegen}
                  />
                </div>

                {/* Frist · Reihenfolge */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FeldLabel htmlFor="sig-frist">Frist</FeldLabel>
                    <input
                      id="sig-frist"
                      type="date"
                      className={eingabeKlasse}
                      value={frist}
                      min={addDaysIso(1)}
                      onChange={(e) => setFrist(e.target.value)}
                    />
                  </div>
                  <div>
                    <FeldLabel htmlFor="sig-reihenfolge">Reihenfolge</FeldLabel>
                    <select
                      id="sig-reihenfolge"
                      className={eingabeKlasse}
                      value={reihenfolge}
                      onChange={(e) => setReihenfolge(e.target.value as "gleichzeitig" | "nacheinander")}
                    >
                      <option value="gleichzeitig">Alle gleichzeitig</option>
                      <option value="nacheinander">Nacheinander</option>
                    </select>
                  </div>
                </div>
                {!etv && (
                <div>
                  <FeldLabel htmlFor="sig-art">Dokumentart</FeldLabel>
                  <select
                    id="sig-art"
                    className={eingabeKlasse}
                    value={dokumentart}
                    onChange={(e) => {
                      const art = e.target.value as Dokumentart;
                      setDokumentart(art);
                      vorlageAnwenden(art);
                    }}
                  >
                    {(Object.keys(DOKUMENTART_LABEL) as Dokumentart[]).map((a) => (
                      <option key={a} value={a}>{vorlagen.find((v) => v.dokumentart === a)?.bezeichnung ?? DOKUMENTART_LABEL[a]}</option>
                    ))}
                  </select>
                </div>
                )}

                {/* E-MAIL */}
                <div className="space-y-3 rounded-xl border border-[#E5E5E5] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <Abschnitt>E-Mail</Abschnitt>
                    <label className="flex items-center gap-2 text-[13px] text-[#595959]">
                      Vorlage
                      <select
                        className={`${eingabeKlasse} h-9 w-auto pr-8 text-[13px]`}
                        value={vorlage}
                        onChange={(e) => vorlageAnwenden(e.target.value as Dokumentart)}
                      >
                        {vorlagen.map((v) => (
                          <option key={v.dokumentart} value={v.dokumentart}>{v.bezeichnung}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div>
                    <FeldLabel htmlFor="sig-betreff">Betreff</FeldLabel>
                    <input id="sig-betreff" className={eingabeKlasse} value={betreff} onChange={(e) => setBetreff(e.target.value)} />
                  </div>
                  <div>
                    <FeldLabel htmlFor="sig-text">
                      Text <span className="font-normal text-[#6B6B6B]">(vorausgefüllt, frei änderbar)</span>
                    </FeldLabel>
                    <textarea
                      id="sig-text"
                      rows={5}
                      className={`${eingabeKlasse} h-auto py-2.5 leading-relaxed`}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                    <div className="mt-1 text-[11.5px] text-[#6B6B6B]">Platzhalter: {"{Anrede} {Dokument} {Objekt} {Frist}"}</div>
                  </div>
                  {mitLink && (
                    <div className="flex items-start gap-2 rounded-lg bg-[#FFF7ED] px-3 py-2 text-[12.5px] leading-snug text-[#2B2B2B]">
                      <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B35300]" />
                      <span>Bei „Nur Link erstellen“ wird keine Einladung gesendet. Mit E-Mail-Adresse gehen Erinnerungen und die Kopie nach dem Unterschreiben trotzdem per E-Mail raus.</span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3 text-[12px] text-[#595959]">
                    <span>Button „Unterschreiben“ und Papier-Link werden automatisch angefügt.</span>
                    <button
                      type="button"
                      onClick={zeigeVorschau}
                      disabled={vorschauLaedt}
                      className="inline-flex shrink-0 items-center gap-1 font-medium text-[#B35300] underline underline-offset-2"
                    >
                      {vorschauLaedt && <Loader2 className="h-3 w-3 animate-spin" />}
                      Vorschau
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 pb-1">
                  <label className="flex items-center gap-2.5 text-[14px] text-[#2B2B2B]">
                    <Checkbox checked={erinnerung} onCheckedChange={(v) => setErinnerung(!!v)} className="data-[state=checked]:border-[#B35300] data-[state=checked]:bg-[#B35300]" />
                    Automatisch erinnern
                  </label>
                  {startInfo.building_id ? (
                  <label className="flex items-center gap-2.5 text-[14px] text-[#2B2B2B]">
                    <Checkbox checked={kopieDms} onCheckedChange={(v) => setKopieDms(!!v)} className="data-[state=checked]:border-[#B35300] data-[state=checked]:bg-[#B35300]" />
                    {etv ? "Ablage im DMS" : "Kopie an alle + Ablage im DMS"}
                  </label>
                  ) : (
                    <p className="text-[12.5px] leading-snug text-[#6B6B6B]">
                      Ohne Objekt keine Ablage im DMS – die Endfassung bleibt im Vorgang abrufbar.
                    </p>
                  )}
                </div>
              </div>

              <div className="border-t border-[#E5E5E5] px-6 py-4">
                {fehler && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg bg-[#FFF7ED] px-3 py-2 text-[13px] text-[#B35300]">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {fehler}
                  </div>
                )}
                <div className="flex justify-end gap-2.5">
                  <SigButton onClick={() => onOpenChange(false)} disabled={senden}>Abbrechen</SigButton>
                  <SigButton variante="primaer" onClick={absenden} loading={senden} className="px-5">
                    {nurLinks ? "Anlegen & Links erstellen" : "Zur Unterschrift senden"}
                  </SigButton>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
        )}
      </Dialog>

      {/* Vorschau der E-Mail */}
      <Dialog open={!!vorschau} onOpenChange={(v) => !v && setVorschau(null)}>
        <DialogContent className="flex h-[85vh] max-w-[720px] flex-col gap-3 p-5">
          <DialogTitle className="font-display text-[18px] font-normal">Vorschau der E-Mail</DialogTitle>
          <DialogDescription className="text-[13px] text-[#595959]">
            Betreff: <span className="font-semibold text-[#2B2B2B]">{vorschau?.subject}</span>
            {externe[0] && <> · an {externe[0].name}</>}
          </DialogDescription>
          <iframe
            title="Vorschau der E-Mail"
            className="min-h-0 w-full flex-1 rounded-lg border border-[#E5E5E5] bg-white"
            sandbox=""
            srcDoc={vorschau?.html ?? ""}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------

function SignerKarte({
  nr, signer, mitarbeiter, farbe, felder, onRemove, onChange,
}: {
  nr: number;
  signer: EntwurfSigner;
  mitarbeiter: { user_id: string; name: string }[];
  farbe?: string;
  felder: number;
  onRemove: () => void;
  onChange: (p: Partial<EntwurfSigner>) => void;
}) {
  const intern = signer.methode === "intern";
  const link = !intern && signer.versand === "link";
  const auswahl = !intern && !!signer.optionen?.length;
  const [bearbeiten, setBearbeiten] = useState(intern ? !signer.user_id : !signer.email && !auswahl);
  const kopf = signer.rolle && signer.name ? `${signer.rolle} · ${signer.name}` : signer.name || signer.rolle || "Ohne Namen";
  const unterzeile = intern
    ? "RGI · in der App mit hinterlegter Unterschrift"
    : [
        signer.rolle && signer.name ? null : signer.rolle,
        signer.email || (link ? "ohne E-Mail" : null),
        link ? "Link selbst verschicken" : null,
      ].filter(Boolean).join(" · ");
  const fehlt = intern ? !signer.user_id : !signer.email && !link;
  return (
    <div className={`rounded-lg border border-[#E5E5E5] px-3 py-2.5 ${intern ? "bg-[#FAFAFA]" : "bg-white"}`}>
      <div className="flex items-center gap-3">
        <NummerKreis n={nr} farbe={farbe} dunkel={intern && !farbe} />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setBearbeiten((v) => !v)} title="Angaben ändern">
          <div className="truncate text-[14px] font-semibold text-[#2B2B2B]">{kopf}</div>
          <div className="truncate text-[12.5px] text-[#6B6B6B]">
            {fehlt && !auswahl ? (
              <span className="text-[#B35300]">{intern ? "Mitarbeiter auswählen" : "E-Mail-Adresse fehlt"}</span>
            ) : !signer.name && auswahl ? (
              <span className="text-[#B35300]">Bitte auswählen</span>
            ) : (
              unterzeile
            )}
            {felder > 0 && <span> · {felder} Feld{felder === 1 ? "" : "er"}</span>}
          </div>
        </button>
        <button type="button" onClick={onRemove} className="rounded p-1 text-[#595959] hover:bg-[#FAFAFA]" title="Entfernen" aria-label={`${signer.name || signer.rolle} entfernen`}>
          <X className="h-4 w-4" />
        </button>
      </div>
      {!intern && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-10" role="radiogroup" aria-label="Wie bekommt die Person den Link?">
          {(
            [
              ["mail", "Per E-Mail senden"],
              ["link", "Link selbst verschicken"],
            ] as const
          ).map(([w, text]) => {
            const aktiv = (link ? "link" : "mail") === w;
            return (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={aktiv}
                onClick={() => onChange({ versand: w })}
                className={`h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors ${
                  aktiv ? "border-[#ee7202] bg-[#FFF7ED] text-[#B35300]" : "border-[#E5E5E5] bg-white text-[#595959] hover:bg-[#FAFAFA]"
                }`}
              >
                {text}
              </button>
            );
          })}
        </div>
      )}
      {auswahl && (
        <div className="mt-2.5 pl-10">
          <select
            className={`${eingabeKlasse} h-9 text-[13px]`}
            value={signer.contact_id && signer.name ? `${signer.contact_id}|${signer.email}` : ""}
            aria-label={`${signer.rolle || "Unterzeichner"} auswählen`}
            onChange={(e) => {
              const o = signer.optionen!.find((x) => `${x.contact_id}|${x.email ?? ""}` === e.target.value);
              if (o) onChange({ name: o.name, email: o.email ?? "", contact_id: o.contact_id ?? null, anrede: o.anrede ?? null });
            }}
          >
            <option value="">{signer.rolle ? `${signer.rolle} auswählen …` : "Auswählen …"}</option>
            {signer.optionen!.map((o) => (
              <option key={`${o.contact_id}|${o.email ?? ""}`} value={`${o.contact_id}|${o.email ?? ""}`} disabled={!o.email && !link}>
                {o.name}
                {o.hinweis ? ` · ${o.hinweis}` : ""}
                {o.email ? "" : " · keine E-Mail"}
              </option>
            ))}
          </select>
        </div>
      )}
      {bearbeiten && (
        <div className="mt-2.5 grid grid-cols-1 gap-2 pl-10 sm:grid-cols-2">
          <select
            className={`${eingabeKlasse} h-9 text-[13px] sm:col-span-2`}
            value={wegVon(signer)}
            aria-label="Wie wird unterschrieben?"
            onChange={(e) => {
              const w = e.target.value as Weg;
              onChange(
                w === "intern"
                  ? { methode: "intern", versand: "mail", optionen: undefined }
                  : { methode: "online", versand: w, ...(intern ? { optionen: undefined } : {}) },
              );
            }}
          >
            <option value="mail">per E-Mail-Link (online oder Papier)</option>
            <option value="link">Nur Link erstellen (ich verschicke selbst)</option>
            <option value="intern">RGI-Mitarbeiter in der App</option>
          </select>
          {intern ? (
            <select
              className={`${eingabeKlasse} h-9 text-[13px] sm:col-span-2`}
              value={signer.user_id ?? ""}
              aria-label="Mitarbeiter"
              onChange={(e) => {
                const m = mitarbeiter.find((x) => x.user_id === e.target.value);
                onChange({ user_id: e.target.value || null, name: m?.name ?? signer.name });
              }}
            >
              <option value="">Mitarbeiter auswählen …</option>
              {mitarbeiter.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.name}</option>
              ))}
            </select>
          ) : (
            <>
              <input className={`${eingabeKlasse} h-9 text-[13px]`} placeholder="Name" value={signer.name} onChange={(e) => onChange({ name: e.target.value })} />
              <input className={`${eingabeKlasse} h-9 text-[13px]`} placeholder="Rolle (z. B. Beirat)" value={signer.rolle} onChange={(e) => onChange({ rolle: e.target.value })} />
              <input
                className={`${eingabeKlasse} h-9 text-[13px] sm:col-span-2`}
                placeholder={link ? "E-Mail-Adresse (optional)" : "E-Mail-Adresse"}
                type="email"
                value={signer.email}
                onChange={(e) => onChange({ email: e.target.value })}
              />
              {link && (
                <p className="-mt-0.5 text-[11.5px] leading-snug text-[#6B6B6B] sm:col-span-2">
                  Für Erinnerungen und die Kopie nach dem Unterschreiben empfohlen. Der Link wird nach dem Anlegen angezeigt.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function KontaktAuswahl({
  objektKontakte, vorhandene, onAdd,
}: {
  objektKontakte: KontaktTreffer[];
  vorhandene: EntwurfSigner[];
  onAdd: (t: { name: string; email: string; rolle: string; contact_id?: string | null; anrede?: string | null }) => void;
}) {
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState("");
  const [frei, setFrei] = useState(false);
  const [freiName, setFreiName] = useState("");
  const [freiMail, setFreiMail] = useState("");
  const [freiRolle, setFreiRolle] = useState("");

  const q = suche.trim();
  const { data: treffer = [], isFetching } = useQuery({
    queryKey: ["signatur", "kontaktsuche", q],
    enabled: offen && q.length >= 2,
    queryFn: async (): Promise<KontaktTreffer[]> => {
      const felder = "id, first_name, last_name, company_name, short_name, salutation, contact_type, contact_emails(email, is_primary)";
      const like = `%${q.replace(/[%,()]/g, " ")}%`;
      const [nachName, nachMail] = await Promise.all([
        db.from("contacts").select(felder).or(`first_name.ilike.${like},last_name.ilike.${like},company_name.ilike.${like},short_name.ilike.${like}`).limit(25),
        q.includes("@")
          ? db.from("contact_emails").select(`contact_id, contacts(${felder})`).ilike("email", like).limit(25)
          : Promise.resolve({ data: [] }),
      ]);
      const map = new Map<string, any>();
      for (const c of nachName.data ?? []) map.set(c.id, c);
      for (const r of nachMail.data ?? []) if (r.contacts) map.set(r.contacts.id, r.contacts);
      const out: KontaktTreffer[] = [];
      for (const c of map.values()) {
        const mails = alleMails(c);
        const rolle = c.contact_type === "service_provider" ? "Dienstleister" : "";
        if (mails.length <= 1) {
          out.push({ contact_id: c.id, name: kontaktName(c), email: mails[0] ?? null, rolle, anrede: kontaktAnrede(c) });
        } else {
          for (const m of mails) out.push({ contact_id: c.id, name: kontaktName(c), email: m, rolle, anrede: kontaktAnrede(c) });
        }
      }
      return out.slice(0, 30);
    },
    staleTime: 30_000,
  });

  const lc = q.toLowerCase();
  const vorschlaege = objektKontakte.filter(
    (k) => !lc || k.name.toLowerCase().includes(lc) || (k.email ?? "").toLowerCase().includes(lc),
  );
  const schonDrin = (t: KontaktTreffer) => vorhandene.some((v) => v.contact_id === t.contact_id && v.name === t.name && v.email === (t.email ?? ""));

  const waehlen = (t: KontaktTreffer) => {
    onAdd({ name: t.name, email: t.email ?? "", rolle: t.rolle, contact_id: t.contact_id, anrede: t.anrede });
  };

  const freiUebernehmen = () => {
    if (!freiName.trim()) return;
    onAdd({ name: freiName.trim(), email: freiMail.trim(), rolle: freiRolle.trim(), contact_id: null, anrede: `Guten Tag ${freiName.trim()}` });
    setFreiName("");
    setFreiMail("");
    setFreiRolle("");
    setFrei(false);
    setOffen(false);
  };

  return (
    <Popover open={offen} onOpenChange={setOffen}>
      <PopoverTrigger asChild>
        <SigButton variante="gestrichelt" className="h-10">
          <Plus className="h-4 w-4" /> Aus Kontakten hinzufügen
        </SigButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] max-w-[92vw] p-0 font-sans">
        {frei ? (
          <div className="space-y-2.5 p-3">
            <div className="text-[13px] font-semibold text-[#2B2B2B]">Frei eingeben</div>
            <input autoFocus className={`${eingabeKlasse} h-9 text-[13px]`} placeholder="Name" value={freiName} onChange={(e) => setFreiName(e.target.value)} />
            <input className={`${eingabeKlasse} h-9 text-[13px]`} placeholder="E-Mail-Adresse" type="email" value={freiMail} onChange={(e) => setFreiMail(e.target.value)} />
            <input className={`${eingabeKlasse} h-9 text-[13px]`} placeholder="Rolle (optional, z. B. Eigentümer)" value={freiRolle} onChange={(e) => setFreiRolle(e.target.value)} />
            <div className="flex justify-end gap-2 pt-1">
              <SigButton klein onClick={() => setFrei(false)}>Zurück</SigButton>
              <SigButton klein variante="primaer" onClick={freiUebernehmen} disabled={!freiName.trim()}>Hinzufügen</SigButton>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-[#E5E5E5] px-3">
              <Search className="h-4 w-4 text-[#6B6B6B]" />
              <input
                autoFocus
                className="h-10 flex-1 bg-transparent text-[14px] outline-none"
                placeholder="Name oder E-Mail suchen …"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
              />
              {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#6B6B6B]" />}
            </div>
            <div className="max-h-[320px] overflow-y-auto py-1">
              {vorschlaege.length > 0 && (
                <>
                  <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Aus diesem Objekt</div>
                  {vorschlaege.map((t) => (
                    <TrefferZeile key={`v-${t.contact_id}`} t={t} drin={schonDrin(t)} onClick={() => waehlen(t)} />
                  ))}
                </>
              )}
              {q.length >= 2 && (
                <>
                  <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Alle Kontakte</div>
                  {treffer.length === 0 && !isFetching && <div className="px-3 py-2 text-[13px] text-[#6B6B6B]">Nichts gefunden.</div>}
                  {treffer.map((t, i) => (
                    <TrefferZeile key={`t-${t.contact_id}-${i}`} t={t} drin={schonDrin(t)} onClick={() => waehlen(t)} />
                  ))}
                </>
              )}
              {vorschlaege.length === 0 && q.length < 2 && (
                <div className="px-3 py-3 text-[13px] text-[#6B6B6B]">Mindestens 2 Buchstaben eingeben.</div>
              )}
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-2 border-t border-[#E5E5E5] px-3 py-2.5 text-left text-[13px] font-medium text-[#B35300] hover:bg-[#FFF7ED]"
              onClick={() => {
                setFrei(true);
                if (q && !q.includes("@")) setFreiName(q);
                if (q.includes("@")) setFreiMail(q);
              }}
            >
              <Plus className="h-4 w-4" /> Frei eingeben (Name + E-Mail)
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function TrefferZeile({ t, drin, onClick }: { t: KontaktTreffer; drin: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={drin}
      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#FAFAFA] disabled:opacity-50"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold text-[#2B2B2B]">{t.name}</div>
        <div className="truncate text-[12px] text-[#6B6B6B]">
          {[t.rolle, t.email ?? "keine E-Mail hinterlegt"].filter(Boolean).join(" · ")}
        </div>
      </div>
      {drin ? <span className="text-[11.5px] text-[#6B6B6B]">hinzugefügt</span> : <Plus className="h-4 w-4 text-[#B35300]" />}
    </button>
  );
}

