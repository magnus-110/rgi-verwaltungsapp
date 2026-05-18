import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountSearchSelect } from "./AccountSearchSelect";
import { CreateAccountInlineDialog } from "./CreateAccountInlineDialog";
import { Loader2, Landmark, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  iban: string;
  bankNameFromStatement?: string | null;
}

export function BankAccountMappingDialog({
  open,
  onOpenChange,
  buildingId,
  iban,
  bankNameFromStatement,
}: Props) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [coaAccountId, setCoaAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Existing mapping
  const { data: existing, isLoading } = useQuery({
    queryKey: ["building-bank-account-row", buildingId, iban],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("building_bank_accounts" as any)
        .select("*")
        .eq("building_id", buildingId)
        .eq("iban", iban)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: open && !!buildingId && !!iban,
  });

  // Accounts (Bankkonten + Rücklagen)
  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts-bank", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, category, building_id")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      // Filter auf Bank/Rücklagen-artige Konten
      return (data || []).filter((a: any) => {
        const cat = (a.category || "").toLowerCase();
        const nr = (a.account_number || "").toString();
        return (
          cat.includes("bank") ||
          cat.includes("rücklag") ||
          cat.includes("system") ||
          nr.startsWith("18") ||
          nr.startsWith("12")
        );
      });
    },
    enabled: open && !!buildingId,
  });

  useEffect(() => {
    if (open) {
      setDisplayName(existing?.display_name || "");
      setCoaAccountId(existing?.coa_account_id || "");
    }
  }, [open, existing]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["building-bank-accounts", buildingId] });
    queryClient.invalidateQueries({ queryKey: ["building-bank-account-row", buildingId, iban] });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        building_id: buildingId,
        iban,
        display_name: displayName.trim() || null,
        coa_account_id: coaAccountId || null,
        bank_name: bankNameFromStatement || null,
      };
      const { error } = await supabase
        .from("building_bank_accounts" as any)
        .upsert(payload, { onConflict: "building_id,iban" });
      if (error) throw error;
      toast.success("Zuordnung gespeichert");
      invalidate();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing?.id) {
      onOpenChange(false);
      return;
    }
    if (!confirm("Zuordnung wirklich löschen?")) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("building_bank_accounts" as any)
        .delete()
        .eq("id", existing.id);
      if (error) throw error;
      toast.success("Zuordnung gelöscht");
      invalidate();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" />
              Bankkonto zuordnen
            </DialogTitle>
            <DialogDescription>
              Verknüpfen Sie diese IBAN mit einem Konto aus dem Kontenrahmen. Alle Buchungen
              aus diesem Bankkonto werden dann automatisch auf das gewählte Konto gebucht.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">IBAN</Label>
                <div className="font-mono text-sm bg-muted/50 rounded px-3 py-2 mt-1">
                  {iban?.replace(/(.{4})/g, "$1 ").trim()}
                </div>
                {bankNameFromStatement && (
                  <div className="text-xs text-muted-foreground mt-1">{bankNameFromStatement}</div>
                )}
              </div>

              <div>
                <Label className="text-xs">Bezeichnung</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder='z. B. "Rücklage Aufzug" oder "Girokonto Haus A"'
                  className="h-9 text-sm"
                />
              </div>

              <div>
                <Label className="text-xs">Konto im Kontenrahmen</Label>
                <AccountSearchSelect
                  value={coaAccountId}
                  onChange={setCoaAccountId}
                  accounts={accounts as any}
                  placeholder="Bank-/Rücklagenkonto wählen…"
                  showCreateOption
                  onCreateClick={() => setCreateOpen(true)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Es werden Bankkonten und Rücklagenkonten angezeigt. Über
                  „Neues Konto anlegen" können Sie weitere Konten für diese Liegenschaft erstellen.
                </p>
              </div>

              <div className="flex justify-between items-center pt-2">
                <div>
                  {existing?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDelete}
                      disabled={saving}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Zuordnung löschen
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                    Abbrechen
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Speichern
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CreateAccountInlineDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        buildingId={buildingId}
        onCreated={(id) => {
          setCoaAccountId(id);
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ["chart-of-accounts-bank", buildingId] });
        }}
      />
    </>
  );
}
