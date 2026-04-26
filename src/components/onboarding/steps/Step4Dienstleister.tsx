import { useEffect, useState } from "react";
import { Plus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "../ui/SectionCard";
import { EmbeddedInput } from "../ui/InlineField";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_PROVIDER_CATEGORIES } from "@/lib/serviceProviderCategories";
import { cn } from "@/lib/utils";

interface SuggestedContact {
  id: string;
  name: string;
  category: string;
}

export interface Step4Data {
  selections?: Record<string, string[]>;
  custom?: { category: string; name: string; trade?: string }[];
  notes?: string;
}

interface Props {
  buildingId: string;
  value: Step4Data;
  onChange: (next: Step4Data) => void;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("") || "?";

export const Step4Dienstleister = ({ buildingId, value, onChange }: Props) => {
  const [suggestions, setSuggestions] = useState<Record<string, SuggestedContact[]>>({});
  const [activeCat, setActiveCat] = useState<string>(SERVICE_PROVIDER_CATEGORIES[0].id);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addTrade, setAddTrade] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, contact_persons(first_name, last_name), company_name, service_provider_categories")
        .eq("is_service_provider_pool", true);
      const grouped: Record<string, SuggestedContact[]> = {};
      (data ?? []).forEach((c: any) => {
        const cats: string[] = c.service_provider_categories ?? [];
        const person = c.contact_persons?.[0];
        const name =
          c.company_name ||
          [person?.first_name, person?.last_name].filter(Boolean).join(" ") ||
          "Unbekannt";
        const targetCats = cats.length ? cats : ["sonstige"];
        targetCats.forEach((cat) => {
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push({ id: c.id, name, category: cat });
        });
      });
      setSuggestions(grouped);
    };
    load();
  }, [buildingId]);

  const set = (patch: Partial<Step4Data>) => onChange({ ...value, ...patch });
  const toggle = (id: string) => {
    const current = value.selections?.[activeCat] ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    set({ selections: { ...(value.selections ?? {}), [activeCat]: next } });
  };

  const addCustom = () => {
    if (!addName.trim()) return;
    set({
      custom: [
        ...(value.custom ?? []),
        { category: activeCat, name: addName.trim(), trade: addTrade.trim() },
      ],
    });
    setAddName("");
    setAddTrade("");
    setShowAdd(false);
  };

  const items = suggestions[activeCat] ?? [];
  const customItems = (value.custom ?? []).filter((c) => c.category === activeCat);
  const selected = value.selections?.[activeCat] ?? [];

  return (
    <div className="space-y-2.5">
      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
        {SERVICE_PROVIDER_CATEGORIES.map((cat) => {
          const active = activeCat === cat.id;
          const count = value.selections?.[cat.id]?.length ?? 0;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setActiveCat(cat.id);
                setShowAdd(false);
              }}
              className={cn(
                "px-3 py-1.5 rounded-full border-[1.5px] text-[13px] whitespace-nowrap transition shrink-0",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/60 text-muted-foreground bg-card hover:border-border"
              )}
            >
              {cat.label}
              {count > 0 && (
                <span
                  className={cn(
                    "ml-1.5 inline-flex h-4 min-w-4 px-1 items-center justify-center rounded-full text-[10px]",
                    active ? "bg-white/25" : "bg-primary/15 text-primary"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Provider list */}
      <div className="space-y-2">
        {items.length === 0 && customItems.length === 0 && (
          <div className="rounded-[14px] border border-dashed border-border/60 p-5 text-center text-[13px] text-muted-foreground">
            Noch keine Vorschläge in dieser Kategorie.
          </div>
        )}

        {items.map((s) => {
          const sel = selected.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className={cn(
                "w-full rounded-[14px] border-[1.5px] p-3.5 flex items-center gap-3 text-left transition",
                sel ? "border-primary bg-accent" : "border-border/60 bg-card hover:border-border"
              )}
            >
              <span
                className={cn(
                  "size-10 rounded-[10px] grid place-items-center font-display text-[14px] shrink-0 transition",
                  sel ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {sel ? <Check className="size-5" strokeWidth={3} /> : initials(s.name)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold leading-tight truncate">{s.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {SERVICE_PROVIDER_CATEGORIES.find((c) => c.id === s.category)?.label ?? s.category}
                </div>
              </div>
              <span
                className={cn(
                  "size-[22px] rounded-full border-[1.5px] grid place-items-center shrink-0",
                  sel ? "border-primary bg-primary" : "border-border bg-card"
                )}
              >
                {sel && <Check className="size-3 text-white" strokeWidth={3} />}
              </span>
            </button>
          );
        })}

        {customItems.map((c, idx) => (
          <div
            key={`custom-${idx}`}
            className="rounded-[14px] border-[1.5px] border-primary/40 bg-accent/40 p-3.5 flex items-center gap-3"
          >
            <span className="size-10 rounded-[10px] bg-primary/15 text-primary grid place-items-center font-display text-[14px] shrink-0">
              {initials(c.name)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold leading-tight truncate">{c.name}</div>
              {c.trade && <div className="text-[11px] text-muted-foreground mt-0.5">{c.trade}</div>}
            </div>
          </div>
        ))}

        {/* Add card */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className={cn(
              "w-full border-[1.5px] border-dashed border-primary/40 p-3.5 flex items-center gap-3 text-left transition",
              showAdd ? "rounded-t-[14px] border-b-0" : "rounded-[14px] hover:bg-accent/30"
            )}
          >
            <span className="size-10 rounded-[10px] border-[1.5px] border-dashed border-primary/40 bg-accent grid place-items-center text-primary shrink-0">
              <Plus className="size-5" />
            </span>
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-primary leading-tight">
                Weiteren Dienstleister hinzufügen
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Nicht in der Liste? Frei eintragen.
              </div>
            </div>
          </button>
          {showAdd && (
            <div className="rounded-b-[14px] border-[1.5px] border-t-0 border-primary/40 p-3 space-y-2 bg-card">
              <EmbeddedInput
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Name / Firma"
              />
              <EmbeddedInput
                value={addTrade}
                onChange={(e) => setAddTrade(e.target.value)}
                placeholder="Gewerk / Bemerkung (optional)"
              />
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowAdd(false);
                    setAddName("");
                    setAddTrade("");
                  }}
                >
                  Abbrechen
                </Button>
                <Button type="button" className="flex-1" onClick={addCustom}>
                  Hinzufügen
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <SectionCard label="BESONDERHEITEN (OPTIONAL)">
        <div className="p-3">
          <Textarea
            rows={2}
            value={value.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Anmerkungen zu Dienstleistern…"
            className="border-0 bg-transparent focus-visible:ring-0 resize-none px-1"
          />
        </div>
      </SectionCard>
    </div>
  );
};
