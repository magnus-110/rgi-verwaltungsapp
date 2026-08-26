import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useUpsertOffer, useSaveOfferItems, useOfferQuestions, useTemplatesOfKind,
  renderOffer, offerSignedUrl, type Offer, type OfferItem,
} from "@/hooks/useOffers";
import {
  BASIS_SUFFIX, RGI_STANDARD_FEES, formatEur, isPercentBasis, type FeeBasis,
} from "@/types/rgiContracts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offer?: Offer | null;
}

const STEPS = ["Anfrage", "Fragen zum Objekt", "Honorar", "Vertragsentwurf"];

/**
 * Standardwerte des aktuellen RGI-Verwaltervertrags, die nicht als
 * Position geführt werden. Landen in offers.contract_defaults und
 * von dort in die Platzhalter der Word-Vorlage.
 */
const CONTRACT_DEFAULTS: Record<string, string> = {
  "laufzeit.jahre": "drei Jahren",
  "freigabe.grenze": "1.500,00",
  "freigabe.beirat_ab": "750,00",
  "zuschlag.ohne_sepa": "5,00",
  "entnahme.werktag": "3",
  "beirat.sitzungen_inklusive": "vier",
  "index.basisjahr": "2020",
  "ort": "Pfronten",
  // Nur fuer das Uebersichtsblatt
  "uebersicht.laufzeit": "3 Jahre",
  "extrakosten":
    "Zusatzkosten entstehen nur bei Sonderfällen wie z. B. Eigentümerwechsel, außerordentliche " +
    "Versammlungen, aufwendige Versicherungsschäden, Bauprojekte ab 5000€ oder Rechtsangelegenheiten. " +
    "Abgerechnet wird pauschal, prozentual oder nach Zeitaufwand – je nach Sonderfall.",
};

/** Werte, die als mehrzeiliges Feld bearbeitet werden. */
const DEFAULT_MULTILINE = new Set(["extrakosten"]);

const DEFAULT_LABEL: Record<string, string> = {
  "laufzeit.jahre": "Laufzeit",
  "freigabe.grenze": "Freigabegrenze je Einzelfall (€)",
  "freigabe.beirat_ab": "Beirat informieren ab (€)",
  "zuschlag.ohne_sepa": "Zuschlag ohne SEPA-Mandat (€)",
  "entnahme.werktag": "Entnahme am Werktag",
  "beirat.sitzungen_inklusive": "Beiratssitzungen inklusive",
  "index.basisjahr": "Index-Basisjahr",
  "ort": "Ort der Unterschrift",
  "uebersicht.laufzeit": "Laufzeit auf dem Übersichtsblatt",
  "extrakosten": "Übersichtsblatt: Text unter „Was kostet Extra?“",
};

