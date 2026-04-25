import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Phone, Smartphone, Briefcase } from "lucide-react";
import { BigChoiceCard } from "../BigChoiceCard";

export interface Step1Data {
  street?: string;
  zip?: string;
  city?: string;
  phone?: string;
  phone_type?: "private" | "mobile" | "business";
  email?: string;
  iban?: string;
  contact_self?: boolean;
  contact_other_name?: string;
  expectations?: string;
}

interface Props {
  value: Step1Data;
  onChange: (next: Step1Data) => void;
}

export const Step1Stammdaten = ({ value, onChange }: Props) => {
  const set = (patch: Partial<Step1Data>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Ihre Stammdaten</h3>
        <p className="text-sm text-muted-foreground">
          Wir benötigen diese Angaben, um Sie offiziell als Eigentümer:in zu führen.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-3">
          <Label htmlFor="street">Straße & Hausnummer</Label>
          <Input
            id="street"
            value={value.street ?? ""}
            onChange={(e) => set({ street: e.target.value })}
            placeholder="z. B. Hauptstraße 12"
          />
        </div>
        <div>
          <Label htmlFor="zip">PLZ</Label>
          <Input
            id="zip"
            value={value.zip ?? ""}
            onChange={(e) => set({ zip: e.target.value })}
            inputMode="numeric"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="city">Ort</Label>
          <Input
            id="city"
            value={value.city ?? ""}
            onChange={(e) => set({ city: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Telefonart</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <BigChoiceCard
            icon={Phone}
            title="Festnetz"
            selected={value.phone_type === "private"}
            onClick={() => set({ phone_type: "private" })}
          />
          <BigChoiceCard
            icon={Smartphone}
            title="Mobil"
            selected={value.phone_type === "mobile"}
            onClick={() => set({ phone_type: "mobile" })}
          />
          <BigChoiceCard
            icon={Briefcase}
            title="Geschäftlich"
            selected={value.phone_type === "business"}
            onClick={() => set({ phone_type: "business" })}
          />
        </div>
        <Input
          value={value.phone ?? ""}
          onChange={(e) => set({ phone: e.target.value })}
          placeholder="Telefonnummer"
          inputMode="tel"
        />
      </div>

      <div>
        <Label htmlFor="email">E-Mail (empfohlen)</Label>
        <Input
          id="email"
          type="email"
          value={value.email ?? ""}
          onChange={(e) => set({ email: e.target.value })}
          placeholder="ihre.email@beispiel.de"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Für Passwort-Reset & Benachrichtigungen.
        </p>
      </div>

      <div>
        <Label htmlFor="iban">IBAN für SEPA-Lastschrift</Label>
        <Input
          id="iban"
          value={value.iban ?? ""}
          onChange={(e) => set({ iban: e.target.value.toUpperCase() })}
          placeholder="DE00 0000 0000 0000 0000 00"
          className="font-mono"
        />
      </div>

      <div className="space-y-3">
        <Label>Wer ist Hauptansprechpartner?</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <BigChoiceCard
            title="Ich selbst"
            selected={value.contact_self === true}
            onClick={() => set({ contact_self: true, contact_other_name: "" })}
          />
          <BigChoiceCard
            title="Andere Person"
            selected={value.contact_self === false}
            onClick={() => set({ contact_self: false })}
          />
        </div>
        {value.contact_self === false && (
          <Input
            value={value.contact_other_name ?? ""}
            onChange={(e) => set({ contact_other_name: e.target.value })}
            placeholder="Name der Ansprechperson"
          />
        )}
      </div>

      <div>
        <Label htmlFor="expectations">Wünsche & Erwartungen (optional)</Label>
        <Textarea
          id="expectations"
          rows={3}
          value={value.expectations ?? ""}
          onChange={(e) => set({ expectations: e.target.value })}
          placeholder="Was ist Ihnen besonders wichtig?"
        />
      </div>
    </div>
  );
};

export const validateStep1 = (d: Step1Data): string | null => {
  if (!d.street?.trim()) return "Bitte Straße angeben.";
  if (!d.zip?.trim() || d.zip.length < 4) return "Bitte PLZ angeben.";
  if (!d.city?.trim()) return "Bitte Ort angeben.";
  if (!d.phone?.trim()) return "Bitte Telefonnummer angeben.";
  if (!d.phone_type) return "Bitte Telefonart wählen.";
  if (!d.iban?.trim() || d.iban.replace(/\s/g, "").length < 15)
    return "Bitte gültige IBAN angeben.";
  if (d.contact_self === undefined) return "Bitte Ansprechpartner wählen.";
  if (d.contact_self === false && !d.contact_other_name?.trim())
    return "Bitte Name der Ansprechperson angeben.";
  return null;
};
