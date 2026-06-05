import { useRgiSettings, useRgiClients, type RgiInvoiceItem } from "@/hooks/useRgi";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Building2, User, Calendar, FileText, Receipt, Banknote } from "lucide-react";

interface Props {
  clientId: string;
  issueDate: string;
  dueDate: string;
  servicePeriodFrom: string | null;
  servicePeriodTo: string | null;
  introText: string;
  footerText: string;
  invoiceNumber?: string | null;
  items: Partial<RgiInvoiceItem>[];
}

const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE");
};
const fmtMoney = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export function InvoiceLivePreview(p: Props) {
  const { data: company } = useRgiSettings();
  const { data: clients } = useRgiClients();
  const client = clients?.find((c) => c.id === p.clientId);

  let net = 0, vat19 = 0, vat7 = 0;
  for (const it of p.items) {
    const n = (it.quantity ?? 0) * (it.unit_price_net ?? 0);
    net += n;
    const r = it.vat_rate ?? 0;
    if (r === 19) vat19 += n * 0.19;
    else if (r === 7) vat7 += n * 0.07;
  }
  const gross = net + vat19 + vat7;

  const period = p.servicePeriodFrom || p.servicePeriodTo
    ? `${fmtDate(p.servicePeriodFrom)} – ${fmtDate(p.servicePeriodTo)}`
    : null;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4 bg-muted/30">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Vorschau</h2>
        <Badge variant={p.invoiceNumber ? "default" : "secondary"} className="font-mono">
          {p.invoiceNumber || "ENTWURF"}
        </Badge>
      </div>

      {/* Kunde + Eckdaten */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
            <User className="w-3.5 h-3.5" /> Rechnungsempfänger
          </div>
          {client ? (
            <div className="space-y-0.5 text-sm">
              <div className="font-semibold">{client.name}</div>
              {client.address_line1 && <div>{client.address_line1}</div>}
              {(client.zip || client.city) && <div>{[client.zip, client.city].filter(Boolean).join(" ")}</div>}
              {client.country && <div className="text-muted-foreground">{client.country}</div>}
              <div className="pt-1 text-xs text-muted-foreground space-y-0.5">
                {client.customer_no && <div>Kd-Nr. {client.customer_no}</div>}
                {client.vat_id && <div>USt-IdNr. {client.vat_id}</div>}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">Noch kein Kunde gewählt</div>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
            <Calendar className="w-3.5 h-3.5" /> Eckdaten
          </div>
          <div className="grid grid-cols-2 gap-y-1.5 text-sm">
            <span className="text-muted-foreground">Rechnungsdatum</span><span className="font-medium">{fmtDate(p.issueDate)}</span>
            <span className="text-muted-foreground">Fällig bis</span><span className="font-medium">{fmtDate(p.dueDate)}</span>
            {period && (<><span className="text-muted-foreground">Leistung</span><span>{period}</span></>)}
          </div>
        </Card>
      </div>

      {/* Einleitung */}
      {p.introText && (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
            <FileText className="w-3.5 h-3.5" /> Einleitung
          </div>
          <p className="text-sm whitespace-pre-line">{p.introText}</p>
        </Card>
      )}

      {/* Positionen */}
      <Card className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-3">
          <Receipt className="w-3.5 h-3.5" /> Positionen ({p.items.length})
        </div>
        {p.items.length === 0 ? (
          <div className="text-sm text-muted-foreground italic text-center py-6">— noch keine Positionen —</div>
        ) : (
          <div className="space-y-2">
            {p.items.map((it, i) => {
              const lineNet = (it.quantity ?? 0) * (it.unit_price_net ?? 0);
              const lineGross = lineNet * (1 + (it.vat_rate ?? 0) / 100);
              return (
                <div key={i} className="flex items-start gap-3 py-2 border-b last:border-b-0">
                  <div className="text-xs font-mono text-muted-foreground pt-0.5 w-5">{i + 1}.</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium whitespace-pre-line">{it.description || <span className="text-muted-foreground italic">ohne Beschreibung</span>}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {Number(it.quantity ?? 0).toLocaleString("de-DE")} {it.unit} × {fmtMoney(it.unit_price_net ?? 0)} · {it.vat_rate ?? 0}% USt
                    </div>
                  </div>
                  <div className="text-sm font-mono font-semibold whitespace-nowrap">{fmtMoney(lineGross)}</div>
                </div>
              );
            })}
          </div>
        )}

        <Separator className="my-3" />
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Netto</span><span className="font-mono">{fmtMoney(net)}</span></div>
          {vat19 > 0 && <div className="flex justify-between text-muted-foreground"><span>USt 19 %</span><span className="font-mono">{fmtMoney(vat19)}</span></div>}
          {vat7 > 0 && <div className="flex justify-between text-muted-foreground"><span>USt 7 %</span><span className="font-mono">{fmtMoney(vat7)}</span></div>}
          <div className="flex justify-between font-semibold text-base pt-1 border-t"><span>Gesamtbetrag</span><span className="font-mono">{fmtMoney(gross)}</span></div>
        </div>
      </Card>

      {/* Footer-Text */}
      {p.footerText && (
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground mb-2">Fußtext</div>
          <p className="text-sm whitespace-pre-line">{p.footerText}</p>
        </Card>
      )}

      {/* Bankdaten */}
      <Card className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
          <Banknote className="w-3.5 h-3.5" /> Zahlung
        </div>
        <p className="text-sm">
          Bitte überweisen Sie den Gesamtbetrag von <strong>{fmtMoney(gross)}</strong> bis zum <strong>{fmtDate(p.dueDate)}</strong> auf:
        </p>
        <div className="mt-2 text-sm grid grid-cols-[80px_1fr] gap-y-0.5">
          <span className="text-muted-foreground">Bank</span><span className="font-medium">{company?.bank_name || "—"}</span>
          <span className="text-muted-foreground">IBAN</span><span className="font-mono">{company?.iban || "—"}</span>
          <span className="text-muted-foreground">BIC</span><span className="font-mono">{company?.bic || "—"}</span>
        </div>
      </Card>

      {/* Absender / Firma */}
      <Card className="p-3 bg-transparent border-dashed">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="w-3.5 h-3.5" />
          <span>{company?.legal_name} · {company?.address_line1} · {company?.zip} {company?.city}</span>
        </div>
      </Card>
    </div>
  );
}