const dec = (s: string): number | null => {
  if (s == null || String(s).trim() === "") return null;
  const n = Number(String(s).replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
};
const str = (n: number | null | undefined): string =>
  n == null ? "" : String(n).replace(".", ",");

export function OfferWizard({ open, onOpenChange, offer }: Props) {
  const upsert = useUpsertOffer();
  const saveItems = useSaveOfferItems();
  const { data: questions } = useOfferQuestions();
  const { data: contractTemplates } = useTemplatesOfKind("contract");

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);

  const [form, setForm] = useState<any>({});
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [items, setItems] = useState<OfferItem[]>([]);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [docx, setDocx] = useState<string | null>(null);
  const [pdf, setPdf] = useState<string | null>(null);
  const [summaryDocx, setSummaryDocx] = useState<string | null>(null);
  const [summaryPdf, setSummaryPdf] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDefaultsOpen(false);
    if (offer) {
      setForm({ ...offer });
      setAnswers(offer.answers ?? {});
      setDefaults({ ...CONTRACT_DEFAULTS, ...(offer.contract_defaults ?? {}) });
      setItems(offer.items ?? []);
      setDocx(offer.docx_storage_path ?? null);
      setPdf(offer.pdf_storage_path ?? null);
      setSummaryDocx(offer.summary_docx_storage_path ?? null);
      setSummaryPdf(offer.summary_pdf_storage_path ?? null);
    } else {
      setForm({ status: "inquiry", management_mode: "weg", inquiry_date: new Date().toISOString().slice(0, 10) });
      setAnswers({});
      setDefaults({ ...CONTRACT_DEFAULTS });
      // Alle Zusatzleistungen kommen vorbelegt aus unserem Vertrag.
      setItems(
        RGI_STANDARD_FEES.map((f, i) => ({
          position: i,
          fee_type: f.fee_type,
          label: f.label,
          basis: f.basis,
          amount: f.amount ?? null,
          percent: f.percent ?? null,
          quantity: 1,
          is_gross: f.is_gross,
          vat_rate: 19,
          is_included: true,
          threshold: f.threshold ?? null,
          min_amount: f.min_amount ?? null,
          max_count: f.max_count ?? null,
          debtor: f.debtor ?? "community",
          halved_if_supervised: !!f.halved_if_supervised,
          tier_from: f.tier_from ?? null,
          tier_to: f.tier_to ?? null,
          note: f.note ?? null,
        }))
      );
      setDocx(null);
      setPdf(null);
      setSummaryDocx(null);
      setSummaryPdf(null);
    }
  }, [open, offer]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const monthlyNet = useMemo(() => {
    const rows: [any, any][] = [
      [form.rate_apartment, form.units_apartment],
      [form.rate_commercial, form.units_commercial],
      [form.rate_parking, form.units_parking],
      [form.rate_other, form.units_other],
    ];
    return rows.reduce((s, [rate, count]) => s + (Number(rate) || 0) * (Number(count) || 0), 0);
  }, [form]);

  const canContinue =
    step === 0 ? !!(form.prospect_name ?? "").trim() :
    step === 2 ? !!form.rate_apartment && !!form.units_apartment :
    true;

  const persist = async (): Promise<Offer | null> => {
    if (!(form.prospect_name ?? "").trim()) return null;
    const saved = await upsert.mutateAsync({
      ...form,
      answers,
      contract_defaults: defaults,
      monthly_net: monthlyNet || null,
    });
    await saveItems.mutateAsync({ offerId: saved.id, items });
    return saved;
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await persist();
      if (saved) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const buildDocument = async (formats: ("docx" | "pdf")[]) => {
    setRendering(true);
    try {
      const saved = await persist();
      if (!saved) return;
      const res = await renderOffer(saved.id, formats);
      setDocx(res.docx_path ?? null);
      setPdf(res.pdf_path ?? null);
      setSummaryDocx(res.summary_docx_path ?? null);
      setSummaryPdf(res.summary_pdf_path ?? null);
      if (res.pdf_error) {
        toast.error(`Word-Datei fertig, PDF fehlgeschlagen: ${res.pdf_error}`);
      } else {
        toast.success(formats.includes("pdf") ? "Vertragsentwurf als Word und PDF erzeugt" : "Vertragsentwurf als Word erzeugt");
      }
      // Das Uebersichtsblatt ist eine Beigabe: sein Fehlen darf den
      // Vertragsentwurf nicht als gescheitert erscheinen lassen.
      if (res.summary_error) {
        toast.warning(`Übersichtsblatt nicht erzeugt: ${res.summary_error}`);
      }
      if (saved.status === "inquiry") set("status", "drafted");
    } catch (e: any) {
      toast.error(e.message ?? "Erzeugen fehlgeschlagen");
    } finally {
      setRendering(false);
    }
  };

  const openFile = async (path: string) => {
    try {
      window.open(await offerSignedUrl(path), "_blank");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const setItem = (i: number, patch: Partial<OfferItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogTitle className="sr-only">
          {offer ? "Angebot bearbeiten" : "Neues Angebot"}
        </DialogTitle>

        {/* ---------- Kopf ---------- */}
        <div className="px-6 pt-5 pb-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={
                    i < step
                      ? "w-6 h-6 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs"
                      : i === step
                      ? "w-6 h-6 rounded-full bg-primary/15 text-primary border-2 border-primary grid place-items-center text-xs font-semibold"
                      : "w-6 h-6 rounded-full bg-muted text-muted-foreground grid place-items-center text-xs"
                  }
                >
                  {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={i === step ? "text-sm font-medium" : "text-sm text-muted-foreground hidden md:inline"}>
                  {s}
                </span>
                {i < STEPS.length - 1 && <div className="w-4 h-px bg-border hidden md:block" />}
              </div>
            ))}
          </div>
          <h2 className="text-lg font-semibold">
            {step === 0 && "Wer fragt an?"}
            {step === 1 && "Was wissen wir über das Objekt?"}
            {step === 2 && "Was wollen wir verlangen?"}
            {step === 3 && "Vertragsentwurf erzeugen"}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {step === 0 && "Name der Gemeinschaft und Anschrift des Objekts. Alles andere ist optional."}
            {step === 1 && "Hilft bei der Entscheidung und wandert später in die Unterlagen."}
            {step === 2 && "Nur die Gebühr pro Einheit — der Rest ist aus unserem Vertrag vorbelegt."}
            {step === 3 && "Alle Standardwerte stehen schon drin. Prüfen, erzeugen, verschicken."}
          </p>
        </div>

        {/* ---------- Inhalt ---------- */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {/* ===== Schritt 1 ===== */}
          {step === 0 && (
            <div className="space-y-4 max-w-xl">
              <div>
                <Label className="text-base">Name der Gemeinschaft</Label>
                <Input
                  className="mt-1.5"
                  value={form.prospect_name ?? ""}
                  onChange={(e) => set("prospect_name", e.target.value)}
                  placeholder="z. B. WEG Musterstraße 12"
                />
              </div>
              <div>
                <Label>Anschrift des Objekts</Label>
                <Input className="mt-1.5" value={form.object_address ?? ""}
                  onChange={(e) => set("object_address", e.target.value)} placeholder="Straße und Hausnummer" />
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <div>
                  <Label>PLZ</Label>
                  <Input className="mt-1.5" value={form.object_zip ?? ""} onChange={(e) => set("object_zip", e.target.value)} />
                </div>
                <div>
                  <Label>Ort</Label>
                  <Input className="mt-1.5" value={form.object_city ?? ""} onChange={(e) => set("object_city", e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Wer vertritt die Gemeinschaft?</Label>
                <Input className="mt-1.5" value={form.object_representative ?? ""}
                  onChange={(e) => set("object_representative", e.target.value)}
                  placeholder="z. B. der Verwaltungsbeirat, Herr Müller" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Art der Verwaltung</Label>
                  <Select value={form.management_mode ?? "weg"} onValueChange={(v) => set("management_mode", v)}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weg">WEG-Verwaltung</SelectItem>
                      <SelectItem value="rent">Mietverwaltung</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ab wann sollen wir übernehmen?</Label>
                  <Input className="mt-1.5" type="date" value={form.desired_start ?? ""}
                    onChange={(e) => set("desired_start", e.target.value || null)} />
                </div>
                <div>
                  <Label>Bisheriger Verwalter</Label>
                  <Input className="mt-1.5" value={form.previous_manager ?? ""}
                    onChange={(e) => set("previous_manager", e.target.value)} />
                </div>
                <div>
                  <Label>Wie kam der Kontakt?</Label>
                  <Input className="mt-1.5" value={form.inquiry_source ?? ""}
                    onChange={(e) => set("inquiry_source", e.target.value)} placeholder="Empfehlung, Anruf, Website" />
                </div>
              </div>
            </div>
          )}

          {/* ===== Schritt 2 ===== */}
          {step === 1 && (
            <div className="space-y-4 max-w-xl">
              {(questions ?? []).map((q) => (
                <div key={q.id}>
                  <Label className="text-base">{q.label}</Label>
                  {q.kind === "number" ? (
                    <Input
                      className="mt-1.5 max-w-[180px]"
                      inputMode="numeric"
                      value={answers[q.key] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                    />
                  ) : (
                    <Textarea
                      className="mt-1.5"
                      rows={2}
                      value={answers[q.key] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                    />
                  )}
                  {q.help_text && <p className="text-xs text-muted-foreground mt-1">{q.help_text}</p>}
                </div>
              ))}
              {(questions ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Es sind keine Fragen hinterlegt.
                </p>
              )}
              <div>
                <Label>Notizen zum Gespräch</Label>
                <Textarea className="mt-1.5" rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
              </div>
            </div>
          )}

          {/* ===== Schritt 3 ===== */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Beträge netto. Zeilen ohne Anzahl erscheinen später nicht im Vertrag.
              </p>
              <div className="space-y-3">
                {[
                  { rateKey: "rate_apartment", countKey: "units_apartment", label: "Wohnungen", required: true },
                  { rateKey: "rate_parking", countKey: "units_parking", label: "Garagen und Stellplätze" },
                  { rateKey: "rate_commercial", countKey: "units_commercial", label: "Teileigentum" },
                  { rateKey: "rate_other", countKey: "units_other", label: "Sonstige Einheiten" },
                ].map((row) => {
                  const rate = Number(form[row.rateKey]) || 0;
                  const count = Number(form[row.countKey]) || 0;
                  return (
                    <div key={row.rateKey} className="border rounded-md p-4">
                      <div className="font-medium text-sm mb-3">
                        {row.label}
                        {row.required && <span className="text-muted-foreground font-normal"> — brauchen wir</span>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                        <div>
                          <Label className="text-xs text-muted-foreground">Wie viele?</Label>
                          <Input className="mt-1" inputMode="numeric" value={form[row.countKey] ?? ""}
                            onChange={(e) => set(row.countKey, e.target.value === "" ? null : Number(e.target.value))} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Wie viel pro Einheit im Monat?</Label>
                          <div className="relative mt-1">
                            <Input className="pr-7" inputMode="decimal" value={form[row.rateKey] ?? ""}
                              onChange={(e) => set(row.rateKey, dec(e.target.value))} placeholder="30,00" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground pb-2.5 tabular-nums whitespace-nowrap">
                          = {formatEur(rate * count)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-md bg-primary/10 border border-primary/20 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Ergibt</div>
                <div className="text-2xl font-semibold text-primary tabular-nums mt-1">
                  {formatEur(monthlyNet)} <span className="text-sm font-normal text-muted-foreground">netto im Monat</span>
                </div>
                <div className="text-sm text-muted-foreground tabular-nums mt-0.5">
                  {formatEur(monthlyNet * 12)} netto im Jahr
                </div>
              </div>
            </div>
          )}

          {/* ===== Schritt 4 ===== */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 px-4 py-3">
                <div className="text-sm">
                  <strong>{form.prospect_name || "—"}</strong>
                  {form.object_address ? ` · ${form.object_address}` : ""}
                </div>
                <div className="text-sm text-muted-foreground tabular-nums mt-0.5">
                  {formatEur(monthlyNet)} netto im Monat · {formatEur(monthlyNet * 12)} im Jahr
                </div>
              </div>

              <div>
                <Label>Welche Vertragsvorlage?</Label>
                <Select value={form.template_id ?? "auto"} onValueChange={(v) => set("template_id", v === "auto" ? null : v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Standardvorlage verwenden</SelectItem>
                    {(contractTemplates ?? []).map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(contractTemplates ?? []).length === 0 && (
                  <p className="text-xs text-destructive mt-1.5">
                    Es ist noch keine Vertragsvorlage hinterlegt. Lade sie unter Einrichtung →
                    Word-Vorlagen hoch und wähle dort „Vorlage für Verträge“.
                  </p>
                )}
              </div>

              {/* Vorbelegte Zusatzleistungen */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 w-full justify-start">
                    <ChevronDown className="w-4 h-4" />
                    {items.filter((i) => i.is_included !== false).length} Zusatzleistungen aus unserem Vertrag — anpassen
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-2">
                  {items.map((it, i) => {
                    const pct = isPercentBasis(it.basis as FeeBasis);
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-2 border rounded-md px-3 py-2">
                        <Checkbox
                          checked={it.is_included !== false}
                          onCheckedChange={(v) => setItem(i, { is_included: !!v })}
                        />
                        <span className="text-sm flex-1 min-w-[180px]">{it.label}</span>
                        <Input
                          className="w-[110px] h-8"
                          inputMode="decimal"
                          value={pct ? str(it.percent) : str(it.amount)}
                          onChange={(e) =>
                            setItem(i, pct ? { percent: dec(e.target.value) } : { amount: dec(e.target.value) })
                          }
                        />
                        <span className="text-xs text-muted-foreground w-[150px]">
                          {BASIS_SUFFIX[it.basis as FeeBasis]}
                        </span>
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>

              {/* Vorbelegte Vertragskonstanten */}
              <Collapsible open={defaultsOpen} onOpenChange={setDefaultsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
                    <ChevronDown className={`w-4 h-4 transition-transform ${defaultsOpen ? "rotate-180" : ""}`} />
                    Weitere Vertragswerte, alle vorbelegt
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.keys(CONTRACT_DEFAULTS).map((k) => (
                    <div key={k} className={DEFAULT_MULTILINE.has(k) ? "sm:col-span-2" : undefined}>
                      <Label className="text-xs text-muted-foreground">{DEFAULT_LABEL[k] ?? k}</Label>
                      {DEFAULT_MULTILINE.has(k) ? (
                        <Textarea
                          className="mt-1"
                          rows={4}
                          value={defaults[k] ?? ""}
                          onChange={(e) => setDefaults((d) => ({ ...d, [k]: e.target.value }))}
                        />
                      ) : (
                        <Input
                          className="mt-1"
                          value={defaults[k] ?? ""}
                          onChange={(e) => setDefaults((d) => ({ ...d, [k]: e.target.value }))}
                        />
                      )}
                    </div>
                  ))}
                  <div>
                    <Label className="text-xs text-muted-foreground">Bestellung bis</Label>
                    <Input
                      className="mt-1"
                      value={defaults["bestellung.bis"] ?? ""}
                      onChange={(e) => setDefaults((d) => ({ ...d, "bestellung.bis": e.target.value }))}
                      placeholder="z. B. 31.12.2029"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Erzeugen */}
              <div className="border rounded-md p-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => buildDocument(["docx", "pdf"])} disabled={rendering} className="gap-1.5">
                    {rendering ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    Word und PDF erzeugen
                  </Button>
                  <Button variant="outline" onClick={() => buildDocument(["docx"])} disabled={rendering}>
                    Nur Word
                  </Button>
                </div>
                {(docx || pdf) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {docx && (
                      <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => openFile(docx)}>
                        <Download className="w-3.5 h-3.5" />Word öffnen
                      </Button>
                    )}
                    {pdf && (
                      <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => openFile(pdf)}>
                        <Download className="w-3.5 h-3.5" />PDF öffnen
                      </Button>
                    )}
                  </div>
                )}
                {(summaryDocx || summaryPdf) && (
                  <div className="flex flex-wrap gap-2 items-center pt-1">
                    <span className="text-xs text-muted-foreground">Übersichtsblatt:</span>
                    {summaryPdf && (
                      <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => openFile(summaryPdf)}>
                        <Download className="w-3.5 h-3.5" />PDF öffnen
                      </Button>
                    )}
                    {summaryDocx && (
                      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openFile(summaryDocx)}>
                        <Download className="w-3.5 h-3.5" />Word öffnen
                      </Button>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Das PDF wird über CloudConvert erzeugt, denselben Weg nutzen schon die Rechnungen.
                  Das einseitige Übersichtsblatt entsteht automatisch mit, sobald unter „Vorlagen“
                  eine Vorlage der Art „Übersichtsblatt“ hochgeladen ist.
                </p>
              </div>

              {/* Nachverfolgung */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-sm">Stand</Label>
                  <Select value={form.status ?? "inquiry"} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inquiry">Anfrage</SelectItem>
                      <SelectItem value="drafted">Entwurf</SelectItem>
                      <SelectItem value="sent">Versendet</SelectItem>
                      <SelectItem value="won">Gewonnen</SelectItem>
                      <SelectItem value="lost">Verloren</SelectItem>
                      <SelectItem value="withdrawn">Zurückgezogen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Versendet am</Label>
                  <Input className="mt-1.5" type="date" value={form.sent_on ?? ""}
                    onChange={(e) => set("sent_on", e.target.value || null)} />
                </div>
                <div>
                  <Label className="text-sm">Nachfassen am</Label>
                  <Input className="mt-1.5" type="date" value={form.follow_up_on ?? ""}
                    onChange={(e) => set("follow_up_on", e.target.value || null)} />
                </div>
              </div>
              {form.status === "lost" && (
                <div>
                  <Label className="text-sm">Warum verloren?</Label>
                  <Input className="mt-1.5" value={form.lost_reason ?? ""}
                    onChange={(e) => set("lost_reason", e.target.value)}
                    placeholder="Preis, Referenzen, kein Wechsel beschlossen…" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---------- Fuß ---------- */}
        <div className="px-6 py-4 border-t flex items-center gap-2 bg-muted/30">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />Zurück
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          )}
          {step === 2 && monthlyNet > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums hidden sm:inline">
              {formatEur(monthlyNet)} im Monat
            </span>
          )}
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <>
              {step >= 1 && (
                <Button variant="outline" onClick={save} disabled={saving || !(form.prospect_name ?? "").trim()}>
                  Speichern und schließen
                </Button>
              )}
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue} className="gap-1.5">
                Weiter<ArrowRight className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button onClick={save} disabled={saving || !(form.prospect_name ?? "").trim()} className="gap-1.5">
              {saving ? "Speichern…" : <>Angebot speichern<Check className="w-4 h-4" /></>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
