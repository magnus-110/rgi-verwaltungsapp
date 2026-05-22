import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, FileText, Receipt, Landmark, BarChart3 } from "lucide-react";
import { toast } from "sonner";

interface CashAuditDocumentsProps {
  buildingId: string;
  fiscalYear: number;
  billingPeriodId: string;
  auditId: string;
  tokenMode?: boolean;
  token?: string;
}

export function CashAuditDocuments({ buildingId, fiscalYear, billingPeriodId, auditId, tokenMode, token }: CashAuditDocumentsProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // PDF-Kontoauszüge (vom Admin hochgeladen)
  const { data: statements = [] } = useQuery({
    queryKey: ["audit-pdf-statements", auditId, tokenMode ? token : "auth"],
    queryFn: async () => {
      if (tokenMode && token) {
        const { data } = await supabase.rpc("get_audit_pdf_statements_by_token", { p_token: token });
        return (data as any[]) || [];
      }
      const { data } = await supabase
        .from("cash_audit_statements")
        .select("id, file_name, file_path, uploaded_at, sort_order, category")
        .eq("cash_audit_id", auditId)
        .order("sort_order")
        .order("uploaded_at");
      return data || [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["audit-invoices", buildingId, fiscalYear, tokenMode ? token : "auth"],
    queryFn: async () => {
      if (tokenMode && token) {
        const { data } = await supabase.rpc("get_audit_invoices_by_token", { p_token: token });
        return (data as any[]) || [];
      }
      const { data } = await supabase
        .from("invoices")
        .select("id, vendor_name, invoice_number, gross_amount, file_path, invoice_date")
        .eq("building_id", buildingId)
        .gte("invoice_date", `${fiscalYear}-01-01`)
        .lte("invoice_date", `${fiscalYear}-12-31`)
        .order("invoice_date");
      return data || [];
    },
  });

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openInNewTab = (url: string) => {
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) toast.error("Bitte Pop-ups erlauben, um die Datei zu öffnen");
  };

  const openViaToken = async (kind: "invoice" | "statement_pdf", id: string, _name: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("audit-signed-url", {
        body: { token, kind, id },
      });
      if (error) throw error;
      if ((data as any)?.signedUrl) {
        openInNewTab((data as any).signedUrl);
      } else {
        throw new Error((data as any)?.error || "Konnte Datei nicht öffnen");
      }
    } catch (e: any) {
      toast.error(e.message || "Fehler beim Öffnen");
    }
  };

  const openViaStorage = async (bucket: string, path: string, _name: string) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error("Datei konnte nicht geöffnet werden");
      return;
    }
    openInNewTab(data.signedUrl);
  };

  const openInvoice = (inv: any) => {
    if (!inv.file_path) return toast.info("Keine PDF hinterlegt");
    const name = inv.vendor_name || inv.invoice_number || "Rechnung";
    if (tokenMode) openViaToken("invoice", inv.id, name);
    else openViaStorage("invoices", inv.file_path, name);
  };

  const openStatement = (s: any) => {
    if (!s.file_path) return;
    if (tokenMode) openViaToken("statement_pdf", s.id, s.file_name);
    else openViaStorage("building-documents", s.file_path, s.file_name);
  };

  const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  // Sektionierung nach category (Altdaten ohne category-Wert: nach Dateinamen erkennen).
  const dmsRegex = /Gesamtabrechnung|Einzelabrechnung|Verm.egensbericht|Verm.gensbericht|§?35a|_35a|Wirtschaftsplan|^Abrechnung[_ ]/i;
  const isPlanRow = (s: any) => s.category === "plan" || (!s.category && dmsRegex.test(s.file_name || ""));
  const planDocs = (statements as any[]).filter(isPlanRow);
  const bankStatements = (statements as any[]).filter((s) => !isPlanRow(s));

  const renderDocList = (list: any[], emptyText: string) => (
    <div className="space-y-1">
      {list.map((s: any) => (
        <button
          key={s.id}
          onClick={() => openStatement(s)}
          className="w-full flex items-center gap-3 p-2 rounded hover:bg-muted/50 text-left text-sm"
        >
          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="flex-1 truncate">{s.file_name}</span>
          <span className="text-xs text-muted-foreground">
            {s.uploaded_at && new Date(s.uploaded_at).toLocaleDateString("de-DE")}
          </span>
        </button>
      ))}
      {list.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">{emptyText}</p>}
    </div>
  );

  const sections = [
    {
      id: "statements",
      label: "Kontoauszüge",
      icon: Landmark,
      count: bankStatements.length,
      content: renderDocList(bankStatements, "Keine Kontoauszüge hochgeladen"),
    },
    {
      id: "invoices",
      label: "Rechnungen",
      icon: Receipt,
      count: invoices.length,
      content: (
        <div className="space-y-1">
          {invoices.map((inv: any) => (
            <button
              key={inv.id}
              onClick={() => openInvoice(inv)}
              className="w-full flex items-center gap-3 p-2 rounded hover:bg-muted/50 text-left text-sm"
            >
              <Receipt className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="truncate block">{inv.vendor_name || inv.invoice_number || "Rechnung"}</span>
                {inv.invoice_date && (
                  <span className="text-xs text-muted-foreground">{new Date(inv.invoice_date).toLocaleDateString("de-DE")}</span>
                )}
              </div>
              <span className="text-sm font-mono">{inv.gross_amount ? fmt(inv.gross_amount) : ""}</span>
            </button>
          ))}
          {invoices.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Keine Rechnungen vorhanden</p>}
        </div>
      ),
    },
    {
      id: "plans",
      label: "Abrechnungen & Berichte",
      icon: BarChart3,
      count: planDocs.length,
      content: renderDocList(planDocs, "Keine Abrechnungs-Dokumente angehängt"),
    },
  ];

  return (
    <div className="space-y-2">
      {sections.map((section) => {
        const isExpanded = expandedSections.has(section.id);
        const Icon = section.icon;
        return (
          <Card key={section.id} className="overflow-hidden">
            <Collapsible open={isExpanded} onOpenChange={() => toggleSection(section.id)}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 text-left transition-colors">
                  <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="font-medium text-sm flex-1">{section.label}</span>
                  {section.count !== null && (
                    <span className="text-xs text-muted-foreground">{section.count}</span>
                  )}
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 pb-3 border-t pt-2">
                  {section.content}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}
