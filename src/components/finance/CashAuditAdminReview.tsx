import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, FileEdit,
  StickyNote, Pencil, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EditBookingDialog } from "./EditBookingDialog";
import { CashAuditWizard } from "./CashAuditWizard";
import { AccountInspectorDialog } from "./AccountInspectorDialog";

interface Props {
  auditId: string;
  onBack?: () => void;
}

const fmt = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export function CashAuditAdminReview({ auditId, onBack }: Props) {
  const queryClient = useQueryClient();
  const [editingBooking, setEditingBooking] = useState<any | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [inspectorAccountId, setInspectorAccountId] = useState<string | null>(null);

  const { data: audit, isLoading } = useQuery({
    queryKey: ["cash-audit", auditId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_audits")
        .select(`
          *,
          buildings(id, name, address, postal_code, city),
          billing_periods(fiscal_year, period_from, period_to),
          contacts!cash_audits_auditor_contact_id_fkey(
            id, company_name,
            contact_persons(first_name, last_name, is_primary)
          )
        `)
        .eq("id", auditId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const buildingId = audit?.building_id;
  const fiscalYear = audit?.billing_periods?.fiscal_year || audit?.fiscal_year;

  const { data: accounts = [] } = useQuery({
    queryKey: ["audit-accounts", buildingId, fiscalYear, "auth"],
    enabled: !!buildingId,
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, category")
        .or(`building_id.eq.${buildingId},building_id.is.null`)
        .order("account_number");
      return data || [];
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["audit-bookings", buildingId, fiscalYear, "auth"],
    enabled: !!buildingId && !!fiscalYear,
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select(`
          id, booking_date, description, amount, account_id, counter_account_id,
          building_id, fiscal_year, performance_period_from, performance_period_to,
          receipt_number, booking_reference, booking_type, amount_35a, is_35a_relevant,
          vat_rate, vat_amount, status, source, ai_warning, invoice_id,
          chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
          counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name),
          invoices!bookings_invoice_id_fkey(id, file_path, file_name, vendor_name)
        `)
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .in("status", ["pending", "confirmed"])
        .order("booking_date");
      return (data || []) as any[];
    },
  });

  const progress = (audit?.progress as Record<string, any>) || {};
  const accountFlags: Record<string, "ok" | "issue"> = progress.accountFlags || {};
  const accountNotes: Record<string, string> = progress.accountNotes || {};
  const bookingFlags: Record<string, "ok" | "issue"> = progress.bookingFlags || {};
  const bookingNotes: Record<string, string> = progress.bookingNotes || {};
  const adminReview: Record<string, { editedAt: string; editedBy?: string }> =
    progress.adminReview || {};
  // Legacy support
  const checkedAccountsLegacy: Record<string, boolean> = progress.checkedAccounts || {};
  const getAccountFlag = (id: string): "ok" | "issue" | null => {
    if (accountFlags[id]) return accountFlags[id];
    if (checkedAccountsLegacy[id]) return "ok";
    return null;
  };

  const accountById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const a of accounts as any[]) m[a.id] = a;
    return m;
  }, [accounts]);

  const bookingById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const b of bookings) m[b.id] = b;
    return m;
  }, [bookings]);

  // Derive flagged groups
  const issueAccountIds = (accounts as any[])
    .filter((a) => getAccountFlag(a.id) === "issue")
    .map((a) => a.id);
  const okAccountIds = (accounts as any[])
    .filter((a) => getAccountFlag(a.id) === "ok")
    .map((a) => a.id);

  const issueBookingIds = Object.keys(bookingFlags).filter((id) => bookingFlags[id] === "issue");
  const okBookingIds = Object.keys(bookingFlags).filter((id) => bookingFlags[id] === "ok");

  // Group flagged bookings by account (use main account_id)
  const issuesByAccount = useMemo(() => {
    const map: Record<string, { account: any; note?: string; bookings: any[] }> = {};
    // From flagged accounts
    for (const aid of issueAccountIds) {
      map[aid] = { account: accountById[aid], note: accountNotes[aid], bookings: [] };
    }
    // From flagged bookings
    for (const bid of issueBookingIds) {
      const b = bookingById[bid];
      if (!b) continue;
      const aid = b.account_id;
      if (!map[aid]) {
        map[aid] = { account: accountById[aid], note: undefined, bookings: [] };
      }
      map[aid].bookings.push(b);
    }
    return map;
  }, [issueAccountIds, issueBookingIds, accountById, bookingById, accountNotes]);

  const okGrouped = useMemo(() => {
    const accs = okAccountIds.map((aid) => ({
      account: accountById[aid],
      note: accountNotes[aid],
      bookings: [] as any[],
    }));
    const bookingMap: Record<string, any[]> = {};
    for (const bid of okBookingIds) {
      const b = bookingById[bid];
      if (!b) continue;
      bookingMap[b.account_id] = bookingMap[b.account_id] || [];
      bookingMap[b.account_id].push(b);
    }
    for (const [aid, list] of Object.entries(bookingMap)) {
      const existing = accs.find((x) => x.account?.id === aid);
      if (existing) existing.bookings = list;
      else accs.push({ account: accountById[aid], note: undefined, bookings: list });
    }
    return accs.filter((x) => x.account);
  }, [okAccountIds, okBookingIds, accountById, bookingById, accountNotes]);

  const handleSavedBooking = async (bookingId: string) => {
    const newAdminReview = {
      ...adminReview,
      [bookingId]: { editedAt: new Date().toISOString() },
    };
    const newProgress = { ...progress, adminReview: newAdminReview };
    await supabase
      .from("cash_audits")
      .update({ progress: newProgress as any, updated_at: new Date().toISOString() })
      .eq("id", auditId);
    queryClient.invalidateQueries({ queryKey: ["cash-audit", auditId] });
  };

  const openAccountInPlan = (accountId: string) => {
    setInspectorAccountId(accountId);
  };

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Lade Kassenprüfung...</div>;
  }
  if (!audit) {
    return <div className="py-12 text-center text-muted-foreground">Kassenprüfung nicht gefunden.</div>;
  }

  if (previewMode) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewMode(false)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Verwaltungs-Ansicht
          </Button>
          <Badge variant="secondary">Prüfer-Sicht (read-only)</Badge>
        </div>
        <CashAuditWizard auditId={auditId} />
      </div>
    );
  }

  const building = audit.buildings;
  const period = audit.billing_periods;
  const auditorContact = audit.contacts;
  const primaryPerson = auditorContact?.contact_persons?.find((p: any) => p.is_primary);
  const auditorContactName = primaryPerson
    ? `${primaryPerson.first_name} ${primaryPerson.last_name}`
    : auditorContact?.company_name || "–";
  const auditorName = (audit as any).auditor_name_override?.trim() || auditorContactName;

  const totalCheckedAccounts = okAccountIds.length;
  const totalIssueAccounts = issueAccountIds.length;
  const totalCheckedBookings = okBookingIds.length;
  const totalIssueBookings = issueBookingIds.length;
  const isCompleted = audit.status === "completed";

  const renderBookingRow = (b: any) => {
    const note = bookingNotes[b.id];
    const adminEdit = adminReview[b.id];
    const acc = accountById[b.account_id];
    const cAcc = accountById[b.counter_account_id];
    return (
      <div key={b.id} className="border rounded-md p-2.5 bg-background space-y-1.5">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="font-mono text-xs text-muted-foreground">
                {new Date(b.booking_date).toLocaleDateString("de-DE")}
              </span>
              <span className="font-medium truncate">{b.description || "–"}</span>
              {b.receipt_number && (
                <Badge variant="outline" className="text-[10px] h-5">
                  Beleg {b.receipt_number}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {acc?.account_number} {acc?.account_name}
              {cAcc && <> ↔ {cAcc.account_number} {cAcc.account_name}</>}
            </div>
          </div>
          <div className="text-sm font-mono font-medium whitespace-nowrap">
            {fmt(Number(b.amount) || 0)}
          </div>
        </div>
        {note && (
          <div className="flex items-start gap-1.5 text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <StickyNote className="h-3 w-3 text-amber-700 mt-0.5 flex-shrink-0" />
            <span className="text-amber-900">{note}</span>
          </div>
        )}
        {adminEdit && (
          <Badge className="bg-blue-100 text-blue-800 text-[10px] gap-1">
            <Pencil className="h-2.5 w-2.5" />
            Von der Verwaltung bearbeitet am{" "}
            {new Date(adminEdit.editedAt).toLocaleDateString("de-DE")}
          </Badge>
        )}
        <div className="flex gap-1.5 pt-0.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setEditingBooking(b)}
          >
            <Pencil className="h-3 w-3" /> Buchung bearbeiten
          </Button>
          {acc && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={() => openAccountInPlan(acc.id)}
            >
              <ExternalLink className="h-3 w-3" /> Konto öffnen
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">Kassenprüfung: {building?.name || "–"}</h2>
            <Badge variant="outline">{fiscalYear}</Badge>
            {isCompleted ? (
              <Badge className="bg-green-100 text-green-800 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Abgeschlossen
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 gap-1">
                <FileEdit className="h-3 w-3" /> In Bearbeitung
              </Badge>
            )}
            <Badge variant="secondary" className="ml-auto">Verwaltungs-Ansicht</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Prüfer: {auditorName} · {[building?.address, (building as any)?.city].filter(Boolean).join(", ")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setPreviewMode(true)} className="gap-1.5">
          <Eye className="h-4 w-4" /> Prüfer-Sicht
        </Button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Geprüfte Konten</div>
            <div className="text-2xl font-semibold text-green-700">{totalCheckedAccounts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Geprüfte Buchungen</div>
            <div className="text-2xl font-semibold text-green-700">{totalCheckedBookings}</div>
          </CardContent>
        </Card>
        <Card className={cn(totalIssueAccounts > 0 && "border-amber-300")}>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Auffällige Konten</div>
            <div className="text-2xl font-semibold text-amber-700">{totalIssueAccounts}</div>
          </CardContent>
        </Card>
        <Card className={cn(totalIssueBookings > 0 && "border-amber-300")}>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Auffällige Buchungen</div>
            <div className="text-2xl font-semibold text-amber-700">{totalIssueBookings}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="issues">
        <TabsList variant="underline" className="w-full justify-start">
          <TabsTrigger variant="underline" value="issues" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Auffälligkeiten
            {(totalIssueAccounts + totalIssueBookings) > 0 && (
              <Badge variant="secondary" className="ml-1 h-5">
                {totalIssueAccounts + totalIssueBookings}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger variant="underline" value="checked" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Geprüft
          </TabsTrigger>
          <TabsTrigger variant="underline" value="notes" className="gap-1.5">
            <StickyNote className="h-3.5 w-3.5" />
            Abschluss & Unterschrift
          </TabsTrigger>
        </TabsList>

        {/* ISSUES */}
        <TabsContent value="issues" className="space-y-3">
          {Object.keys(issuesByAccount).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Keine Auffälligkeiten markiert.
              </CardContent>
            </Card>
          ) : (
            Object.values(issuesByAccount).map((grp) => (
              <Card key={grp.account?.id} className="border-amber-300 bg-amber-50/30">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start gap-2 flex-wrap">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">
                        {grp.account?.account_number} {grp.account?.account_name}
                      </div>
                      {grp.note && (
                        <div className="text-xs text-amber-900 mt-1 bg-amber-100/60 rounded px-2 py-1">
                          <StickyNote className="h-3 w-3 inline mr-1" />
                          Notiz vom Prüfer: {grp.note}
                        </div>
                      )}
                    </div>
                    {grp.account && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => openAccountInPlan(grp.account.id)}
                      >
                        <ExternalLink className="h-3 w-3" /> Konto öffnen
                      </Button>
                    )}
                  </div>
                  {grp.bookings.length > 0 && (
                    <div className="space-y-1.5 pl-2 border-l-2 border-amber-300">
                      {grp.bookings.map(renderBookingRow)}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* CHECKED */}
        <TabsContent value="checked" className="space-y-2">
          {okGrouped.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Noch nichts als geprüft markiert.
              </CardContent>
            </Card>
          ) : (
            okGrouped.map((grp) => (
              <Card key={grp.account.id} className="border-green-200 bg-green-50/30">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-sm">
                      {grp.account.account_number} {grp.account.account_name}
                    </span>
                    {grp.bookings.length > 0 && (
                      <Badge variant="outline" className="text-[10px] h-5">
                        {grp.bookings.length} Buchung(en) geprüft
                      </Badge>
                    )}
                    {grp.note && (
                      <span className="text-xs text-muted-foreground italic">
                        „{grp.note}"
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* NOTES / SIGNATURE */}
        <TabsContent value="notes">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="text-sm font-medium">
                  {isCompleted ? "Abgeschlossen" : audit.status === "in_progress" ? "In Bearbeitung" : "Entwurf"}
                </div>
              </div>
              {audit.notes && (
                <div>
                  <div className="text-xs text-muted-foreground">Notizen vom Prüfer</div>
                  <p className="text-sm whitespace-pre-wrap">{audit.notes}</p>
                </div>
              )}
              {audit.signed_at && (
                <div>
                  <div className="text-xs text-muted-foreground">
                    Unterschrieben am {new Date(audit.signed_at).toLocaleDateString("de-DE")}
                  </div>
                  {audit.signature_data && (
                    <img
                      src={audit.signature_data}
                      alt="Unterschrift"
                      className="mt-2 h-16 border rounded bg-white p-1"
                    />
                  )}
                </div>
              )}
              {!audit.notes && !audit.signed_at && (
                <p className="text-sm text-muted-foreground">
                  Noch keine Notizen oder Unterschrift hinterlegt.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EditBookingDialog
        open={!!editingBooking}
        onOpenChange={(o) => !o && setEditingBooking(null)}
        booking={editingBooking}
        buildingName={building?.name || ""}
        onSaved={handleSavedBooking}
        hideQuickActions
      />

      <AccountInspectorDialog
        open={!!inspectorAccountId}
        onOpenChange={(o) => !o && setInspectorAccountId(null)}
        accountId={inspectorAccountId}
        buildingId={buildingId || ""}
        fiscalYear={Number(fiscalYear) || new Date().getFullYear()}
        onBookingChanged={handleSavedBooking}
        hideQuickActions
      />
    </div>
  );
}
