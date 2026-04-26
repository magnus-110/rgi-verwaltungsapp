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
  account_holder?: string;
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
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!buildingId || prefilledRef.current) return;
    const current = valueRef.current;
    const hasUserInput =
      current.street || current.zip || current.city ||
      (current.phones && current.phones.length > 0) ||
      (current.emails && current.emails.length > 0) ||
      current.iban || current.contact_self !== undefined;
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
          const latest = valueRef.current;
          const prefilled = { ...data.data };
          if (prefilled.iban) prefilled.iban = formatIban(prefilled.iban);
          onChange({ ...prefilled, ...latest });
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
        <div className="px-4 py-3 space-y-3">
          <Field label="Straße & Hausnr." required>
            <EmbeddedInput
              value={value.street ?? ""}
              onChange={(e) => set({ street: e.target.value })}
              placeholder="z. B. Musterstraße 12"
            />
          </Field>
          <div className="grid grid-cols-[90px_1fr] gap-2">
            <Field label="PLZ" required>
              <EmbeddedInput
                value={value.zip ?? ""}
                onChange={(e) => set({ zip: e.target.value })}
                placeholder="z. B. 80331"
                inputMode="numeric"
              />
            </Field>
            <Field label="Ort" required>
              <EmbeddedInput
                value={value.city ?? ""}
                onChange={(e) => set({ city: e.target.value })}
                placeholder="z. B. München"
              />
            </Field>
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
            <div className="space-y-3">
              <Field label="Telefonnummer">
                <EmbeddedInput
                  value={item.number}
                  onChange={(e) => update({ number: e.target.value })}
                  placeholder="z. B. +49 170 1234567"
                  inputMode="tel"
                />
              </Field>
              <Field label="Notiz (optional)">
                <EmbeddedInput
                  value={item.note ?? ""}
                  onChange={(e) => update({ note: e.target.value })}
                  placeholder="z. B. mobil, tagsüber erreichbar"
                />
              </Field>
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
            <Field label="E-Mail-Adresse">
              <EmbeddedInput
                type="email"
                value={item.address}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="z. B. ihre.email@beispiel.de"
              />
            </Field>
          )}
        />
        <div className="px-4 pb-2.5 -mt-1 text-[11px] text-muted-foreground/80">
          Empfohlen — wird für den Passwort-Reset benötigt
        </div>
      </SectionCard>

      <SectionCard label="BANKVERBINDUNG">
        <div className="px-4 py-3">
          <Field label="IBAN" required>
            <EmbeddedInput
              value={value.iban ?? ""}
              onChange={(e) => set({ iban: sanitizeGermanIbanInput(e.target.value) })}
              onKeyDown={(e) => {
                // Allow editing keys
                if (
                  ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"].includes(e.key) ||
                  e.metaKey || e.ctrlKey
                ) return;
                const clean = (value.iban ?? "").replace(/\s/g, "");
                // Position 1: must be 'D'; position 2: must be 'E'; positions 3+: digits only
                const pos = clean.length;
                if (pos === 0 && e.key.toUpperCase() !== "D") e.preventDefault();
                else if (pos === 1 && e.key.toUpperCase() !== "E") e.preventDefault();
                else if (pos >= 2 && !/^\d$/.test(e.key)) e.preventDefault();
                else if (pos >= 22) e.preventDefault();
              }}
              placeholder="DE00 0000 0000 0000 0000 00"
              className="font-mono tracking-[0.04em]"
              maxLength={27}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>
        <div className="px-4 pb-2.5 -mt-1 text-[11px] text-muted-foreground/80">
          Wird für die SEPA-Lastschrift Ihres Hausgeldes benötigt.
        </div>
      </SectionCard>

      <SectionCard label="HAUPTANSPRECHPARTNER">
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
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
                  {label}
                </button>
              );
            })}
          </div>

          {value.contact_self === false && (
            <div className="space-y-3 pt-1">
              <Field label="Vor- und Nachname" required>
                <EmbeddedInput
                  value={other.name ?? value.contact_other_name ?? ""}
                  onChange={(e) => {
                    setOther({ name: e.target.value });
                    set({ contact_other_name: e.target.value });
                  }}
                  placeholder="z. B. Anna Müller"
                />
              </Field>
              <Field label="Beziehung">
                <EmbeddedInput
                  value={other.relation ?? ""}
                  onChange={(e) => setOther({ relation: e.target.value })}
                  placeholder="z. B. Ehepartner, Sohn, Bevollmächtigte/r"
                />
              </Field>
              <Field label="Straße & Hausnr.">
                <EmbeddedInput
                  value={other.street ?? ""}
                  onChange={(e) => setOther({ street: e.target.value })}
                  placeholder="z. B. Musterstraße 12"
                />
              </Field>
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <Field label="PLZ">
                  <EmbeddedInput
                    value={other.zip ?? ""}
                    onChange={(e) => setOther({ zip: e.target.value })}
                    placeholder="z. B. 80331"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Ort">
                  <EmbeddedInput
                    value={other.city ?? ""}
                    onChange={(e) => setOther({ city: e.target.value })}
                    placeholder="z. B. München"
                  />
                </Field>
              </div>
              <Field label="Telefon">
                <EmbeddedInput
                  value={other.phone ?? ""}
                  onChange={(e) => setOther({ phone: e.target.value })}
                  placeholder="z. B. +49 170 1234567"
                  inputMode="tel"
                />
              </Field>
              <Field label="E-Mail">
                <EmbeddedInput
                  type="email"
                  value={other.email ?? ""}
                  onChange={(e) => setOther({ email: e.target.value })}
                  placeholder="z. B. anna.mueller@beispiel.de"
                />
              </Field>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard label="WÜNSCHE & ERWARTUNGEN (OPTIONAL)">
        <div className="p-3">
          <Field label="Was wünschen Sie sich für unsere Zusammenarbeit?">
            <Textarea
              rows={3}
              value={value.expectations ?? ""}
              onChange={(e) => set({ expectations: e.target.value })}
              placeholder="z. B. zeitnahe Rückmeldungen, transparente Abrechnungen …"
              className="border-0 bg-[hsl(var(--input))] focus-visible:ring-0 focus-visible:bg-[hsl(35_25%_92%)] resize-none rounded-lg px-3 py-2.5 text-[14px]"
            />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
};

const Field = ({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div>
    <div className="text-[12px] text-muted-foreground mb-1">
      {label}
      {required && <span className="text-primary ml-0.5">*</span>}
    </div>
    {children}
  </div>
);

// IBAN helpers — German IBAN only: starts with "DE" + 20 digits = 22 chars
const formatIban = (raw: string): string => {
  const clean = raw.replace(/\s+/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.match(/.{1,4}/g)?.join(" ") ?? "";
};

/** Strict sanitizer for paste/typing: only "DE" + digits, max 22 chars, formatted with spaces. */
const sanitizeGermanIbanInput = (raw: string): string => {
  let clean = raw.replace(/\s+/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Force "DE" prefix
  if (clean.length >= 1 && clean[0] !== "D") clean = "D" + clean.replace(/^D/, "");
  if (clean.length >= 2 && clean[1] !== "E") clean = clean[0] + "E" + clean.slice(2).replace(/[^0-9]/g, "");
  // After "DE", only digits allowed
  if (clean.length > 2) clean = clean.slice(0, 2) + clean.slice(2).replace(/[^0-9]/g, "");
  if (clean.length > 22) clean = clean.slice(0, 22);
  return clean.match(/.{1,4}/g)?.join(" ") ?? "";
};

const isValidIbanFormat = (iban: string): boolean => {
  const clean = iban.replace(/\s/g, "").toUpperCase();
  return /^DE\d{20}$/.test(clean);
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
  if (!d.iban?.trim()) return "Bitte IBAN angeben.";
  if (!isValidIbanFormat(d.iban))
    return "Bitte vollständige deutsche IBAN eingeben (DE + 20 Ziffern).";
  if (d.contact_self === undefined) return "Bitte Ansprechpartner wählen.";
  if (d.contact_self === false) {
    const name = d.contact_other?.name ?? d.contact_other_name;
    if (!name?.trim()) return "Bitte Name der Ansprechperson angeben.";
  }
  return null;
};
