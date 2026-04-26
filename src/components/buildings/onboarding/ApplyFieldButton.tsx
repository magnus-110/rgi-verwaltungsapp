import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  submissionId: string;
  field: string;
  value?: any;
  applied: boolean;
  label?: string;
  appliedLabel?: string;
  size?: "sm" | "default";
  buildingId: string;
}

export const ApplyFieldButton = ({
  submissionId,
  field,
  value,
  applied: appliedProp,
  label = "Übernehmen",
  appliedLabel = "Übernommen",
  size = "sm",
  buildingId,
}: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [appliedLocal, setAppliedLocal] = useState(false);
  const applied = appliedProp || appliedLocal;

  const handleClick = async () => {
    if (applied || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboarding-apply-field", {
        body: { submission_id: submissionId, field, value },
      });
      if (error) throw error;
      const r = data as any;
      if (r?.error) throw new Error(r.error);
      setAppliedLocal(true);
      toast({ title: "Übernommen", description: label });
      qc.invalidateQueries({ queryKey: ["onb-overview-submissions", buildingId] });
      qc.invalidateQueries({ queryKey: ["onb-overview-providers", buildingId] });
      qc.invalidateQueries({ queryKey: ["onb-overview-assignments", buildingId] });
      qc.invalidateQueries({ queryKey: ["onb-overview-assessments", buildingId] });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Unbekannter Fehler", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={applied ? "default" : "outline"}
      onClick={handleClick}
      disabled={applied || busy}
      className={cn(
        "h-7 px-2 text-xs gap-1",
        applied && "bg-success text-success-foreground hover:bg-success/90 cursor-default"
      )}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : applied ? (
        <Check className="h-3 w-3" />
      ) : (
        <Plus className="h-3 w-3" />
      )}
      {applied ? appliedLabel : label}
    </Button>
  );
};
