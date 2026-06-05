import { useRgiSettings, useRgiClients, type RgiInvoiceItem } from "@/hooks/useRgi";

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
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE");
};
const fmtMoney = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export function InvoiceLivePreview(p: Props) {
  const { data: company } = useRgiSettings();
  const { data: clients } = useRgiClients();
  const client = clients?.find((c) => c.id === p.clientId);

  let net = 0, vat19 = 0, vat7 = 0, vat0 = 0;
  for (const it of p.items) {
    const n = (it.quantity ?? 0) * (it.unit_price_net ?? 0);
    net += n;
    const r = it.vat_rate ?? 0;
    if (r === 19) vat19 += n * 0.19;
    else if (r === 7) vat7 += n * 0.07;
    else vat0 += 0;
  }
  const gross = net + vat19 + vat7 + vat0;

  const period = p.servicePeriodFrom || p.servicePeriodTo
    ? `${fmtDate(p.servicePeriodFrom)} – ${fmtDate(p.servicePeriodTo)}`
    : "";

  return (
    <div className="bg-muted/40 rounded-md p-3 overflow-y-auto h-full">
      <div className="bg-white text-slate-900 shadow-md mx-auto" style={{ width: "100%", maxWidth: 720, aspectRatio: "1 / 1.414", padding: "32px 36px", fontFamily: "Arial, sans-serif", fontSize: 11 }}>
        {/* Briefkopf */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="text-[10px] font-semibold tracking-wide text-slate-600">RGI IMMOBILIEN</div>
            <div className="text-[9px] text-slate-500">Verkauf · Vermietung · Verwaltung</div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Rechnung</h1>
        </div>

        {/* Adresse + Meta */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <div className="text-[8px] text-slate-500 border-b border-slate-300 pb-1 mb-1">
              {company?.legal_name} · {[company?.address_line1, company?.zip, company?.city].filter(Boolean).join(" · ")}
            </div>
            <div className="font-semibold">{client?.name || <span className="text-slate-400">Kunde …</span>}</div>
            {client?.address_line1 && <div>{client.address_line1}</div>}
            {(client?.zip || client?.city) && <div>{[client?.zip, client?.city].filter(Boolean).join(" ")}</div>}
            {client?.country && <div>{client.country}</div>}
          </div>
          <div className="text-[10px]">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <span className="text-slate-500">Rechnungsnummer</span><span className="font-medium">{p.invoiceNumber || "ENTWURF"}</span>
              <span className="text-slate-500">Rechnungsdatum</span><span>{fmtDate(p.issueDate)}</span>
              <span className="text-slate-500">Fällig bis</span><span>{fmtDate(p.dueDate)}</span>
              {period && (<><span className="text-slate-500">Leistungszeitraum</span><span>{period}</span></>)}
              {client?.customer_no && (<><span className="text-slate-500">Kundennummer</span><span>{client.customer_no}</span></>)}
              {client?.vat_id && (<><span className="text-slate-500">USt-IdNr.</span><span>{client.vat_id}</span></>)}
            </div>
          </div>
        </div>

        <p className="mb-2">Sehr geehrte Damen und Herren,</p>
        {p.introText && <p className="whitespace-pre-line mb-3">{p.introText}</p>}

        {/* Positionstabelle */}
        <table className="w-full border-collapse text-[10px] mb-4">
          <thead>
            <tr className="border-b-2 border-slate-400 text-left">
              <th className="py-1 pr-1 w-6">Nr.</th>
              <th className="py-1 pr-1">Beschreibung</th>
              <th className="py-1 pr-1 text-right w-12">Menge</th>
              <th className="py-1 pr-1 w-10">Einh.</th>
              <th className="py-1 pr-1 text-right w-16">Einzelpreis</th>
              <th className="py-1 pr-1 text-right w-10">USt</th>
              <th className="py-1 pl-1 text-right w-16">Summe</th>
            </tr>
          </thead>
          <tbody>
            {p.items.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-400 py-3">— noch keine Positionen —</td></tr>
            )}
            {p.items.map((it, i) => {
              const lineNet = (it.quantity ?? 0) * (it.unit_price_net ?? 0);
              const lineGross = lineNet * (1 + (it.vat_rate ?? 0) / 100);
              return (
                <tr key={i} className="border-b border-slate-200 align-top">
                  <td className="py-1 pr-1">{i + 1}</td>
                  <td className="py-1 pr-1 whitespace-pre-line">{it.description || <span className="text-slate-400">…</span>}</td>
                  <td className="py-1 pr-1 text-right">{Number(it.quantity ?? 0).toLocaleString("de-DE")}</td>
                  <td className="py-1 pr-1">{it.unit}</td>
                  <td className="py-1 pr-1 text-right">{fmtMoney(it.unit_price_net ?? 0)}</td>
                  <td className="py-1 pr-1 text-right">{it.vat_rate ?? 0}%</td>
                  <td className="py-1 pl-1 text-right">{fmtMoney(lineGross)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Summen */}
        <div className="flex justify-end mb-4">
          <table className="text-[10px]">
            <tbody>
              <tr><td className="pr-6 py-0.5 text-slate-600">Nettobetrag</td><td className="text-right">{fmtMoney(net)}</td></tr>
              {vat19 > 0 && <tr><td className="pr-6 py-0.5 text-slate-600">Umsatzsteuer 19%</td><td className="text-right">{fmtMoney(vat19)}</td></tr>}
              {vat7 > 0 && <tr><td className="pr-6 py-0.5 text-slate-600">Umsatzsteuer 7%</td><td className="text-right">{fmtMoney(vat7)}</td></tr>}
              <tr className="font-semibold border-t border-slate-400"><td className="pr-6 py-0.5">Gesamtbetrag</td><td className="text-right">{fmtMoney(gross)}</td></tr>
            </tbody>
          </table>
        </div>

        {p.footerText && <p className="whitespace-pre-line mb-3 text-[10px]">{p.footerText}</p>}

        <p className="text-[10px] mb-3">
          Bitte überweisen Sie den Gesamtbetrag bis zum <strong>{fmtDate(p.dueDate)}</strong> auf folgendes Konto:<br />
          <strong>{company?.bank_name}</strong> · IBAN <strong>{company?.iban}</strong> · BIC <strong>{company?.bic}</strong>
        </p>

        <p className="text-[10px]">Mit freundlichen Grüßen<br /><strong>{company?.legal_name}</strong></p>

        <div className="mt-6 pt-2 border-t border-slate-300 text-[7.5px] text-slate-500 leading-snug">
          {company?.legal_name} · {company?.address_line1} · {company?.zip} {company?.city} · Tel. {company?.phone} · {company?.email}<br />
          Geschäftsführer {company?.ceo} · HRB {company?.hrb} · USt-IdNr. {company?.vat_id} · {company?.bank_name}: IBAN {company?.iban} · BIC {company?.bic}
        </div>
      </div>
    </div>
  );
}
