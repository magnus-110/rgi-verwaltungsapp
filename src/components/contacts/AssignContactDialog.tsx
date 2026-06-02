import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, User, Plus, ChevronRight, ChevronLeft, Mail, AlertCircle, Trash2, UserCog, ChevronDown } from "lucide-react";
import { CreateContactDialog } from "./CreateContactDialog";
import { UNIT_KIND_OPTIONS, type UnitKind } from "@/lib/secondaryUnits";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  onAssigned: () => void;
  existingContactIds: string[];
  managementMode?: "weg" | "rent";
  /** Wenn gesetzt: Dialog läuft im Edit-Modus für dieses Assignment (Kontakt ist fix). */
  editAssignmentId?: string | null;
}

interface ContactPerson {
  first_name: string | null;
  last_name: string | null;
  is_primary: boolean | null;
  sort_order: number | null;
}

interface ContactOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  salutation: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  hasEmail?: boolean;
  persons?: ContactPerson[];
}

interface PhoneEntry { phone_number: string; label: string }
interface EmailEntry { email: string; label: string }
interface BankEntry { iban: string; bic: string; bank_name: string; account_holder: string }

const PHONE_LABELS = ["Mobil", "Privat", "Geschäftlich", "Fax"];
const EMAIL_LABELS = ["Privat", "Geschäftlich"];

function formatIban(raw: string): string {
  return raw.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}

