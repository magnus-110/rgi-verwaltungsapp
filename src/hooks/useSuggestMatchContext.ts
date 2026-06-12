// Deprecated: KI-Buchungsvorschläge wurden global entfernt.
// Buchungen werden extern (durch Claude) erzeugt; Vorlagen- und Rechnungs-Match
// laufen in dedizierten Hooks/Komponenten weiter.
// Diese Datei bleibt als no-op Stub bestehen, damit bestehende Imports nicht brechen.

export interface SuggestMatchContext {
  invoices: any[];
  templates: any[];
  accounts: any[];
  billingPeriods: any[];
  bookingInstructions: string | null;
  buildingId: string;
  managementMode: string | null;
}

export async function loadSuggestMatchContext(buildingId: string): Promise<SuggestMatchContext> {
  return {
    invoices: [],
    templates: [],
    accounts: [],
    billingPeriods: [],
    bookingInstructions: null,
    buildingId,
    managementMode: null,
  };
}

export async function loadHistoricalBookings(_buildingId: string, _txn: any): Promise<any[]> {
  return [];
}

export function buildSuggestMatchPayload(
  _txn: any,
  _ctx: SuggestMatchContext,
  _allTransactions: any[],
  _historicalBookings: any[]
) {
  return null;
}

export async function invokeSuggestMatchWithTimeout(_payload: any, _timeoutMs = 30000): Promise<any> {
  return null;
}
