import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Info, Save, Loader2, Flame, MapPin, StickyNote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  buildingId: string;
}

export const BuildingGeneralInfoCard = ({ buildingId }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: building } = useQuery({
    queryKey: ["building-general-info", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("etv_default_location, heating_type, general_notes")
        .eq("id", buildingId)
        .single();
      if (error) throw error;
      return data as { etv_default_location: string | null; heating_type: string | null; general_notes: string | null };
    },
  });

  const [etv, setEtv] = useState("");
  const [heating, setHeating] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (building) {
      setEtv(building.etv_default_location || "");
      setHeating(building.heating_type || "");
      setNotes(building.general_notes || "");
    }
  }, [building]);

  const isDirty =
    (building?.etv_default_location || "") !== etv ||
    (building?.heating_type || "") !== heating ||
    (building?.general_notes || "") !== notes;

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("buildings")
      .update({
        etv_default_location: etv || null,
        heating_type: heating || null,
        general_notes: notes || null,
      })
      .eq("id", buildingId);
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Gespeichert" });
    qc.invalidateQueries({ queryKey: ["building-general-info", buildingId] });
    qc.invalidateQueries({ queryKey: ["building-detail", buildingId] });
  };

  return (
    <Card>
      <CardHeader className="p-3 md:p-4 pb-2">
        <CardTitle className="text-sm md:text-base flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          Allgemeine Infos
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 md:p-4 pt-1 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1.5">
            <MapPin className="h-3 w-3" /> ETV-Ort (Standard)
          </Label>
          <Input
            value={etv}
            onChange={(e) => setEtv(e.target.value)}
            placeholder="z. B. Hotel Krone, Musterstraße 1"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1.5">
            <Flame className="h-3 w-3" /> Heizungsart
          </Label>
          <Input
            value={heating}
            onChange={(e) => setHeating(e.target.value)}
            placeholder="z. B. Gas, Fernwärme"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1.5">
            <StickyNote className="h-3 w-3" /> Notizen
          </Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Allgemeine Notizen zum Gebäude…"
            rows={3}
            className="text-sm"
          />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={!isDirty || saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Speichern
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
