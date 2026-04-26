import { useEffect, useRef } from "react";
import { SectionCard } from "../ui/SectionCard";
import { EmbeddedInput } from "../ui/InlineField";
import { MultiEntryList } from "../ui/MultiEntryList";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Info } from "lucide-react";

export type PhoneType = "private" | "mobile" | "business";
export interface PhoneEntry { number: string; type?: PhoneType; note?: string }
export interface EmailEntry { address: string }

export interface OtherContactInfo {
  name?: string;
  street?: string;
  zip?: string;
  city?: string;
  phone?: string;
  email?: string;
  relation?: string;
}

export interface Step1Data {
  street?: string;
  zip?: string;
  city?: string;
  phones?: PhoneEntry[];
  emails?: EmailEntry[];
  iban?: string;
  contact_self?: boolean;
  contact_other_name?: string;
  contact_other?: OtherContactInfo;
  expectations?: string;
  // legacy
  phone?: string;
  phone_type?: PhoneType;
  email?: string;
}

interface Props {
  value: Step1Data;
  onChange: (next: Step1Data) => void;
  buildingId?: string;
}

export const Step1Stammdaten = ({ value, onChange, buildingId }: Props) => {
  const set = (patch: Partial<Step1Data>) => onChange({ ...value, ...patch });
  const prefilledRef = useRef(false);
  const hasOverridesRef = useRef(false);

  useEffect(() => {
    if (!buildingId || prefilledRef.current) return;
    // Skip prefill if user has already typed something
    const hasUserInput =
      value.street || value.zip || value.city ||
      (value.phones && value.phones.length > 0) ||
      (value.emails && value.emails.length > 0) ||
      value.iban || value.contact_self !== undefined;
    if (hasUserInput) {
      prefilledRef.current = true;
      return;
    }
    prefilledRef.current = true;
    supabase.functions
      .invoke("prefill-onboarding-step1", { body: { building_id: buildingId } })
      .then(({ data }) => {
        if (data?.prefilled && data?.data) {
          hasOverridesRef.current = !!data.hasOverrides;
          onChange({ ...data.data, ...value });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId]);

  const phones: PhoneEntry[] =
    value.phones && value.phones.length > 0
      ? value.phones
      : value.phone
      ? [{ number: value.phone, note: "" }]
      : [];
  const emails: EmailEntry[] =
    value.emails && value.emails.length > 0
      ? value.emails
      : value.email
      ? [{ address: value.email }]
      : [];

  const other = value.contact_other ?? {};
  const setOther = (patch: Partial<OtherContactInfo>) =>
    set({ contact_other: { ...other, ...patch } });

  return (
    <div className="space-y-2.5">
      {hasOverridesRef.current && (
        <div className="flex gap-2 items-start rounded-[12px] bg-primary/5 border border-primary/20 px-3 py-2.5 text-[12px] text-foreground/80">
          <Info className="size-4 text-primary shrink-0 mt-0.5" />
          <span>
            Wir haben Ihre bisher hinterlegten Daten geladen. Änderungen gelten <b>nur für dieses Gebäude</b> und überschreiben nicht Ihr globales Profil.
          </span>
        </div>
      )}
      <SectionCard label="WOHNANSCHRIFT">
        <div className="px-4 py-3 space-y-2">
          <EmbeddedInput
            value={value.street ?? ""}
            onChange={(e) => set({ street: e.target.value })}
            placeholder="Straße & Hausnr. *"
          />
          <div className="grid grid-cols-[90px_1fr] gap-2">
            <EmbeddedInput
              value={value.zip ?? ""}
              onChange={(e) => set({ zip: e.target.value })}
              placeholder="PLZ *"
              inputMode="numeric"
            />
            <EmbeddedInput
              value={value.city ?? ""}
              onChange={(e) => set({ city: e.target.value })}
              placeholder="Ort *"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard label="TELEFON">
        <MultiEntryList
          items={phones}
          onChange={(next) => set({ phones: next, phone: next[0]?.number })}
          newItem={(): PhoneEntry => ({ number: "", note: "" })}
          addLabel="Weitere Nummer hinzufügen"
          renderItem={(item, update) => (
            <div className="space-y-2">
              <EmbeddedInput
                value={item.number}
                onChange={(e) => update({ number: e.target.value })}
                placeholder="Telefonnummer"
                inputMode="tel"
              />
              <EmbeddedInput
                value={item.note ?? ""}
                onChange={(e) => update({ note: e.target.value })}
                placeholder="Notiz (optional, z. B. mobil, tagsüber erreichbar)"
              />
            </div>
          )}
        />
      </SectionCard>

      <SectionCard label="E-MAIL">
        <MultiEntryList
          items={emails}
          onChange={(next) => set({ emails: next, email: next[0]?.address })}
          newItem={(): EmailEntry => ({ address: "" })}
          minItems={1}
          addLabel="Weitere E-Mail hinzufügen"
          renderItem={(item, update) => (
            <EmbeddedInput
              type="email"
              value={item.address}
              onChange={(e) => update({ address: e.target.value })}
              placeholder="ihre.email@beispiel.de"
            />
          )}
        />
        <div className="px-4 pb-2.5 -mt-1 text-[11px] text-muted-foreground/80">
          Empfohlen — wird für den Passwort-Reset benötigt
        </div>
      </SectionCard>

      <SectionCard label="BANKVERBINDUNG">
        <div className="px-4 py-3">
          <EmbeddedInput
            value={value.iban ?? ""}
            onChange={(e) => set({ iban: e.target.value.toUpperCase() })}
            placeholder="IBAN *  (DE00 0000 0000 0000 0000 00)"
            className="font-mono"
          />
        </div>
        <div className="px-4 pb-2.5 -mt-1 text-[11px] text-muted-foreground/80">
          Wird für die SEPA-Lastschrift Ihres Hausgeldes benötigt.
        </div>
      </SectionCard>

      <SectionCard label="HAUPTANSPRECHPARTNER">
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: true, label: "Ich selbst" },
              { v: false, label: "Andere Person" },
            ].map(({ v, label }) => {
              const sel = value.contact_self === v;
              return (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() =>
                    set({
                      contact_self: v,
                      ...(v ? { contact_other_name: "", contact_other: undefined } : {}),
                    })
                  }
                  className={cn(
                    "h-11 rounded-lg text-[13px] font-medium transition",
                    sel
                      ? "bg-primary text-primary-foreground"
                      : "bg-[hsl(var(--input))] text-foreground hover:bg-[hsl(35_25%_92%)]"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {value.contact_self === false && (
            <div className="space-y-2 pt-1">
              <EmbeddedInput
                value={other.name ?? value.contact_other_name ?? ""}
                onChange={(e) => {
                  setOther({ name: e.target.value });
                  set({ contact_other_name: e.target.value });
                }}
                placeholder="Vor- und Nachname *"
              />
              <EmbeddedInput
                value={other.relation ?? ""}
                onChange={(e) => setOther({ relation: e.target.value })}
                placeholder="Beziehung (z. B. Ehepartner, Sohn, Bevollmächtigte/r)"
              />
              <EmbeddedInput
                value={other.street ?? ""}
                onChange={(e) => setOther({ street: e.target.value })}
                placeholder="Straße & Hausnr."
              />
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <EmbeddedInput
                  value={other.zip ?? ""}
                  onChange={(e) => setOther({ zip: e.target.value })}
                  placeholder="PLZ"
                  inputMode="numeric"
                />
                <EmbeddedInput
                  value={other.city ?? ""}
                  onChange={(e) => setOther({ city: e.target.value })}
                  placeholder="Ort"
                />
              </div>
              <EmbeddedInput
                value={other.phone ?? ""}
                onChange={(e) => setOther({ phone: e.target.value })}
                placeholder="Telefon"
                inputMode="tel"
              />
              <EmbeddedInput
                type="email"
                value={other.email ?? ""}
                onChange={(e) => setOther({ email: e.target.value })}
                placeholder="E-Mail"
              />
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard label="WÜNSCHE & ERWARTUNGEN (OPTIONAL)">
        <div className="p-3">
          <Textarea
            rows={3}
            value={value.expectations ?? ""}
            onChange={(e) => set({ expectations: e.target.value })}
            placeholder="Was wünschen Sie sich für unsere Zusammenarbeit?"
            className="border-0 bg-[hsl(var(--input))] focus-visible:ring-0 focus-visible:bg-[hsl(35_25%_92%)] resize-none rounded-lg px-3 py-2.5 text-[14px]"
          />
        </div>
      </SectionCard>
    </div>
  );
};

export const validateStep1 = (d: Step1Data): string | null => {
  if (!d.street?.trim()) return "Bitte Straße angeben.";
  if (!d.zip?.trim() || d.zip.length < 4) return "Bitte PLZ angeben.";
  if (!d.city?.trim()) return "Bitte Ort angeben.";
  const phones = d.phones && d.phones.length > 0
    ? d.phones
    : d.phone ? [{ number: d.phone }] : [];
  if (phones.length === 0 || !phones[0].number?.trim())
    return "Bitte mindestens eine Telefonnummer angeben.";
  if (!d.iban?.trim() || d.iban.replace(/\s/g, "").length < 15)
    return "Bitte gültige IBAN angeben.";
  if (d.contact_self === undefined) return "Bitte Ansprechpartner wählen.";
  if (d.contact_self === false) {
    const name = d.contact_other?.name ?? d.contact_other_name;
    if (!name?.trim()) return "Bitte Name der Ansprechperson angeben.";
  }
  return null;
};
