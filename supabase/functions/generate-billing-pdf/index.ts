import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { buildingId, periodId, fiscalYear, ownerId } = await req.json();

    // Fetch building info
    const { data: building } = await supabase
      .from("buildings")
      .select("name, address, manager_name")
      .eq("id", buildingId)
      .single();

    // Fetch period
    const { data: period } = await supabase
      .from("billing_periods")
      .select("*")
      .eq("id", periodId)
      .single();

    // Fetch accounts
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("is_billing_relevant", true)
      .or(`building_id.is.null,building_id.eq.${buildingId}`)
      .order("account_number");

    // Fetch bookings
    const { data: bookings } = await supabase
      .from("bookings")
      .select("account_id, amount, booking_category, is_35a_relevant, description")
      .eq("building_id", buildingId)
      .eq("fiscal_year", fiscalYear)
      .neq("status", "cancelled");

    // Fetch overrides
    const { data: overrides } = await supabase
      .from("building_account_overrides")
      .select("*")
      .eq("building_id", buildingId);

    // Fetch owners
    const { data: assignments } = await supabase
      .from("contact_building_assignments")
      .select(`
        *,
        contacts(first_name, last_name, company_name, address_street, address_zip, address_city),
        contact_building_shares(*),
        contact_building_costs(*)
      `)
      .eq("building_id", buildingId)
      .eq("is_active", true)
      .in("role_in_building", ["eigentuemer", "mieter"]);

    // Fetch balances
    const { data: balances } = await supabase
      .from("account_balances")
      .select("*, chart_of_accounts(account_number, account_name, category, carry_forward_balance)")
      .eq("building_id", buildingId)
      .eq("fiscal_year", fiscalYear);

    // Distribution key mapping
    const DIST_KEY_TO_SHARE: Record<string, string> = {
      mea: "mea", einheiten: "einheit", qm: "qm", personen: "personen",
      verbrauch_wasser: "wasser", verbrauch_warmwasser: "warmwasser",
      heizkostenverordnung: "heizkosten",
    };

    const getDistKey = (accountId: string, defaultKey: string | null) => {
      const override = (overrides || []).find((o: any) => o.account_id === accountId);
      return override?.distribution_key || defaultKey || "mea";
    };

    // Calculate account totals
    const accountTotals = (accounts || []).map((acc: any) => {
      const distKey = getDistKey(acc.id, acc.default_distribution_key);
      const total = (bookings || [])
        .filter((b: any) => b.account_id === acc.id && b.booking_category !== "heating_repost")
        .reduce((s: number, b: any) => s + Math.abs(Number(b.amount)), 0);
      return { ...acc, total, distKey };
    });

    const totalCosts = accountTotals.reduce((s: number, a: any) => s + a.total, 0);

    // Group by distribution key
    const groupedByKey: Record<string, { accounts: any[]; total: number }> = {};
    accountTotals.forEach((acc: any) => {
      if (acc.total === 0) return;
      if (!groupedByKey[acc.distKey]) groupedByKey[acc.distKey] = { accounts: [], total: 0 };
      groupedByKey[acc.distKey].accounts.push(acc);
      groupedByKey[acc.distKey].total += acc.total;
    });

    const getShareTotal = (shareType: string) => {
      const mapped = DIST_KEY_TO_SHARE[shareType] || shareType;
      return (assignments || []).reduce((s: number, a: any) => {
        const share = (a.contact_building_shares || []).find((sh: any) => sh.share_type === mapped);
        return s + (share ? Number(share.share_value) : 0);
      }, 0);
    };

    const getTimeProportion = (assignment: any) => {
      if (!period) return 1;
      const periodStart = new Date(period.period_from).getTime();
      const periodEnd = new Date(period.period_to).getTime();
      const totalDays = (periodEnd - periodStart) / (1000 * 60 * 60 * 24) + 1;
      const validFrom = assignment.valid_from ? new Date(assignment.valid_from).getTime() : periodStart;
      const validTo = assignment.valid_to ? new Date(assignment.valid_to).getTime() : periodEnd;
      const effectiveStart = Math.max(periodStart, validFrom);
      const effectiveEnd = Math.min(periodEnd, validTo);
      const effectiveDays = Math.max(0, (effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24) + 1);
      return effectiveDays / totalDays;
    };

    // Calculate owner results
    const ownerResults = (assignments || []).map((assignment: any) => {
      const contact = assignment.contacts;
      const name = contact?.company_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Unbekannt";
      const shares = assignment.contact_building_shares || [];
      const costs = assignment.contact_building_costs || [];
      const timeProportion = getTimeProportion(assignment);

      let totalShare = 0;
      let share35a = 0;
      Object.entries(groupedByKey).forEach(([distKey, group]) => {
        const shareType = DIST_KEY_TO_SHARE[distKey] || distKey;
        const ownerShare = shares.find((s: any) => s.share_type === shareType);
        const totalShares = getShareTotal(distKey);
        if (ownerShare && totalShares > 0) {
          const proportion = (Number(ownerShare.share_value) / totalShares) * timeProportion;
          totalShare += group.total * proportion;
          const group35a = group.accounts
            .filter((acc: any) => (bookings || []).some((b: any) => b.account_id === acc.id && b.is_35a_relevant))
            .reduce((s: number, acc: any) => {
              return s + (bookings || [])
                .filter((b: any) => b.account_id === acc.id && b.is_35a_relevant)
                .reduce((bs: number, b: any) => bs + Math.abs(Number(b.amount)), 0);
            }, 0);
          share35a += group35a * proportion;
        }
      });

      const annualHausgeld = costs
        .filter((c: any) => c.cost_type === "hausgeld" || c.cost_type === "nebenkosten")
        .reduce((s: number, c: any) => {
          const amount = Number(c.amount);
          switch (c.interval) {
            case "monatlich": return s + amount * 12;
            case "quartal": return s + amount * 4;
            case "jaehrlich": return s + amount;
            default: return s + amount * 12;
          }
        }, 0) * timeProportion;

      const annualReserve = costs
        .filter((c: any) => c.cost_type === "ruecklage")
        .reduce((s: number, c: any) => {
          const amount = Number(c.amount);
          switch (c.interval) {
            case "monatlich": return s + amount * 12;
            case "quartal": return s + amount * 4;
            case "jaehrlich": return s + amount;
            default: return s + amount * 12;
          }
        }, 0) * timeProportion;

      const totalPaid = annualHausgeld + annualReserve;
      const result = totalPaid - totalShare;

      return {
        assignmentId: assignment.id,
        name,
        address: [contact?.address_street, [contact?.address_zip, contact?.address_city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        unitNumber: assignment.unit_number || "–",
        totalShare,
        annualHausgeld,
        annualReserve,
        totalPaid,
        result,
        share35a,
        timeProportion,
      };
    });

    const formatCurrency = (n: number) =>
      new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

    const formatDate = (d: string) => new Date(d).toLocaleDateString("de-DE");

    // Generate HTML content
    const generateHtml = (owner?: any) => {
      const periodLabel = `${formatDate(period.period_from)} – ${formatDate(period.period_to)}`;
      
      if (owner) {
        // Einzelabrechnung
        const resultLabel = owner.result >= 0 ? "Guthaben" : "Nachzahlung";
        const steuerbonus = Math.min(owner.share35a * 0.2, 1200);
        return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 25mm 15mm 20mm 15mm; color: #333; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  h2 { font-size: 13px; color: #555; margin-top: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { padding: 4px 8px; text-align: left; border-bottom: 1px solid #ddd; }
  th { background: #f5f5f5; font-weight: 600; }
  .right { text-align: right; }
  .mono { font-family: 'Courier New', monospace; }
  .total { font-weight: bold; border-top: 2px solid #333; }
  .result { font-size: 14px; padding: 8px; margin: 12px 0; background: ${owner.result >= 0 ? '#f0fdf4' : '#fef2f2'}; border-radius: 4px; }
  .footer { margin-top: 24px; font-size: 9px; color: #888; }
</style></head><body>
  <div style="margin-bottom: 24px;">
    <div style="font-size: 9px; color: #888;">${building?.manager_name || "Hausverwaltung"} · ${building?.address || ""}</div>
    <div style="margin-top: 12px;">${owner.name}<br>${owner.address || ""}</div>
  </div>
  <h1>Einzelabrechnung ${fiscalYear}</h1>
  <p>${building?.name || ""} · ${periodLabel}</p>
  <p>Einheit: ${owner.unitNumber}${owner.timeProportion < 1 ? ` (zeitanteilig: ${Math.round(owner.timeProportion * 100)}%)` : ""}</p>
  
  <h2>Kostenübersicht</h2>
  <table>
    <tr><th>Position</th><th class="right">Betrag</th></tr>
    <tr><td>Ihr Kostenanteil (Betriebskosten)</td><td class="right mono">${formatCurrency(owner.totalShare)}</td></tr>
    <tr><td>./. Hausgeld-Vorauszahlungen</td><td class="right mono">${formatCurrency(-owner.annualHausgeld)}</td></tr>
    <tr><td>./. Rücklagenzuführung</td><td class="right mono">${formatCurrency(-owner.annualReserve)}</td></tr>
    <tr class="total"><td><strong>Ergebnis (${resultLabel})</strong></td><td class="right mono"><strong>${formatCurrency(Math.abs(owner.result))}</strong></td></tr>
  </table>
  
  <div class="result">
    <strong>${resultLabel}:</strong> ${formatCurrency(Math.abs(owner.result))}
    ${owner.result < 0 ? "<br>Bitte überweisen Sie den Betrag innerhalb von 30 Tagen." : "<br>Das Guthaben wird Ihrem Konto gutgeschrieben."}
  </div>

  ${owner.share35a > 0 ? `
  <h2>Bescheinigung gemäß §35a EStG</h2>
  <p>Anteilige haushaltsnahe Dienstleistungen und Handwerkerleistungen:</p>
  <table>
    <tr><td>Ihr Anteil an §35a-relevanten Kosten</td><td class="right mono">${formatCurrency(owner.share35a)}</td></tr>
    <tr><td>Davon 20% Steuerermäßigung (max. 1.200 €)</td><td class="right mono">${formatCurrency(steuerbonus)}</td></tr>
  </table>
  ` : ""}

  <div class="footer">
    Erstellt am ${new Date().toLocaleDateString("de-DE")} · ${building?.manager_name || "Hausverwaltung"}
  </div>
</body></html>`;
      }

      // Gesamtabrechnung
      const accountRows = accountTotals
        .filter((a: any) => a.total > 0)
        .map((a: any) => `<tr><td class="mono" style="font-size:10px">${a.account_number}</td><td>${a.account_name}</td><td class="right mono">${formatCurrency(a.total)}</td></tr>`)
        .join("");

      const ownerRows = ownerResults
        .map((o: any) => `<tr><td>${o.unitNumber}</td><td>${o.name}</td><td class="right mono">${formatCurrency(o.totalShare)}</td><td class="right mono">${formatCurrency(o.totalPaid)}</td><td class="right mono" style="color:${o.result >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(o.result)}</td></tr>`)
        .join("");

      return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 25mm 15mm 20mm 15mm; color: #333; }
  h1 { font-size: 18px; }
  h2 { font-size: 13px; color: #555; margin-top: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { padding: 4px 8px; text-align: left; border-bottom: 1px solid #ddd; }
  th { background: #f5f5f5; font-weight: 600; }
  .right { text-align: right; }
  .mono { font-family: 'Courier New', monospace; }
  .total { font-weight: bold; border-top: 2px solid #333; }
  .footer { margin-top: 24px; font-size: 9px; color: #888; page-break-before: avoid; }
</style></head><body>
  <h1>Gesamtabrechnung ${fiscalYear}</h1>
  <p><strong>${building?.name || ""}</strong> · ${building?.address || ""}</p>
  <p>Abrechnungszeitraum: ${periodLabel}</p>
  <p>Verwalter: ${building?.manager_name || "–"}</p>

  <h2>Kostenaufstellung</h2>
  <table>
    <tr><th style="width:80px">Konto</th><th>Bezeichnung</th><th class="right">Betrag</th></tr>
    ${accountRows}
    <tr class="total"><td></td><td><strong>Gesamtkosten</strong></td><td class="right mono"><strong>${formatCurrency(totalCosts)}</strong></td></tr>
  </table>

  <h2>Verteilung auf Eigentümer</h2>
  <table>
    <tr><th>Einheit</th><th>Eigentümer</th><th class="right">Kostenanteil</th><th class="right">Vorauszahlungen</th><th class="right">Ergebnis</th></tr>
    ${ownerRows}
  </table>

  <div class="footer">
    Erstellt am ${new Date().toLocaleDateString("de-DE")} · ${building?.manager_name || "Hausverwaltung"}
  </div>
</body></html>`;
    };

    // For now, return the HTML as a downloadable response
    // In production, this would use a PDF library or headless browser
    if (ownerId) {
      const owner = ownerResults.find((o: any) => o.assignmentId === ownerId);
      if (!owner) {
        return new Response(JSON.stringify({ error: "Eigentümer nicht gefunden" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const html = generateHtml(owner);
      
      // Store as HTML file in storage for now
      const fileName = `abrechnung_${fiscalYear}_${owner.name.replace(/[^a-zA-Z0-9äöüÄÖÜ]/g, "_")}.html`;
      const filePath = `billing-pdfs/${buildingId}/${fiscalYear}/${fileName}`;
      
      await supabase.storage
        .from("building-documents")
        .upload(filePath, new Blob([html], { type: "text/html" }), { upsert: true });

      const { data: signedUrl } = await supabase.storage
        .from("building-documents")
        .createSignedUrl(filePath, 3600);

      return new Response(JSON.stringify({ url: signedUrl?.signedUrl, html }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gesamtabrechnung
    const html = generateHtml();
    const fileName = `Gesamtabrechnung_${fiscalYear}_${building?.name || "Liegenschaft"}.html`;
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

  } catch (error: any) {
    console.error("generate-billing-pdf error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
