import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Save, Trash2, Phone, Mail, Landmark, Users } from "lucide-react";
import { ContactBuildingAssignments } from "./ContactBuildingAssignments";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Contact } from "@/pages/Contacts";

const SALUTATIONS = [
  "Herr", "Frau", "Eheleute", "Firma", "Familie",
  "Herr Dr.", "Frau Dr.", "Herr Prof.", "Frau Prof.",
  "Herr Prof. Dr.", "Frau Prof. Dr.", "Herr/Frau"
];

interface LocalPhone { _localId: string; id?: string; phone_number: string; label: string; _deleted?: boolean; }
interface LocalEmail { _localId: string; id?: string; email: string; label: string; is_primary: boolean; _deleted?: boolean; }
interface LocalBankAccount {
  _localId: string; id?: string; account_holder: string | null; bank_name: string | null;
  iban: string | null; bic: string | null; sepa_mandate_ref: string | null;
  sepa_mandate_date: string | null; is_default: boolean; _deleted?: boolean;
}
interface LocalPerson {
  _localId: string; id?: string; salutation: string | null; first_name: string | null;
  last_name: string | null; position: string | null; email: string | null;
  phone: string | null; notes: string | null; is_primary: boolean; _deleted?: boolean;
}

// IBAN validation: basic structure check (2 letter country + 2 check digits + up to 30 alphanumeric)
function isValidIban(iban: string): boolean {
  if (!iban || iban.trim() === "") return true; // empty is allowed
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleaned);
}

function formatIban(value: string): string {
  const cleaned = value.replace(/\s/g, "").toUpperCase();
  // Group in blocks of 4
  return cleaned.replace(/(.{4})/g, "$1 ").trim();
}

let localIdCounter = 0;
function nextLocalId() { return `_new_${++localIdCounter}_${Date.now()}`; }

interface Props {
  contact: Contact;
  onBack?: () => void;
  onUpdate: () => void;
  onDeleted?: () => void;
}

