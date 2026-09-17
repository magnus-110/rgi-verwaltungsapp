import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SERVICE_PROVIDER_CATEGORIES,
  SERVICE_PROVIDER_GROUPS,
  type ServiceProviderGroup,
} from "@/lib/serviceProviderCategories";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
}

/** Gewerke-Auswahl für Dienstleister – wird im Neuanlage-Dialog und in der Adressakte genutzt. */
export function ServiceProviderCategoryPicker({ value, onChange, label = "Gewerke (Mehrfachauswahl)" }: Props) {
  const [catSearch, setCatSearch] = useState("");

  const grouped = (() => {
    const term = catSearch.trim().toLowerCase();
    const out: Record<ServiceProviderGroup, typeof SERVICE_PROVIDER_CATEGORIES> = {} as any;
    SERVICE_PROVIDER_CATEGORIES.forEach((c) => {
      if (term && !c.label.toLowerCase().includes(term)) return;
      (out[c.group] ||= []).push(c);
    });
    return out;
  })();

  const toggleCat = (id: string) => {
    onChange(value.includes(id) ? value.filter((c) => c !== id) : [...value, id]);
  };

  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        placeholder="Gewerk suchen…"
        value={catSearch}
        onChange={(e) => setCatSearch(e.target.value)}
        className="h-8 text-xs mt-1 mb-2"
      />
      <div className="space-y-2">
        {(Object.keys(SERVICE_PROVIDER_GROUPS) as ServiceProviderGroup[]).map((g) => {
          const items = grouped[g];
          if (!items || items.length === 0) return null;
          return (
            <div key={g}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                {SERVICE_PROVIDER_GROUPS[g]}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((cat) => {
                  const selected = value.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCat(cat.id)}
                      className={`px-2.5 py-1 rounded-full border text-xs transition ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
