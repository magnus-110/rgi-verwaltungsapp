import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Search, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  account_number: string;
  account_name: string;
  category: string;
  is_35a_relevant?: boolean | null;
}

interface AccountSearchSelectProps {
  value: string;
  onChange: (value: string) => void;
  accounts: Account[];
  placeholder?: string;
  excludeCategory?: string;
  showCreateOption?: boolean;
  onCreateClick?: () => void;
  className?: string;
  triggerClassName?: string;
}

export function AccountSearchSelect({
  value,
  onChange,
  accounts,
  placeholder = "Konto wählen…",
  excludeCategory,
  showCreateOption,
  onCreateClick,
  className,
  triggerClassName,
}: AccountSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredAccounts = useMemo(() => {
    let list = accounts;
    if (excludeCategory) list = list.filter(a => a.category !== excludeCategory);
    const q = search.toLowerCase().trim();
    if (q) list = list.filter(a => a.account_number.includes(q) || a.account_name.toLowerCase().includes(q));
    return list;
  }, [accounts, search, excludeCategory]);

  const grouped = useMemo(() => {
    return filteredAccounts.reduce((acc: Record<string, Account[]>, a) => {
      (acc[a.category] = acc[a.category] || []).push(a);
      return acc;
    }, {});
  }, [filteredAccounts]);

  const selectedAccount = accounts.find(a => a.id === value);
  const label = selectedAccount ? `${selectedAccount.account_number}  ${selectedAccount.account_name}` : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn(
            "w-full h-9 justify-between text-left font-semibold text-sm border-primary/30 bg-primary/5",
            !value && "text-muted-foreground font-normal",
            triggerClassName
          )}
        >
          <span className="truncate">{value ? label : placeholder}</span>
          {value ? (
            <X className="h-3.5 w-3.5 shrink-0 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); onChange(""); }} />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[400px] p-0", className)} align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nr. oder Name suchen…"
              className="pl-8 h-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[280px] overflow-y-auto p-1">
          {Object.keys(grouped).length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">Kein Konto gefunden</div>
          ) : (
            Object.entries(grouped).map(([cat, accs]) => (
              <div key={cat}>
                <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{cat}</div>
                {accs.map(a => (
                  <button
                    key={a.id}
                    onClick={() => { onChange(a.id); setOpen(false); setSearch(""); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-2 text-left rounded-md hover:bg-accent transition-colors text-sm",
                      value === a.id && "bg-accent"
                    )}
                  >
                    <span className="font-mono text-xs font-medium w-12 shrink-0">{a.account_number}</span>
                    <span className="truncate">{a.account_name}</span>
                    {a.is_35a_relevant && (
                      <Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100 ml-auto shrink-0">§35a</Badge>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
          {showCreateOption && (
            <button
              onClick={() => { onCreateClick?.(); setOpen(false); setSearch(""); }}
              className="w-full flex items-center gap-2 px-2 py-2 text-left rounded-md hover:bg-accent transition-colors text-sm text-primary font-medium"
            >
              <Plus className="h-3.5 w-3.5" /> Neues Konto anlegen
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
