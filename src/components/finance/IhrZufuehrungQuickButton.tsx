import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, PiggyBank } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { createIhrZufuehrungBooking, isReserveAccount } from "./lib/ihrZufuehrung";
import { cn } from "@/lib/utils";

interface AccountLike {
  id: string;
  account_number?: string | null;
  account_name?: string | null;
  category?: string | null;
}

interface Props {
  buildingId: string | null | undefined;
  account?: AccountLike | null;
  counterAccount?: AccountLike | null;
  defaultAmount?: number | string | null;
  /** Optional: Wirtschaftsjahr; sonst aus defaultDate oder aktuellem Jahr abgeleitet */
  defaultFiscalYear?: number | null;
  defaultDate?: string | null;
  defaultDescription?: string | null;
  /** Wenn true: Button immer sichtbar (z. B. in Bankauszugs-Liste) */
  alwaysVisible?: boolean;
  onCreated?: () => void;
  className?: string;
}

const parseDe = (v: string | number | null | undefined): number => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (s.includes(",")) return parseFloat(s.replace(",", ".")) || 0;
  return parseFloat(s) || 0;
};

const formatDe = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function IhrZufuehrungQuickButton({
  buildingId,
  account,
  counterAccount,
  defaultAmount,
  defaultFiscalYear,
  defaultDate,
  defaultDescription,
  alwaysVisible,
  onCreated,
  className,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const reserveDetected = useMemo(
    () => isReserveAccount(account) || isReserveAccount(counterAccount),
    [account, counterAccount]
  );
  const visible = alwaysVisible || reserveDetected;

  const [amount, setAmount] = useState<string>("");
  const [fiscalYear, setFiscalYear] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const openPopover = (next: boolean) => {
    if (next) {
      const amt = parseDe(defaultAmount ?? "");
      setAmount(amt ? formatDe(amt) : "");
      const yr =
        defaultFiscalYear ??
        (defaultDate ? new Date(defaultDate).getFullYear() : new Date().getFullYear());
      setFiscalYear(String(yr));
      setDescription(`Rücklagenbildung ${yr}`);
    }
    setOpen(next);
  };

  // Buchungstext mit aktuellem Jahr synchronisieren, solange Nutzer nicht abweicht
  const syncedFromYear = (y: string) => {
    const prevDefault = `Rücklagenbildung ${fiscalYear}`;
    if (description === prevDefault || !description.trim()) {
      setDescription(`Rücklagenbildung ${y}`);
    }
    setFiscalYear(y);
  };

  const handleSave = async () => {
    if (!buildingId) return;
    const amt = parseDe(amount);
    if (!amt || amt <= 0) {
      toast.error("Bitte Betrag angeben");
      return;
    }
    const yr = parseInt(fiscalYear, 10);
    if (!yr || yr < 2000 || yr > 2100) {
      toast.error("Bitte Wirtschaftsjahr angeben");
      return;
    }
    setSaving(true);
    try {
      await createIhrZufuehrungBooking({
        buildingId,
        amount: amt,
        fiscalYear: yr,
        description: description?.trim() || null,
        createdBy: user?.id,
      });
      toast.success(`IHR-Zuführung gebucht (31.12.${yr})`);
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey[0] as string;
          return (
            typeof k === "string" &&
            (k.startsWith("bookings") ||
              k.startsWith("account-balance") ||
              k.startsWith("bank-transactions"))
          );
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
          title="Planmäßige IHR-Zuführung 4030 → 1930 erzeugen (31.12.)"
          onClick={(e) => e.stopPropagation()}
        >
          <PiggyBank className="h-3.5 w-3.5" />
          IHR-Zuführung
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 space-y-3"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <div className="text-sm font-semibold">IHR-Zuführung erzeugen</div>
          <div className="text-xs text-muted-foreground">
            4030 Durchlaufkonto → 1930 Planmäßige IHR (+)
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Wirtschaftsjahr</Label>
            <Input
              type="number"
              value={fiscalYear}
              onChange={(e) => setFiscalYear(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="text-[10px] text-muted-foreground">Buchungsdatum 31.12.</div>
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
          <Label className="text-xs">Zusatz-Text (optional)</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder='leer = nur "Rücklagenbildung JJJJ"'
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