export function AssignContactDialog({ open, onOpenChange, buildingId, onAssigned, existingContactIds, managementMode = "weg", editAssignmentId = null }: Props) {
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"select" | "details">("select");
  const { toast } = useToast();

  // Assignment details
  const [isBeirat, setIsBeirat] = useState(false);
  const [unitNumber, setUnitNumber] = useState("");
  const [floorLocation, setFloorLocation] = useState("");
  const [addressMode, setAddressMode] = useState<"existing" | "new">("existing");

  // Unit-kind (Wohnung, Stellplatz, Keller, …) — billing_mode ist immer 'own_billing'
  const [unitKind, setUnitKind] = useState<UnitKind>("apartment");

  // Editable contact data for "new" mode
  const [editStreet, setEditStreet] = useState("");
  const [editZip, setEditZip] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editPhones, setEditPhones] = useState<PhoneEntry[]>([]);
  const [editEmails, setEditEmails] = useState<EmailEntry[]>([]);
  const [editBanks, setEditBanks] = useState<BankEntry[]>([]);

  // Invitation
  const [sendInvite, setSendInvite] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Owner change (Eigentümerwechsel) – only used in edit mode
  const [originalContactId, setOriginalContactId] = useState<string | null>(null);
  const [showChangeOwner, setShowChangeOwner] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");

  useEffect(() => {
    if (open) {
      loadContacts();
      resetForm();
      if (editAssignmentId) {
        loadAssignmentForEdit(editAssignmentId);
      }
    }
  }, [open, editAssignmentId]);

  const resetForm = () => {
    setStep("select");
    setSelectedId(null);
    setSearch("");
    setIsBeirat(false);
    setUnitNumber("");
    setFloorLocation("");
    setAddressMode("existing");
    setUnitKind("apartment");
    setEditStreet(""); setEditZip(""); setEditCity("");
    setEditPhones([]); setEditEmails([]); setEditBanks([]);
    setSendInvite(false);
  };

  const loadAssignmentForEdit = async (assignmentId: string) => {
    const { data: a, error } = await supabase
      .from("contact_building_assignments")
      .select("contact_id, unit_number, floor_location, unit_kind, role_in_building")
      .eq("id", assignmentId)
      .maybeSingle();
    if (error || !a) return;
    setSelectedId(a.contact_id);
    setUnitNumber(a.unit_number || "");
    setFloorLocation(a.floor_location || "");
    setUnitKind(((a as any).unit_kind || "apartment") as UnitKind);
    setIsBeirat((a as any).role_in_building === "beirat");
    await loadContactDetails(a.contact_id);
    setStep("details");
  };

  const loadContacts = async () => {
    const { data } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, company_name, salutation, address_street, address_zip, address_city, contact_persons(first_name, last_name, is_primary, sort_order)")
      .order("last_name");

    if (!data) { setContacts([]); return; }

    const { data: emailData } = await supabase.from("contact_emails").select("contact_id");
    const contactIdsWithEmail = new Set((emailData || []).map(e => e.contact_id));

    setContacts(data.map((c: any) => ({ ...c, persons: c.contact_persons || [], hasEmail: contactIdsWithEmail.has(c.id) })));
  };

  // Load full contact data when moving to details step
  const loadContactDetails = async (contactId: string) => {
    let contact = contacts.find(c => c.id === contactId) as ContactOption | undefined;
    if (!contact) {
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company_name, salutation, address_street, address_zip, address_city")
        .eq("id", contactId)
        .maybeSingle();
      if (data) contact = data as ContactOption;
    }
    if (!contact) return;

    // Prefill address
    setEditStreet(contact.address_street || "");
    setEditZip(contact.address_zip || "");
    setEditCity(contact.address_city || "");

    // Load phones, emails, banks
    const [phonesRes, emailsRes, banksRes] = await Promise.all([
      supabase.from("contact_phones").select("phone_number, label").eq("contact_id", contactId),
      supabase.from("contact_emails").select("email, label").eq("contact_id", contactId),
      supabase.from("contact_bank_accounts").select("iban, bic, bank_name, account_holder").eq("contact_id", contactId),
    ]);

    setEditPhones((phonesRes.data || []).map(p => ({ phone_number: p.phone_number, label: p.label || "Mobil" })));
    setEditEmails((emailsRes.data || []).map(e => ({ email: e.email, label: e.label || "Privat" })));
    setEditBanks((banksRes.data || []).map(b => ({ iban: b.iban || "", bic: b.bic || "", bank_name: b.bank_name || "", account_holder: b.account_holder || "" })));

  };

  const filtered = contacts.filter(c => {
    const term = search.toLowerCase();
    if (!term) return true;
    const personHit = (c.persons || []).some(p =>
      (p.first_name || "").toLowerCase().includes(term) ||
      (p.last_name || "").toLowerCase().includes(term)
    );
    return (c.first_name || "").toLowerCase().includes(term) ||
      (c.last_name || "").toLowerCase().includes(term) ||
      (c.company_name || "").toLowerCase().includes(term) ||
      personHit;
  });

  const getName = (c: ContactOption) => {
    if (c.company_name) return c.company_name;

    // Personen-zentrische Anzeige: alle hinterlegten Personen (z.B. Eheleute) kombinieren.
    const persons = (c.persons || [])
      .slice()
      .sort((a, b) => {
        if (!!b.is_primary !== !!a.is_primary) return (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0);
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      })
      .filter(p => p.first_name || p.last_name);

    if (persons.length >= 2) {
      // Gemeinsamer Nachname → "Thorsten und Petra Streber"
      const lastNames = persons.map(p => (p.last_name || "").trim());
      const sameLast = lastNames.every(ln => ln && ln === lastNames[0]);
      if (sameLast) {
        const firsts = persons.map(p => (p.first_name || "").trim()).filter(Boolean);
        return `${firsts.join(" und ")} ${lastNames[0]}`.trim();
      }
      // Verschiedene Nachnamen → "Thorsten Streber und Petra Müller"
      const full = persons.map(p => [p.first_name, p.last_name].filter(Boolean).join(" ").trim()).filter(Boolean);
      return full.join(" und ");
    }

    if (persons.length === 1) {
      const p = persons[0];
      return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unbenannt";
    }

    // Fallback auf Container-Felder
    return [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";
  };

  const getAddress = (c: ContactOption) => {
    const parts = [c.address_street, [c.address_zip, c.address_city].filter(Boolean).join(" ")].filter(Boolean);
    return parts.join(", ");
  };

  const selectedContact = contacts.find(c => c.id === selectedId);

  const goToDetails = async () => {
    if (!selectedId) return;
    await loadContactDetails(selectedId);
    setStep("details");
  };

  const handleAssign = async () => {
    if (!selectedId) return;
    setSaving(true);

    // If new address mode, update contact master data
    if (addressMode === "new") {
      // Update address
      await supabase.from("contacts").update({
        address_street: editStreet || null,
        address_zip: editZip || null,
        address_city: editCity || null,
      }).eq("id", selectedId);

      // Replace phones
      await supabase.from("contact_phones").delete().eq("contact_id", selectedId);
      const validPhones = editPhones.filter(p => p.phone_number.trim());
      if (validPhones.length > 0) {
        await supabase.from("contact_phones").insert(validPhones.map(p => ({ contact_id: selectedId, phone_number: p.phone_number, label: p.label })));
      }

      // Replace emails
      await supabase.from("contact_emails").delete().eq("contact_id", selectedId);
      const validEmails = editEmails.filter(e => e.email.trim());
      if (validEmails.length > 0) {
        await supabase.from("contact_emails").insert(validEmails.map((e, i) => ({ contact_id: selectedId, email: e.email, label: e.label, is_primary: i === 0 })));
      }

      // Replace banks
      await supabase.from("contact_bank_accounts").delete().eq("contact_id", selectedId);
      const validBanks = editBanks.filter(b => b.iban.trim());
      if (validBanks.length > 0) {
        await supabase.from("contact_bank_accounts").insert(validBanks.map((b, i) => ({
          contact_id: selectedId,
          iban: b.iban.replace(/\s/g, ''),
          bic: b.bic || null,
          bank_name: b.bank_name || null,
          account_holder: b.account_holder || null,
          is_default: i === 0,
        })));
      }
    }

    const roleValue = isBeirat ? 'beirat' : (managementMode === 'weg' ? 'eigentuemer' : 'mieter');

    let error: any = null;
    if (editAssignmentId) {
      const res = await supabase.from("contact_building_assignments").update({
        role_in_building: roleValue as any,
        unit_number: unitNumber || null,
        floor_location: floorLocation || null,
        unit_kind: unitKind as any,
      } as any).eq("id", editAssignmentId);
      error = res.error;
    } else {
      const res = await supabase.from("contact_building_assignments").insert({
        contact_id: selectedId,
        building_id: buildingId,
        role_in_building: roleValue as any,
        unit_number: unitNumber || null,
        floor_location: floorLocation || null,
        unit_kind: unitKind as any,
        billing_mode: 'own_billing' as any,
        parent_assignment_id: null,
      } as any);
      error = res.error;
    }

    if (error) {
      setSaving(false);
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }

    // Check if contact has email for invitation
    const hasEmail = addressMode === "new"
      ? editEmails.some(e => e.email.trim())
      : (selectedContact?.hasEmail || editEmails.some(e => e.email.trim()));

    // Bei Edit-Modus: Account/Einladung nur wenn explizit angekreuzt.
    // Bei Neu-Anlage: Account immer erstellen wenn E-Mail da, Versand nur bei sendInvite.
    if (editAssignmentId) {
      if (sendInvite && hasEmail) {
        setInviting(true);
        try {
          const { error: inviteError } = await supabase.functions.invoke("invite-contact-user", {
            body: { contact_id: selectedId, building_id: buildingId, management_mode: managementMode, send_email: true },
          });
          if (inviteError) {
            toast({ title: "Aktualisiert, aber Einladung fehlgeschlagen", description: inviteError.message, variant: "destructive" });
          } else {
            toast({ title: "Aktualisiert & Einladung gesendet" });
          }
        } catch (e) {
          toast({ title: "Aktualisiert, aber Einladung fehlgeschlagen", variant: "destructive" });
        }
        setInviting(false);
      } else {
        toast({ title: "Zuordnung aktualisiert" });
      }
    } else if (hasEmail) {
      setInviting(true);
      try {
        const { error: inviteError } = await supabase.functions.invoke("invite-contact-user", {
          body: { contact_id: selectedId, building_id: buildingId, management_mode: managementMode, send_email: sendInvite },
        });
        if (inviteError) {
          toast({ title: "Zugeordnet, aber Account-Erstellung fehlgeschlagen", description: inviteError.message, variant: "destructive" });
        } else {
          toast({ title: sendInvite ? "Kontakt zugeordnet & Einladung gesendet" : "Kontakt zugeordnet & Account erstellt" });
        }
      } catch (e) {
        toast({ title: "Zugeordnet, aber Account-Erstellung fehlgeschlagen", variant: "destructive" });
      }
      setInviting(false);
    } else {
      toast({ title: "Kontakt zugeordnet" });
    }

    setSaving(false);
    onOpenChange(false);
    onAssigned();
  };

  const isSaving = saving || inviting;
  const hasEmailForInvite = addressMode === "new"
    ? editEmails.some(e => e.email.trim())
    : selectedContact?.hasEmail;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editAssignmentId ? "Zuordnung bearbeiten" : (step === "select" ? "Kontakt zuordnen" : "Zuordnungsdetails")}
            </DialogTitle>
          </DialogHeader>

          {step === "select" && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Kontakt suchen..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="max-h-60 overflow-y-auto border rounded-md">
                {filtered.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {search ? "Keine Ergebnisse" : "Keine Kontakte vorhanden"}
                  </div>
                ) : (
                  filtered.map(c => (
                    <div
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                        selectedId === c.id ? "bg-primary/10" : "hover:bg-muted"
                      }`}
                    >
                      <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm block">{getName(c)}</span>
                        {getAddress(c) && (
                          <span className="text-xs text-muted-foreground block truncate">{getAddress(c)}</span>
                        )}
                      </div>
                      {existingContactIds.includes(c.id) && (
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">Bereits zugeordnet</Badge>
                      )}
                      {c.hasEmail && <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                    </div>
                  ))
                )}
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setShowCreate(true)}>
                <Plus className="h-3 w-3 mr-1" /> Neuen Kontakt erstellen
              </Button>
            </div>
          )}

          {step === "details" && selectedContact && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-md px-3 py-2 text-sm">
                <p className="font-medium">{getName(selectedContact)}</p>
                {getAddress(selectedContact) && (
                  <p className="text-xs text-muted-foreground">{getAddress(selectedContact)}</p>
                )}
              </div>

              {/* Unit kind */}
              <div>
                <Label className="text-xs">Art der Einheit</Label>
                <Select value={unitKind} onValueChange={(v) => setUnitKind(v as UnitKind)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_KIND_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Unit details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Einheit Nr.</Label>
                  <Input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} className="h-8 text-sm" placeholder="z.B. 3" />
                </div>
                <div>
                  <Label className="text-xs">Etage / Lage</Label>
                  <Input value={floorLocation} onChange={(e) => setFloorLocation(e.target.value)} className="h-8 text-sm" placeholder="z.B. 2. OG links" />
                </div>
              </div>

              {/* Beirat checkbox (WEG only) */}
              {managementMode === 'weg' && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="beirat-assign"
                    checked={isBeirat}
                    onCheckedChange={(v) => setIsBeirat(!!v)}
                  />
                  <Label htmlFor="beirat-assign" className="text-sm cursor-pointer">Mitglied des Verwaltungsbeirats</Label>
                </div>
              )}

              <Separator />

              {/* Address / contact data mode */}
              <div>
                <RadioGroup value={addressMode} onValueChange={(v) => setAddressMode(v as "existing" | "new")} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="existing" id="addr-existing" className="mt-0.5" />
                    <div>
                      <Label htmlFor="addr-existing" className="text-sm cursor-pointer">Bestehende Daten übernehmen</Label>
                      {getAddress(selectedContact) ? (
                        <p className="text-xs text-muted-foreground">{getAddress(selectedContact)}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Keine Adresse hinterlegt</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="new" id="addr-new" className="mt-0.5" />
                    <Label htmlFor="addr-new" className="text-sm cursor-pointer">Daten bearbeiten / ergänzen</Label>
                  </div>
                </RadioGroup>

                {addressMode === "new" && (
                  <div className="mt-4 space-y-4 pl-2">
                    {/* Address */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Adresse</p>
                      <Input value={editStreet} onChange={(e) => setEditStreet(e.target.value)} placeholder="Straße + Hausnr." className="h-8 text-sm" />
                      <div className="flex gap-2">
                        <Input value={editZip} onChange={(e) => setEditZip(e.target.value)} placeholder="PLZ" className="h-8 text-sm w-24" />
                        <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} placeholder="Ort" className="h-8 text-sm flex-1" />
                      </div>
                    </div>

                    <Separator />

                    {/* Phones */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telefon</p>
                        <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditPhones([...editPhones, { phone_number: "", label: "Mobil" }])}>
                          <Plus className="h-3 w-3 mr-1" /> Neu
                        </Button>
                      </div>
                      {editPhones.length === 0 && <p className="text-xs text-muted-foreground italic">Keine Telefonnummer</p>}
                      {editPhones.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Select value={p.label} onValueChange={(v) => { const u = [...editPhones]; u[i].label = v; setEditPhones(u); }}>
                            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PHONE_LABELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input
                            value={p.phone_number}
                            onChange={(e) => { const u = [...editPhones]; u[i].phone_number = e.target.value; setEditPhones(u); }}
                            placeholder="Nummer"
                            className="flex-1 h-8 text-sm"
                          />
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditPhones(editPhones.filter((_, j) => j !== i))}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <Separator />

                    {/* Emails */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">E-Mail</p>
                        <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditEmails([...editEmails, { email: "", label: "Privat" }])}>
                          <Plus className="h-3 w-3 mr-1" /> Neu
                        </Button>
                      </div>
                      {editEmails.length === 0 && <p className="text-xs text-muted-foreground italic">Keine E-Mail</p>}
                      {editEmails.map((e, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Select value={e.label} onValueChange={(v) => { const u = [...editEmails]; u[i].label = v; setEditEmails(u); }}>
                            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {EMAIL_LABELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input
                            type="email"
                            value={e.email}
                            onChange={(ev) => { const u = [...editEmails]; u[i].email = ev.target.value; setEditEmails(u); }}
                            placeholder="E-Mail"
                            className="flex-1 h-8 text-sm"
                          />
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditEmails(editEmails.filter((_, j) => j !== i))}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <Separator />

                    {/* Bank */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bankverbindung</p>
                        <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditBanks([...editBanks, { iban: "", bic: "", bank_name: "", account_holder: "" }])}>
                          <Plus className="h-3 w-3 mr-1" /> Neu
                        </Button>
                      </div>
                      {editBanks.length === 0 && <p className="text-xs text-muted-foreground italic">Keine Bankverbindung</p>}
                      {editBanks.map((b, i) => (
                        <div key={i} className="bg-muted/30 rounded-lg p-2 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Konto {i + 1}</span>
                            <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditBanks(editBanks.filter((_, j) => j !== i))}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                          <Input
                            value={formatIban(b.iban)}
                            onChange={(e) => { const u = [...editBanks]; u[i].iban = e.target.value.replace(/\s/g, ''); setEditBanks(u); }}
                            placeholder="IBAN"
                            className="h-8 text-sm font-mono"
                          />
                          <div className="grid grid-cols-2 gap-1.5">
                            <Input
                              value={b.bic}
                              onChange={(e) => { const u = [...editBanks]; u[i].bic = e.target.value; setEditBanks(u); }}
                              placeholder="BIC"
                              className="h-8 text-xs font-mono"
                            />
                            <Input
                              value={b.bank_name}
                              onChange={(e) => { const u = [...editBanks]; u[i].bank_name = e.target.value; setEditBanks(u); }}
                              placeholder="Bank"
                              className="h-8 text-xs"
                            />
                          </div>
                          <Input
                            value={b.account_holder}
                            onChange={(e) => { const u = [...editBanks]; u[i].account_holder = e.target.value; setEditBanks(u); }}
                            placeholder="Kontoinhaber"
                            className="h-8 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Invitation option */}
              <div>
                {hasEmailForInvite ? (
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="send-invite"
                      checked={sendInvite}
                      onCheckedChange={(v) => setSendInvite(!!v)}
                      className="mt-0.5"
                    />
                    <div>
                      <Label htmlFor="send-invite" className="text-sm cursor-pointer">
                        {editAssignmentId ? "Anmeldedaten erneut senden" : "Einladung mit Zugangsdaten senden"}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Login-Daten werden per E-Mail verschickt
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <p className="text-xs">
                      Keine E-Mail hinterlegt – Einladung nicht möglich.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            {step === "select" && (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
                <Button onClick={goToDetails} disabled={!selectedId}>
                  Weiter <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            )}
            {step === "details" && (
              <>
                {editAssignmentId ? (
                  <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                    Abbrechen
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setStep("select")} disabled={isSaving}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Zurück
                  </Button>
                )}
                <Button onClick={handleAssign} disabled={isSaving}>
                  {isSaving
                    ? "..."
                    : editAssignmentId
                      ? (sendInvite && hasEmailForInvite ? "Speichern & Einladen" : "Speichern")
                      : (sendInvite && hasEmailForInvite ? "Zuordnen & Einladen" : "Zuordnen")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateContactDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => { loadContacts(); setShowCreate(false); }}
      />
    </>
  );
}