export function ContactDetail({ contact, onBack, onUpdate, onDeleted }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...contact });
  const [phones, setPhones] = useState<LocalPhone[]>([]);
  const [emails, setEmails] = useState<LocalEmail[]>([]);
  const [bankAccounts, setBankAccounts] = useState<LocalBankAccount[]>([]);
  const [persons, setPersons] = useState<LocalPerson[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ibanErrors, setIbanErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setForm({ ...contact });
    setIsDirty(false);
    setIbanErrors({});
    loadRelated();
  }, [contact.id]);

  const loadRelated = async () => {
    const [phonesRes, emailsRes, banksRes, personsRes] = await Promise.all([
      supabase.from("contact_phones").select("*").eq("contact_id", contact.id).order("created_at"),
      supabase.from("contact_emails").select("*").eq("contact_id", contact.id).order("created_at"),
      supabase.from("contact_bank_accounts").select("*").eq("contact_id", contact.id).order("created_at"),
      supabase.from("contact_persons").select("*").eq("contact_id", contact.id).order("sort_order"),
    ]);
    setPhones((phonesRes.data || []).map((p: any) => ({ ...p, _localId: p.id })));
    setEmails((emailsRes.data || []).map((e: any) => ({ ...e, _localId: e.id })));
    setBankAccounts((banksRes.data || []).map((b: any) => ({ ...b, _localId: b.id })));
    setPersons((personsRes.data || []).map((p: any) => ({ ...p, _localId: p.id })));
  };

  const markDirty = useCallback(() => setIsDirty(true), []);

  // --- Local state mutations (no DB calls) ---
  const addPhone = () => {
    setPhones(prev => [...prev, { _localId: nextLocalId(), phone_number: "", label: "Mobil" }]);
    markDirty();
  };
  const updatePhoneLocal = (localId: string, field: string, value: string) => {
    setPhones(prev => prev.map(p => p._localId === localId ? { ...p, [field]: value } : p));
    markDirty();
  };
  const removePhone = (localId: string) => {
    setPhones(prev => prev.map(p => p._localId === localId ? { ...p, _deleted: true } : p));
    markDirty();
  };

  const addEmail = () => {
    setEmails(prev => [...prev, { _localId: nextLocalId(), email: "", label: "Privat", is_primary: false }]);
    markDirty();
  };
  const updateEmailLocal = (localId: string, field: string, value: string | boolean) => {
    setEmails(prev => prev.map(e => e._localId === localId ? { ...e, [field]: value } : e));
    markDirty();
  };
  const removeEmail = (localId: string) => {
    setEmails(prev => prev.map(e => e._localId === localId ? { ...e, _deleted: true } : e));
    markDirty();
  };

  const addBank = () => {
    setBankAccounts(prev => [...prev, {
      _localId: nextLocalId(), account_holder: null, bank_name: null,
      iban: null, bic: null, sepa_mandate_ref: null, sepa_mandate_date: null, is_default: false,
    }]);
    markDirty();
  };
  const updateBankLocal = (localId: string, field: string, value: string | boolean) => {
    setBankAccounts(prev => prev.map(b => b._localId === localId ? { ...b, [field]: value } : b));
    // Validate IBAN on change
    if (field === "iban") {
      const ibanValue = value as string;
      if (ibanValue && !isValidIban(ibanValue)) {
        setIbanErrors(prev => ({ ...prev, [localId]: "Ungültiges IBAN-Format (z.B. DE89 3704 0044 0532 0130 00)" }));
      } else {
        setIbanErrors(prev => { const next = { ...prev }; delete next[localId]; return next; });
      }
    }
    markDirty();
  };
  const removeBank = (localId: string) => {
    setBankAccounts(prev => prev.map(b => b._localId === localId ? { ...b, _deleted: true } : b));
    setIbanErrors(prev => { const next = { ...prev }; delete next[localId]; return next; });
    markDirty();
  };

  // --- Batch Save ---
  const saveAll = async () => {
    // Validate IBANs before saving
    const activeAccounts = bankAccounts.filter(b => !b._deleted);
    const newErrors: Record<string, string> = {};
    for (const b of activeAccounts) {
      if (b.iban && !isValidIban(b.iban)) {
        newErrors[b._localId] = "Ungültiges IBAN-Format (z.B. DE89 3704 0044 0532 0130 00)";
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setIbanErrors(newErrors);
      toast({ title: "Fehler", description: "Bitte korrigieren Sie die IBAN-Felder.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // 1. Save contact base data
      const { error: contactError } = await supabase.from("contacts").update({
        short_name: form.short_name, salutation: form.salutation,
        first_name: form.first_name, last_name: form.last_name,
        company_name: form.company_name, address_street: form.address_street,
        address_zip: form.address_zip, address_city: form.address_city, notes: form.notes,
      }).eq("id", contact.id);
      if (contactError) throw contactError;

      // 2. Save phones
      const deletedPhones = phones.filter(p => p._deleted && p.id);
      const newPhones = phones.filter(p => !p._deleted && !p.id);
      const existingPhones = phones.filter(p => !p._deleted && p.id);

      if (deletedPhones.length > 0) {
        await supabase.from("contact_phones").delete().in("id", deletedPhones.map(p => p.id!));
      }
      for (const p of newPhones) {
        if (p.phone_number.trim()) {
          await supabase.from("contact_phones").insert({ contact_id: contact.id, phone_number: p.phone_number, label: p.label });
        }
      }
      for (const p of existingPhones) {
        await supabase.from("contact_phones").update({ phone_number: p.phone_number, label: p.label }).eq("id", p.id!);
      }

      // 3. Save emails
      const deletedEmails = emails.filter(e => e._deleted && e.id);
      const newEmails = emails.filter(e => !e._deleted && !e.id);
      const existingEmails = emails.filter(e => !e._deleted && e.id);

      if (deletedEmails.length > 0) {
        await supabase.from("contact_emails").delete().in("id", deletedEmails.map(e => e.id!));
      }
      for (const e of newEmails) {
        if (e.email.trim()) {
          await supabase.from("contact_emails").insert({ contact_id: contact.id, email: e.email, label: e.label, is_primary: e.is_primary });
        }
      }
      for (const e of existingEmails) {
        await supabase.from("contact_emails").update({ email: e.email, label: e.label, is_primary: e.is_primary }).eq("id", e.id!);
      }

      // 4. Save bank accounts
      const deletedBanks = bankAccounts.filter(b => b._deleted && b.id);
      const newBanks = bankAccounts.filter(b => !b._deleted && !b.id);
      const existingBanks = bankAccounts.filter(b => !b._deleted && b.id);

      if (deletedBanks.length > 0) {
        await supabase.from("contact_bank_accounts").delete().in("id", deletedBanks.map(b => b.id!));
      }
      for (const b of newBanks) {
        await supabase.from("contact_bank_accounts").insert({
          contact_id: contact.id, account_holder: b.account_holder, bank_name: b.bank_name,
          iban: b.iban ? b.iban.replace(/\s/g, "").toUpperCase() : null, bic: b.bic, is_default: b.is_default,
        });
      }
      for (const b of existingBanks) {
        await supabase.from("contact_bank_accounts").update({
          account_holder: b.account_holder, bank_name: b.bank_name,
          iban: b.iban ? b.iban.replace(/\s/g, "").toUpperCase() : null, bic: b.bic, is_default: b.is_default,
        }).eq("id", b.id!);
      }

      toast({ title: "Gespeichert" });
      setIsDirty(false);
      onUpdate();
      // Reload to get server-generated values (e.g. SEPA mandate refs)
      await loadRelated();
    } catch (err: any) {
      toast({ title: "Fehler beim Speichern", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async () => {
    setDeleting(true);
    const { error } = await supabase.from("contacts").delete().eq("id", contact.id);
    setDeleting(false);
    if (error) {
      toast({ title: "Fehler beim Löschen", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Kontakt gelöscht" });
      onDeleted?.();
    }
  };

  const displayName = form.company_name || [form.salutation, form.first_name, form.last_name].filter(Boolean).join(" ") || "Unbenannt";
  const visiblePhones = phones.filter(p => !p._deleted);
  const visibleEmails = emails.filter(e => !e._deleted);
  const visibleBanks = bankAccounts.filter(b => !b._deleted);
  const hasIbanErrors = Object.keys(ibanErrors).length > 0;

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
          {isDirty && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Ungespeichert</span>}
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Kontakt löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  <strong>{displayName}</strong> wird unwiderruflich gelöscht, einschließlich aller Telefonnummern, E-Mails, Bankverbindungen und Gebäude-Zuordnungen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={deleteContact} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? "Löscht..." : "Endgültig löschen"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={saveAll} disabled={saving || hasIbanErrors} size="sm">
            <Save className="h-4 w-4 mr-2" />{saving ? "..." : "Speichern"}
          </Button>
        </div>
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
                <Input value={form.short_name || ""} onChange={(e) => { setForm({ ...form, short_name: e.target.value }); markDirty(); }} />
              </div>
              <div>
                <Label>Anrede</Label>
                <Select value={form.salutation || ""} onValueChange={(v) => { setForm({ ...form, salutation: v }); markDirty(); }}>
                  <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                  <SelectContent>
                    {SALUTATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vorname</Label>
                <Input value={form.first_name || ""} onChange={(e) => { setForm({ ...form, first_name: e.target.value }); markDirty(); }} />
              </div>
              <div>
                <Label>Nachname</Label>
                <Input value={form.last_name || ""} onChange={(e) => { setForm({ ...form, last_name: e.target.value }); markDirty(); }} />
              </div>
              <div className="md:col-span-2">
                <Label>Firma</Label>
                <Input value={form.company_name || ""} onChange={(e) => { setForm({ ...form, company_name: e.target.value }); markDirty(); }} />
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <h3 className="text-sm font-semibold mb-3">Adresse</h3>
              <div className="space-y-3">
                <div>
                  <Label>Straße & Hausnummer</Label>
                  <Input value={form.address_street || ""} onChange={(e) => { setForm({ ...form, address_street: e.target.value }); markDirty(); }} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>PLZ</Label>
                    <Input value={form.address_zip || ""} onChange={(e) => { setForm({ ...form, address_zip: e.target.value }); markDirty(); }} />
                  </div>
                  <div className="col-span-2">
                    <Label>Ort</Label>
                    <Input value={form.address_city || ""} onChange={(e) => { setForm({ ...form, address_city: e.target.value }); markDirty(); }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <Label>Notizen</Label>
              <Textarea value={form.notes || ""} onChange={(e) => { setForm({ ...form, notes: e.target.value }); markDirty(); }} rows={4} />
            </div>
          </TabsContent>

          {/* Kommunikation Tab */}
          <TabsContent value="kommunikation" className="space-y-6 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2"><Phone className="h-4 w-4" /> Telefonnummern</CardTitle>
                  <Button size="sm" variant="outline" onClick={addPhone}><Plus className="h-3 w-3 mr-1" />Hinzufügen</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {visiblePhones.length === 0 && <p className="text-sm text-muted-foreground">Keine Telefonnummern</p>}
                {visiblePhones.map((p) => (
                  <div key={p._localId} className="flex items-center gap-2">
                    <Select value={p.label || "Mobil"} onValueChange={(v) => updatePhoneLocal(p._localId, "label", v)}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Mobil", "Festnetz", "Büro", "Fax"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      value={p.phone_number}
                      onChange={(e) => updatePhoneLocal(p._localId, "phone_number", e.target.value)}
                      placeholder="Nummer eingeben"
                      className="flex-1"
                    />
                    <Button size="icon" variant="ghost" onClick={() => removePhone(p._localId)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2"><Mail className="h-4 w-4" /> E-Mail-Adressen</CardTitle>
                  <Button size="sm" variant="outline" onClick={addEmail}><Plus className="h-3 w-3 mr-1" />Hinzufügen</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {visibleEmails.length === 0 && <p className="text-sm text-muted-foreground">Keine E-Mail-Adressen</p>}
                {visibleEmails.map((e) => (
                  <div key={e._localId} className="flex items-center gap-2">
                    <Select value={e.label || "Privat"} onValueChange={(v) => updateEmailLocal(e._localId, "label", v)}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Privat", "Geschäftlich", "Sonstige"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      value={e.email}
                      onChange={(ev) => updateEmailLocal(e._localId, "email", ev.target.value)}
                      placeholder="E-Mail eingeben"
                      className="flex-1"
                      type="email"
                    />
                    <Button size="icon" variant="ghost" onClick={() => removeEmail(e._localId)}>
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
            {visibleBanks.length === 0 && <p className="text-sm text-muted-foreground">Keine Bankverbindungen</p>}
            {visibleBanks.map((b) => (
              <Card key={b._localId}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Kontoinhaber</Label>
                        <Input
                          value={b.account_holder || ""}
                          onChange={(e) => updateBankLocal(b._localId, "account_holder", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Kreditinstitut</Label>
                        <Input
                          value={b.bank_name || ""}
                          onChange={(e) => updateBankLocal(b._localId, "bank_name", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>IBAN</Label>
                        <Input
                          value={b.iban ? formatIban(b.iban) : ""}
                          onChange={(e) => updateBankLocal(b._localId, "iban", e.target.value)}
                          placeholder="DE89 3704 0044 0532 0130 00"
                          className={ibanErrors[b._localId] ? "border-destructive" : ""}
                        />
                        {ibanErrors[b._localId] && (
                          <p className="text-xs text-destructive mt-1">{ibanErrors[b._localId]}</p>
                        )}
                      </div>
                      <div>
                        <Label>BIC</Label>
                        <Input
                          value={b.bic || ""}
                          onChange={(e) => updateBankLocal(b._localId, "bic", e.target.value)}
                        />
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeBank(b._localId)} className="ml-2">
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