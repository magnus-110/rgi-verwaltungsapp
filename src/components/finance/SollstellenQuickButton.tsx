import { useState, useMemo, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  createSollstellungBooking,
  isPersonenkonto,
  type SollstellungDirection,
} from "./lib/sollstellung";
import { cn } from "@/lib/utils";

interface AccountLike {
  id: string;
  account_number?: string | null;
  account_name?: string | null;
  category?: string | null;
}

interface Props {
  buildingId: string | null | undefined;
  /** Aktuelles Hauptkonto der Buchungsmaske */
  account?: AccountLike | null;
  /** Aktuelles Gegenkonto der Buchungsmaske */
  counterAccount?: AccountLike | null;
  /** Default-Betrag aus der Maske */
  defaultAmount?: number | string | null;
  /** Default-Datum aus der Maske */
  defaultDate?: string | null;
  /** Default-Beschreibung aus der Maske */
  defaultDescription?: string | null;
  /** Wenn true: Button immer sichtbar, Personenkonto wird per Picker gewählt */
  allowAccountPicker?: boolean;
  onCreated?: () => void;
  className?: string;
}

const parseDe = (v: string | number | null | undefined): number => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s) return 0;
  // Wenn beide Trenner vorkommen → "." = Tausender, "," = Dezimal (de)
  if (s.includes(",") && s.includes(".")) {
    return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  // Nur Komma → Dezimaltrenner
  if (s.includes(",")) {
    return parseFloat(s.replace(",", ".")) || 0;
  }
  // Nur Punkt → schon im JS-Number-Format (z. B. "138.11")
  return parseFloat(s) || 0;
};

const formatDe = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function SollstellenQuickButton({
  buildingId,
  account,
  counterAccount,
  defaultAmount,
  defaultDate,
  defaultDescription,
  allowAccountPicker,
  onCreated,
  className,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Personenkonto aus Maske ableiten
  const derivedPersonenkonto = useMemo<AccountLike | null>(() => {
    if (isPersonenkonto(account)) return account!;
    if (isPersonenkonto(counterAccount)) return counterAccount!;
    return null;
  }, [account, counterAccount]);

  const [pickedPersonenkontoId, setPickedPersonenkontoId] = useState<string>("");
  const [personenkontenList, setPersonenkontenList] = useState<AccountLike[]>([]);

  // Personenkonten nachladen wenn Picker aktiv und kein automatisches Konto vorhanden
  useEffect(() => {
    if (!allowAccountPicker || derivedPersonenkonto || !buildingId || !open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, category")
        .eq("building_id", buildingId)
        .ilike("category", "0. Personenkonten%")
        .order("account_number");
      if (!cancelled) setPersonenkontenList((data as any) || []);
    })();
    return () => { cancelled = true; };
  }, [allowAccountPicker, derivedPersonenkonto, buildingId, open]);

  const personenkonto = derivedPersonenkonto
    || personenkontenList.find((p) => p.id === pickedPersonenkontoId)
    || null;

  const visible = !!derivedPersonenkonto || !!allowAccountPicker;

  const [direction, setDirection] = useState<SollstellungDirection>("guthaben");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const openPopover = (next: boolean) => {
    if (next) {
      const amt = parseDe(defaultAmount ?? "");
      setAmount(amt ? formatDe(amt) : "");
      setDate(defaultDate || new Date().toISOString().split("T")[0]);
      const personLabel = personenkonto?.account_name || personenkonto?.account_number || "";
      setDescription(
        defaultDescription
          ? `Sollstellung ${defaultDescription}`
          : `Sollstellung ${personLabel}`,
      );
      setDirection("guthaben");
    }
    setOpen(next);
  };

  const handleSave = async () => {
    if (!buildingId || !personenkonto) return;
    const amt = parseDe(amount);
    if (!amt || amt <= 0) {
      toast.error("Bitte Betrag angeben");
      return;
    }
    if (!date) {
      toast.error("Bitte Datum angeben");
      return;
    }
    if (!description.trim()) {
      toast.error("Bitte Buchungstext angeben");
      return;
    }
    setSaving(true);
    try {
      await createSollstellungBooking({
        buildingId,
        personenkontoId: personenkonto.id,
        amount: amt,
        bookingDate: date,
        description: description.trim(),
        direction,
        createdBy: user?.id,
      });
      toast.success("Sollstellung gebucht");
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey[0] as string;
          return typeof k === "string" && (k.startsWith("bookings") || k.startsWith("account-balance"));
        },
      });
      setOpen(false);
      onCreated?.();
    } catch (err: any) {
      toast.error("Fehler: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Popover open={open} onOpenChange={openPopover}>
      <PopoverTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          disabled={!buildingId}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
            "border-border text-muted-foreground hover:bg-muted",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            className,
          )}
          title="Interne Sollstellungs-Buchung Personenkonto ↔ 4020 erzeugen"
          onClick={(e) => e.stopPropagation()}
        >
          Sollstellen
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-1">
          <div className="text-sm font-semibold">Sollstellung erzeugen</div>
          <div className="text-xs text-muted-foreground">
            {personenkonto
              ? `${personenkonto.account_number} – ${personenkonto.account_name} ↔ 4020`
              : "Personenkonto wählen ↔ 4020"}
          </div>
        </div>

        {allowAccountPicker && !derivedPersonenkonto && (
          <div className="space-y-1">
            <Label className="text-xs">Personenkonto</Label>
            <select
              value={pickedPersonenkontoId}
              onChange={(e) => setPickedPersonenkontoId(e.target.value)}
              className="w-full h-8 text-xs border rounded-md px-2 bg-background"
            >
              <option value="">– bitte wählen –</option>
              {personenkontenList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.account_number} – {p.account_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Art</Label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setDirection("guthaben")}
              className={cn(
                "flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors",
                direction === "guthaben"
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              Guthaben
            </button>
            <button
              type="button"
              onClick={() => setDirection("nachzahlung")}
              className={cn(
                "flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors",
                direction === "nachzahlung"
                  ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              Nachzahlung
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Datum</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Betrag (€)</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Buchungstext</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Buchen
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
