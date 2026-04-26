import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  buildingId?: string;
  contactId?: string;
  /** Compact = small dot only */
  compact?: boolean;
  className?: string;
}

interface Notification {
  id: string;
  contact_id: string;
  building_id: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  contacts?: { first_name: string | null; last_name: string | null; company_name: string | null } | null;
}

export const IbanChangeBadge = ({ buildingId, contactId, compact, className }: Props) => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: notifications = [] } = useQuery({
    queryKey: ["iban-change-notifications", buildingId ?? null, contactId ?? null],
    queryFn: async () => {
      let q = supabase
        .from("contact_change_notifications")
        .select("id, contact_id, building_id, old_value, new_value, created_at, contacts(first_name,last_name,company_name)")
        .eq("status", "pending")
        .eq("change_type", "iban")
        .order("created_at", { ascending: false });
      if (buildingId) q = q.eq("building_id", buildingId);
      if (contactId) q = q.eq("contact_id", contactId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    refetchInterval: 60000,
  });

  if (notifications.length === 0) return null;

  const acknowledge = async (id: string) => {
    setBusyId(id);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("contact_change_notifications")
      .update({
        status: "acknowledged",
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: u.user?.id ?? null,
      })
      .eq("id", id);
    setBusyId(null);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Erledigt markiert" });
    qc.invalidateQueries({ queryKey: ["iban-change-notifications"] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button
          className={cn(
            "inline-flex items-center gap-1 rounded-md hover:bg-muted/50 transition-colors",
            compact ? "p-0.5" : "px-2 py-1",
            className
          )}
          aria-label="IBAN-Änderungen"
        >
          <AlertCircle className={cn("text-warning", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
          {!compact && (
            <Badge variant="outline" className="border-warning text-warning text-xs h-5 px-1.5">
              {notifications.length} IBAN
            </Badge>
          )}
          {compact && (
            <span className="text-[10px] font-semibold text-warning leading-none">{notifications.length}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold text-sm">IBAN-Änderungen</h4>
            <p className="text-xs text-muted-foreground">
              Diese Änderungen müssen ggf. in der Bank/SEPA hinterlegt werden.
            </p>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {notifications.map((n) => {
              const name = n.contacts?.company_name ||
                [n.contacts?.first_name, n.contacts?.last_name].filter(Boolean).join(" ") ||
                "Unbekannt";
              return (
                <div key={n.id} className="border rounded-md p-2.5 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium">{name}</div>
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 gap-1"
                      disabled={busyId === n.id}
                      onClick={() => acknowledge(n.id)}
                    >
                      {busyId === n.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Erledigt
                    </Button>
                  </div>
                  <div className="text-xs space-y-0.5">
                    {n.old_value && (
                      <div className="text-muted-foreground line-through">{n.old_value}</div>
                    )}
                    <div className="font-mono text-foreground">{n.new_value || "—"}</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("de-DE")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
