import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Bot, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  buildingId: string;
  initialValue?: string | null;
}

export function BookingInstructionsSection({ buildingId, initialValue }: Props) {
  const [value, setValue] = useState(initialValue || "");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setValue(initialValue || "");
    setHasChanges(false);
  }, [initialValue]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("buildings")
      .update({ booking_instructions: value || null } as any)
      .eq("id", buildingId);
    setSaving(false);
    if (error) {
      toast.error("Fehler beim Speichern");
    } else {
      toast.success("Buchungshinweise gespeichert");
      setHasChanges(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">KI-Buchungshinweise</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && !collapsed && (
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? "Speichern..." : "Speichern"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "Aufklappen" : "Einklappen"}
            >
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {!collapsed && (
          <p className="text-xs text-muted-foreground">
            Liegenschaftsspezifische Hinweise für die KI-Buchung. Diese fließen direkt in die KI-gestützte Kontenzuordnung ein und haben höchste Priorität.
          </p>
        )}
      </CardHeader>
      {!collapsed && (
        <CardContent>
          <Textarea
            placeholder={`Beispiele:\n• Stadtwerke Augsburg immer auf Konto 4100 buchen\n• Abschläge Gas auf Vorauszahlungskonto 1590\n• Hausmeister Müller ist §35a relevant\n• Versicherung Allianz: Konto 4120, kein Vorsteuerabzug`}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setHasChanges(true);
            }}
            className="min-h-[120px] text-sm"
          />
        </CardContent>
      )}
    </Card>
  );
}
