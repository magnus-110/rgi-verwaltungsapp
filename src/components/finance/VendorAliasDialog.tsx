import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rawVendorName: string;
  buildingId?: string | null;
  /** Wenn gesetzt: optional Auswahl global vs. liegenschafts-spezifisch erlauben. */
  allowScopeChoice?: boolean;
}

/**
 * Dialog zum Hinterlegen einer Kurz-Bezeichnung für einen Lieferanten.
 *
 * Wichtig: Der Alias gilt NUR für künftige Buchungen. Bereits
 * bestehende Buchungstexte werden NICHT nachträglich geändert.
 */
export function VendorAliasDialog({
  open, onOpenChange, rawVendorName, buildingId, allowScopeChoice = true,
}: Props) {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [scope, setScope] = useState<"global" | "building">("global");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDisplayName("");
      setScope(buildingId ? "global" : "global");
    }
  }, [open, buildingId]);

  const handleSave = async () => {
    const name = displayName.trim();
    if (!name) { toast.error("Bitte einen Anzeigenamen eingeben"); return; }
    if (!rawVendorName.trim()) { toast.error("Original-Lieferantenname fehlt"); return; }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const insertRow = {
        building_id: scope === "building" && buildingId ? buildingId : null,
        raw_pattern: rawVendorName.trim(),
        display_name: name,
        created_by: userData.user?.id || null,
      };
      const { error } = await supabase.from("vendor_aliases").insert(insertRow);
      if (error) {
        if (String(error.message || "").includes("duplicate")) {
          toast.error("Für diesen Lieferanten existiert bereits ein Alias");
        } else {
          toast.error("Fehler: " + error.message);
        }
        return;
      }
      toast.success("Alias gespeichert – gilt für künftige Buchungen");
      qc.invalidateQueries({ queryKey: ["vendor-aliases"] });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lieferanten-Kurzname festlegen</DialogTitle>
          <DialogDescription>
            Gilt nur für <b>künftige</b> Buchungen. Bestehende Buchungstexte bleiben unverändert.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Original (aus Rechnung)</Label>
            <div className="text-sm bg-muted/40 rounded px-2 py-1.5 break-words">
              {rawVendorName || <em className="text-muted-foreground">leer</em>}
            </div>
          </div>

          <div>
            <Label htmlFor="alias-display" className="text-xs">Anzeigename</Label>
            <Input
              id="alias-display"
              autoFocus
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="z.B. Markus Gschwend"
              className="h-9"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } }}
            />
          </div>

          {allowScopeChoice && (
            <div>
              <Label className="text-xs">Gültigkeit</Label>
              <RadioGroup value={scope} onValueChange={(v: any) => setScope(v)} className="mt-1 space-y-1">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="global" id="scope-global" />
                  <Label htmlFor="scope-global" className="text-sm font-normal cursor-pointer">
                    Global (alle Liegenschaften)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="building" id="scope-building" disabled={!buildingId} />
                  <Label htmlFor="scope-building" className="text-sm font-normal cursor-pointer">
                    Nur für diese Liegenschaft
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving || !displayName.trim()}>
            {saving ? "Speichern…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
