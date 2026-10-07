// Rechnungsentwurf bearbeiten – eine Seite für alles.
//
// Früher gab es zwei Schritte: einen Dialog „Rechnungsentwurf
// erstellen“ und danach diese Bearbeitungsseite. Jetzt landet man
// direkt hier. Links steht die Rechnung so, wie sie später aussieht
// (Empfänger, Daten, Einleitung, Positionen, Summen), und alles ist
// an Ort und Stelle änderbar. Rechts stehen Gesamtbetrag, Zahlungsweg
// und die nächsten Schritte. Alle Knöpfe sitzen oben in einer Leiste.

import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Trash2, Plus, RefreshCw, Eye, FileStack, Save, FolderInput, Landmark,
  ChevronUp, ChevronDown, ChevronLeft, X, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

import {
  useRgiClients, useRgiProjects, useRgiInvoice, useRgiInvoiceItems,
  useCreateRgiInvoice, useUpdateRgiInvoice, useUpsertRgiInvoiceItems,
  useRgiItemPresets, useUpsertRgiItemPreset,
  rgiNextInvoiceNumber, rgiRenderInvoice, rgiSignedUrl, type RgiInvoiceItem,
} from "@/hooks/useRgi";
import { useDeleteInvoiceDraft } from "@/hooks/useRgiBilling";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ImportFromProjectDialog } from "./ImportFromProjectDialog";
import { DEFAULT_INTRO } from "@/types/rgiBilling";
import { formatDate, formatEur } from "@/types/rgiContracts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string | null;
}

type Draft = {
  client_id: string;
  project_id: string | null;
  template_id: string | null;
  issue_date: string;
  due_date: string;
  service_period_from: string | null;
  service_period_to: string | null;
  intro_text: string;
  footer_text: string;
  paid_by_withdrawal: boolean;
  items: Partial<RgiInvoiceItem>[];
};

const blankItem = (): Partial<RgiInvoiceItem> => ({
  kind: "flat", description: "", quantity: 1, unit: "Stück", unit_price_net: 0, vat_rate: 19,
});

/** Kleine Überschrift über einem Abschnitt. */
function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{children}</span>;
}

