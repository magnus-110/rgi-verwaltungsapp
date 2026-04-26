import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, User, Phone, Mail, CreditCard, MapPin } from "lucide-react";

interface Contact {
  id: string;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
}

interface Phone { id: string; phone_number: string; label: string | null; }
interface Email { id: string; email: string; label: string | null; }
interface Bank { id: string; iban: string | null; bic: string | null; bank_name: string | null; account_holder: string | null; }

export const OwnerSelfServiceSection = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [phones, setPhones] = useState<Phone[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);

  const load = async () => {
    if (!profile?.user_id) return;
    setLoading(true);
    const { data: c } = await supabase
      .from("contacts")
      .select("id, salutation, first_name, last_name, company_name, address_street, address_zip, address_city")
      .eq("user_id", profile.user_id)
      .maybeSingle();
    if (!c) { setContact(null); setLoading(false); return; }
    setContact(c as Contact);
    const [{ data: ph }, { data: em }, { data: bk }] = await Promise.all([
      supabase.from("contact_phones").select("id, phone_number, label").eq("contact_id", c.id),
      supabase.from("contact_emails").select("id, email, label").eq("contact_id", c.id),
      supabase.from("contact_bank_accounts").select("id, iban, bic, bank_name, account_holder").eq("contact_id", c.id),
    ]);
    setPhones((ph ?? []) as Phone[]);
    setEmails((em ?? []) as Email[]);
    setBanks((bk ?? []) as Bank[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.user_id]);

  const saveContact = async () => {
    if (!contact) return;
    setSaving(true);
    const { error } = await supabase
      .from("contacts")
      .update({
        salutation: contact.salutation,
        first_name: contact.first_name,
        last_name: contact.last_name,
        company_name: contact.company_name,
        address_street: contact.address_street,
        address_zip: contact.address_zip,
        address_city: contact.address_city,
      })
      .eq("id", contact.id);
    setSaving(false);
    if (error) return toast({ title: "Fehler", description: error.message, variant: "destructive" });
    toast({ title: "Stammdaten gespeichert" });
  };

  const addPhone = async () => {
    if (!contact) return;
    const { data, error } = await supabase
      .from("contact_phones")
      .insert({ contact_id: contact.id, phone_number: "", label: "Privat" })
      .select("id, phone_number, label").single();
    if (error) return toast({ title: "Fehler", description: error.message, variant: "destructive" });
    setPhones((p) => [...p, data as Phone]);
  };
  const updatePhone = async (id: string, patch: Partial<Phone>) => {
    setPhones((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };
  const savePhone = async (p: Phone) => {
    const { error } = await supabase.from("contact_phones").update({ phone_number: p.phone_number, label: p.label }).eq("id", p.id);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
  };
  const deletePhone = async (id: string) => {
    const { error } = await supabase.from("contact_phones").delete().eq("id", id);
    if (error) return toast({ title: "Fehler", description: error.message, variant: "destructive" });
    setPhones((p) => p.filter((x) => x.id !== id));
  };

  const addEmail = async () => {
    if (!contact) return;
    const { data, error } = await supabase
      .from("contact_emails")
      .insert({ contact_id: contact.id, email: "", label: "Privat" })
      .select("id, email, label").single();
    if (error) return toast({ title: "Fehler", description: error.message, variant: "destructive" });
    setEmails((e) => [...e, data as Email]);
  };
  const updateEmail = (id: string, patch: Partial<Email>) =>
    setEmails((e) => e.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const saveEmail = async (e: Email) => {
    const { error } = await supabase.from("contact_emails").update({ email: e.email, label: e.label }).eq("id", e.id);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
  };
  const deleteEmail = async (id: string) => {
    const { error } = await supabase.from("contact_emails").delete().eq("id", id);
    if (error) return toast({ title: "Fehler", description: error.message, variant: "destructive" });
    setEmails((e) => e.filter((x) => x.id !== id));
  };

  const addBank = async () => {
    if (!contact) return;
    const { data, error } = await supabase
      .from("contact_bank_accounts")
      .insert({ contact_id: contact.id, iban: "", bic: "", bank_name: "", account_holder: "" })
      .select("id, iban, bic, bank_name, account_holder").single();
    if (error) return toast({ title: "Fehler", description: error.message, variant: "destructive" });
    setBanks((b) => [...b, data as Bank]);
  };
  const updateBank = (id: string, patch: Partial<Bank>) =>
    setBanks((b) => b.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const saveBank = async (b: Bank) => {
    const { error } = await supabase
      .from("contact_bank_accounts")
      .update({ iban: b.iban, account_holder: b.account_holder })
      .eq("id", b.id);
    if (error) return toast({ title: "Fehler", description: error.message, variant: "destructive" });
    toast({ title: "Bankdaten gespeichert" });
  };
  const deleteBank = async (id: string) => {
    const { error } = await supabase.from("contact_bank_accounts").delete().eq("id", id);
    if (error) return toast({ title: "Fehler", description: error.message, variant: "destructive" });
    setBanks((b) => b.filter((x) => x.id !== id));
  };

  if (loading) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Lade Stammdaten...
      </CardContent></Card>
    );
  }

  if (!contact) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground">
        Es ist noch kein Kontakt für Ihren Account hinterlegt. Bitte wenden Sie sich an die Verwaltung.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Personendaten */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="w-5 h-5" /> Persönliche Daten</CardTitle>
          <CardDescription>Ihre Stammdaten, wie sie in der Verwaltung hinterlegt sind.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Anrede</Label>
              <Input value={contact.salutation ?? ""} onChange={(e) => setContact({ ...contact, salutation: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Firma</Label>
              <Input value={contact.company_name ?? ""} onChange={(e) => setContact({ ...contact, company_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Vorname</Label>
              <Input value={contact.first_name ?? ""} onChange={(e) => setContact({ ...contact, first_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Nachname</Label>
              <Input value={contact.last_name ?? ""} onChange={(e) => setContact({ ...contact, last_name: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Straße &amp; Hausnummer</Label>
            <Input value={contact.address_street ?? ""} onChange={(e) => setContact({ ...contact, address_street: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>PLZ</Label>
              <Input value={contact.address_zip ?? ""} onChange={(e) => setContact({ ...contact, address_zip: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Ort</Label>
              <Input value={contact.address_city ?? ""} onChange={(e) => setContact({ ...contact, address_city: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveContact} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Speichern
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Telefon */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Phone className="w-5 h-5" /> Telefonnummern</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {phones.map((p) => (
            <div key={p.id} className="flex gap-2 items-center">
              <Input className="w-32" placeholder="Label" value={p.label ?? ""} onChange={(e) => updatePhone(p.id, { label: e.target.value })} onBlur={() => savePhone(p)} />
              <Input placeholder="Telefonnummer" value={p.phone_number ?? ""} onChange={(e) => updatePhone(p.id, { phone_number: e.target.value })} onBlur={() => savePhone(p)} />
              <Button variant="ghost" size="icon" onClick={() => deletePhone(p.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addPhone}><Plus className="h-4 w-4 mr-1" /> Hinzufügen</Button>
        </CardContent>
      </Card>

      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> E-Mail-Adressen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {emails.map((e) => (
            <div key={e.id} className="flex gap-2 items-center">
              <Input className="w-32" placeholder="Label" value={e.label ?? ""} onChange={(ev) => updateEmail(e.id, { label: ev.target.value })} onBlur={() => saveEmail(e)} />
              <Input placeholder="E-Mail" value={e.email ?? ""} onChange={(ev) => updateEmail(e.id, { email: ev.target.value })} onBlur={() => saveEmail(e)} />
              <Button variant="ghost" size="icon" onClick={() => deleteEmail(e.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addEmail}><Plus className="h-4 w-4 mr-1" /> Hinzufügen</Button>
        </CardContent>
      </Card>

      {/* Bank — nur 1 Eintrag, nur Kontoinhaber + IBAN */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5" /> Bankverbindung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {banks.length === 0 ? (
            <Button variant="outline" size="sm" onClick={addBank}>
              <Plus className="h-4 w-4 mr-1" /> Bankverbindung hinzufügen
            </Button>
          ) : (
            (() => {
              const b = banks[0];
              return (
                <div className="border rounded-md p-3 space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Kontoinhaber</Label>
                    <Input
                      value={b.account_holder ?? ""}
                      onChange={(e) => updateBank(b.id, { account_holder: e.target.value })}
                      placeholder="Vor- und Nachname"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">IBAN</Label>
                    <Input
                      className="font-mono"
                      value={b.iban ?? ""}
                      onChange={(e) => updateBank(b.id, { iban: e.target.value })}
                      placeholder="DE00 0000 0000 0000 0000 00"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => saveBank(b)}>Speichern</Button>
                  </div>
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>
    </div>
  );
};
