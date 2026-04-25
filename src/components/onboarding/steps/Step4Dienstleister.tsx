import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Wrench, Flame, Sparkles, Snowflake, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BigChoiceCard } from "../BigChoiceCard";

interface SuggestedContact {
  id: string;
  name: string;
  category: string;
  source: "global" | "neighbor";
  count?: number;
}

export interface Step4Data {
  selections?: Record<string, string[]>; // category -> contact IDs / names
  custom?: { category: string; name: string; phone?: string }[];
  notes?: string;
}

interface Props {
  buildingId: string;
  value: Step4Data;
  onChange: (next: Step4Data) => void;
}

const CATEGORIES = [
  { id: "hausmeister", label: "Hausmeister", icon: Users },
  { id: "heizung", label: "Heizung & Sanitär", icon: Flame },
  { id: "reinigung", label: "Reinigung", icon: Sparkles },
  { id: "winterdienst", label: "Winterdienst", icon: Snowflake },
] as const;

export const Step4Dienstleister = ({ buildingId, value, onChange }: Props) => {
  const [suggestions, setSuggestions] = useState<Record<string, SuggestedContact[]>>({});
  const [activeCategory, setActiveCategory] = useState<string>("hausmeister");
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPhone, setCustomPhone] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, contact_persons(first_name, last_name), company_name, onboarding_category")
        .eq("suggest_in_onboarding", true);
      const grouped: Record<string, SuggestedContact[]> = {};
      (data ?? []).forEach((c: any) => {
        const cat = c.onboarding_category || "sonstige";
        const person = c.contact_persons?.[0];
        const name =
          c.company_name ||
          [person?.first_name, person?.last_name].filter(Boolean).join(" ") ||
          "Unbekannt";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({ id: c.id, name, category: cat, source: "global" });
      });
      setSuggestions(grouped);
    };
    load();
  }, [buildingId]);

  const set = (patch: Partial<Step4Data>) => onChange({ ...value, ...patch });
  const toggle = (category: string, id: string) => {
    const current = value.selections?.[category] ?? [];
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    set({ selections: { ...(value.selections ?? {}), [category]: next } });
  };

  const addCustom = () => {
    if (!customName.trim()) return;
    set({
      custom: [
        ...(value.custom ?? []),
        { category: activeCategory, name: customName.trim(), phone: customPhone.trim() },
      ],
    });
    setCustomName("");
    setCustomPhone("");
    setShowCustom(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Bewährte Dienstleister</h3>
        <p className="text-sm text-muted-foreground">
          Welche Handwerker und Dienstleister haben sich bewährt?
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const count = value.selections?.[cat.id]?.length ?? 0;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-full border-2 text-sm whitespace-nowrap transition ${
                activeCategory === cat.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {cat.label}
              {count > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-primary-foreground px-1.5 text-xs">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {(suggestions[activeCategory] ?? []).length === 0 && (
          <Card className="p-4 text-sm text-muted-foreground text-center">
            Noch keine Vorschläge in dieser Kategorie.
          </Card>
        )}
        {(suggestions[activeCategory] ?? []).map((s) => (
          <BigChoiceCard
            key={s.id}
            icon={Wrench}
            title={s.name}
            selected={value.selections?.[activeCategory]?.includes(s.id) ?? false}
            onClick={() => toggle(activeCategory, s.id)}
          />
        ))}

        {(value.custom ?? [])
          .filter((c) => c.category === activeCategory)
          .map((c, idx) => (
            <Card key={idx} className="p-3 text-sm flex items-center gap-2 bg-muted/30">
              <Plus className="h-4 w-4 text-primary" />
              <span className="font-medium">{c.name}</span>
              {c.phone && <span className="text-muted-foreground">· {c.phone}</span>}
            </Card>
          ))}

        {!showCustom ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setShowCustom(true)}
          >
            <Plus className="h-4 w-4 mr-2" /> Eigenen Dienstleister hinzufügen
          </Button>
        ) : (
          <Card className="p-3 space-y-2">
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Name / Firma"
            />
            <Input
              value={customPhone}
              onChange={(e) => setCustomPhone(e.target.value)}
              placeholder="Telefon (optional)"
              inputMode="tel"
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCustom(false)} className="flex-1">
                Abbrechen
              </Button>
              <Button type="button" onClick={addCustom} className="flex-1">
                Hinzufügen
              </Button>
            </div>
          </Card>
        )}
      </div>

      <div>
        <Label htmlFor="notes">Besonderheiten</Label>
        <Textarea
          id="notes"
          rows={2}
          value={value.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
    </div>
  );
};
