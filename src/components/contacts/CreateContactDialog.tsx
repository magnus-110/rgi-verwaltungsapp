import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";

const SALUTATIONS = [
  "Herr", "Frau", "Eheleute", "Firma", "Familie",
  "Herr Dr.", "Frau Dr.", "Herr Prof.", "Frau Prof.",
  "Herr Prof. Dr.", "Frau Prof. Dr.", "Herr/Frau"
];

const CONTACT_TYPES = [
  { value: "person", label: "Person" },
  { value: "company", label: "Firma" },
  { value: "service_provider", label: "Dienstleister" },
];

const PHONE_LABELS = ["Mobil", "Privat", "Geschäftlich", "Fax"];
const EMAIL_LABELS = ["Privat", "Geschäftlich"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface PhoneEntry { phone_number: string; label: string }
interface EmailEntry { email: string; label: string }
interface BankEntry { iban: string; bic: string; bank_name: string; account_holder: string }

function formatIban(raw: string): string {
  return raw.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}

export function CreateContactDialog({ open, onOpenChange, onCreated }: Props) {
  const [contactType, setContactType] = useState("person");
  const [companyName, setCompanyName] = useState("");
  const [shortName, setShortName] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [notes, setNotes] = useState("");

  // Person fields
  const [salutation, setSalutation] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [position, setPosition] = useState("");

  const [phones, setPhones] = useState<PhoneEntry[]>([{ phone_number: "", label: "Mobil" }]);
  const [emails, setEmails] = useState<EmailEntry[]>([{ email: "", label: "Privat" }]);
  const [banks, setBanks] = useState<BankEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const isCompanyType = contactType === "company" || contactType === "service_provider";

  const resetForm = () => {
    setContactType("person"); setCompanyName(""); setShortName("");
    setAddressStreet(""); setAddressZip(""); setAddressCity(""); setNotes("");
    setSalutation(""); setFirstName(""); setLastName(""); setPosition("");
    setPhones([{ phone_number: "", label: "Mobil" }]);
    setEmails([{ email: "", label: "Privat" }]);
    setBanks([]);
  };

  const handleSave = async () => {
    if (!lastName && !companyName) {
      toast({ title: "Fehler", description: "Name oder Firma ist erforderlich", variant: "destructive" });
      return;
    }
    setSaving(true);

    // Create contact
    const { data: contact, error } = await supabase.from("contacts").insert({
      contact_type: contactType as any,
      company_name: companyName || null,
      short_name: shortName || null,
      address_street: addressStreet || null,
      address_zip: addressZip || null,
      address_city: addressCity || null,
      notes: notes || null,
      // Keep legacy fields for compatibility
      salutation: salutation || null,
      first_name: firstName || null,
      last_name: lastName || null,
    }).select("id").single();

    if (error || !contact) {
      setSaving(false);
      toast({ title: "Fehler", description: error?.message || "Kontakt konnte nicht erstellt werden", variant: "destructive" });
      return;
    }

    // Create the first person
    const { data: person } = await supabase.from("contact_persons").insert({
      contact_id: contact.id,
      salutation: salutation || null,
      first_name: firstName || null,
      last_name: lastName || null,
      position: position || null,
      is_primary: true,
    }).select("id").single();

    const personId = person?.id;

    // Insert phones, emails, banks assigned to the person
    const validPhones = phones.filter(p => p.phone_number.trim());
    const validEmails = emails.filter(e => e.email.trim());
    const validBanks = banks.filter(b => b.iban.trim());

    await Promise.all([
      validPhones.length > 0
        ? supabase.from("contact_phones").insert(validPhones.map(p => ({ contact_id: contact.id, person_id: personId, phone_number: p.phone_number, label: p.label })))
        : Promise.resolve(),
      validEmails.length > 0
        ? supabase.from("contact_emails").insert(validEmails.map((e, i) => ({ contact_id: contact.id, person_id: personId, email: e.email, label: e.label, is_primary: i === 0 })))
        : Promise.resolve(),
      validBanks.length > 0
        ? supabase.from("contact_bank_accounts").insert(validBanks.map((b, i) => ({
            contact_id: contact.id, person_id: personId,
            iban: b.iban.replace(/\s/g, ''),
            bic: b.bic || null, bank_name: b.bank_name || null,
            account_holder: b.account_holder || null, is_default: i === 0,
          })))
        : Promise.resolve(),
    ]);

    setSaving(false);
    toast({ title: "Kontakt erstellt" });
    resetForm();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neuer Kontakt</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Typ-Auswahl */}
          <div>
            <Label className="text-xs">Adress-Typ</Label>
            <Select value={contactType} onValueChange={setContactType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTACT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Stammdaten */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stammdaten</p>
            <div>
              <Label className="text-xs">Kurzname</Label>
              <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="z.B. Müller, Max" />
            </div>
            {isCompanyType && (
              <div>
                <Label className="text-xs">Firmenname</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
            )}
          </div>

          <Separator />

          {/* Person */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {isCompanyType ? "Ansprechpartner" : "Person"}
            </p>
            <div>
              <Label className="text-xs">Anrede</Label>
              <Select value={salutation} onValueChange={setSalutation}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                <SelectContent>
                  {SALUTATIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Vorname</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Nachname</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            {isCompanyType && (
              <div>
                <Label className="text-xs">Position / Rolle</Label>
                <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="z.B. Geschäftsführer" />
              </div>
            )}
          </div>

          <Separator />

          {/* Adresse */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Adresse</p>
            <div>
              <Label className="text-xs">Straße & Hausnummer</Label>
              <Input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">PLZ</Label>
                <Input value={addressZip} onChange={(e) => setAddressZip(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Ort</Label>
                <Input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Telefon */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telefon</p>
              <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setPhones([...phones, { phone_number: "", label: "Mobil" }])}>
                <Plus className="h-3 w-3 mr-1" /> Hinzufügen
              </Button>
            </div>
            {phones.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={p.label} onValueChange={(v) => { const u = [...phones]; u[i].label = v; setPhones(u); }}>
                  <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PHONE_LABELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={p.phone_number} onChange={(e) => { const u = [...phones]; u[i].phone_number = e.target.value; setPhones(u); }} placeholder="Telefonnummer" className="flex-1" />
                {phones.length > 1 && (
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPhones(phones.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Separator />

          {/* E-Mail */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">E-Mail</p>
              <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEmails([...emails, { email: "", label: "Privat" }])}>
                <Plus className="h-3 w-3 mr-1" /> Hinzufügen
              </Button>
            </div>
            {emails.map((e, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={e.label} onValueChange={(v) => { const u = [...emails]; u[i].label = v; setEmails(u); }}>
                  <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMAIL_LABELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="email" value={e.email} onChange={(ev) => { const u = [...emails]; u[i].email = ev.target.value; setEmails(u); }} placeholder="E-Mail-Adresse" className="flex-1" />
                {emails.length > 1 && (
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEmails(emails.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Separator />

          {/* Bankverbindung */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bankverbindung</p>
              <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setBanks([...banks, { iban: "", bic: "", bank_name: "", account_holder: "" }])}>
                <Plus className="h-3 w-3 mr-1" /> Hinzufügen
              </Button>
            </div>
            {banks.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Noch keine Bankverbindung</p>
            )}
            {banks.map((b, i) => (
              <div key={i} className="bg-muted/40 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Konto {i + 1}</span>
                  <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setBanks(banks.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
                <div>
                  <Label className="text-xs">IBAN</Label>
                  <Input value={formatIban(b.iban)} onChange={(e) => { const u = [...banks]; u[i].iban = e.target.value.replace(/\s/g, ''); setBanks(u); }} placeholder="DE89 3704 0044 0532 0130 00" className="font-mono text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">BIC</Label>
                    <Input value={b.bic} onChange={(e) => { const u = [...banks]; u[i].bic = e.target.value; setBanks(u); }} className="font-mono text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Bank</Label>
                    <Input value={b.bank_name} onChange={(e) => { const u = [...banks]; u[i].bank_name = e.target.value; setBanks(u); }} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Kontoinhaber</Label>
                  <Input value={b.account_holder} onChange={(e) => { const u = [...banks]; u[i].account_holder = e.target.value; setBanks(u); }} />
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Notizen */}
          <div>
            <Label className="text-xs">Notizen</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Interne Anmerkungen..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Speichern..." : "Erstellen"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
