// Jahresabrechnung für finanz-dokumente: dieselben Abfragen, dieselbe Berechnung und dieselben
// Request-Bodies wie BillingSettlement.tsx im DMS-Modus (siehe _shared/finanzen/abrechnung.ts).
import {
  baueAbrechnungsDokumentBody,
  berechneAbrechnung,
  erzeugeAbrechnungsPayloads,
  ladeAbrechnungsDaten,
  waehleAbrechnungsVorlagen,
} from "../_shared/finanzen/abrechnung.ts";
import { DMS_FOLDER_SLUGS } from "../_shared/finanzen/dmsAblage.ts";

const runden = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const heuteBerlin = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

export async function abrechnungsDokumente(db: any, o: {
  building_id: string;
  period_id: string;
  wirtschaftsjahr: number;
  einheiten?: string[] | null;
  nur_gesamt?: boolean;
  /** nur die Empfänger (für §35a) */
  nurEmpfaenger?: boolean;
  passtEinheit?: (filter: string[] | null | undefined, unit: string | null | undefined) => boolean;
  vorlage?: (scope: string) => Promise<string>;
}): Promise<any> {
  // Standard der App: SOLL-Vorschüsse, Konten ohne Saldo ausgeblendet
  const daten = await ladeAbrechnungsDaten(db, { building_id: o.building_id, period_id: o.period_id, useIstVorschuss: false, fiscal_year: o.wirtschaftsjahr });
  const ergebnis = berechneAbrechnung(daten, { useIstVorschuss: false, showZeroBalanceAccounts: false });

  if (o.nurEmpfaenger) {
    return {
      empfaenger: ergebnis.ownerResults.map((r: any) => {
        const a = (daten.assignments as any[]).find((x) => x.id === r.assignmentId);
        return { assignmentId: r.assignmentId, name: r.name, unitNumber: r.unitNumber, contactId: a?.contact_id ?? r.contactId ?? null, rolle: a?.role_in_building ?? null };
      }),
    };
  }

  const vorlagen = waehleAbrechnungsVorlagen(daten.billingTemplates);
  if (!vorlagen.effectiveSingleTpl && !vorlagen.effectiveOverallTpl) throw new Error("Keine Abrechnungs-Vorlage hinterlegt (Buchhaltung › Dokumente)");
  const p = erzeugeAbrechnungsPayloads(daten, ergebnis, { erstellDatum: heuteBerlin(), mitVermoegensbericht: !!vorlagen.effectiveAssetReportTpl });
  const passt = o.passtEinheit ?? (() => true);
  const jahr = o.wirtschaftsjahr;

  const auftraege: any[] = [];
  const body = (templateId: string | null, dokument: any) =>
    baueAbrechnungsDokumentBody({ templateId, overallTemplateId: vorlagen.effectiveOverallTpl, fiscalYear: jahr, dokument });

  if (!o.einheiten?.length) {
    auftraege.push({ name: p.dokumente.overall.dms.displayName, fn: "generate-billing-document", body: body(vorlagen.effectiveOverallTpl, p.dokumente.overall), kategorie: DMS_FOLDER_SLUGS.gesamtabrechnung });
    if (p.dokumente.assetReport) {
      auftraege.push({ name: p.dokumente.assetReport.dms.displayName, fn: "generate-billing-document", body: body(vorlagen.effectiveAssetReportTpl, p.dokumente.assetReport), kategorie: DMS_FOLDER_SLUGS.vermoegensbericht });
    }
  }
  if (!o.nur_gesamt) {
    if (!vorlagen.effectiveSingleTpl) throw new Error("Keine Vorlage für Einzelabrechnungen hinterlegt");
    for (const e of p.owners) {
      if (!passt(o.einheiten, e.unitNumber)) continue;
      auftraege.push({
        name: e.dokument.dms.displayName,
        fn: "generate-billing-document",
        body: body(vorlagen.effectiveSingleTpl, e.dokument),
        einheiten: e.unitNumber ? [e.unitNumber] : undefined,
        kontakt_ids: e.contactId ? [e.contactId] : undefined,
        kategorie: DMS_FOLDER_SLUGS.einzelabrechnung,
      });
    }
  }

  const warnungen: string[] = [];
  if ((daten as any).rawBookings?.length >= 1000) warnungen.push("Mehr als 1000 Buchungen im Zeitraum – wie in der App werden nur die ersten 1000 berücksichtigt. Bitte prüfen.");
  if (ergebnis.distributionWarnings?.length) warnungen.push(...ergebnis.distributionWarnings.map((w: any) => `Konto ${w.accountNumber} ${w.accountName} (${w.distributionKey}): ${w.reason}`));

  return {
    auftraege,
    zusammenfassung: {
      zeitraum: `${daten.period?.period_from ?? ""} – ${daten.period?.period_to ?? ""}`,
      abrechnungssumme: runden(ergebnis.abrechnungssumme),
      abrechnungsspitze: runden(ergebnis.abrechnungsspitze),
      eigentuemer: ergebnis.ownerResults.map((r: any) => ({
        einheit: r.unitNumber, name: r.name, kostenanteil: runden(r.totalOwnerCost), vorschuss_soll: runden(r.totalPaid),
        ergebnis: runden(r.result), bedeutung: r.result >= 0 ? "Guthaben" : "Nachzahlung",
      })),
    },
    warnungen,
  };
}
