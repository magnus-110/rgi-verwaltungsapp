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
  /** selections per category — same contact can be selected in multiple categories independently */
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
  const [allProviders, setAllProviders] = useState<SuggestedContact[]>([]);
  const [activeCat, setActiveCat] = useState<string>(SERVICE_PROVIDER_CATEGORIES[0]?.id ?? "sonstige");
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addTrade, setAddTrade] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.rpc("get_service_provider_pool" as any);
      if (error) {
        console.error("Failed to load service provider pool", error);
        return;
      }
      const list: SuggestedContact[] = (data ?? []).flatMap((c: any) => {
        const cats: string[] = c.categories?.length ? c.categories : ["sonstige"];
        return cats.map((cat) => ({ id: c.id, name: c.name, category: cat }));
      });
      setAllProviders(list);
    };
    load();
  }, [buildingId]);

  const set = (patch: Partial<Step4Data>) => onChange({ ...value, ...patch });

  /** Toggle is per-category — contact selected for "winterdienst" is independent from "hausmeister". */
  const toggle = (id: string, category: string) => {
    const current = value.selections?.[category] ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    set({ selections: { ...(value.selections ?? {}), [category]: next } });
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

  const items = allProviders.filter((p) => p.category === activeCat);
  const customItems = (value.custom ?? []).filter((c) => c.category === activeCat);

  const isSelectedInCat = (id: string) =>
    (value.selections?.[activeCat] ?? []).includes(id);

  const countForCat = (catId: string) => value.selections?.[catId]?.length ?? 0;

  return (
    <div className="space-y-3">
      {/* Filter chips — per category only */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
        {SERVICE_PROVIDER_CATEGORIES.map((cat) => {
          const active = activeCat === cat.id;
          const count = countForCat(cat.id);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setActiveCat(cat.id);
                setShowAdd(false);
              }}
              className={cn(
                "px-3 py-1.5 rounded-full border-[1.5px] text-[13px] whitespace-nowrap transition shrink-0 inline-flex items-center gap-1.5",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/60 text-muted-foreground bg-card hover:border-border"
              )}
            >
              <span>{cat.label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "inline-flex h-[18px] min-w-[18px] px-1 items-center justify-center rounded-full text-[10px] font-semibold",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-success/15 text-success"
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
          <div className="rounded-[14px] border border-dashed border-border/60 p-6 text-center text-[13px] text-muted-foreground">
            Noch keine Vorschläge in dieser Kategorie.
            <div className="text-[11px] mt-1 opacity-70">
              Sie können unten einen eigenen Dienstleister hinzufügen.
            </div>
          </div>
        )}

        {items.map((s) => {
          const sel = isSelectedInCat(s.id);
          return (
            <button
              key={`${s.id}-${activeCat}`}
              type="button"
              onClick={() => toggle(s.id, activeCat)}
              className={cn(
                "w-full rounded-[14px] border-[1.5px] p-3.5 flex items-center gap-3 text-left transition group",
                sel
                  ? "border-success bg-success/8 shadow-[0_1px_0_hsl(var(--success)/0.12)]"
                  : "border-border/60 bg-card hover:border-border hover:bg-muted/30"
              )}
            >
              <span
                className={cn(
                  "size-10 rounded-full grid place-items-center font-display text-[14px] shrink-0 transition",
                  sel
                    ? "bg-success/15 text-success"
                    : "bg-muted text-muted-foreground group-hover:bg-muted/80"
                )}
              >
                {sel ? <Check className="size-5" strokeWidth={2.5} /> : initials(s.name)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold leading-tight truncate text-foreground">
                  {s.name}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {sel ? "Ausgewählt für diese Kategorie" : "Tippen zum Auswählen"}
                </div>
              </div>
              <span
                className={cn(
                  "size-[22px] rounded-full border-[1.5px] grid place-items-center shrink-0 transition",
                  sel ? "border-success/50 bg-success/15" : "border-border bg-card"
                )}
              >
                {sel && <Check className="size-3 text-success" strokeWidth={3} />}
              </span>
            </button>
          );
        })}

        {customItems.map((c, idx) => (
          <div
            key={`custom-${idx}`}
            className="rounded-[14px] border-[1.5px] border-success/40 bg-success/5 p-3.5 flex items-center gap-3"
          >
            <span className="size-10 rounded-full bg-success/15 text-success grid place-items-center font-display text-[14px] shrink-0">
              {initials(c.name)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold leading-tight truncate">{c.name}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {c.trade || "Eigener Eintrag"}
              </div>
            </div>
          </div>
        ))}

        {/* Add card */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className={cn(
              "w-full border-[1.5px] border-dashed border-border/70 p-3.5 flex items-center gap-3 text-left transition",
              showAdd ? "rounded-t-[14px] border-b-0" : "rounded-[14px] hover:bg-muted/30"
            )}
          >
            <span className="size-10 rounded-full border-[1.5px] border-dashed border-border bg-muted/40 grid place-items-center text-muted-foreground shrink-0">
              <Plus className="size-5" />
            </span>
            <div className="flex-1">
              <div className="text-[14px] font-semibold leading-tight">
                Weiteren Dienstleister hinzufügen
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Nicht in der Liste? Frei eintragen.
              </div>
            </div>
          </button>
          {showAdd && (
            <div className="rounded-b-[14px] border-[1.5px] border-t-0 border-border/70 p-3 space-y-3 bg-card">
              <div>
                <div className="text-[12px] text-muted-foreground mb-1">Name / Firma</div>
                <EmbeddedInput
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="z. B. Müller Sanitär GmbH"
                />
              </div>
              <div>
                <div className="text-[12px] text-muted-foreground mb-1">Gewerk / Bemerkung (optional)</div>
                <EmbeddedInput
                  value={addTrade}
                  onChange={(e) => setAddTrade(e.target.value)}
                  placeholder="z. B. Heizung, Notdienst"
                />
              </div>
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
