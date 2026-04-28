import { useRef, type ReactNode } from "react";
import { SectionCard } from "../ui/SectionCard";
import { EmbeddedInput } from "../ui/InlineField";
import { cn } from "@/lib/utils";
import {
  UNIT_KIND_OPTIONS,
  UNIT_KIND_LABELS,
  type UnitKind,
  type BillingMode,
} from "@/lib/secondaryUnits";

/** Pill-Button im Stil der Kassenprüfung/Beirat-Auswahl */
const PillChoice = <T extends string | boolean>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { v: T; label: string }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  columns?: 2 | 3;
}) => (
  <div className={cn("grid gap-2.5", columns === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
    {options.map(({ v, label }) => {
      const sel = value === v;
      return (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "h-12 rounded-[10px] border px-3 flex items-center gap-2.5 text-[13.5px] font-medium transition",
            sel
              ? "border-primary bg-primary/[0.06] text-primary"
              : "border-border/60 bg-card text-foreground hover:bg-accent/40"
          )}
        >
          <span
            className={cn(
              "size-[18px] shrink-0 rounded-full border-[1.5px] grid place-items-center transition",
              sel ? "border-primary" : "border-muted-foreground/40"
            )}
          >
            {sel && <span className="size-[9px] rounded-full bg-primary" />}
          </span>
          <span className="truncate">{label}</span>
        </button>
      );
    })}
  </div>
);

export interface SecondaryUnitDraft {
  unit_kind: UnitKind;
  unit_number?: string;
  mea_share?: string;
  billing_mode: BillingMode;
  monthly_fee?: string;
}

export interface Step2Data {
  unit_number?: string;
  unit_description?: string;
  monthly_fee?: string;
  mea_share?: string;
  square_meters?: string;
  secondary_units?: SecondaryUnitDraft[];
  // UI-only Wizard-State
  has_secondary_units?: boolean | null;
  secondary_units_have_own_billing?: boolean | null;
}

interface Props {
  value: Step2Data;
  onChange: (next: Step2Data) => void;
}

const FieldLabel = ({ children }: { children: ReactNode }) => (
  <div className="text-[12px] text-muted-foreground mb-1">{children}</div>
);

const makeUnit = (kind: UnitKind): SecondaryUnitDraft => ({
  unit_kind: kind,
  unit_number: "",
  mea_share: "",
  billing_mode: "own_billing",
  monthly_fee: "",
});

