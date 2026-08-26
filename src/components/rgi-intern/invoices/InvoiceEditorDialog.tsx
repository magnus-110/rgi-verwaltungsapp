// Rechnungsentwurf bearbeiten.
//
// Zwei Dinge sind hier bewusst weg:
//
// Die Live-Vorschau. Sie belegte die halbe Breite und zeigte eine
// Nachbildung, die dem echten Word-Dokument nicht gleicht. Wer
// wissen will, wie die Rechnung aussieht, drückt „PDF-Vorschau“ und
// bekommt das Dokument selbst. Die Positionstabelle hat dafür jetzt
// die volle Breite.
//
// Die Zahlungseingänge. Vor dem Versand gibt es nichts zu buchen —
// sie stehen jetzt in der Rechnungsansicht.

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Trash2, Plus, RefreshCw, Download, FileSignature, FileStack, Save, FolderInput,
  Wallet, Landmark, ChevronUp, ChevronDown, Pencil,
} from "lucide-react";
import { toast } from "sonner";

import {
  useRgiClients, useRgiProjects, useRgiTemplates, useRgiInvoice, useRgiInvoiceItems,
  useCreateRgiInvoice, useUpdateRgiInvoice, useUpsertRgiInvoiceItems,
  useRgiItemPresets, useUpsertRgiItemPreset,
  rgiNextInvoiceNumber, rgiRenderInvoice, rgiSignedUrl, type RgiInvoiceItem,
} from "@/hooks/useRgi";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ImportFromProjectDialog } from "./ImportFromProjectDialog";
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
  kind: "flat", description: "", quantity: 1, unit: "Std", unit_price_net: 0, vat_rate: 19,
});

