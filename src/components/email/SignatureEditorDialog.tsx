import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  EMAIL_SIGNATURE_SETTINGS_KEY,
  saveAccountSignature,
  useSignatureCompany,
  type SignatureAccount,
} from "@/hooks/useEmailSignature";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SignaturePreview } from "./SignaturePreview";
import {
  normalizeSignatureFields,
  renderSignatureHtml,
  type SignatureCompany,
  type SignatureFields,
} from "@/lib/emailSignature";

const FIELD_LABELS: { key: keyof SignatureFields; label: string; placeholder?: string }[] = [
  { key: "greeting", label: "Grußformel", placeholder: "Mit freundlichen Grüßen" },
  { key: "name", label: "Name", placeholder: "Max Mustermann" },
  { key: "title", label: "Funktion", placeholder: "z. B. Geschäftsführer" },
  { key: "qualification", label: "Zusatz", placeholder: "z. B. zert. Verwalter (IHK) nach § 26a WEG" },
  { key: "phone", label: "Telefon", placeholder: "+49 8363 960656" },
  { key: "email", label: "E-Mail", placeholder: "name@rgi-immobilien.de" },
];

const COMPANY_LABELS: { key: keyof SignatureCompany; label: string }[] = [
  { key: "kg_name", label: "Firma (KG)" },
  { key: "kg_seat", label: "Sitz (KG)" },
  { key: "kg_register", label: "Registergericht + Nr. (KG)" },
  { key: "kg_vat_id", label: "USt-IdNr. (KG)" },
  { key: "gp_name", label: "Komplementärin" },
  { key: "gp_seat", label: "Sitz (Komplementärin)" },
  { key: "gp_register", label: "Registergericht + Nr. (Komplementärin)" },
  { key: "managing_directors", label: "Geschäftsführer der Komplementärin" },
  { key: "address", label: "Adresse" },
  { key: "website", label: "Website" },
  { key: "logo_url", label: "Logo-URL (PNG, öffentlich erreichbar)" },
];

export function SignatureEditorDialog({
  account,
  allAccounts,
  open,
  onOpenChange,
}: {
  account: SignatureAccount | null;
  allAccounts: SignatureAccount[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: savedCompany, isLoading } = useSignatureCompany();
  const [fields, setFields] = useState<SignatureFields>(normalizeSignatureFields(null));
  const [company, setCompany] = useState<SignatureCompany | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("person");

  useEffect(() => {
    if (!open || !account) return;
    const f = normalizeSignatureFields(account.signature_fields, account.email_address);
    if (!account.signature_fields && !f.name) f.name = account.display_name || "";
    setFields(f);
    setTab("person");
  }, [open, account]);

  useEffect(() => {
    if (open && savedCompany) setCompany(savedCompany);
  }, [open, savedCompany]);

  const previewHtml = useMemo(
    () => (company ? renderSignatureHtml(fields, company) : ""),
    [fields, company],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["email-accounts-settings"] });
    queryClient.invalidateQueries({ queryKey: ["email-accounts-compose"] });
    queryClient.invalidateQueries({ queryKey: EMAIL_SIGNATURE_SETTINGS_KEY });
  };

  const companyChanged =
    !!company && !!savedCompany && JSON.stringify(company) !== JSON.stringify(savedCompany);

  const save = async () => {
    if (!account || !company) return;
    setSaving(true);
    try {
      if (companyChanged) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("email_signature_settings")
          .upsert({ id: true, ...company, updated_at: new Date().toISOString() });
        if (error) throw error;
        // Pflichtangaben gelten für alle: übrige Postfächer neu erzeugen
        const others = allAccounts.filter((a) => a.id !== account.id && a.signature_fields);
        for (const a of others) {
          await saveAccountSignature(a.id, normalizeSignatureFields(a.signature_fields, a.email_address), company);
        }
      }
      await saveAccountSignature(account.id, fields, company);
      toast.success(companyChanged ? "Signatur und Pflichtangaben gespeichert – alle Signaturen aktualisiert" : "Signatur gespeichert");
      invalidate();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const setField = (k: keyof SignatureFields, v: string) => setFields((f) => ({ ...f, [k]: v }));
  const setCompanyField = (k: keyof SignatureCompany, v: string) =>
    setCompany((c) => (c ? { ...c, [k]: v } : c));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Signatur – {account?.display_name}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !company ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="person">Angaben zur Person</TabsTrigger>
                <TabsTrigger value="firma">Pflichtangaben &amp; Logo (alle Postfächer)</TabsTrigger>
              </TabsList>
              <TabsContent value="person" className="pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {FIELD_LABELS.map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-xs">{label}</Label>
                      <Input
                        value={fields[key]}
                        onChange={(e) => setField(key, e.target.value)}
                        placeholder={placeholder}
                        className="h-9"
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="firma" className="pt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Pflichtangaben für Geschäftsbriefe der GmbH &amp; Co. KG (§ 125 i. V. m. § 177a HGB, § 35a GmbHG).
                  Bitte genau wie im Handelsregister eintragen. Änderungen werden beim Speichern in alle Signaturen übernommen.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {COMPANY_LABELS.map(({ key, label }) => (
                    <div key={key} className={key === "logo_url" || key === "managing_directors" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
                      <Label className="text-xs">{label}</Label>
                      <Input value={company[key]} onChange={(e) => setCompanyField(key, e.target.value)} className="h-9" />
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Vorschau (so sieht die Signatur beim Empfänger aus)</Label>
              <div className="border rounded-md p-3 bg-white">
                <SignaturePreview html={previewHtml} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Speichern
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
