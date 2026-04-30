import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Vote } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface EtvRelevancePopoverProps {
  email: {
    id: string;
    building_id: string | null;
    is_etv_relevant?: boolean | null;
    etv_meeting_id?: string | null;
  };
}

export const EtvRelevancePopover = ({ email }: EtvRelevancePopoverProps) => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const disabled = !email.building_id;
  const isMarked = !!email.is_etv_relevant;

  const { data: meetings = [] } = useQuery({
    queryKey: ["etv-meetings-for-building", email.building_id],
    queryFn: async () => {
      if (!email.building_id) return [];
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("id, title, meeting_date, status")
        .eq("building_id", email.building_id)
        .gte("meeting_date", today)
        .order("meeting_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!email.building_id && open,
  });

  const update = async (patch: { is_etv_relevant: boolean; etv_meeting_id: string | null }) => {
    const { error } = await supabase.from("emails").update(patch).eq("id", email.id);
    if (error) {
      toast.error("Fehler beim Speichern");
      return;
    }
    qc.invalidateQueries({ queryKey: ["emails"] });
    qc.invalidateQueries({ queryKey: ["etv-relevant-emails"] });
    toast.success(patch.is_etv_relevant ? "Als ETV-relevant markiert" : "ETV-Markierung entfernt");
  };

  const handleToggle = async (checked: boolean) => {
    await update({ is_etv_relevant: checked, etv_meeting_id: checked ? email.etv_meeting_id || null : null });
  };

  const handleMeetingChange = async (val: string) => {
    await update({ is_etv_relevant: true, etv_meeting_id: val === "general" ? null : val });
  };

  if (disabled) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 opacity-40 cursor-not-allowed"
        title="Erst eine Liegenschaft zuordnen"
        onClick={(e) => { e.preventDefault(); toast.info("Bitte zuerst eine Liegenschaft zuordnen"); }}
      >
        <Vote className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Relevant für Eigentümerversammlung"
        >
          <Vote className={cn("h-4 w-4", isMarked && "text-primary")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="etv-toggle" className="text-sm">
            Relevant für Eigentümerversammlung
          </Label>
          <Switch id="etv-toggle" checked={isMarked} onCheckedChange={handleToggle} />
        </div>

        {isMarked && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Konkrete Versammlung (optional)</Label>
            <Select value={email.etv_meeting_id || "general"} onValueChange={handleMeetingChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">Allgemein / nächste Versammlung</SelectItem>
                {meetings.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title} – {new Date(m.meeting_date).toLocaleDateString("de-DE")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
