import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

const formatDate = (d: string) => new Date(d).toLocaleDateString("de-DE");

// Distribution key label mapping
const DIST_KEY_LABELS: Record<string, string> = {
  mea: "MEA", einheiten: "Einheiten", qm: "Fläche (qm)", personen: "Personen",
  verbrauch_wasser: "Wasser", verbrauch_warmwasser: "Warmwasser",
  heizkostenverordnung: "Heizk.Abr.", direkt: "direkt",
};

const DIST_KEY_TO_SHARE: Record<string, string> = {
  mea: "mea", einheiten: "einheit", qm: "qm", personen: "personen",
  verbrauch_wasser: "wasser", verbrauch_warmwasser: "warmwasser",
  heizkostenverordnung: "heizkosten",
};

// Section labels for the Gesamtabrechnung
const SECTION_LABELS: Record<string, string> = {
  income: "Einnahmen",
  operating_distributable: "Umlagefähige Ausgaben",
  operating_non_distributable: "Nicht umlagefähige Ausgaben",
  accrual: "Abgrenzungen",
  reserve: "Erhaltungsrücklage",
  reserve_withdrawal: "Rücklagenentnahme",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { buildingId, periodId, fiscalYear, ownerId } = await req.json();

    // Fetch all data in parallel
    const [
      { data: building },
      { data: period },
      { data: accounts },
      { data: bookings },
      { data: overrides },
      { data: assignments },
      { data: balances },
      { data: heatingValues },
      { data: planItems },
    ] = await Promise.all([
      supabase.from("buildings").select("name, address, manager_name").eq("id", buildingId).single(),
      supabase.from("billing_periods").select("*").eq("id", periodId).single(),
      supabase.from("chart_of_accounts").select("*").or(`building_id.is.null,building_id.eq.${buildingId}`).order("account_number"),
      supabase.from("bookings").select("account_id, amount, booking_category, is_35a_relevant, description").eq("building_id", buildingId).eq("fiscal_year", fiscalYear).neq("status", "cancelled"),
      supabase.from("building_account_overrides").select("*").eq("building_id", buildingId),
      supabase.from("contact_building_assignments").select(`*, contacts(first_name, last_name, company_name, salutation, address_street, address_zip, address_city), contact_building_shares(*), contact_building_costs(*)`).eq("building_id", buildingId).eq("is_active", true).in("role_in_building", ["eigentuemer", "mieter"]),
      supabase.from("account_balances").select("*, chart_of_accounts(account_number, account_name, category, carry_forward_balance)").eq("building_id", buildingId).eq("fiscal_year", fiscalYear),
      supabase.from("heating_distribution_values").select("*").eq("building_id", buildingId).eq("billing_period_id", periodId),
      // Get economic plan items for WP column
      supabase.from("economic_plans" as any).select("*, economic_plan_items(*)").eq("building_id", buildingId).eq("fiscal_year", fiscalYear).maybeSingle(),
    ]);

    const periodLabel = `${formatDate(period.period_from)} – ${formatDate(period.period_to)}`;

    // Helper: get distribution key for an account
    const getDistKey = (accountId: string, defaultKey: string | null) => {
      const override = (overrides || []).find((o: any) => o.account_id === accountId);
      return override?.distribution_key || defaultKey || "mea";
    };

    // Helper: time proportion for an assignment within the period
    const getTimeProportion = (assignment: any) => {
      if (!period) return 1;
      const periodStart = new Date(period.period_from).getTime();
      const periodEnd = new Date(period.period_to).getTime();
      const totalDays = (periodEnd - periodStart) / 86400000 + 1;
      const validFrom = assignment.valid_from ? new Date(assignment.valid_from).getTime() : periodStart;
      const validTo = assignment.valid_to ? new Date(assignment.valid_to).getTime() : periodEnd;
      const effectiveStart = Math.max(periodStart, validFrom);
      const effectiveEnd = Math.min(periodEnd, validTo);
      return Math.max(0, (effectiveEnd - effectiveStart) / 86400000 + 1) / totalDays;
    };

    // Build account totals with section info
    const billingAccounts = (accounts || []).filter((a: any) => a.is_billing_relevant || a.settlement_section);
    const accountTotals = billingAccounts.map((acc: any) => {
      const distKey = getDistKey(acc.id, acc.default_distribution_key);
      const total = (bookings || [])
        .filter((b: any) => b.account_id === acc.id)
        .reduce((s: number, b: any) => s + Number(b.amount), 0);
      const absTotal = Math.abs(total);
      // Get WP planned amount
      const wpItem = (planItems as any)?.economic_plan_items?.find((i: any) => i.account_id === acc.id);
      const wpAmount = wpItem ? Number(wpItem.planned_amount || 0) : 0;
      return { ...acc, total, absTotal, distKey, wpAmount };
    });

    // Group accounts by settlement_section
    const sectionOrder = ["income", "operating_distributable", "operating_non_distributable", "accrual", "reserve", "reserve_withdrawal"];
    const sections = sectionOrder.map(sec => ({
      id: sec,
      label: SECTION_LABELS[sec] || sec,
      accounts: accountTotals.filter((a: any) => a.settlement_section === sec && a.absTotal > 0),
      total: accountTotals.filter((a: any) => a.settlement_section === sec && a.absTotal > 0)
        .reduce((s: number, a: any) => s + a.absTotal, 0),
      wpTotal: accountTotals.filter((a: any) => a.settlement_section === sec)
        .reduce((s: number, a: any) => s + a.wpAmount, 0),
    })).filter(s => s.accounts.length > 0);

    // Distributable accounts for Einzelabrechnung
    const distributableAccounts = accountTotals.filter((a: any) => a.is_distributable && a.absTotal > 0);

    // Share totals per distribution key
    const getShareTotal = (shareType: string) => {
      const mapped = DIST_KEY_TO_SHARE[shareType] || shareType;
      return (assignments || []).reduce((s: number, a: any) => {
        const share = (a.contact_building_shares || []).find((sh: any) => sh.share_type === mapped);
        return s + (share ? Number(share.share_value) : 0);
      }, 0);
    };

    // Opening/closing balances
    const openingGiro = (balances || [])
      .filter((b: any) => b.chart_of_accounts?.category === "bank")
      .reduce((s: number, b: any) => s + Number(b.opening_balance), 0);
    const openingRL = (balances || [])
      .filter((b: any) => b.chart_of_accounts?.category === "ruecklage")
      .reduce((s: number, b: any) => s + Number(b.opening_balance), 0);
    const closingGiro = (balances || [])
      .filter((b: any) => b.chart_of_accounts?.category === "bank")
      .reduce((s: number, b: any) => s + Number(b.closing_balance), 0);
    const closingRL = (balances || [])
      .filter((b: any) => b.chart_of_accounts?.category === "ruecklage")
      .reduce((s: number, b: any) => s + Number(b.closing_balance), 0);

    // Calculate total distributable costs
    const totalDistributable = distributableAccounts.reduce((s: number, a: any) => s + a.absTotal, 0);

    // Total income
    const totalIncome = sections.find(s => s.id === "income")?.total || 0;

    // Total expenses (all non-income sections)
    const totalExpenses = sections.filter(s => s.id !== "income").reduce((s, sec) => s + sec.total, 0);

    // Abrechnungsspitze (building level)
    const buildingSpitze = totalIncome - totalExpenses;

    // Calculate per-owner results
    const ownerResults = (assignments || []).map((assignment: any) => {
      const contact = assignment.contacts;
      const name = contact?.company_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Unbekannt";
      const salutation = contact?.salutation || "";
      const shares = assignment.contact_building_shares || [];
      const costs = assignment.contact_building_costs || [];
      const timeProportion = getTimeProportion(assignment);

      // Per-account breakdown for Einzelabrechnung
      const accountBreakdown: any[] = [];
      let totalOwnerCost = 0;
      let total35aDienste = 0;
      let total35aHandwerker = 0;

      distributableAccounts.forEach((acc: any) => {
        const isHeating = acc.is_heating_relevant;
        const heatingVal = isHeating
          ? (heatingValues || []).find((hv: any) => hv.assignment_id === assignment.id)
          : null;

        let ownerCost: number;
        let distLabel: string;
        let totalShares: number;
        let ownerShareValue: number;

        if (heatingVal) {
          // Direct heating value from external provider
          ownerCost = Number(heatingVal.amount);
          distLabel = "Heizk.Abr.";
          totalShares = acc.absTotal;
          ownerShareValue = ownerCost;
        } else {
          // Standard distribution
          const distKey = acc.distKey;
          const shareType = DIST_KEY_TO_SHARE[distKey] || distKey;
          const ownerShare = shares.find((s: any) => s.share_type === shareType);
          totalShares = getShareTotal(distKey);
          ownerShareValue = ownerShare ? Number(ownerShare.share_value) : 0;

          if (totalShares > 0 && ownerShareValue > 0) {
            ownerCost = acc.absTotal * (ownerShareValue / totalShares) * timeProportion;
          } else {
            ownerCost = 0;
          }
          distLabel = DIST_KEY_LABELS[distKey] || distKey;
        }

        if (ownerCost > 0) {
          accountBreakdown.push({
            accountNumber: acc.account_number,
            accountName: acc.account_name,
            distributableAmount: acc.absTotal,
            distLabel,
            totalShares,
            ownerShare: ownerShareValue,
            ownerCost,
          });
          totalOwnerCost += ownerCost;

          // §35a calculation
          if (acc.settlement_35a_type === "dienste") {
            total35aDienste += ownerCost;
          } else if (acc.settlement_35a_type === "handwerker") {
            total35aHandwerker += ownerCost;
          }
        }
      });

      // Annual prepayments from recurring costs
      const calcAnnual = (types: string[]) => costs
        .filter((c: any) => types.includes(c.cost_type))
        .reduce((s: number, c: any) => {
          const amount = Number(c.amount);
          switch (c.interval) {
            case "monatlich": return s + amount * 12;
            case "quartal": return s + amount * 4;
            case "jaehrlich": return s + amount;
            default: return s + amount * 12;
          }
        }, 0) * timeProportion;

      const annualHausgeld = calcAnnual(["hausgeld", "nebenkosten"]);
      const annualReserve = calcAnnual(["ruecklage"]);
      const totalPaid = annualHausgeld + annualReserve;
      const result = totalPaid - totalOwnerCost;

      return {
        assignmentId: assignment.id,
        name,
        salutation,
        address: [contact?.address_street, [contact?.address_zip, contact?.address_city].filter(Boolean).join(" ")].filter(Boolean).join("\n"),
        unitNumber: assignment.unit_number || "–",
        accountBreakdown,
        totalOwnerCost,
        annualHausgeld,
        annualReserve,
        totalPaid,
        result,
        total35aDienste,
        total35aHandwerker,
        timeProportion,
      };
    });

    // ─── HTML STYLES (shared) ───
    const sharedStyles = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #1a1a1a; line-height: 1.4; }
      .page { width: 210mm; min-height: 297mm; padding: 20mm 18mm 15mm 18mm; position: relative; page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .header-line { font-size: 8px; color: #888; border-bottom: 0.5px solid #ccc; padding-bottom: 3px; margin-bottom: 14px; }
      .recipient { margin-bottom: 16px; font-size: 10px; line-height: 1.5; }
      h1 { font-size: 15px; font-weight: 700; margin-bottom: 2px; }
      h2 { font-size: 11px; font-weight: 700; margin: 14px 0 4px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 2px; }
      .subtitle { font-size: 10px; color: #555; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; margin: 4px 0 8px 0; font-size: 9.5px; }
      th { text-align: left; padding: 3px 6px; background: #f2f2f2; font-weight: 600; border-bottom: 1.5px solid #999; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.3px; }
      td { padding: 2.5px 6px; border-bottom: 0.5px solid #e0e0e0; }
      .r { text-align: right; }
      .mono { font-family: 'Courier New', monospace; font-size: 9px; }
      .section-total td { font-weight: 700; border-top: 1px solid #999; border-bottom: 1px solid #999; background: #fafafa; }
      .grand-total td { font-weight: 700; border-top: 2px solid #333; font-size: 10.5px; }
      .result-box { margin: 12px 0; padding: 10px 14px; border-radius: 4px; font-size: 12px; font-weight: 700; }
      .result-positive { background: #ecfdf5; border: 1px solid #86efac; color: #166534; }
      .result-negative { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; }
      .footer { position: absolute; bottom: 12mm; left: 18mm; right: 18mm; font-size: 7.5px; color: #aaa; border-top: 0.5px solid #ddd; padding-top: 3px; }
      .balance-row td { padding: 2px 6px; }
      .indent { padding-left: 20px !important; }
      .kto { width: 50px; font-family: 'Courier New', monospace; font-size: 9px; color: #666; }
    `;

    const footerHtml = `<div class="footer">${building?.manager_name || "Hausverwaltung"} · Erstellt am ${new Date().toLocaleDateString("de-DE")}</div>`;

    // ─── GESAMTABRECHNUNG HTML ───
    const generateGesamtHtml = () => {
      let sectionRows = "";

      sections.forEach(sec => {
        // Section header
        sectionRows += `<tr><td colspan="4" style="font-weight:700; padding-top:8px; font-size:10px;">${sec.label}</td></tr>`;

        sec.accounts.forEach(acc => {
          sectionRows += `<tr>
            <td class="kto">${acc.account_number}</td>
            <td>${acc.account_name}</td>
            <td class="r mono">${formatCurrency(acc.wpAmount)}</td>
            <td class="r mono">${formatCurrency(acc.absTotal)}</td>
          </tr>`;
        });

        // Section subtotal
        sectionRows += `<tr class="section-total">
          <td></td>
          <td>Summe ${sec.label}</td>
          <td class="r mono">${formatCurrency(sec.wpTotal)}</td>
          <td class="r mono">${formatCurrency(sec.total)}</td>
        </tr>`;
      });

      // Owner summary table
      const ownerRows = ownerResults.map(o =>
        `<tr>
          <td>${o.unitNumber}</td>
          <td>${o.name}</td>
          <td class="r mono">${formatCurrency(o.totalOwnerCost)}</td>
          <td class="r mono">${formatCurrency(o.totalPaid)}</td>
          <td class="r mono" style="color:${o.result >= 0 ? '#166534' : '#991b1b'}">${formatCurrency(o.result)}</td>
        </tr>`
      ).join("");

      const totalOwnerCosts = ownerResults.reduce((s, o) => s + o.totalOwnerCost, 0);
      const totalOwnerPaid = ownerResults.reduce((s, o) => s + o.totalPaid, 0);
      const totalOwnerResult = ownerResults.reduce((s, o) => s + o.result, 0);

      return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${sharedStyles}</style></head><body>
        <div class="page">
          <div class="header-line">${building?.manager_name || "Hausverwaltung"} · ${building?.address || ""}</div>
          <h1>Gesamtabrechnung ${fiscalYear}</h1>
          <div class="subtitle">${building?.name || ""} · Abrechnungszeitraum: ${periodLabel}</div>

          <h2>Anfangsbestände</h2>
          <table>
            <tr class="balance-row"><td>Girokonto</td><td class="r mono">${formatCurrency(openingGiro)}</td><td></td><td></td></tr>
            <tr class="balance-row"><td>Erhaltungsrücklage</td><td class="r mono">${formatCurrency(openingRL)}</td><td></td><td></td></tr>
            <tr class="section-total"><td><strong>Gesamtvermögen Anfang</strong></td><td class="r mono"><strong>${formatCurrency(openingGiro + openingRL)}</strong></td><td></td><td></td></tr>
          </table>

          <h2>Einnahmen und Ausgaben</h2>
          <table>
            <tr><th class="kto">Konto</th><th>Bezeichnung</th><th class="r">Wirtschaftsplan</th><th class="r">Ist-Betrag</th></tr>
            ${sectionRows}
          </table>

          <h2>Endbestände</h2>
          <table>
            <tr class="balance-row"><td>Girokonto</td><td class="r mono">${formatCurrency(closingGiro)}</td><td></td><td></td></tr>
            <tr class="balance-row"><td>Erhaltungsrücklage</td><td class="r mono">${formatCurrency(closingRL)}</td><td></td><td></td></tr>
            <tr class="section-total"><td><strong>Gesamtvermögen Ende</strong></td><td class="r mono"><strong>${formatCurrency(closingGiro + closingRL)}</strong></td><td></td><td></td></tr>
          </table>

          <h2>Verteilung auf Eigentümer</h2>
          <table>
            <tr><th>Einheit</th><th>Eigentümer</th><th class="r">Kostenanteil</th><th class="r">Vorauszahlungen</th><th class="r">Ergebnis</th></tr>
            ${ownerRows}
            <tr class="grand-total">
              <td></td><td>Gesamt</td>
              <td class="r mono">${formatCurrency(totalOwnerCosts)}</td>
              <td class="r mono">${formatCurrency(totalOwnerPaid)}</td>
              <td class="r mono">${formatCurrency(totalOwnerResult)}</td>
            </tr>
          </table>

          ${footerHtml}
        </div>
      </body></html>`;
    };

    // ─── EINZELABRECHNUNG HTML ───
    const generateEinzelHtml = (owner: any) => {
      const resultLabel = owner.result >= 0 ? "Guthaben" : "Nachzahlung";
      const resultClass = owner.result >= 0 ? "result-positive" : "result-negative";

      // Account breakdown rows (7-column)
      const breakdownRows = owner.accountBreakdown.map((row: any) =>
        `<tr>
          <td class="kto">${row.accountNumber}</td>
          <td>${row.accountName}</td>
          <td class="r mono">${formatCurrency(row.distributableAmount)}</td>
          <td style="text-align:center; font-size:8.5px">${row.distLabel}</td>
          <td class="r mono">${typeof row.totalShares === 'number' ? row.totalShares.toLocaleString("de-DE") : '–'}</td>
          <td class="r mono">${typeof row.ownerShare === 'number' ? row.ownerShare.toLocaleString("de-DE") : '–'}</td>
          <td class="r mono">${formatCurrency(row.ownerCost)}</td>
        </tr>`
      ).join("");

      // §35a section
      let para35a = "";
      if (owner.total35aDienste > 0 || owner.total35aHandwerker > 0) {
        const diensteBonus = Math.min(owner.total35aDienste * 0.2, 4000);
        const handwerkerBonus = Math.min(owner.total35aHandwerker * 0.2, 1200);
        para35a = `
          <h2>Bescheinigung gemäß §35a EStG</h2>
          <table>
            <tr><th>Kategorie</th><th class="r">Anteilige Kosten</th><th class="r">Steuerermäßigung (20%)</th></tr>
            ${owner.total35aDienste > 0 ? `<tr><td>Haushaltsnahe Dienstleistungen</td><td class="r mono">${formatCurrency(owner.total35aDienste)}</td><td class="r mono">${formatCurrency(diensteBonus)}</td></tr>` : ""}
            ${owner.total35aHandwerker > 0 ? `<tr><td>Handwerkerleistungen</td><td class="r mono">${formatCurrency(owner.total35aHandwerker)}</td><td class="r mono">${formatCurrency(handwerkerBonus)}</td></tr>` : ""}
            <tr class="section-total">
              <td><strong>Gesamt</strong></td>
              <td class="r mono"><strong>${formatCurrency(owner.total35aDienste + owner.total35aHandwerker)}</strong></td>
              <td class="r mono"><strong>${formatCurrency(diensteBonus + handwerkerBonus)}</strong></td>
            </tr>
          </table>
          <p style="font-size:8px; color:#666; margin-top:4px;">Die Steuerermäßigung für haushaltsnahe Dienstleistungen beträgt max. 4.000 €, für Handwerkerleistungen max. 1.200 € pro Jahr.</p>
        `;
      }

      return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${sharedStyles}</style></head><body>
        <div class="page">
          <div class="header-line">${building?.manager_name || "Hausverwaltung"} · ${building?.address || ""}</div>
          <div class="recipient">
            ${owner.salutation ? owner.salutation + "<br>" : ""}${owner.name}<br>${(owner.address || "").replace(/\n/g, "<br>")}
          </div>

          <h1>Einzelabrechnung ${fiscalYear}</h1>
          <div class="subtitle">
            ${building?.name || ""} · Einheit ${owner.unitNumber} · ${periodLabel}
            ${owner.timeProportion < 1 ? ` · Zeitanteilig: ${Math.round(owner.timeProportion * 100)}%` : ""}
          </div>

          <h2>Kostenverteilung</h2>
          <table>
            <tr>
              <th class="kto">Konto</th>
              <th>Bezeichnung</th>
              <th class="r">Gesamt</th>
              <th style="text-align:center">Verteiler</th>
              <th class="r">Ges.-Anteil</th>
              <th class="r">Ihr Anteil</th>
              <th class="r">Ihre Kosten</th>
            </tr>
            ${breakdownRows}
            <tr class="grand-total">
              <td></td>
              <td colspan="5"><strong>Summe Kostenanteil</strong></td>
              <td class="r mono"><strong>${formatCurrency(owner.totalOwnerCost)}</strong></td>
            </tr>
          </table>

          <h2>Abrechnungsergebnis</h2>
          <table>
            <tr><td>Ihr Kostenanteil</td><td class="r mono">${formatCurrency(owner.totalOwnerCost)}</td></tr>
            <tr><td>./. Hausgeld-Vorauszahlungen</td><td class="r mono">- ${formatCurrency(owner.annualHausgeld)}</td></tr>
            <tr><td>./. Rücklagenzuführung</td><td class="r mono">- ${formatCurrency(owner.annualReserve)}</td></tr>
            <tr class="grand-total"><td><strong>${resultLabel}</strong></td><td class="r mono"><strong>${formatCurrency(Math.abs(owner.result))}</strong></td></tr>
          </table>

          <div class="result-box ${resultClass}">
            ${resultLabel}: ${formatCurrency(Math.abs(owner.result))}
            ${owner.result < 0
              ? " — Bitte überweisen Sie den Betrag innerhalb von 30 Tagen."
              : " — Das Guthaben wird Ihrem Konto gutgeschrieben."}
          </div>

          ${para35a}

          ${footerHtml}
        </div>
      </body></html>`;
    };

    // ─── RESPONSE ───
    const storeAndRespond = async (html: string, fileName: string) => {
      const filePath = `billing-pdfs/${buildingId}/${fiscalYear}/${fileName.replace(/[^a-zA-Z0-9äöüÄÖÜ._-]/g, "_")}`;
      await supabase.storage
        .from("building-documents")
        .upload(filePath, new Blob([html], { type: "text/html" }), { upsert: true });
      const { data: signedUrl } = await supabase.storage
        .from("building-documents")
        .createSignedUrl(filePath, 3600);
      return new Response(JSON.stringify({ url: signedUrl?.signedUrl, html }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    };

    if (ownerId) {
      const owner = ownerResults.find((o: any) => o.assignmentId === ownerId);
      if (!owner) {
        return new Response(JSON.stringify({ error: "Eigentümer nicht gefunden" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const html = generateEinzelHtml(owner);
      return storeAndRespond(html, `Einzelabrechnung_${fiscalYear}_${owner.name}.html`);
    }

    // If ownerId === "all", generate combined document with all Einzelabrechnungen
    const html = generateGesamtHtml();
    return storeAndRespond(html, `Gesamtabrechnung_${fiscalYear}_${building?.name || "Liegenschaft"}.html`);

  } catch (error: any) {
    console.error("generate-billing-pdf error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
