import { useState, useEffect } from "react";
import { useRgiSettings, useUpsertRgiSettings } from "@/hooks/useRgi";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export function CompanySettingsTab() {
  const { data, isLoading } = useRgiSettings();
  const upsert = useUpsertRgiSettings();
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (data) setForm(data);
    else if (!isLoading) setForm({ legal_name: "RGI Immobilien", invoice_number_pattern: "{YYYY}-{NNNN}", default_payment_terms_days: 14, country: "Deutschland" });
  }, [data, isLoading]);

  if (isLoading) return <Skeleton className="h-96" />;

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <Card className="p-6 mt-4 space-y-6 max-w-4xl">
      <Section title="Firma">
        <Field label="Firmenname *"><Input value={form.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} /></Field>
        <Field label="Geschäftsführer"><Input value={form.ceo ?? ""} onChange={(e) => set("ceo", e.target.value)} /></Field>
        <Field label="Handelsregister (HRB)"><Input value={form.hrb ?? ""} onChange={(e) => set("hrb", e.target.value)} /></Field>
        <Field label="Registergericht"><Input value={form.court ?? ""} onChange={(e) => set("court", e.target.value)} /></Field>
        <Field label="Steuernummer"><Input value={form.tax_no ?? ""} onChange={(e) => set("tax_no", e.target.value)} /></Field>
        <Field label="USt-IdNr."><Input value={form.vat_id ?? ""} onChange={(e) => set("vat_id", e.target.value)} /></Field>
      </Section>

      <Section title="Anschrift">
        <Field label="Adresse 1"><Input value={form.address_line1 ?? ""} onChange={(e) => set("address_line1", e.target.value)} /></Field>
        <Field label="Adresse 2"><Input value={form.address_line2 ?? ""} onChange={(e) => set("address_line2", e.target.value)} /></Field>
        <Field label="PLZ"><Input value={form.zip ?? ""} onChange={(e) => set("zip", e.target.value)} /></Field>
        <Field label="Stadt"><Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} /></Field>
        <Field label="Land"><Input value={form.country ?? ""} onChange={(e) => set("country", e.target.value)} /></Field>
      </Section>

      <Section title="Kontakt">
        <Field label="E-Mail"><Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Telefon"><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Website"><Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} /></Field>
      </Section>

      <Section title="Bankverbindung">
        <Field label="IBAN"><Input value={form.iban ?? ""} onChange={(e) => set("iban", e.target.value)} /></Field>
        <Field label="BIC"><Input value={form.bic ?? ""} onChange={(e) => set("bic", e.target.value)} /></Field>
        <Field label="Bank"><Input value={form.bank_name ?? ""} onChange={(e) => set("bank_name", e.target.value)} /></Field>
      </Section>

      <Section title="Rechnungs-Defaults">
        <Field label="Nummernkreis-Muster" hint="Platzhalter: {YYYY} {MM} {SPARTE} {NNNN}">
          <Input value={form.invoice_number_pattern ?? ""} onChange={(e) => set("invoice_number_pattern", e.target.value)} />
        </Field>
        <Field label="Zahlungsziel (Tage)">
          <Input type="number" value={form.default_payment_terms_days ?? 14} onChange={(e) => set("default_payment_terms_days", Number(e.target.value))} />
        </Field>
        <Field label="Mahngebühr Stufe 1 (€)"><Input type="number" step="0.01" value={form.reminder_fee_l1 ?? ""} onChange={(e) => set("reminder_fee_l1", num(e.target.value))} /></Field>
        <Field label="Mahngebühr Stufe 2 (€)"><Input type="number" step="0.01" value={form.reminder_fee_l2 ?? ""} onChange={(e) => set("reminder_fee_l2", num(e.target.value))} /></Field>
        <Field label="Mahngebühr Stufe 3 (€)"><Input type="number" step="0.01" value={form.reminder_fee_l3 ?? ""} onChange={(e) => set("reminder_fee_l3", num(e.target.value))} /></Field>
      </Section>

      <div>
        <Label>Standard-Fußtext</Label>
        <Textarea rows={3} value={form.default_footer_text ?? ""} onChange={(e) => set("default_footer_text", e.target.value)} />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => upsert.mutate(form)} disabled={upsert.isPending}>Speichern</Button>
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