export const Step2Wohnungsdaten = ({ value, onChange }: Props) => {
  const set = (patch: Partial<Step2Data>) => onChange({ ...value, ...patch });
  const secondaryUnits = value.secondary_units ?? [];
  const selectedKinds = new Set<UnitKind>(secondaryUnits.map((u) => u.unit_kind));

  const kindRef = useRef<HTMLDivElement>(null);
  const billingRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLElement>) => {
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleHasSecondaryUnits = (v: boolean) => {
    if (v) {
      set({ has_secondary_units: true });
      scrollTo(kindRef);
    } else {
      set({
        has_secondary_units: false,
        secondary_units: [],
        secondary_units_have_own_billing: null,
      });
    }
  };

  const toggleKind = (kind: UnitKind) => {
    if (selectedKinds.has(kind)) {
      set({ secondary_units: secondaryUnits.filter((u) => u.unit_kind !== kind) });
    } else {
      set({ secondary_units: [...secondaryUnits, makeUnit(kind)] });
      if (secondaryUnits.length === 0) scrollTo(billingRef);
    }
  };

  const handleOwnBilling = (v: boolean) => {
    if (v) {
      set({ secondary_units_have_own_billing: true });
      scrollTo(detailsRef);
    } else {
      // Bei "Nein" Hausgeld/MEA leeren
      set({
        secondary_units_have_own_billing: false,
        secondary_units: secondaryUnits.map((u) => ({
          ...u,
          mea_share: "",
          monthly_fee: "",
        })),
      });
    }
  };

  const updateUnit = (kind: UnitKind, patch: Partial<SecondaryUnitDraft>) => {
    set({
      secondary_units: secondaryUnits.map((u) =>
        u.unit_kind === kind ? { ...u, ...patch } : u
      ),
    });
  };

  const kindOptions = UNIT_KIND_OPTIONS.filter((o) => o.value !== "apartment");

  return (
    <div className="space-y-2.5">
      <SectionCard label="WOHNUNG">
        <div className="px-4 py-3">
          <div className="grid gap-2" style={{ gridTemplateColumns: "110px 1fr" }}>
            <div>
              <FieldLabel>Nr.</FieldLabel>
              <EmbeddedInput
                value={value.unit_number ?? ""}
                onChange={(e) => set({ unit_number: e.target.value })}
                placeholder="0001"
              />
            </div>
            <div>
              <FieldLabel>Beschreibung</FieldLabel>
              <EmbeddedInput
                value={value.unit_description ?? ""}
                onChange={(e) => set({ unit_description: e.target.value })}
                placeholder="EG rechts"
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard label="FINANZIELLE ECKDATEN">
        <div className="px-4 py-3 space-y-3">
          <div>
            <FieldLabel>Hausgeld (€/Monat)</FieldLabel>
            <EmbeddedInput
              value={value.monthly_fee ?? ""}
              onChange={(e) => set({ monthly_fee: e.target.value })}
              inputMode="decimal"
              placeholder="z. B. 350,00"
            />
          </div>
          <div>
            <FieldLabel>Miteigentumsanteile</FieldLabel>
            <EmbeddedInput
              value={value.mea_share ?? ""}
              onChange={(e) => set({ mea_share: e.target.value })}
              inputMode="decimal"
              placeholder="z. B. 125,5"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard label="WOHNFLÄCHE">
        <div className="px-4 py-3">
          <FieldLabel>Größe (m²)</FieldLabel>
          <EmbeddedInput
            value={value.square_meters ?? ""}
            onChange={(e) => set({ square_meters: e.target.value })}
            inputMode="decimal"
            placeholder="z. B. 78,50"
          />
        </div>
      </SectionCard>

      <SectionCard label="WEITERE EINHEITEN">
        <div className="px-4 py-3 space-y-3">
          <div className="text-[13px] font-medium text-foreground">
            Haben Sie zusätzliche Einheiten, die zu Ihrer Wohnung gehören
            (z. B. Tiefgaragen-Stellplatz, Außenstellplatz, Keller, …)?
          </div>
          <PillChoice<boolean>
            options={[
              { v: true, label: "Ja" },
              { v: false, label: "Nein" },
            ]}
            value={value.has_secondary_units ?? null}
            onChange={handleHasSecondaryUnits}
          />
        </div>
      </SectionCard>

      {value.has_secondary_units === true && (
        <div ref={kindRef} className="scroll-mt-4">
          <SectionCard label="ART DER EINHEIT">
            <div className="px-4 py-3 space-y-3">
              <div className="text-[13px] font-medium text-foreground">
                Um was handelt es sich? (Mehrfachauswahl möglich)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {kindOptions.map((opt) => {
                  const sel = selectedKinds.has(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleKind(opt.value)}
                      className={cn(
                        "h-12 rounded-[10px] border px-3 flex items-center gap-2.5 text-[13.5px] font-medium transition",
                        sel
                          ? "border-primary bg-primary/[0.06] text-primary"
                          : "border-border/60 bg-card text-foreground hover:bg-accent/40"
                      )}
                    >
                      <span
                        className={cn(
                          "size-[18px] shrink-0 rounded-full border-[1.5px] grid place-items-center transition",
                          sel ? "border-primary" : "border-muted-foreground/40"
                        )}
                      >
                        {sel && <span className="size-[9px] rounded-full bg-primary" />}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {value.has_secondary_units === true && secondaryUnits.length > 0 && (
        <div ref={billingRef} className="scroll-mt-4">
          <SectionCard label="ABRECHNUNG">
            <div className="px-4 py-3 space-y-3">
              <div className="text-[13px] font-medium text-foreground">
                Gibt es hierfür eine eigene Abrechnung?
              </div>
              <PillChoice<boolean>
                options={[
                  { v: true, label: "Ja" },
                  { v: false, label: "Nein" },
                ]}
                value={value.secondary_units_have_own_billing ?? null}
                onChange={handleOwnBilling}
              />
            </div>
          </SectionCard>
        </div>
      )}

      {value.has_secondary_units === true &&
        secondaryUnits.length > 0 &&
        value.secondary_units_have_own_billing === true && (
          <div ref={detailsRef} className="scroll-mt-4">
          <SectionCard label="DETAILS JE EINHEIT">
            <div className="px-4 py-3 space-y-4">
              {secondaryUnits.map((u) => (
                <div key={u.unit_kind} className="space-y-2.5">
                  <div className="text-[13px] font-semibold text-foreground">
                    {UNIT_KIND_LABELS[u.unit_kind]}
                  </div>
                  <div>
                    <FieldLabel>Nr./Bez. (optional)</FieldLabel>
                    <EmbeddedInput
                      value={u.unit_number ?? ""}
                      onChange={(e) =>
                        updateUnit(u.unit_kind, { unit_number: e.target.value })
                      }
                      placeholder="z. B. TG-04"
                    />
                  </div>
                  <div>
                    <FieldLabel>Hausgeld (€/Monat)</FieldLabel>
                    <EmbeddedInput
                      value={u.monthly_fee ?? ""}
                      onChange={(e) =>
                        updateUnit(u.unit_kind, { monthly_fee: e.target.value })
                      }
                      inputMode="decimal"
                      placeholder="z. B. 25,00"
                    />
                  </div>
                  <div>
                    <FieldLabel>Miteigentumsanteile</FieldLabel>
                    <EmbeddedInput
                      value={u.mea_share ?? ""}
                      onChange={(e) =>
                        updateUnit(u.unit_kind, { mea_share: e.target.value })
                      }
                      inputMode="decimal"
                      placeholder="z. B. 5"
                    />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
          </div>
        )}
    </div>
  );
};