export function InvoiceEditorDialog({ open, onOpenChange, invoiceId }: Props) {
  const { user } = useAuth();
  const { data: clients } = useRgiClients();
  const { data: projects } = useRgiProjects();
  const { data: templates } = useRgiTemplates();
  const { data: invoice } = useRgiInvoice(invoiceId);
  const { data: items } = useRgiInvoiceItems(invoiceId);
  const { data: presets } = useRgiItemPresets();

  const create = useCreateRgiInvoice();
  const update = useUpdateRgiInvoice();
  const upsertItems = useUpsertRgiInvoiceItems();
  const upsertPreset = useUpsertRgiItemPreset();

  const [d, setD] = useState<Draft>(emptyDraft());
  const [rendering, setRendering] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [headOpen, setHeadOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHeadOpen(false);
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
    } else {
      setD(emptyDraft());
      setHeadOpen(true); // ohne Objektbezug muss man alles selbst setzen
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
  const client = clients?.find((c) => c.id === d.client_id);

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

  /**
   * Vergibt die Rechnungsnummer und erzeugt das Dokument. Der Knopf
   * hieß früher „Festschreiben und versenden“ — verschickt wurde nie
   * etwas, einen Mailversand gibt es in der App nicht.
   */
  const finalize = async () => {
    if (!d.client_id) { toast.error("Bitte einen Rechnungsempfänger wählen"); return; }
    if (!d.template_id) { toast.error("Bitte zuerst eine Word-Vorlage wählen"); return; }
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
      toast.success(`Nummer ${extra.invoice_number ?? invoice?.invoice_number} vergeben, PDF erzeugt`);
      if (r?.pdf_path) window.open(await rgiSignedUrl("invoices", r.pdf_path), "_blank");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Fehlgeschlagen: ${e?.message ?? e}`);
    } finally {
      setRendering(false);
    }
  };

  const preview = async (format: "pdf" | "docx") => {
    if (!d.client_id) { toast.error("Bitte einen Rechnungsempfänger wählen"); return; }
    if (!d.template_id) { toast.error("Bitte zuerst eine Word-Vorlage wählen"); return; }
    setRendering(true);
    const tid = toast.loading(`${format.toUpperCase()} wird erzeugt …`);
    try {
      const id = await persist();
      const r = await rgiRenderInvoice(id, [format]);
      if (format === "pdf" && r?.pdf_error) throw new Error(r.pdf_error);
      const path = format === "pdf" ? r?.pdf_path : r?.docx_path;
      if (!path) throw new Error(`${format.toUpperCase()} wurde nicht erzeugt`);
      window.open(await rgiSignedUrl("invoices", path), "_blank");
      toast.success(`${format.toUpperCase()} erzeugt`, { id: tid });
    } catch (e: any) {
      console.error("preview failed", e);
      toast.error(`Rendern fehlgeschlagen: ${e?.message ?? e}`, { id: tid });
    } finally {
      setRendering(false);
    }
  };

  // ---------------- Darstellung ----------------

  const summary = [
    client?.name || "Empfänger fehlt",
    `Rechnung vom ${formatDate(d.issue_date)}`,
    d.service_period_from
      ? `Leistung ${formatDate(d.service_period_from)}–${formatDate(d.service_period_to)}`
      : null,
    d.paid_by_withdrawal
      ? "Selbstentnahme vom Objektkonto"
      : d.due_date ? `fällig ${formatDate(d.due_date)}` : "Überweisung",
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col border-0 [&>button]:top-4 [&>button]:right-4">
        <DialogHeader className="px-6 pt-4 pb-3 border-b bg-background shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base flex-wrap">
            {isFinal ? "Rechnung" : "Rechnungsentwurf"}
            {invoice?.invoice_number
              ? <Badge variant="outline" className="font-mono">{invoice.invoice_number}</Badge>
              : <Badge variant="secondary" className="font-normal">noch keine Nummer</Badge>}
            {d.paid_by_withdrawal && (
              <Badge variant="secondary" className="gap-1 font-normal">
                <Wallet className="w-3 h-3" />Selbstentnahme
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl p-6 space-y-4">

            {/* Kopfdaten: eine Zeile, aufklappbar */}
            <Card className="p-3">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                {d.paid_by_withdrawal
                  ? <Wallet className="w-4 h-4 text-primary shrink-0" />
                  : <Landmark className="w-4 h-4 text-muted-foreground shrink-0" />}
                {summary.map((s, i) => (
                  <span key={i} className="flex items-center gap-2">
                    {i > 0 && <span className="text-muted-foreground">·</span>}
                    <span className={i === 0 ? "font-medium" : ""}>{s}</span>
                  </span>
                ))}
                <Button variant="ghost" size="sm" className="ml-auto gap-1.5 h-8"
                  onClick={() => setHeadOpen((v) => !v)}>
                  <Pencil className="w-3.5 h-3.5" />{headOpen ? "Zuklappen" : "Ändern"}
                </Button>
              </div>
              {!headOpen && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Aus dem Objekt übernommen. Aufklappen nur, wenn du abweichen willst.
                </p>
              )}

              {headOpen && (
                <div className="mt-3 pt-3 border-t grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Rechnungsempfänger *</Label>
                    <Select value={d.client_id} onValueChange={(v) => setD({ ...d, client_id: v })} disabled={isFinal}>
                      <SelectTrigger><SelectValue placeholder="Empfänger wählen…" /></SelectTrigger>
                      <SelectContent>
                        {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Projekt (optional)</Label>
                    <Select value={d.project_id ?? "none"}
                      onValueChange={(v) => setD({ ...d, project_id: v === "none" ? null : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— kein Projekt —</SelectItem>
                        {projects?.filter((p) => !d.client_id || p.client_id === d.client_id).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Rechnungsdatum</Label>
                    <Input type="date" value={d.issue_date}
                      onChange={(e) => setD({ ...d, issue_date: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">{d.paid_by_withdrawal ? "Fällig (entfällt)" : "Fällig am"}</Label>
                    <Input type="date" value={d.due_date} disabled={d.paid_by_withdrawal}
                      onChange={(e) => setD({ ...d, due_date: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Leistung von</Label>
                    <Input type="date" value={d.service_period_from ?? ""}
                      onChange={(e) => setD({ ...d, service_period_from: e.target.value || null })} />
                  </div>
                  <div>
                    <Label className="text-xs">Leistung bis</Label>
                    <Input type="date" value={d.service_period_to ?? ""}
                      onChange={(e) => setD({ ...d, service_period_to: e.target.value || null })} />
                  </div>
                  <label className="sm:col-span-2 flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 cursor-pointer">
                    <span className="text-sm">
                      {d.paid_by_withdrawal ? "Selbstentnahme vom Objektkonto" : "Überweisung durch den Empfänger"}
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        {d.paid_by_withdrawal
                          ? "Die Rechnung ist der Beleg zur Entnahme — ohne Bankverbindung und Zahlungsziel."
                          : "Die Rechnung zeigt Bankverbindung und Zahlungsziel."}
                      </span>
                    </span>
                    <Switch checked={d.paid_by_withdrawal}
                      onCheckedChange={(v) => setD({ ...d, paid_by_withdrawal: v })} />
                  </label>
                </div>
              )}
            </Card>

            {/* Positionen, volle Breite */}
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Positionen<span className="ml-1.5 font-normal normal-case">· {d.items.length}</span>
                </h3>
                <div className="flex gap-1.5 flex-wrap">
                  <Select value="" onValueChange={applyPreset}>
                    <SelectTrigger className="h-8 w-[164px] text-xs">
                      <span className="flex items-center gap-1.5">
                        <FileStack className="w-3.5 h-3.5" />Vorlage laden…
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {(presets ?? []).length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Keine Vorlagen</div>
                      )}
                      {presets?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.sparte ? ` · ${p.sparte}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}
                    disabled={!d.project_id} className="h-8 gap-1 text-xs">
                    <FolderInput className="w-3.5 h-3.5" />Stunden
                  </Button>
                  <Button size="sm" variant="ghost" onClick={saveAsPreset}
                    disabled={d.items.length === 0} className="h-8 gap-1 text-xs">
                    <Save className="w-3.5 h-3.5" />Als Vorlage
                  </Button>
                  <Button size="sm" className="h-8 gap-1 text-xs"
                    onClick={() => setD({ ...d, items: [...d.items, blankItem()] })}>
                    <Plus className="w-3.5 h-3.5" />Position
                  </Button>
                </div>
              </div>

              {d.items.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-10 border border-dashed rounded-md">
                  Noch keine Positionen. Über „Position“ oder eine Vorlage hinzufügen.
                </div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Beschreibung</TableHead>
                        <TableHead className="w-[88px] text-right">Menge</TableHead>
                        <TableHead className="w-[92px]">Einheit</TableHead>
                        <TableHead className="w-[110px] text-right">€ netto</TableHead>
                        <TableHead className="w-[84px]">USt</TableHead>
                        <TableHead className="w-[118px] text-right">Betrag</TableHead>
                        <TableHead className="w-[76px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.items.map((it, idx) => {
                        const lineNet = (it.quantity ?? 0) * (it.unit_price_net ?? 0);
                        return (
                          <TableRow key={idx} className="align-top">
                            <TableCell className="text-xs font-mono text-muted-foreground pt-4">{idx + 1}</TableCell>
                            <TableCell className="p-1.5">
                              <Textarea
                                rows={1}
                                placeholder="Beschreibung der Leistung…"
                                className="min-h-[34px] text-sm resize-y"
                                value={it.description ?? ""}
                                onChange={(e) => setItem(idx, { description: e.target.value })}
                              />
                            </TableCell>
                            <TableCell className="p-1.5">
                              <Input className="h-8 text-right text-sm tabular-nums" type="number" step="0.01"
                                value={it.quantity ?? 0}
                                onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} />
                            </TableCell>
                            <TableCell className="p-1.5">
                              <Input className="h-8 text-sm" value={it.unit ?? ""}
                                onChange={(e) => setItem(idx, { unit: e.target.value })} />
                            </TableCell>
                            <TableCell className="p-1.5">
                              <Input className="h-8 text-right text-sm tabular-nums" type="number" step="0.01"
                                value={it.unit_price_net ?? 0}
                                onChange={(e) => setItem(idx, { unit_price_net: Number(e.target.value) })} />
                            </TableCell>
                            <TableCell className="p-1.5">
                              <Select value={String(it.vat_rate ?? 19)}
                                onValueChange={(v) => setItem(idx, { vat_rate: Number(v) })}>
                                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">0 %</SelectItem>
                                  <SelectItem value="7">7 %</SelectItem>
                                  <SelectItem value="19">19 %</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm pt-4 whitespace-nowrap tabular-nums">
                              {formatEur(lineNet)}
                            </TableCell>
                            <TableCell className="p-1.5">
                              <div className="flex">
                                <Button variant="ghost" size="icon" className="h-8 w-6"
                                  disabled={idx === 0} onClick={() => moveItem(idx, -1)}>
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-6"
                                  disabled={idx === d.items.length - 1} onClick={() => moveItem(idx, 1)}>
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-6"
                                  onClick={() => setD({ ...d, items: d.items.filter((_, i) => i !== idx) })}>
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="mt-4 pt-3 border-t flex justify-end">
                <dl className="grid grid-cols-2 gap-x-8 gap-y-1 min-w-[250px] text-sm">
                  <dt className="text-muted-foreground">Netto</dt>
                  <dd className="text-right font-mono tabular-nums">{formatEur(totals.net)}</dd>
                  {totals.vat19 > 0 && (
                    <>
                      <dt className="text-muted-foreground">USt 19 %</dt>
                      <dd className="text-right font-mono tabular-nums">{formatEur(totals.vat19)}</dd>
                    </>
                  )}
                  {totals.vat7 > 0 && (
                    <>
                      <dt className="text-muted-foreground">USt 7 %</dt>
                      <dd className="text-right font-mono tabular-nums">{formatEur(totals.vat7)}</dd>
                    </>
                  )}
                  <dt className="font-semibold text-base pt-1 border-t">Gesamt</dt>
                  <dd className="text-right font-mono tabular-nums font-semibold text-base pt-1 border-t">
                    {formatEur(totals.gross)}
                  </dd>
                </dl>
              </div>
            </Card>

            {/* Vorlage und Texte */}
            <Card className="p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Vorlage und Texte
              </h3>
              <div>
                <Label className="text-xs">Word-Vorlage *</Label>
                <Select value={d.template_id ?? "none"}
                  onValueChange={(v) => setD({ ...d, template_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— noch keine gewählt —</SelectItem>
                    {templates?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}{t.is_default ? " (Standard)" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!d.template_id && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Ohne Vorlage lässt sich kein Dokument erzeugen. Vorlagen liegen unter „Word-Vorlagen“.
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Einleitungstext</Label>
                <Textarea rows={3} value={d.intro_text}
                  onChange={(e) => setD({ ...d, intro_text: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Fußtext</Label>
                <Textarea rows={2} value={d.footer_text}
                  onChange={(e) => setD({ ...d, footer_text: e.target.value })} />
              </div>
            </Card>
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap px-6 py-3 border-t bg-background shrink-0">
          <span className="mr-auto text-sm self-center">
            Gesamt <b className="font-mono tabular-nums">{formatEur(totals.gross)}</b>
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          {!isFinal && (
            <Button variant="secondary" onClick={saveDraft}
              disabled={create.isPending || update.isPending || rendering}>
              Entwurf speichern
            </Button>
          )}
          <Button variant="outline" onClick={() => preview("docx")}
            disabled={rendering || !d.client_id} className="gap-1.5">
            <Download className="w-4 h-4" />Word
          </Button>
          <Button variant="outline" onClick={() => preview("pdf")}
            disabled={rendering || !d.client_id} className="gap-1.5">
            {rendering ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDF-Vorschau
          </Button>
          <Button onClick={finalize} disabled={rendering || !d.client_id} className="gap-1.5">
            {rendering ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
            {isFinal ? "PDF neu erzeugen" : "Nummer vergeben und PDF erzeugen"}
          </Button>
        </DialogFooter>
      </DialogContent>

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
  const today = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 14);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return {
    client_id: "", project_id: null, template_id: null,
    issue_date: fmt(today), due_date: fmt(due),
    service_period_from: null, service_period_to: null,
    intro_text: "", footer_text: "", paid_by_withdrawal: false, items: [],
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
