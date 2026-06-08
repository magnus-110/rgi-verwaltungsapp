import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useRgiClients, useRgiProjects, useRgiTemplates, useRgiInvoice, useRgiInvoiceItems, useRgiPayments,
  useCreateRgiInvoice, useUpdateRgiInvoice, useUpsertRgiInvoiceItems, useAddRgiPayment,
  useRgiItemPresets, useUpsertRgiItemPreset,
  rgiNextInvoiceNumber, rgiRenderInvoice, rgiSignedUrl, type RgiInvoiceItem,
} from "@/hooks/useRgi";
import { Trash2, Plus, RefreshCw, Download, Send, CheckCircle, FileStack, Save, FolderInput } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ImportFromProjectDialog } from "./ImportFromProjectDialog";
import { InvoiceLivePreview } from "./InvoiceLivePreview";

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
  const { data: payments } = useRgiPayments(invoiceId);

  const create = useCreateRgiInvoice();
  const update = useUpdateRgiInvoice();
  const upsertItems = useUpsertRgiInvoiceItems();
  const addPayment = useAddRgiPayment();

  const [d, setD] = useState<Draft>(emptyDraft());
  const [rendering, setRendering] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const { data: presets } = useRgiItemPresets();
  const upsertPreset = useUpsertRgiItemPreset();

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
    toast.success(`Vorlage "${p.name}" geladen`);
  };

  const saveAsPreset = async () => {
    if (d.items.length === 0) { toast.error("Keine Positionen vorhanden"); return; }
    const name = window.prompt("Name der Rechnungsvorlage (z.B. Eigentümerwechsel, Mietvertrag, Verwaltergebühr):");
    if (!name) return;
    const project = projects?.find((p) => p.id === d.project_id);
    const itemsPayload = d.items.map((it) => ({
      kind: it.kind ?? "flat",
      description: it.description ?? "",
      quantity: Number(it.quantity ?? 1),
      unit: it.unit ?? "Stk",
      unit_price_net: Number(it.unit_price_net ?? 0),
      vat_rate: Number(it.vat_rate ?? 19),
    }));
    await upsertPreset.mutateAsync({ name, sparte: project?.sparte ?? null, items: itemsPayload } as any);
  };

  const handleImported = (newItems: Partial<RgiInvoiceItem>[]) => {
    setD((prev) => ({ ...prev, items: [...prev.items, ...newItems] }));
  };



  useEffect(() => {
    if (!open) return;
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
        items: (items ?? []).map((it) => ({ ...it })),
      });
    } else {
      setD(emptyDraft());
    }
  }, [open, invoice, items]);

  const setItem = (idx: number, patch: Partial<RgiInvoiceItem>) => {
    setD((prev) => ({ ...prev, items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  };

  const totals = computeTotals(d.items);

  const save = async (status?: "draft" | "sent") => {
    if (!d.client_id) { toast.error("Kunde wählen"); return; }
    try {
      let id = invoiceId;
      const project = projects?.find((p) => p.id === d.project_id);
      const payload: any = {
        client_id: d.client_id,
        project_id: d.project_id,
        template_id: d.template_id,
        issue_date: d.issue_date,
        due_date: d.due_date || null,
        service_period_from: d.service_period_from,
        service_period_to: d.service_period_to,
        intro_text: d.intro_text,
        footer_text: d.footer_text,
      };
      if (!id) {
        if (status === "sent") {
          payload.invoice_number = await rgiNextInvoiceNumber(project?.sparte);
          payload.status = "sent";
          payload.sent_at = new Date().toISOString();
        }
        payload.created_by = user?.id;
        const inv = await create.mutateAsync(payload);
        id = inv.id;
      } else {
        if (status === "sent" && (!invoice?.invoice_number)) {
          payload.invoice_number = await rgiNextInvoiceNumber(project?.sparte);
          payload.status = "sent";
          payload.sent_at = new Date().toISOString();
        } else if (status === "sent") {
          payload.status = "sent";
          if (!invoice?.sent_at) payload.sent_at = new Date().toISOString();
        }
        await update.mutateAsync({ id, patch: payload });
      }
      await upsertItems.mutateAsync({ invoiceId: id!, items: d.items });

      if (status === "sent") {
        // Mark time entries
        const allTimeIds = d.items.flatMap((it) => (it.source_time_entry_ids ?? []) as string[]);
        if (allTimeIds.length > 0) {
          const { supabase } = await import("@/integrations/supabase/client");
          // Map each item to its created item id — refetch items
          const { data: freshItems } = await supabase.from("rgi_invoice_items").select("id, source_time_entry_ids").eq("invoice_id", id!);
          for (const fi of freshItems ?? []) {
            const tids = (fi.source_time_entry_ids as string[] | null) ?? [];
            if (tids.length > 0) {
              await supabase.from("rgi_time_entries").update({ invoice_item_id: fi.id }).in("id", tids);
            }
          }
        }
        setRendering(true);
        try {
          const r = await rgiRenderInvoice(id!);
          toast.success("Rechnung versendet & PDF erzeugt");
          if (r?.pdf_path) {
            const url = await rgiSignedUrl("invoices", r.pdf_path);
            window.open(url, "_blank");
          }
        } catch (e: any) {
          toast.error(`PDF-Rendering fehlgeschlagen: ${e.message}`);
        } finally {
          setRendering(false);
        }
      } else {
        toast.success("Entwurf gespeichert");
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const addPay = async () => {
    if (!invoiceId || !payAmount) return;
    await addPayment.mutateAsync({
      invoice_id: invoiceId,
      amount: Number(payAmount),
      paid_on: new Date().toISOString().slice(0, 10),
    });
    setPayAmount("");
  };

  const previewRender = async (format: "pdf" | "docx") => {
    if (!d.client_id) { toast.error("Kunde wählen"); return; }
    if (!d.template_id) { toast.error('Bitte zuerst eine Word-Vorlage wählen (Feld "Vorlage" oben)'); return; }
    setRendering(true);
    const tid = toast.loading(`${format.toUpperCase()} wird erzeugt …`);
    try {
      let id = invoiceId;
      const payload: any = {
        client_id: d.client_id,
        project_id: d.project_id,
        template_id: d.template_id,
        issue_date: d.issue_date,
        due_date: d.due_date || null,
        service_period_from: d.service_period_from,
        service_period_to: d.service_period_to,
        intro_text: d.intro_text,
        footer_text: d.footer_text,
      };
      if (!id) {
        payload.created_by = user?.id;
        const inv = await create.mutateAsync(payload);
        id = inv.id;
      } else {
        await update.mutateAsync({ id, patch: payload });
      }
      await upsertItems.mutateAsync({ invoiceId: id!, items: d.items });

      const r = await rgiRenderInvoice(id!, [format]);
      const path = format === "pdf" ? r?.pdf_path : r?.docx_path;
      if (format === "pdf" && r?.pdf_error) {
        throw new Error(r.pdf_error);
      }
      if (!path) throw new Error(`${format.toUpperCase()} wurde nicht erzeugt`);
      const url = await rgiSignedUrl("invoices", path);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = path.split("/").pop() || `Rechnung.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      toast.success(`${format.toUpperCase()} erzeugt`, { id: tid });
    } catch (e: any) {
      console.error("previewRender failed", e);
      toast.error(`Rendering fehlgeschlagen: ${e?.message ?? e}`, { id: tid });
    } finally {
      setRendering(false);
    }
  };

  const isSent = !!invoice?.invoice_number;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col border-0 [&>button]:top-4 [&>button]:right-4">
        <DialogHeader className="px-6 pt-4 pb-3 border-b bg-background shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            {invoiceId ? "Rechnung bearbeiten" : "Neue Rechnung"}
            {invoice?.invoice_number && <Badge variant="outline" className="font-mono">{invoice.invoice_number}</Badge>}
            {invoice && <Badge>{invoice.status}</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] flex-1 min-h-0 overflow-hidden">
          {/* LINKS: Eingabe */}
          <div className="overflow-y-auto p-6 space-y-4 border-r bg-background">

            {/* Basisdaten */}
            <Card className="p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basisdaten</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Kunde *</Label>
                  <Select value={d.client_id} onValueChange={(v) => setD({ ...d, client_id: v })} disabled={isSent}>
                    <SelectTrigger><SelectValue placeholder="Kunde wählen…" /></SelectTrigger>
                    <SelectContent>{clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Projekt</Label>
                  <Select value={d.project_id ?? "none"} onValueChange={(v) => setD({ ...d, project_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— kein Projekt —</SelectItem>
                      {projects?.filter((p) => !d.client_id || p.client_id === d.client_id).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Word-Vorlage</Label>
                  <Select value={d.template_id ?? "none"} onValueChange={(v) => setD({ ...d, template_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Standard —</SelectItem>
                      {templates?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Rechnungsdatum</Label><Input type="date" value={d.issue_date} onChange={(e) => setD({ ...d, issue_date: e.target.value })} /></div>
                <div><Label className="text-xs">Fällig am</Label><Input type="date" value={d.due_date} onChange={(e) => setD({ ...d, due_date: e.target.value })} /></div>
                <div><Label className="text-xs">Leistung von</Label><Input type="date" value={d.service_period_from ?? ""} onChange={(e) => setD({ ...d, service_period_from: e.target.value || null })} /></div>
                <div><Label className="text-xs">Leistung bis</Label><Input type="date" value={d.service_period_to ?? ""} onChange={(e) => setD({ ...d, service_period_to: e.target.value || null })} /></div>
              </div>
            </Card>

            {/* Positionen */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Positionen</h3>
                <div className="flex gap-1.5 flex-wrap">
                  <Select value="" onValueChange={applyPreset}>
                    <SelectTrigger className="h-8 w-[170px] text-xs">
                      <span className="flex items-center gap-1.5"><FileStack className="w-3.5 h-3.5" />Vorlage laden…</span>
                    </SelectTrigger>
                    <SelectContent>
                      {(presets ?? []).length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Keine Vorlagen</div>}
                      {presets?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}{p.sparte ? ` · ${p.sparte}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)} disabled={!d.project_id} className="h-8 gap-1 text-xs">
                    <FolderInput className="w-3.5 h-3.5" />Projekt
                  </Button>
                  <Button size="sm" variant="ghost" onClick={saveAsPreset} disabled={d.items.length === 0} className="h-8 gap-1 text-xs">
                    <Save className="w-3.5 h-3.5" />Speichern
                  </Button>
                  <Button size="sm" onClick={() => setD({ ...d, items: [...d.items, blankItem()] })} className="h-8 gap-1 text-xs">
                    <Plus className="w-3.5 h-3.5" />Position
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {d.items.map((it, idx) => {
                  const lineNet = (it.quantity ?? 0) * (it.unit_price_net ?? 0);
                  const lineGross = lineNet * (1 + (it.vat_rate ?? 0) / 100);
                  return (
                    <div key={idx} className="border rounded-md p-3 space-y-2 bg-muted/30">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-mono text-muted-foreground pt-2 w-5">{idx + 1}.</span>
                        <Textarea
                          rows={2}
                          placeholder="Beschreibung der Leistung…"
                          className="flex-1 text-sm"
                          value={it.description ?? ""}
                          onChange={(e) => setItem(idx, { description: e.target.value })}
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setD({ ...d, items: d.items.filter((_, i) => i !== idx) })}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end pl-7">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Menge</Label>
                          <Input className="h-8" type="number" step="0.01" value={it.quantity ?? 0} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Einheit</Label>
                          <Input className="h-8" value={it.unit ?? ""} onChange={(e) => setItem(idx, { unit: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">€ netto</Label>
                          <Input className="h-8" type="number" step="0.01" value={it.unit_price_net ?? 0} onChange={(e) => setItem(idx, { unit_price_net: Number(e.target.value) })} />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">USt</Label>
                          <Select value={String(it.vat_rate ?? 19)} onValueChange={(v) => setItem(idx, { vat_rate: Number(v) })}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">0%</SelectItem>
                              <SelectItem value="7">7%</SelectItem>
                              <SelectItem value="19">19%</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="text-sm font-mono font-semibold whitespace-nowrap pb-1.5">{lineGross.toFixed(2)} €</div>
                      </div>
                    </div>
                  );
                })}
                {d.items.length === 0 && <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">Noch keine Positionen. Klick auf „Position" oder eine Vorlage.</div>}
              </div>

              <div className="mt-4 pt-3 border-t flex justify-end">
                <div className="text-sm space-y-1 min-w-[240px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Netto</span><span className="font-mono">{totals.net.toFixed(2)} €</span></div>
                  {totals.vat19 > 0 && <div className="flex justify-between text-muted-foreground"><span>USt 19%</span><span className="font-mono">{totals.vat19.toFixed(2)} €</span></div>}
                  {totals.vat7 > 0 && <div className="flex justify-between text-muted-foreground"><span>USt 7%</span><span className="font-mono">{totals.vat7.toFixed(2)} €</span></div>}
                  <div className="flex justify-between font-semibold text-base pt-1 border-t"><span>Brutto</span><span className="font-mono">{totals.gross.toFixed(2)} €</span></div>
                </div>
              </div>
            </Card>

            {/* Texte */}
            <Card className="p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Texte</h3>
              <div><Label className="text-xs">Einleitungstext</Label><Textarea rows={2} value={d.intro_text} onChange={(e) => setD({ ...d, intro_text: e.target.value })} /></div>
              <div><Label className="text-xs">Fußtext</Label><Textarea rows={2} value={d.footer_text} onChange={(e) => setD({ ...d, footer_text: e.target.value })} /></div>
            </Card>

            {/* Zahlungen */}
            {invoiceId && isSent && (
              <Card className="p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Zahlungen</h3>
                <div className="space-y-1 mb-3">
                  {(payments ?? []).map((pmt) => (
                    <div key={pmt.id} className="text-sm flex justify-between border-b pb-1">
                      <span>{pmt.paid_on} {pmt.note && `· ${pmt.note}`}</span>
                      <span className="font-mono">{Number(pmt.amount).toFixed(2)} €</span>
                    </div>
                  ))}
                  {(payments ?? []).length === 0 && <span className="text-sm text-muted-foreground">Keine Zahlungen erfasst.</span>}
                </div>
                <div className="flex gap-2">
                  <Input type="number" step="0.01" placeholder="Betrag (€)" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                  <Button onClick={addPay} disabled={!payAmount} className="gap-1.5"><CheckCircle className="w-4 h-4" />Erfassen</Button>
                </div>
              </Card>
            )}
          </div>

          {/* RECHTS: Vorschau */}
          <div className="hidden lg:block overflow-hidden">
            <InvoiceLivePreview
              clientId={d.client_id}
              issueDate={d.issue_date}
              dueDate={d.due_date}
              servicePeriodFrom={d.service_period_from}
              servicePeriodTo={d.service_period_to}
              introText={d.intro_text}
              footerText={d.footer_text}
              invoiceNumber={invoice?.invoice_number}
              items={d.items}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap px-6 py-3 border-t bg-background shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          {!isSent && <Button variant="secondary" onClick={() => save("draft")} disabled={create.isPending || update.isPending}>Als Entwurf speichern</Button>}
          <Button variant="outline" onClick={() => previewRender("docx")} disabled={rendering || !d.client_id} className="gap-1.5">
            <Download className="w-4 h-4" />Word
          </Button>
          <Button variant="outline" onClick={() => previewRender("pdf")} disabled={rendering || !d.client_id} className="gap-1.5">
            {rendering ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDF
          </Button>
          <Button onClick={() => save("sent")} disabled={rendering || !d.client_id} className="gap-1.5">
            {rendering ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isSent ? "Speichern & neu rendern" : "Versenden"}
          </Button>
        </DialogFooter>
      </DialogContent>
      {d.project_id && (
        <ImportFromProjectDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          projectId={d.project_id}
          clientId={d.client_id}
          onApply={handleImported}
        />
      )}
    </Dialog>
  );
}

function emptyDraft(): Draft {
  const today = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 14);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    client_id: "", project_id: null, template_id: null,
    issue_date: fmt(today), due_date: fmt(due),
    service_period_from: null, service_period_to: null,
    intro_text: "", footer_text: "", items: [],
  };
}


function computeTotals(items: Partial<RgiInvoiceItem>[]) {
  let net = 0, vat19 = 0, vat7 = 0, vat0 = 0;
  for (const it of items) {
    const lineNet = (it.quantity ?? 0) * (it.unit_price_net ?? 0);
    const r = it.vat_rate ?? 0;
    net += lineNet;
    if (r === 19) vat19 += lineNet * 0.19;
    else if (r === 7) vat7 += lineNet * 0.07;
    else vat0 += 0;
  }
  return { net, vat19, vat7, vat0, gross: net + vat19 + vat7 };
}
