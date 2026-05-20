import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  X, Pencil, FileText, Save, ArrowRightLeft, AlertTriangle, Check,
  ChevronLeft, ChevronRight, Move, ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EditBookingDialog } from "./EditBookingDialog";

type AccountOption = { id: string; account_number: string | number; account_name: string };

function AccountSearchSelect({
  value, onChange, accounts, placeholder = "Konto suchen…", excludeIds = [], className,
}: {
  value: string;
  onChange: (id: string) => void;
  accounts: AccountOption[];
  placeholder?: string;
  excludeIds?: string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find((a) => a.id === value);
  const filtered = accounts.filter((a) => !excludeIds.includes(a.id));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("h-9 justify-between font-normal", className)}
        >
          <span className="truncate">
            {selected ? `${selected.account_number} ${selected.account_name}` : placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 ml-2 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[420px]" align="start">
        <Command
          filter={(value, search) => {
            // value = `${number} ${name}` lowercased — match if either number or name contains search
            return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Nach Nummer oder Name suchen…" />
          <CommandList>
            <CommandEmpty>Kein Konto gefunden.</CommandEmpty>
            <CommandGroup>
              {filtered.map((a) => {
                const label = `${a.account_number} ${a.account_name}`;
                return (
                  <CommandItem
                    key={a.id}
                    value={label}
                    onSelect={() => {
                      onChange(a.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === a.id ? "opacity-100" : "opacity-0")} />
                    <span className="font-mono text-xs mr-2 text-muted-foreground">{a.account_number}</span>
                    <span className="truncate">{a.account_name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
  buildingId: string;
  fiscalYear: number;
  onBookingChanged?: (bookingId: string) => void;
  hideQuickActions?: boolean;
}

const fmt = (n?: number | null) =>
  n == null ? "–" : n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export function AccountInspectorDialog({
  open, onOpenChange, accountId, buildingId, fiscalYear, onBookingChanged, hideQuickActions,
}: Props) {
  const queryClient = useQueryClient();
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [editingFull, setEditingFull] = useState<any | null>(null);
  const [editAccount, setEditAccount] = useState(false);
  const [accForm, setAccForm] = useState<{ account_name: string; is_billing_relevant: boolean; is_wirtschaftsplan_relevant: boolean }>({
    account_name: "",
    is_billing_relevant: false,
    is_wirtschaftsplan_relevant: false,
  });
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [moveTargetId, setMoveTargetId] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Account
  const { data: account } = useQuery({
    queryKey: ["account-inspector", accountId],
    enabled: !!accountId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("id", accountId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // All accounts of this building (for move target)
  const { data: allAccounts = [] } = useQuery({
    queryKey: ["account-inspector-coa", buildingId],
    enabled: !!buildingId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, building_id")
        .or(`building_id.eq.${buildingId},building_id.is.null`)
        .order("account_number");
      return data || [];
    },
  });

  // Bookings: account_id = X OR counter_account_id = X
  const { data: bookings = [], refetch: refetchBookings } = useQuery({
    queryKey: ["account-inspector-bookings", accountId, fiscalYear, buildingId],
    enabled: !!accountId && !!buildingId && !!fiscalYear && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, booking_date, description, amount, account_id, counter_account_id,
          building_id, fiscal_year, receipt_number, booking_type, status,
          amount_35a, is_35a_relevant, invoice_id,
          chart_of_accounts!bookings_account_id_fkey(id, account_number, account_name),
          counter_account:chart_of_accounts!bookings_counter_account_id_fkey(id, account_number, account_name),
          invoices(id, file_path, file_name, vendor_name, invoice_number, gross_amount)
        `)
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .or(`account_id.eq.${accountId},counter_account_id.eq.${accountId}`)
        .order("booking_date");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  useEffect(() => {
    if (account) {
      setAccForm({
        account_name: account.account_name || "",
        is_billing_relevant: !!(account as any).is_billing_relevant,
        is_wirtschaftsplan_relevant: !!(account as any).is_wirtschaftsplan_relevant,
      });
    }
  }, [account]);

  useEffect(() => {
    if (!open) {
      setSelectedBookingId(null);
      setBulkSelected(new Set());
      setEditAccount(false);
      setMoveTargetId("");
    }
  }, [open]);

  useEffect(() => {
    if (!selectedBookingId && bookings.length > 0) {
      setSelectedBookingId(bookings[0].id);
    }
  }, [bookings, selectedBookingId]);

  const idx = bookings.findIndex((b) => b.id === selectedBookingId);
  const booking: any = idx >= 0 ? bookings[idx] : null;

  // PDF preview
  useEffect(() => {
    setPdfUrl(null);
    if (!booking?.invoices?.file_path) return;
    let cancelled = false;
    (async () => {
      const cleanPath = booking.invoices.file_path.replace(/^\/+/, "").replace(/^invoices\//, "");
      const { data } = await supabase.storage.from("invoices").createSignedUrl(cleanPath, 3600);
      if (!cancelled && data?.signedUrl) setPdfUrl(data.signedUrl);
    })();
    return () => { cancelled = true; };
  }, [selectedBookingId, booking?.invoices?.file_path]);

  // Saldo (bank-zentrisch: account_id = +amount; counter = -amount or vice-versa per booking_type)
  const saldo = useMemo(() => {
    let s = 0;
    for (const b of bookings) {
      const sign = b.booking_type === "income" ? 1 : -1;
      const amt = Number(b.amount) || 0;
      if (b.account_id === accountId) s += sign * amt;
      else if (b.counter_account_id === accountId) s -= sign * amt;
    }
    return s;
  }, [bookings, accountId]);

  const saveAccount = async () => {
    if (!accountId) return;
    const { error } = await supabase
      .from("chart_of_accounts")
      .update({
        account_name: accForm.account_name,
        is_billing_relevant: accForm.is_billing_relevant,
        is_wirtschaftsplan_relevant: accForm.is_wirtschaftsplan_relevant,
      } as any)
      .eq("id", accountId);
    if (error) {
      toast.error("Konto konnte nicht gespeichert werden", { description: error.message });
      return;
    }
    toast.success("Konto aktualisiert");
    setEditAccount(false);
    queryClient.invalidateQueries({ queryKey: ["account-inspector", accountId] });
    queryClient.invalidateQueries({ queryKey: ["chart_of_accounts"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };

  const moveBooking = async (bookingId: string, newAccId: string) => {
    const b = bookings.find((x) => x.id === bookingId);
    if (!b || !newAccId) return;
    if (newAccId === b.account_id) {
      toast.error("Zielkonto entspricht dem Soll/Haben-Konto");
      return;
    }
    const { error } = await supabase
      .from("bookings")
      .update({ counter_account_id: newAccId } as any)
      .eq("id", bookingId);
    if (error) {
      toast.error("Umbuchung fehlgeschlagen", { description: error.message });
      return;
    }
    toast.success("Gegenkonto geändert");
    onBookingChanged?.(bookingId);
    refetchBookings();
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
  };

  const bulkMove = async () => {
    if (!moveTargetId || bulkSelected.size === 0) return;
    let ok = 0, fail = 0;
    for (const bid of bulkSelected) {
      const b = bookings.find((x) => x.id === bid);
      if (!b) { fail++; continue; }
      if (moveTargetId === b.account_id) { fail++; continue; }
      const { error } = await supabase
        .from("bookings")
        .update({ counter_account_id: moveTargetId } as any)
        .eq("id", bid);
      if (error) fail++;
      else { ok++; onBookingChanged?.(bid); }
    }
    toast.success(`${ok} Gegenkonto(s) geändert${fail ? `, ${fail} fehlgeschlagen` : ""}`);
    setBulkSelected(new Set());
    setMoveTargetId("");
    refetchBookings();
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
  };

  const toggleBulk = (id: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const goTo = (i: number) => {
    if (i < 0 || i >= bookings.length) return;
    setSelectedBookingId(bookings[i].id);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-none w-[95vw] h-[90vh] p-0 gap-0 [&>button]:hidden flex flex-col">
          {/* Header */}
          <div className="flex items-start gap-3 px-4 py-3 border-b bg-muted/30">
            <div className="flex-1 min-w-0">
              {editAccount ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-muted-foreground">{account?.account_number}</span>
                    <Input
                      value={accForm.account_name}
                      onChange={(e) => setAccForm((p) => ({ ...p, account_name: e.target.value }))}
                      className="h-8 max-w-md"
                    />
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <Label className="flex items-center gap-2 cursor-pointer">
                      <Switch
                        checked={accForm.is_billing_relevant}
                        onCheckedChange={(v) => setAccForm((p) => ({ ...p, is_billing_relevant: v }))}
                      />
                      Abrechnungsrelevant
                    </Label>
                    <Label className="flex items-center gap-2 cursor-pointer">
                      <Switch
                        checked={accForm.is_wirtschaftsplan_relevant}
                        onCheckedChange={(v) => setAccForm((p) => ({ ...p, is_wirtschaftsplan_relevant: v }))}
                      />
                      Wirtschaftsplan
                    </Label>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold">
                      {account?.account_number} {account?.account_name}
                    </h2>
                    <Badge variant="outline">{fiscalYear}</Badge>
                    <Badge variant="secondary">{bookings.length} Buchungen</Badge>
                    <span className={cn("text-sm font-mono ml-2", saldo >= 0 ? "text-green-700" : "text-red-700")}>
                      Saldo: {fmt(saldo)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(account as any)?.category || "–"}
                  </p>
                </>
              )}
            </div>
            {editAccount ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditAccount(false)}>Abbrechen</Button>
                <Button size="sm" onClick={saveAccount} className="gap-1.5">
                  <Save className="h-3.5 w-3.5" /> Speichern
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditAccount(true)} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Konto bearbeiten
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Bulk action bar */}
          {bulkSelected.size > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm">
              <Move className="h-4 w-4 text-amber-700" />
              <span>{bulkSelected.size} ausgewählt – verschieben nach:</span>
              <AccountSearchSelect
                value={moveTargetId}
                onChange={setMoveTargetId}
                accounts={allAccounts as any}
                excludeIds={accountId ? [accountId] : []}
                placeholder="Zielkonto suchen…"
                className="w-[360px]"
              />
              <Button size="sm" disabled={!moveTargetId} onClick={bulkMove} className="gap-1.5">
                <ArrowRightLeft className="h-3.5 w-3.5" /> Umbuchen
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBulkSelected(new Set())}>Auswahl leeren</Button>
            </div>
          )}

          {/* Body: split view */}
          <div className="grid grid-cols-1 md:grid-cols-[420px_1fr] flex-1 min-h-0">
            {/* Left: booking list */}
            <div className="border-r flex flex-col min-h-0">
              <div className="px-3 py-2 border-b text-xs text-muted-foreground flex items-center gap-2">
                <Checkbox
                  checked={bulkSelected.size === bookings.length && bookings.length > 0}
                  onCheckedChange={(v) => {
                    if (v) setBulkSelected(new Set(bookings.map((b) => b.id)));
                    else setBulkSelected(new Set());
                  }}
                />
                <span>Alle</span>
              </div>
              <ScrollArea className="flex-1">
                <div className="divide-y">
                  {bookings.map((b) => {
                    const isSel = b.id === selectedBookingId;
                    const onThisAcc = b.account_id === accountId;
                    const otherAcc = onThisAcc ? b.counter_account : b.chart_of_accounts;
                    const sign = b.booking_type === "income" ? 1 : -1;
                    const effective = onThisAcc ? sign : -sign;
                    return (
                      <div
                        key={b.id}
                        className={cn(
                          "px-3 py-2 cursor-pointer hover:bg-muted/40 flex items-start gap-2",
                          isSel && "bg-primary/5 border-l-2 border-primary",
                        )}
                        onClick={() => setSelectedBookingId(b.id)}
                      >
                        <Checkbox
                          checked={bulkSelected.has(b.id)}
                          onCheckedChange={() => toggleBulk(b.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {new Date(b.booking_date).toLocaleDateString("de-DE")}
                            </span>
                            <span className={cn("text-xs font-mono font-semibold", effective >= 0 ? "text-green-700" : "text-red-700")}>
                              {effective >= 0 ? "+" : "−"}{fmt(Math.abs(Number(b.amount) || 0))}
                            </span>
                          </div>
                          <p className="text-xs truncate font-medium">{b.description || "–"}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            ↔ {otherAcc?.account_number} {otherAcc?.account_name}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {bookings.length === 0 && (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      Keine Buchungen in diesem Wirtschaftsjahr.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right: detail */}
            <div className="grid grid-cols-1 lg:grid-cols-2 min-h-0">
              {/* Detail */}
              <div className="overflow-y-auto p-4 space-y-4 border-r">
                {booking ? (
                  <>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx <= 0} onClick={() => goTo(idx - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs text-muted-foreground tabular-nums">{idx + 1} / {bookings.length}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx >= bookings.length - 1} onClick={() => goTo(idx + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="rounded-lg border bg-card divide-y text-sm">
                      <Row label="Datum" value={new Date(booking.booking_date).toLocaleDateString("de-DE")} />
                      <Row label="Betrag" value={
                        <span className={cn("font-mono font-semibold", booking.booking_type === "income" ? "text-green-700" : "text-red-700")}>
                          {fmt(Math.abs(Number(booking.amount) || 0))}
                        </span>
                      } />
                      <Row label="Buchungstext" value={<span className="text-right">{booking.description || "–"}</span>} />
                      <Row label="Konto" value={<span className="text-right">{booking.chart_of_accounts?.account_number} {booking.chart_of_accounts?.account_name}</span>} />
                      <Row label="Gegenkonto" value={<span className="text-right">{booking.counter_account?.account_number} {booking.counter_account?.account_name}</span>} />
                      {booking.receipt_number && <Row label="Beleg" value={booking.receipt_number} />}
                    </div>

                    <Separator />

                    {/* Account change for THIS booking */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
                        <ArrowRightLeft className="h-3 w-3" /> Konto ändern
                      </div>
                      {(["account_id", "counter_account_id"] as const).map((side) => {
                        const currentId = booking[side];
                        const sideLabel = side === "account_id" ? "Konto (Soll/Haben)" : "Gegenkonto";
                        return (
                          <div key={side} className="space-y-1">
                            <Label className="text-xs">{sideLabel}</Label>
                            <AccountSearchSelect
                              value={currentId || ""}
                              accounts={allAccounts as any}
                              excludeIds={[
                                side === "account_id" ? booking.counter_account_id : booking.account_id,
                              ].filter(Boolean)}
                              placeholder="Konto suchen…"
                              onChange={async (val) => {
                                if (val === currentId) return;
                                const { error } = await supabase
                                  .from("bookings")
                                  .update({ [side]: val } as any)
                                  .eq("id", booking.id);
                                if (error) {
                                  toast.error("Änderung fehlgeschlagen", { description: error.message });
                                  return;
                                }
                                toast.success("Buchung aktualisiert");
                                onBookingChanged?.(booking.id);
                                refetchBookings();
                                queryClient.invalidateQueries({ queryKey: ["bookings"] });
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>

                    <Separator />

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingFull(booking)}>
                        <Pencil className="h-3.5 w-3.5" /> Vollständig bearbeiten
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-sm text-muted-foreground py-12">
                    Wähle eine Buchung aus.
                  </div>
                )}
              </div>

              {/* Beleg */}
              <div className="bg-muted/20 min-h-0 flex flex-col">
                {pdfUrl ? (
                  <iframe src={pdfUrl} className="w-full h-full border-0" title="Beleg" />
                ) : booking?.invoices ? (
                  <div className="p-6 space-y-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <h4 className="font-semibold">Rechnung</h4>
                    </div>
                    <div className="rounded-lg border bg-card divide-y text-sm">
                      <Row label="Lieferant" value={booking.invoices.vendor_name || "–"} />
                      <Row label="Rechnungs-Nr." value={booking.invoices.invoice_number || "–"} />
                      <Row label="Brutto" value={fmt(booking.invoices.gross_amount)} />
                    </div>
                    <p className="text-xs text-muted-foreground italic">Kein PDF-Beleg hinterlegt.</p>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-6 text-center">
                    <div>
                      <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Kein Beleg verknüpft</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EditBookingDialog
        open={!!editingFull}
        onOpenChange={(o) => !o && setEditingFull(null)}
        booking={editingFull}
        buildingName={""}
        onSaved={(id) => {
          onBookingChanged?.(id);
          refetchBookings();
        }}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