export function InvoiceEditorDialog({ open, onOpenChange, invoiceId }: Props) {
  const { user } = useAuth();
  const { data: clients } = useRgiClients();
  const { data: projects } = useRgiProjects();
  const { data: invoice } = useRgiInvoice(invoiceId);
  const { data: items } = useRgiInvoiceItems(invoiceId);
  const { data: presets } = useRgiItemPresets();

  const create = useCreateRgiInvoice();
  const update = useUpdateRgiInvoice();
  const upsertItems = useUpsertRgiInvoiceItems();
  const upsertPreset = useUpsertRgiItemPreset();
  const deleteDraft = useDeleteInvoiceDraft();

  const [d, setD] = useState<Draft>(emptyDraft());
  const [rendering, setRendering] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [footerOpen, setFooterOpen] = useState(false);
  const [askDelete, setAskDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRecipientOpen(false);
    if (invoice) {
      setD({
        client_id: invoice.client_id,
        project_id: invoice.project_id,
        template_id: invoice.template_id,
        issue_date: invoice.issue_date,
        due_date: invoice.due_date ?? "",
        service_period_from: invoice.service_period_from,
        service_period_to: invoice.service_period_to,
        intro_text: invoice.intro_text ?? "",
        footer_text: invoice.footer_text ?? "",
        paid_by_withdrawal: (invoice as any).paid_by_withdrawal === true,
        items: (items ?? []).map((it) => ({ ...it })),
      });
      setFooterOpen(!!invoice.footer_text);
    } else {
      setD(emptyDraft());
      setRecipientOpen(true); // ohne Objektbezug muss man den Empfänger selbst wählen
      setFooterOpen(false);
    }
  }, [open, invoice, items]);

  const setItem = (idx: number, patch: Partial<RgiInvoiceItem>) =>
    setD((prev) => ({ ...prev, items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));

  const moveItem = (idx: number, dir: -1 | 1) =>
    setD((prev) => {
      const next = [...prev.items];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...prev, items: next };
    });

  const totals = computeTotals(d.items);
  const isFinal = !!invoice?.invoice_number;
  const client = clients?.find((c) => c.id === d.client_id) as any;
  const hasBuilding = !!((invoice as any)?.building_id || client?.building_id);

  // ---------------- Vorlagen ----------------

  const applyPreset = (presetId: string) => {
    const p = presets?.find((x) => x.id === presetId);
    if (!p) return;
    const newItems: Partial<RgiInvoiceItem>[] = (((p.items as any) ?? []) as any[]).map((it: any) => ({
      kind: it.kind ?? "flat",
      description: it.description ?? "",
      quantity: Number(it.quantity ?? 1),
      unit: it.unit ?? "Stk",
      unit_price_net: Number(it.unit_price_net ?? 0),
      vat_rate: Number(it.vat_rate ?? 19),
    }));
    setD((prev) => ({ ...prev, items: [...prev.items, ...newItems] }));
    toast.success(`Vorlage „${p.name}“ geladen`);
  };

  const saveAsPreset = async () => {
    if (d.items.length === 0) { toast.error("Keine Positionen vorhanden"); return; }
    const name = window.prompt("Name der Positionsvorlage (z. B. Eigentümerwechsel, Mietvertrag):");
    if (!name) return;
    const project = projects?.find((p) => p.id === d.project_id);
    await upsertPreset.mutateAsync({
      name,
      sparte: project?.sparte ?? null,
      items: d.items.map((it) => ({
        kind: it.kind ?? "flat",
        description: it.description ?? "",
        quantity: Number(it.quantity ?? 1),
        unit: it.unit ?? "Stk",
        unit_price_net: Number(it.unit_price_net ?? 0),
        vat_rate: Number(it.vat_rate ?? 19),
      })),
    } as any);
  };

  // ---------------- Speichern und Ausgeben ----------------

  const buildPayload = () => ({
    client_id: d.client_id,
    project_id: d.project_id,
    template_id: d.template_id,
    issue_date: d.issue_date,
    due_date: d.paid_by_withdrawal ? null : (d.due_date || null),
    service_period_from: d.service_period_from,
    service_period_to: d.service_period_to,
    intro_text: d.intro_text,
    footer_text: d.footer_text,
    paid_by_withdrawal: d.paid_by_withdrawal,
  }) as any;

  /** Speichert und gibt die Rechnungs-ID zurück. */
  const persist = async (extra?: Record<string, unknown>) => {
    let id = invoiceId;
    const payload = { ...buildPayload(), ...(extra ?? {}) };
    if (!id) {
      payload.created_by = user?.id;
      const inv = await create.mutateAsync(payload);
      id = inv.id;
    } else {
      await update.mutateAsync({ id, patch: payload });
    }
    await upsertItems.mutateAsync({ invoiceId: id!, items: d.items });
    return id!;
  };

  const saveDraft = async () => {
    if (!d.client_id) { toast.error("Bitte einen Rechnungsempfänger wählen"); return; }
    try {
      await persist();
      toast.success("Entwurf gespeichert");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  /** Vergibt die Rechnungsnummer und erzeugt das PDF. */
  const finalize = async () => {
    if (!d.client_id) { toast.error("Bitte einen Rechnungsempfänger wählen"); return; }
    setRendering(true);
    try {
      const project = projects?.find((p) => p.id === d.project_id);
      const extra: Record<string, unknown> = {};
      if (!invoice?.invoice_number) {
        extra.invoice_number = await rgiNextInvoiceNumber(project?.sparte);
        extra.status = "sent";
        extra.sent_at = new Date().toISOString();
      }
      const id = await persist(extra);

      // Verbrauchte Zeiterfassungen an ihre Position hängen, damit
      // sie nicht ein zweites Mal zur Abrechnung angeboten werden.
      const allTimeIds = d.items.flatMap((it) => (it.source_time_entry_ids ?? []) as string[]);
      if (allTimeIds.length > 0) {
        const { data: freshItems } = await supabase
          .from("rgi_invoice_items")
          .select("id, source_time_entry_ids")
          .eq("invoice_id", id);
        for (const fi of freshItems ?? []) {
          const tids = (fi.source_time_entry_ids as string[] | null) ?? [];
          if (tids.length > 0) {
            await supabase.from("rgi_time_entries").update({ invoice_item_id: fi.id }).in("id", tids);
          }
        }
      }

      const r = await rgiRenderInvoice(id);
      const nr = extra.invoice_number ?? invoice?.invoice_number;
      toast.success(`Nummer ${nr} vergeben, PDF erzeugt`, {
        description: r?.payment === "created" || r?.payment === "updated"
          ? "Die Rechnung steht jetzt unter „Zahlungen“ beim Objekt."
          : r?.payment_error
            ? `Nicht in Zahlungen eingestellt: ${r.payment_error}`
            : "Ohne Objektbezug — nicht in Zahlungen eingestellt.",
      });
      if (r?.pdf_path) window.open(await rgiSignedUrl("invoices", r.pdf_path), "_blank");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Fehlgeschlagen: ${e?.message ?? e}`);
    } finally {
      setRendering(false);
    }
  };

  const preview = async () => {
    if (!d.client_id) { toast.error("Bitte einen Rechnungsempfänger wählen"); return; }
    setRendering(true);
    const tid = toast.loading("PDF wird erzeugt …");
    try {
      const id = await persist();
      const r = await rgiRenderInvoice(id, ["pdf"]);
      if (r?.pdf_error) throw new Error(r.pdf_error);
      if (!r?.pdf_path) throw new Error("PDF wurde nicht erzeugt");
      window.open(await rgiSignedUrl("invoices", r.pdf_path), "_blank");
      toast.success("PDF erzeugt", { id: tid });
    } catch (e: any) {
      console.error("preview failed", e);
      toast.error(`PDF fehlgeschlagen: ${e?.message ?? e}`, { id: tid });
    } finally {
      setRendering(false);
    }
  };

  // ---------------- Darstellung ----------------

  const busy = rendering || create.isPending || update.isPending;
  const paymentText = d.paid_by_withdrawal
    ? "Der Rechnungsbetrag wird gemäß Verwaltervertrag vom Objektkonto der Gemeinschaft entnommen."
    : hasBuilding
      ? "Der Rechnungsbetrag wird durch die Hausverwaltung vom Konto der Gemeinschaft überwiesen."
      : "Die Rechnung zeigt die Bankverbindung – der Empfänger überweist selbst.";
  const dateField = (label: string, value: string, onChange: (v: string) => void, disabled = false) => (
    <div className="flex flex-col gap-1">
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      <Input type="date" value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} className="h-10 rounded-lg bg-muted/30" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col border-0 bg-background [&>button]:hidden">
        {/* Kopfleiste mit allen Aktionen */}
        <div className="border-b bg-background shrink-0">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex-1 min-w-[260px]">
              <button type="button" onClick={() => onOpenChange(false)}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <ChevronLeft className="w-3.5 h-3.5" />Zurück
              </button>
              <div className="flex flex-wrap items-center gap-2.5 mt-0.5">
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  {isFinal ? "Rechnung" : "Rechnungsentwurf"}
                </DialogTitle>
                {invoice?.invoice_number ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-muted font-mono">{invoice.invoice_number}</span>
                ) : (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-800 dark:bg-primary/15 dark:text-orange-200">
                    Entwurf · Nummer folgt beim Festschreiben
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isFinal && invoiceId && (
                <Button variant="ghost" onClick={() => setAskDelete(true)} disabled={deleteDraft.isPending || busy}
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-4 h-4" />Löschen
                </Button>
              )}
              {!isFinal && (
                <Button variant="outline" className="rounded-full gap-1.5" onClick={saveDraft} disabled={busy}>
                  <Save className="w-4 h-4" />Speichern
                </Button>
              )}
              <Button variant="outline" className="rounded-full gap-1.5" onClick={preview} disabled={busy || !d.client_id}>
                {rendering ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}PDF-Vorschau
              </Button>
              <Button className="rounded-full gap-1.5 bg-foreground text-background hover:bg-foreground/90"
                onClick={finalize} disabled={busy || !d.client_id}>
                {isFinal ? "PDF neu erzeugen" : "Festschreiben & PDF erzeugen"}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Schließen">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-muted/40">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 flex flex-wrap items-start gap-6">

            {/* Die Rechnung */}
            <div className="flex-[999_1_640px] min-w-0 rounded-2xl border bg-card overflow-hidden">
              <div className="h-1 bg-primary" />
              <div className="p-5 sm:p-8 space-y-7">

                {/* Empfänger und Daten */}
                <div className="flex flex-wrap gap-x-10 gap-y-6 justify-between">
                  <div className="flex-[1_1_260px] min-w-0">
                    <div className="flex items-baseline gap-3">
                      <Eyebrow>Rechnung an</Eyebrow>
                      {!isFinal && (
                        <button type="button" onClick={() => setRecipientOpen((v) => !v)}
                          className="text-xs font-medium text-primary hover:underline">
                          {recipientOpen ? "Fertig" : "Ändern"}
                        </button>
                      )}
                    </div>
                    {recipientOpen ? (
                      <div className="mt-2 space-y-3">
                        <div>
                          <Label className="text-xs font-normal text-muted-foreground">Rechnungsempfänger *</Label>
                          <Select value={d.client_id} onValueChange={(v) => setD({ ...d, client_id: v })}>
                            <SelectTrigger className="h-10"><SelectValue placeholder="Empfänger wählen…" /></SelectTrigger>
                            <SelectContent>
                              {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs font-normal text-muted-foreground">Projekt (optional)</Label>
                          <Select value={d.project_id ?? "none"}
                            onValueChange={(v) => setD({ ...d, project_id: v === "none" ? null : v })}>
                            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— kein Projekt —</SelectItem>
                              {projects?.filter((p) => !d.client_id || p.client_id === d.client_id).map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[15px] leading-relaxed">
                        {client ? (
                          <>
                            <div className="font-semibold">{client.name}</div>
                            {client.address_line1 && <div>{client.address_line1}</div>}
                            {(client.zip || client.city) && <div>{[client.zip, client.city].filter(Boolean).join(" ")}</div>}
                          </>
                        ) : (
                          <div className="text-muted-foreground">Noch kein Empfänger gewählt</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-[1_1_340px] grid grid-cols-2 gap-3">
                    {dateField("Rechnungsdatum", d.issue_date, (v) => setD({ ...d, issue_date: v }))}
                    {d.paid_by_withdrawal
                      ? dateField("Fällig (entfällt)", "", () => {}, true)
                      : dateField("Überweisen bis", d.due_date, (v) => setD({ ...d, due_date: v }))}
                    {dateField("Leistungszeitraum von", d.service_period_from ?? "", (v) => setD({ ...d, service_period_from: v || null }))}
                    {dateField("Leistungszeitraum bis", d.service_period_to ?? "", (v) => setD({ ...d, service_period_to: v || null }))}
                  </div>
                </div>

                {/* Einleitung */}
                <div className="space-y-1.5">
                  <Eyebrow>Einleitung</Eyebrow>
                  <Textarea rows={3} value={d.intro_text}
                    onChange={(e) => setD({ ...d, intro_text: e.target.value })}
                    className="text-[15px] leading-relaxed bg-muted/30 border-transparent hover:border-input focus-visible:border-input" />
                </div>

                {/* Positionen */}
                <div>
                  <div className="flex items-baseline gap-2.5 mb-2.5">
                    <Eyebrow>Positionen</Eyebrow>
                    <span className="text-xs text-muted-foreground">
                      {d.items.length} {d.items.length === 1 ? "Position" : "Positionen"}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <div className="min-w-[680px]">
                      <div className="grid grid-cols-[24px_minmax(0,1fr)_60px_84px_92px_84px_100px_72px] gap-2.5 items-center pb-2 border-b-[1.5px] border-foreground text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <div>Pos.</div><div>Beschreibung</div><div className="text-right">Menge</div><div>Einheit</div>
                        <div className="text-right">Einzelpreis</div><div>USt.</div><div className="text-right">Netto</div><div />
                      </div>

                      {d.items.length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-8 border-b">
                          Noch keine Positionen. Über „Position hinzufügen“ oder eine Vorlage ergänzen.
                        </div>
                      )}

                      {d.items.map((it, idx) => {
                        const lineNet = (it.quantity ?? 0) * (it.unit_price_net ?? 0);
                        return (
                          <div key={idx}
                            className="grid grid-cols-[24px_minmax(0,1fr)_60px_84px_92px_84px_100px_72px] gap-2.5 items-start py-3 border-b">
                            <div className="text-sm text-muted-foreground pt-2.5">{idx + 1}</div>
                            <Textarea
                              rows={1}
                              placeholder="Beschreibung der Leistung"
                              className="min-h-[40px] text-sm font-medium resize-none [field-sizing:content]"
                              value={it.description ?? ""}
                              onChange={(e) => setItem(idx, { description: e.target.value })}
                            />
                            <Input className="h-10 text-right text-sm tabular-nums" type="number" step="0.01"
                              aria-label="Menge" value={it.quantity ?? 0}
                              onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} />
                            <Input className="h-10 text-sm" aria-label="Einheit" value={it.unit ?? ""}
                              onChange={(e) => setItem(idx, { unit: e.target.value })} />
                            <Input className="h-10 text-right text-sm tabular-nums" type="number" step="0.01"
                              aria-label="Einzelpreis netto" value={it.unit_price_net ?? 0}
                              onChange={(e) => setItem(idx, { unit_price_net: Number(e.target.value) })} />
                            <Select value={String(it.vat_rate ?? 19)}
                              onValueChange={(v) => setItem(idx, { vat_rate: Number(v) })}>
                              <SelectTrigger className="h-10 text-sm" aria-label="Umsatzsteuer"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">0 %</SelectItem>
                                <SelectItem value="7">7 %</SelectItem>
                                <SelectItem value="19">19 %</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="text-right text-sm font-semibold tabular-nums pt-2.5 whitespace-nowrap">
                              {formatEur(lineNet)}
                            </div>
                            <div className="flex justify-end">
                              <Button variant="ghost" size="icon" className="h-9 w-6" aria-label="Nach oben"
                                disabled={idx === 0} onClick={() => moveItem(idx, -1)}>
                                <ChevronUp className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-9 w-6" aria-label="Nach unten"
                                disabled={idx === d.items.length - 1} onClick={() => moveItem(idx, 1)}>
                                <ChevronDown className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-9 w-7 text-muted-foreground hover:text-destructive"
                                aria-label="Position entfernen"
                                onClick={() => setD({ ...d, items: d.items.filter((_, i) => i !== idx) })}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button variant="outline" size="sm" className="h-9 rounded-full gap-1.5 border-dashed"
                      onClick={() => setD({ ...d, items: [...d.items, blankItem()] })}>
                      <Plus className="w-3.5 h-3.5" />Position hinzufügen
                    </Button>
                    <Select value="" onValueChange={applyPreset}>
                      <SelectTrigger className="h-9 w-auto rounded-full text-sm gap-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5"><FileStack className="w-3.5 h-3.5" />Aus Vorlage</div>
                      </SelectTrigger>
                      <SelectContent>
                        {(presets ?? []).length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">Keine Vorlagen</div>
                        )}
                        {presets?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}{p.sparte ? ` · ${p.sparte}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="h-9 rounded-full gap-1.5"
                      onClick={() => setImportOpen(true)} disabled={!d.project_id}
                      title={d.project_id ? undefined : "Erst unter „Ändern“ ein Projekt wählen"}>
                      <FolderInput className="w-3.5 h-3.5" />Stunden übernehmen
                    </Button>
                    <Button variant="ghost" size="sm" className="h-9 rounded-full gap-1.5"
                      onClick={saveAsPreset} disabled={d.items.length === 0}>
                      <Save className="w-3.5 h-3.5" />Als Vorlage speichern
                    </Button>
                  </div>
                </div>

                {/* Summen */}
                <div className="flex justify-end">
                  <dl className="w-[300px] max-w-full space-y-1.5 text-sm">
                    <div className="flex justify-between"><dt className="text-muted-foreground">Summe netto</dt>
                      <dd className="tabular-nums">{formatEur(totals.net)}</dd></div>
                    {totals.vat19 > 0 && (
                      <div className="flex justify-between"><dt className="text-muted-foreground">zzgl. 19 % Umsatzsteuer</dt>
                        <dd className="tabular-nums">{formatEur(totals.vat19)}</dd></div>
                    )}
                    {totals.vat7 > 0 && (
                      <div className="flex justify-between"><dt className="text-muted-foreground">zzgl. 7 % Umsatzsteuer</dt>
                        <dd className="tabular-nums">{formatEur(totals.vat7)}</dd></div>
                    )}
                    <div className="flex justify-between items-baseline pt-2.5 mt-1.5 border-t-[1.5px] border-foreground">
                      <dt className="font-semibold">Gesamtbetrag</dt>
                      <dd className="tabular-nums text-xl font-bold">{formatEur(totals.gross)}</dd>
                    </div>
                  </dl>
                </div>

                {/* Zahlungshinweis, wie er auf der Rechnung steht */}
                <div className="flex gap-3 items-start rounded-xl bg-orange-50/70 dark:bg-primary/10 px-4 py-3.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-[18px] h-[18px] shrink-0 mt-0.5 text-primary" />
                  <span>{paymentText}</span>
                </div>

                {/* Fußtext nur bei Bedarf */}
                {footerOpen ? (
                  <div className="space-y-1.5">
                    <Eyebrow>Fußtext (optional)</Eyebrow>
                    <Textarea rows={2} value={d.footer_text} placeholder="z. B. ein Hinweis für den Empfänger"
                      onChange={(e) => setD({ ...d, footer_text: e.target.value })} className="bg-muted/30" />
                  </div>
                ) : (
                  <button type="button" onClick={() => setFooterOpen(true)}
                    className="text-sm font-medium text-primary hover:underline">
                    + Fußtext hinzufügen
                  </button>
                )}
              </div>
            </div>

            {/* Seitenleiste */}
            <aside className="flex-[1_1_300px] min-w-0 lg:max-w-[360px] space-y-4 lg:sticky lg:top-0">
              <div className="rounded-2xl border bg-card p-5">
                <Eyebrow>Gesamtbetrag</Eyebrow>
                <div className="text-3xl font-bold tracking-tight tabular-nums mt-0.5">{formatEur(totals.gross)}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {formatEur(totals.net)} netto · {formatEur(totals.vat19 + totals.vat7)} USt.
                </div>
                <div className="mt-4 flex gap-2.5 items-start rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
                  <Landmark className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                  <span>
                    {d.paid_by_withdrawal
                      ? "Selbstentnahme vom Objektkonto (ältere Rechnung)"
                      : hasBuilding
                        ? <>Überweisung durch die Hausverwaltung{d.due_date && <> bis <b className="font-semibold">{formatDate(d.due_date)}</b></>}</>
                        : <>Der Empfänger überweist{d.due_date && <> bis <b className="font-semibold">{formatDate(d.due_date)}</b></>}</>}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-5">
                <div className="mb-3"><Eyebrow>So geht es weiter</Eyebrow></div>
                <ol className="space-y-3">
                  {[
                    ["Entwurf prüfen", "Positionen, Daten und Text stimmen? Mit „PDF-Vorschau“ siehst du die echte Rechnung."],
                    ["Festschreiben", "Die Rechnung bekommt ihre Nummer und das PDF wird erzeugt."],
                    ["Zahlungslauf", "Die Rechnung steht automatisch unter „Zahlungen“ beim Objekt."],
                  ].map(([t, txt], i) => {
                    const done = isFinal ? i < 2 : i < 0;
                    const current = isFinal ? i === 2 : i === 0;
                    return (
                      <li key={t} className="flex gap-3 items-start">
                        <span className={`w-6 h-6 shrink-0 rounded-full text-xs font-bold inline-flex items-center justify-center ${
                          current ? "bg-primary text-primary-foreground" : done ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                        }`}>{i + 1}</span>
                        <div>
                          <div className="font-semibold text-sm">{t}</div>
                          <div className="text-xs text-muted-foreground">{txt}</div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </aside>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={askDelete} onOpenChange={setAskDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Entwurf löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Entwurf mit seinen {d.items.length} Positionen wird gelöscht. Angehakte
              Posten und verbrauchte Stunden werden wieder freigegeben und stehen erneut
              unter „Abzurechnen“.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteDraft.isPending}
              onClick={async () => {
                if (!invoiceId) return;
                try {
                  await deleteDraft.mutateAsync({
                    id: invoiceId,
                    invoice_number: invoice?.invoice_number ?? null,
                  });
                  setAskDelete(false);
                  onOpenChange(false);
                } catch {
                  setAskDelete(false);
                }
              }}
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {d.project_id && (
        <ImportFromProjectDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          projectId={d.project_id}
          clientId={d.client_id}
          onApply={(newItems) => setD((prev) => ({ ...prev, items: [...prev.items, ...newItems] }))}
        />
      )}
    </Dialog>
  );
}

function emptyDraft(): Draft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    client_id: "", project_id: null, template_id: null,
    issue_date: today,
    // Überwiesen wird bis zum Jahresende des Rechnungsjahres.
    due_date: `${today.slice(0, 4)}-12-31`,
    service_period_from: null, service_period_to: null,
    intro_text: DEFAULT_INTRO, footer_text: "", paid_by_withdrawal: false, items: [],
  };
}

function computeTotals(items: Partial<RgiInvoiceItem>[]) {
  let net = 0, vat19 = 0, vat7 = 0;
  for (const it of items) {
    const lineNet = (it.quantity ?? 0) * (it.unit_price_net ?? 0);
    net += lineNet;
    const r = it.vat_rate ?? 0;
    if (r === 19) vat19 += lineNet * 0.19;
    else if (r === 7) vat7 += lineNet * 0.07;
  }
  return { net, vat19, vat7, gross: net + vat19 + vat7 };
}
