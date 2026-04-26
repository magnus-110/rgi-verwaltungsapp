import { Phone, Smartphone, Briefcase } from "lucide-react";
import { SectionCard } from "../ui/SectionCard";
import { InlineField, InlineInput, EmbeddedInput } from "../ui/InlineField";
import { MultiEntryList } from "../ui/MultiEntryList";
import { ChoiceCardPair } from "../ui/ChoiceCardPair";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type PhoneType = "private" | "mobile" | "business";
export interface PhoneEntry { number: string; type: PhoneType; }
export interface EmailEntry { address: string; }

export interface Step1Data {
  street?: string;
  zip?: string;
  city?: string;
  phones?: PhoneEntry[];
  emails?: EmailEntry[];
  iban?: string;
  contact_self?: boolean;
  contact_other_name?: string;
  expectations?: string;
  // legacy single fields kept for backward read; new submissions use arrays
  phone?: string;
  phone_type?: PhoneType;
  email?: string;
}

interface Props {
  value: Step1Data;
  onChange: (next: Step1Data) => void;
}

const PHONE_TYPE_OPTS: { value: PhoneType; label: string; Icon: typeof Phone }[] = [
  { value: "mobile", label: "Mobil", Icon: Smartphone },
  { value: "private", label: "Festnetz", Icon: Phone },
  { value: "business", label: "Geschäftl.", Icon: Briefcase },
];

const PhoneTypeSelect = ({
  value,
  onChange,
}: {
  value: PhoneType;
  onChange: (v: PhoneType) => void;
}) => (
  <div className="flex gap-1">
    {PHONE_TYPE_OPTS.map(({ value: v, label, Icon }) => {
      const sel = value === v;
      return (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-label={label}
          className={cn(
            "size-7 rounded-md grid place-items-center transition border",
            sel
              ? "border-primary bg-accent text-primary"
              : "border-transparent text-muted-foreground hover:bg-muted"
          )}
          title={label}
        >
          <Icon className="size-3.5" />
        </button>
      );
    })}
  </div>
);

export const Step1Stammdaten = ({ value, onChange }: Props) => {
  const set = (patch: Partial<Step1Data>) => onChange({ ...value, ...patch });

  // Backward-compat: hydrate arrays from legacy single fields on first render
  const phones: PhoneEntry[] =
    value.phones && value.phones.length > 0
      ? value.phones
      : value.phone
      ? [{ number: value.phone, type: value.phone_type ?? "mobile" }]
      : [];
  const emails: EmailEntry[] =
    value.emails && value.emails.length > 0
      ? value.emails
      : value.email
      ? [{ address: value.email }]
      : [];

  return (
    <div className="space-y-2.5">
      <SectionCard label="WOHNANSCHRIFT">
        <InlineField label="Straße" required>
          <InlineInput
            value={value.street ?? ""}
            onChange={(e) => set({ street: e.target.value })}
            placeholder="Hauptstraße 12"
          />
        </InlineField>
        <div className="px-4 py-3">
          <div className="grid grid-cols-[90px_1fr] gap-2">
            <EmbeddedInput
              value={value.zip ?? ""}
              onChange={(e) => set({ zip: e.target.value })}
              placeholder="PLZ"
              inputMode="numeric"
            />
            <EmbeddedInput
              value={value.city ?? ""}
              onChange={(e) => set({ city: e.target.value })}
              placeholder="Ort"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard label="TELEFON">
        <MultiEntryList<PhoneEntry>
          items={phones}
          onChange={(next) => set({ phones: next, phone: next[0]?.number, phone_type: next[0]?.type })}
          newItem={() => ({ number: "", type: "mobile" })}
          addLabel="Weitere Nummer hinzufügen"
          renderItem={(item, update) => (
            <div className="flex items-center gap-2">
              <input
                value={item.number}
                onChange={(e) => update({ number: e.target.value })}
                placeholder="Telefonnummer"
                inputMode="tel"
                className="flex-1 bg-transparent border-0 outline-none text-[14px] placeholder:text-muted-foreground/60"
              />
              <PhoneTypeSelect value={item.type} onChange={(t) => update({ type: t })} />
            </div>
          )}
        />
      </SectionCard>

      <SectionCard label="E-MAIL">
        <MultiEntryList<EmailEntry>
          items={emails}
          onChange={(next) => set({ emails: next, email: next[0]?.address })}
          newItem={() => ({ address: "" })}
          minItems={0}
          addLabel="Weitere E-Mail hinzufügen"
          renderItem={(item, update) => (
            <input
              type="email"
              value={item.address}
              onChange={(e) => update({ address: e.target.value })}
              placeholder="ihre.email@beispiel.de"
              className="w-full bg-transparent border-0 outline-none text-[14px] placeholder:text-muted-foreground/60"
            />
          )}
        />
        <div className="px-4 pb-2.5 -mt-1 text-[11px] text-muted-foreground/80">
          Empfohlen — wird für den Passwort-Reset benötigt
        </div>
      </SectionCard>

      <SectionCard label="BANKVERBINDUNG">
        <InlineField label="IBAN" required>
          <InlineInput
            value={value.iban ?? ""}
            onChange={(e) => set({ iban: e.target.value.toUpperCase() })}
            placeholder="DE00 0000 0000 0000 0000 00"
            className="font-mono"
          />
        </InlineField>
        <div className="px-4 pb-2.5 -mt-1 text-[11px] text-muted-foreground/80">
          Wird für die SEPA-Lastschrift Ihres Hausgeldes benötigt.
        </div>
      </SectionCard>

      <SectionCard label="HAUPTANSPRECHPARTNER">
        <div className="p-3.5">
          <ChoiceCardPair<boolean>
            value={value.contact_self}
            onChange={(v) => set({ contact_self: v, ...(v ? { contact_other_name: "" } : {}) })}
            options={[
              { value: true, title: "Ich selbst", subtitle: "Sie erhalten alle Schreiben." },
              { value: false, title: "Andere Person", subtitle: "Z. B. Familienmitglied." },
            ]}
          />
          {value.contact_self === false && (
            <div className="mt-2.5">
              <EmbeddedInput
                value={value.contact_other_name ?? ""}
                onChange={(e) => set({ contact_other_name: e.target.value })}
                placeholder="Name der Ansprechperson"
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
            placeholder="Was ist Ihnen besonders wichtig?"
            className="border-0 bg-transparent focus-visible:ring-0 resize-none px-1"
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
    : d.phone ? [{ number: d.phone, type: d.phone_type ?? "mobile" as PhoneType }] : [];
  if (phones.length === 0 || !phones[0].number?.trim())
    return "Bitte mindestens eine Telefonnummer angeben.";
  if (!d.iban?.trim() || d.iban.replace(/\s/g, "").length < 15)
    return "Bitte gültige IBAN angeben.";
  if (d.contact_self === undefined) return "Bitte Ansprechpartner wählen.";
  if (d.contact_self === false && !d.contact_other_name?.trim())
    return "Bitte Name der Ansprechperson angeben.";
  return null;
};
