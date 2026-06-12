import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const BrokerModeToggle = ({ userId }: { userId: string }) => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from("profiles") as any)
        .select("broker_mode_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      setEnabled(!!data?.broker_mode_enabled);
    })();
  }, [userId]);

  const toggle = async (val: boolean) => {
    setLoading(true);
    const { error } = await (supabase.from("profiles") as any)
      .update({ broker_mode_enabled: val })
      .eq("user_id", userId);
    setLoading(false);
    if (error) { toast.error("Fehler: " + error.message); return; }
    setEnabled(val);
    toast.success(val ? "Makler-Modus aktiviert" : "Makler-Modus deaktiviert");
  };

  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground">Makler</Label>
      <Switch checked={enabled} onCheckedChange={toggle} disabled={loading} />
    </div>
  );
};
