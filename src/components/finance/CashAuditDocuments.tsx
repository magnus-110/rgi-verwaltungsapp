import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, FileText, Receipt, Landmark, BarChart3 } from "lucide-react";
import { PdfViewerModal } from "@/components/documents/PdfViewerModal";

interface CashAuditDocumentsProps {
  buildingId: string;
  fiscalYear: number;
  billingPeriodId: string;
}

export function CashAuditDocuments({ buildingId, fiscalYear, billingPeriodId }: CashAuditDocumentsProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["statements"]));
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const { data: statements = [] } = useQuery({
    queryKey: ["audit-statements", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_statements")
        .select("id, file_name, file_path, import_date, statement_date_from, statement_date_to")
        .eq("building_id", buildingId)
        .order("statement_date_from", { ascending: false });
      return data || [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["audit-invoices", buildingId, fiscalYear],
    queryFn: async () => {
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

  const openPdf = async (bucket: string, path: string) => {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (data?.signedUrl) setPdfUrl(data.signedUrl);
  };

  const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  const sections = [
    {
      id: "statements",
      label: "Kontoauszüge",
      icon: Landmark,
      count: statements.length,
      content: (
        <div className="space-y-1">
          {statements.map((s) => (
            <button
              key={s.id}
              onClick={() => s.file_path && openPdf("building-documents", s.file_path)}
              className="w-full flex items-center gap-3 p-2 rounded hover:bg-muted/50 text-left text-sm"
            >
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="flex-1 truncate">{s.file_name}</span>
              <span className="text-xs text-muted-foreground">
                {s.statement_date_from && new Date(s.statement_date_from).toLocaleDateString("de-DE")}
                {s.statement_date_to && ` – ${new Date(s.statement_date_to).toLocaleDateString("de-DE")}`}
              </span>
            </button>
          ))}
          {statements.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Keine Kontoauszüge vorhanden</p>}
        </div>
      ),
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
              onClick={() => inv.file_path && openPdf("invoices", inv.file_path)}
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
      label: "Abrechnungen & Pläne",
      icon: BarChart3,
      count: null,
      content: (
        <div className="py-4 text-center text-sm text-muted-foreground">
          Die Abrechnungs- und Wirtschaftsplan-PDFs werden über den Abrechnungs-Tab erstellt und können dort eingesehen werden.
        </div>
      ),
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

      {pdfUrl && <PdfViewerModal isOpen={!!pdfUrl} onClose={() => setPdfUrl(null)} documentUrl={pdfUrl} documentName="Dokument" />}
    </div>
  );
}
