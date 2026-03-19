import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Save, Trash2, Phone, Mail, Landmark, Building2 } from "lucide-react";
import { ContactBuildingAssignments } from "./ContactBuildingAssignments";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Contact } from "@/pages/Contacts";

const SALUTATIONS = [
  "Herr", "Frau", "Eheleute", "Firma", "Familie",
  "Herr Dr.", "Frau Dr.", "Herr Prof.", "Frau Prof.",
  "Herr Prof. Dr.", "Frau Prof. Dr.", "Herr/Frau"
];

interface ContactPhone { id: string; phone_number: string; label: string; }
interface ContactEmail { id: string; email: string; label: string; is_primary: boolean; }
interface ContactBankAccount {
  id: string; account_holder: string | null; bank_name: string | null;
  iban: string | null; bic: string | null; sepa_mandate_ref: string | null;
  sepa_mandate_date: string | null; is_default: boolean;
}

interface Props {
  contact: Contact;
  onBack?: () => void;
  onUpdate: () => void;
}

export function ContactDetail({ contact, onBack, onUpdate }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...contact });
  const [phones, setPhones] = useState<ContactPhone[]>([]);
  const [emails, setEmails] = useState<ContactEmail[]>([]);
  const [bankAccounts, setBankAccounts] = useState<ContactBankAccount[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({ ...contact });
    loadRelated();
  }, [contact.id]);

  const loadRelated = async () => {
    const [phonesRes, emailsRes, banksRes] = await Promise.all([
      supabase.from("contact_phones").select("*").eq("contact_id", contact.id).order("created_at"),
      supabase.from("contact_emails").select("*").eq("contact_id", contact.id).order("created_at"),
      supabase.from("contact_bank_accounts").select("*").eq("contact_id", contact.id).order("created_at"),
    ]);
    setPhones((phonesRes.data as ContactPhone[]) || []);
    setEmails((emailsRes.data as ContactEmail[]) || []);
    setBankAccounts((banksRes.data as ContactBankAccount[]) || []);
  };

  const saveContact = async () => {
    setSaving(true);
    const { error } = await supabase.from("contacts").update({
      short_name: form.short_name, salutation: form.salutation,
      first_name: form.first_name, last_name: form.last_name,
      company_name: form.company_name, address_street: form.address_street,
      address_zip: form.address_zip, address_city: form.address_city, notes: form.notes,
    }).eq("id", contact.id);
    setSaving(false);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else { toast({ title: "Gespeichert" }); onUpdate(); }
  };

  // Phone CRUD
  const addPhone = async () => {
    await supabase.from("contact_phones").insert({ contact_id: contact.id, phone_number: "", label: "Mobil" });
    loadRelated();
  };
  const updatePhone = async (id: string, field: string, value: string) => {
    await supabase.from("contact_phones").update({ [field]: value }).eq("id", id);
    loadRelated();
  };
  const deletePhone = async (id: string) => {
    await supabase.from("contact_phones").delete().eq("id", id);
    loadRelated();
  };

  // Email CRUD
  const addEmail = async () => {
    await supabase.from("contact_emails").insert({ contact_id: contact.id, email: "", label: "Privat" });
    loadRelated();
  };
  const updateEmail = async (id: string, field: string, value: string | boolean) => {
    await supabase.from("contact_emails").update({ [field]: value }).eq("id", id);
    loadRelated();
  };
  const deleteEmail = async (id: string) => {
    await supabase.from("contact_emails").delete().eq("id", id);
    loadRelated();
  };

  // Bank CRUD
  const addBank = async () => {
    await supabase.from("contact_bank_accounts").insert({ contact_id: contact.id });
    loadRelated();
  };
  const updateBank = async (id: string, field: string, value: string | boolean) => {
    await supabase.from("contact_bank_accounts").update({ [field]: value }).eq("id", id);
    loadRelated();
  };
  const deleteBank = async (id: string) => {
    await supabase.from("contact_bank_accounts").delete().eq("id", id);
    loadRelated();
  };

  const displayName = form.company_name || [form.salutation, form.first_name, form.last_name].filter(Boolean).join(" ") || "Unbenannt";

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h2 className="text-xl font-semibold truncate">{displayName}</h2>
        </div>
        <Button onClick={saveContact} disabled={saving} size="sm">
          <Save className="h-4 w-4 mr-2" />{saving ? "..." : "Speichern"}
        </Button>
      </div>

      <div className="p-6">
        <Tabs defaultValue="stammdaten">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="stammdaten">Stammdaten</TabsTrigger>
            <TabsTrigger value="kommunikation">Kommunikation</TabsTrigger>
            <TabsTrigger value="bank">Bank</TabsTrigger>
            <TabsTrigger value="gebaeude">Gebäude</TabsTrigger>
          </TabsList>

          {/* Stammdaten Tab */}
          <TabsContent value="stammdaten" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Kurzname</Label>
                <Input value={form.short_name || ""} onChange={(e) => setForm({ ...form, short_name: e.target.value })} />
              </div>
              <div>
                <Label>Anrede</Label>
                <Select value={form.salutation || ""} onValueChange={(v) => setForm({ ...form, salutation: v })}>
                  <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                  <SelectContent>
                    {SALUTATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vorname</Label>
                <Input value={form.first_name || ""} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </div>
              <div>
                <Label>Nachname</Label>
                <Input value={form.last_name || ""} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Firma</Label>
                <Input value={form.company_name || ""} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <h3 className="text-sm font-semibold mb-3">Adresse</h3>
              <div className="space-y-3">
                <div>
                  <Label>Straße & Hausnummer</Label>
                  <Input value={form.address_street || ""} onChange={(e) => setForm({ ...form, address_street: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>PLZ</Label>
                    <Input value={form.address_zip || ""} onChange={(e) => setForm({ ...form, address_zip: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label>Ort</Label>
                    <Input value={form.address_city || ""} onChange={(e) => setForm({ ...form, address_city: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <Label>Notizen</Label>
              <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} />
            </div>
          </TabsContent>

          {/* Kommunikation Tab */}
          <TabsContent value="kommunikation" className="space-y-6 mt-4">
            {/* Phones */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2"><Phone className="h-4 w-4" /> Telefonnummern</CardTitle>
                  <Button size="sm" variant="outline" onClick={addPhone}><Plus className="h-3 w-3 mr-1" />Hinzufügen</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {phones.length === 0 && <p className="text-sm text-muted-foreground">Keine Telefonnummern</p>}
                {phones.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <Select value={p.label || "Mobil"} onValueChange={(v) => updatePhone(p.id, "label", v)}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Mobil", "Festnetz", "Büro", "Fax"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      value={p.phone_number}
                      onChange={(e) => updatePhone(p.id, "phone_number", e.target.value)}
                      placeholder="Nummer eingeben"
                      className="flex-1"
                    />
                    <Button size="icon" variant="ghost" onClick={() => deletePhone(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Emails */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2"><Mail className="h-4 w-4" /> E-Mail-Adressen</CardTitle>
                  <Button size="sm" variant="outline" onClick={addEmail}><Plus className="h-3 w-3 mr-1" />Hinzufügen</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {emails.length === 0 && <p className="text-sm text-muted-foreground">Keine E-Mail-Adressen</p>}
                {emails.map((e) => (
                  <div key={e.id} className="flex items-center gap-2">
                    <Select value={e.label || "Privat"} onValueChange={(v) => updateEmail(e.id, "label", v)}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Privat", "Geschäftlich", "Sonstige"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      value={e.email}
                      onChange={(ev) => updateEmail(e.id, "email", ev.target.value)}
                      placeholder="E-Mail eingeben"
                      className="flex-1"
                      type="email"
                    />
                    <Button size="icon" variant="ghost" onClick={() => deleteEmail(e.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bank Tab */}
          <TabsContent value="bank" className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Landmark className="h-4 w-4" /> Bankverbindungen</h3>
              <Button size="sm" variant="outline" onClick={addBank}><Plus className="h-3 w-3 mr-1" />Hinzufügen</Button>
            </div>
            {bankAccounts.length === 0 && <p className="text-sm text-muted-foreground">Keine Bankverbindungen</p>}
            {bankAccounts.map((b) => (
              <Card key={b.id}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Kontoinhaber</Label>
                        <Input
                          value={b.account_holder || ""}
                          onChange={(e) => updateBank(b.id, "account_holder", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Kreditinstitut</Label>
                        <Input
                          value={b.bank_name || ""}
                          onChange={(e) => updateBank(b.id, "bank_name", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>IBAN</Label>
                        <Input
                          value={b.iban || ""}
                          onChange={(e) => updateBank(b.id, "iban", e.target.value)}
                          placeholder="DE..."
                        />
                      </div>
                      <div>
                        <Label>BIC</Label>
                        <Input
                          value={b.bic || ""}
                          onChange={(e) => updateBank(b.id, "bic", e.target.value)}
                        />
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => deleteBank(b.id)} className="ml-2">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {b.sepa_mandate_ref && (
                    <div className="bg-muted rounded-md px-3 py-2 text-xs text-muted-foreground">
                      SEPA-Mandatsreferenz: <span className="font-mono font-medium text-foreground">{b.sepa_mandate_ref}</span>
                      {b.sepa_mandate_date && <span className="ml-3">vom {new Date(b.sepa_mandate_date).toLocaleDateString("de-DE")}</span>}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Gebäude Tab */}
          <TabsContent value="gebaeude" className="mt-4">
            <ContactBuildingAssignments contactId={contact.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
