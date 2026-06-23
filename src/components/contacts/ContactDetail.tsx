import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  Phone,
  Mail,
  Landmark,
  Users,
  ChevronDown,
  ChevronRight,
  FileText,
  Wrench,
  CalendarIcon,
  CheckCircle2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ContactBuildingAssignments } from "./ContactBuildingAssignments";
import { ContactDocumentsSection } from "./ContactDocumentsSection";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  SERVICE_PROVIDER_CATEGORIES,
  SERVICE_PROVIDER_GROUPS,
  type ServiceProviderGroup,
} from "@/lib/serviceProviderCategories";
import { Star, Siren, MapPin, Loader2 } from "lucide-react";
import type { Contact } from "@/pages/Contacts";
import { toTelHref } from "@/lib/phone";

const SALUTATIONS = [
  "Herr",
  "Frau",
  "Eheleute",
  "Firma",
  "Familie",
  "Herr Dr.",
  "Frau Dr.",
  "Herr Prof.",
  "Frau Prof.",
  "Herr Prof. Dr.",
  "Frau Prof. Dr.",
  "Herr/Frau",
];

const CONTACT_TYPES = [
  { value: "person", label: "Person" },
  { value: "company", label: "Firma" },
  { value: "service_provider", label: "Dienstleister" },
];

const PHONE_LABELS = ["Mobil", "Festnetz", "Büro", "Fax"];
const EMAIL_LABELS = ["Privat", "Geschäftlich", "Sonstige"];

interface LocalPhone {
  _localId: string;
  id?: string;
  phone_number: string;
  label: string;
  person_id?: string | null;
  _deleted?: boolean;
}
interface LocalEmail {
  _localId: string;
  id?: string;
  email: string;
  label: string;
  is_primary: boolean;
  person_id?: string | null;
  _deleted?: boolean;
}
interface LocalBankAccount {
  _localId: string;
  id?: string;
  account_holder: string | null;
  bank_name: string | null;
  iban: string | null;
  bic: string | null;
  sepa_mandate_ref: string | null;
  sepa_mandate_date: string | null;
  is_default: boolean;
  person_id?: string | null;
  _deleted?: boolean;
}
interface LocalPerson {
  _localId: string;
  id?: string;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  notes: string | null;
  is_primary: boolean;
  _deleted?: boolean;
  // Local sub-collections
  phones: LocalPhone[];
  emails: LocalEmail[];
  banks: LocalBankAccount[];
}

function isValidIban(iban: string): boolean {
  if (!iban || iban.trim() === "") return true;
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleaned);
}

function formatIban(value: string): string {
  const cleaned = value.replace(/\s/g, "").toUpperCase();
  return cleaned.replace(/(.{4})/g, "$1 ").trim();
}

let localIdCounter = 0;
function nextLocalId() {
  return `_new_${++localIdCounter}_${Date.now()}`;
}

interface Props {
  contact: Contact;
  onBack?: () => void;
  onUpdate: () => void;
  onDeleted?: () => void;
}

export function ContactDetail({ contact, onBack, onUpdate, onDeleted }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...contact });
  const [persons, setPersons] = useState<LocalPerson[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ibanErrors, setIbanErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [openPersons, setOpenPersons] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setForm({ ...contact });
    setIsDirty(false);
    setIbanErrors({});
    loadRelated();
  }, [contact.id]);

  const loadRelated = async () => {
    const [personsRes, phonesRes, emailsRes, banksRes] = await Promise.all([
      supabase.from("contact_persons").select("*").eq("contact_id", contact.id).order("sort_order"),
      supabase.from("contact_phones").select("*").eq("contact_id", contact.id).order("created_at"),
      supabase.from("contact_emails").select("*").eq("contact_id", contact.id).order("created_at"),
      supabase.from("contact_bank_accounts").select("*").eq("contact_id", contact.id).order("created_at"),
    ]);

    const personsData = (personsRes.data || []).map((p: any) => ({
      ...p,
      _localId: p.id,
      phones: (phonesRes.data || [])
        .filter((ph: any) => ph.person_id === p.id)
        .map((ph: any) => ({ ...ph, _localId: ph.id })),
      emails: (emailsRes.data || [])
        .filter((em: any) => em.person_id === p.id)
        .map((em: any) => ({ ...em, _localId: em.id })),
      banks: (banksRes.data || [])
        .filter((bk: any) => bk.person_id === p.id)
        .map((bk: any) => ({ ...bk, _localId: bk.id })),
    }));

    setPersons(personsData);

    // Auto-open first person
    if (personsData.length > 0) {
      setOpenPersons({ [personsData[0]._localId]: true });
    }
  };

  const markDirty = useCallback(() => setIsDirty(true), []);

  // Person-level mutations
  const addPerson = () => {
    const newPerson: LocalPerson = {
      _localId: nextLocalId(),
      salutation: null,
      first_name: null,
      last_name: null,
      position: null,
      notes: null,
      is_primary: persons.filter((p) => !p._deleted).length === 0,
      phones: [{ _localId: nextLocalId(), phone_number: "", label: "Mobil" }],
      emails: [{ _localId: nextLocalId(), email: "", label: "Privat", is_primary: true }],
      banks: [],
    };
    setPersons((prev) => [...prev, newPerson]);
    setOpenPersons((prev) => ({ ...prev, [newPerson._localId]: true }));
    markDirty();
  };

  const updatePerson = (localId: string, field: string, value: any) => {
    setPersons((prev) => prev.map((p) => (p._localId === localId ? { ...p, [field]: value } : p)));
    markDirty();
  };

  const removePerson = (localId: string) => {
    setPersons((prev) => prev.map((p) => (p._localId === localId ? { ...p, _deleted: true } : p)));
    markDirty();
  };

  const setPrimaryPerson = (localId: string) => {
    setPersons((prev) => prev.map((p) => ({ ...p, is_primary: p._localId === localId })));
    markDirty();
  };

  // Sub-collection mutations for a person
  const addPhoneToPerson = (personLocalId: string) => {
    setPersons((prev) =>
      prev.map((p) =>
        p._localId === personLocalId
          ? { ...p, phones: [...p.phones, { _localId: nextLocalId(), phone_number: "", label: "Mobil" }] }
          : p,
      ),
    );
    markDirty();
  };

  const updatePhoneInPerson = (personLocalId: string, phoneLocalId: string, field: string, value: string) => {
    setPersons((prev) =>
      prev.map((p) =>
        p._localId === personLocalId
          ? { ...p, phones: p.phones.map((ph) => (ph._localId === phoneLocalId ? { ...ph, [field]: value } : ph)) }
          : p,
      ),
    );
    markDirty();
  };

  const removePhoneFromPerson = (personLocalId: string, phoneLocalId: string) => {
    setPersons((prev) =>
      prev.map((p) =>
        p._localId === personLocalId
          ? { ...p, phones: p.phones.map((ph) => (ph._localId === phoneLocalId ? { ...ph, _deleted: true } : ph)) }
          : p,
      ),
    );
    markDirty();
  };

  const addEmailToPerson = (personLocalId: string) => {
    setPersons((prev) =>
      prev.map((p) =>
        p._localId === personLocalId
          ? { ...p, emails: [...p.emails, { _localId: nextLocalId(), email: "", label: "Privat", is_primary: false }] }
          : p,
      ),
    );
    markDirty();
  };

  const updateEmailInPerson = (personLocalId: string, emailLocalId: string, field: string, value: any) => {
    setPersons((prev) =>
      prev.map((p) =>
        p._localId === personLocalId
          ? { ...p, emails: p.emails.map((em) => (em._localId === emailLocalId ? { ...em, [field]: value } : em)) }
          : p,
      ),
    );
    markDirty();
  };

  const removeEmailFromPerson = (personLocalId: string, emailLocalId: string) => {
    setPersons((prev) =>
      prev.map((p) =>
        p._localId === personLocalId
          ? { ...p, emails: p.emails.map((em) => (em._localId === emailLocalId ? { ...em, _deleted: true } : em)) }
          : p,
      ),
    );
    markDirty();
  };

  const addBankToPerson = (personLocalId: string) => {
    setPersons((prev) =>
      prev.map((p) =>
        p._localId === personLocalId
          ? {
              ...p,
              banks: [
                ...p.banks,
                {
                  _localId: nextLocalId(),
                  account_holder: null,
                  bank_name: null,
                  iban: null,
                  bic: null,
                  sepa_mandate_ref: null,
                  sepa_mandate_date: null,
                  is_default: false,
                },
              ],
            }
          : p,
      ),
    );
    markDirty();
  };

  const updateBankInPerson = (personLocalId: string, bankLocalId: string, field: string, value: any) => {
    setPersons((prev) =>
      prev.map((p) =>
        p._localId === personLocalId
          ? { ...p, banks: p.banks.map((bk) => (bk._localId === bankLocalId ? { ...bk, [field]: value } : bk)) }
          : p,
      ),
    );
    if (field === "iban") {
      const ibanValue = value as string;
      const key = `${personLocalId}_${bankLocalId}`;
      if (ibanValue && !isValidIban(ibanValue)) {
        setIbanErrors((prev) => ({ ...prev, [key]: "Ungültiges IBAN-Format" }));
      } else {
        setIbanErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    }
    markDirty();
  };

  const removeBankFromPerson = (personLocalId: string, bankLocalId: string) => {
    setPersons((prev) =>
      prev.map((p) =>
        p._localId === personLocalId
          ? { ...p, banks: p.banks.map((bk) => (bk._localId === bankLocalId ? { ...bk, _deleted: true } : bk)) }
          : p,
      ),
    );
    markDirty();
  };

  const saveAll = async () => {
    // Validate IBANs
    const newErrors: Record<string, string> = {};
    for (const p of persons.filter((p) => !p._deleted)) {
      for (const b of p.banks.filter((b) => !b._deleted)) {
        if (b.iban && !isValidIban(b.iban)) {
          newErrors[`${p._localId}_${b._localId}`] = "Ungültiges IBAN-Format";
        }
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
      const { error: contactError } = await supabase
        .from("contacts")
        .update({
          short_name: form.short_name,
          company_name: form.company_name,
          address_street: form.address_street,
          address_zip: form.address_zip,
          address_city: form.address_city,
          notes: form.notes,
          contact_type: form.contact_type as any,
          is_service_provider_pool: !!form.is_service_provider_pool,
          service_provider_categories: form.is_service_provider_pool ? (form.service_provider_categories ?? []) : [],
          trade_notes: (form as any).trade_notes ?? null,
          rating: (form as any).rating ?? null,
          last_hired_at: (form as any).last_hired_at ?? null,
          is_emergency_service: !!(form as any).is_emergency_service,
          address_lat: (form as any).address_lat ?? null,
          address_lon: (form as any).address_lon ?? null,
        } as any)
        .eq("id", contact.id);
      if (contactError) throw contactError;

      // 2. Save persons and their sub-collections
      for (const p of persons) {
        if (p._deleted && p.id) {
          // Delete person (cascade deletes phones/emails/banks with person_id)
          await supabase.from("contact_persons").delete().eq("id", p.id);
          continue;
        }
        if (p._deleted) continue;

        let personId = p.id;
        if (!personId) {
          // Create new person
          const { data, error } = await supabase
            .from("contact_persons")
            .insert({
              contact_id: contact.id,
              salutation: p.salutation,
              first_name: p.first_name,
              last_name: p.last_name,
              position: p.position,
              notes: p.notes,
              is_primary: p.is_primary,
            })
            .select("id")
            .single();
          if (error) throw error;
          personId = data.id;
        } else {
          // Update existing person
          await supabase
            .from("contact_persons")
            .update({
              salutation: p.salutation,
              first_name: p.first_name,
              last_name: p.last_name,
              position: p.position,
              notes: p.notes,
              is_primary: p.is_primary,
            })
            .eq("id", personId);
        }

        // Save phones for this person
        for (const ph of p.phones) {
          if (ph._deleted && ph.id) {
            await supabase.from("contact_phones").delete().eq("id", ph.id);
          } else if (!ph._deleted && !ph.id && ph.phone_number.trim()) {
            await supabase
              .from("contact_phones")
              .insert({ contact_id: contact.id, person_id: personId, phone_number: ph.phone_number, label: ph.label });
          } else if (!ph._deleted && ph.id) {
            await supabase
              .from("contact_phones")
              .update({ phone_number: ph.phone_number, label: ph.label, person_id: personId })
              .eq("id", ph.id);
          }
        }

        // Save emails for this person
        for (const em of p.emails) {
          if (em._deleted && em.id) {
            await supabase.from("contact_emails").delete().eq("id", em.id);
          } else if (!em._deleted && !em.id && em.email.trim()) {
            await supabase
              .from("contact_emails")
              .insert({
                contact_id: contact.id,
                person_id: personId,
                email: em.email,
                label: em.label,
                is_primary: em.is_primary,
              });
          } else if (!em._deleted && em.id) {
            await supabase
              .from("contact_emails")
              .update({ email: em.email, label: em.label, is_primary: em.is_primary, person_id: personId })
              .eq("id", em.id);
          }
        }

        // Save banks for this person
        for (const bk of p.banks) {
          if (bk._deleted && bk.id) {
            await supabase.from("contact_bank_accounts").delete().eq("id", bk.id);
          } else if (!bk._deleted && !bk.id) {
            await supabase.from("contact_bank_accounts").insert({
              contact_id: contact.id,
              person_id: personId,
              account_holder: bk.account_holder,
              bank_name: bk.bank_name,
              iban: bk.iban ? bk.iban.replace(/\s/g, "").toUpperCase() : null,
              bic: bk.bic,
              is_default: bk.is_default,
              sepa_mandate_date: bk.sepa_mandate_date,
              sepa_mandate_ref: bk.sepa_mandate_ref || null,
            });
          } else if (!bk._deleted && bk.id) {
            await supabase
              .from("contact_bank_accounts")
              .update({
                account_holder: bk.account_holder,
                bank_name: bk.bank_name,
                iban: bk.iban ? bk.iban.replace(/\s/g, "").toUpperCase() : null,
                bic: bk.bic,
                is_default: bk.is_default,
                person_id: personId,
                sepa_mandate_date: bk.sepa_mandate_date,
                sepa_mandate_ref: bk.sepa_mandate_ref || null,
              })
              .eq("id", bk.id);
          }
        }
      }

      toast({ title: "Gespeichert" });
      setIsDirty(false);
      onUpdate();
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

  const displayName =
    form.company_name || form.short_name || [form.first_name, form.last_name].filter(Boolean).join(" ") || "Unbenannt";
  const visiblePersons = persons.filter((p) => !p._deleted);
  const hasIbanErrors = Object.keys(ibanErrors).length > 0;
  const isCompanyType = form.contact_type === "company" || form.contact_type === "service_provider";

  const togglePersonOpen = (localId: string) => {
    setOpenPersons((prev) => ({ ...prev, [localId]: !prev[localId] }));
  };

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
          {isDirty && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Ungespeichert</span>
          )}
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
                  <strong>{displayName}</strong> wird unwiderruflich gelöscht.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteContact}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Löscht..." : "Endgültig löschen"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={saveAll} disabled={saving || hasIbanErrors} size="sm">
            <Save className="h-4 w-4 mr-2" />
            {saving ? "..." : "Speichern"}
          </Button>
        </div>
      </div>

      <div className="p-6">
        <Tabs defaultValue="personen">
          <TabsList variant="segment" className="w-full grid grid-cols-4">
            <TabsTrigger variant="segment" value="stammdaten">
              Stammdaten
            </TabsTrigger>
            <TabsTrigger variant="segment" value="personen" className="gap-1">
              <Users className="h-3.5 w-3.5" />
              Personen {visiblePersons.length > 0 && `(${visiblePersons.length})`}
            </TabsTrigger>
            <TabsTrigger variant="segment" value="gebaeude">
              Gebäude
            </TabsTrigger>
            <TabsTrigger variant="segment" value="dokumente" className="gap-1">
              <FileText className="h-3.5 w-3.5" />
              Dokumente
            </TabsTrigger>
          </TabsList>

          {/* Stammdaten Tab */}
          <TabsContent value="stammdaten" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Adress-Typ</Label>
                <Select
                  value={form.contact_type || "person"}
                  onValueChange={(v) => {
                    setForm({ ...form, contact_type: v });
                    markDirty();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Kurzname</Label>
                <Input
                  value={form.short_name || ""}
                  onChange={(e) => {
                    setForm({ ...form, short_name: e.target.value });
                    markDirty();
                  }}
                />
              </div>
              {isCompanyType && (
                <div className="md:col-span-2">
                  <Label>Firmenname</Label>
                  <Input
                    value={form.company_name || ""}
                    onChange={(e) => {
                      setForm({ ...form, company_name: e.target.value });
                      markDirty();
                    }}
                  />
                </div>
              )}
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">Adresse</h3>
                {(() => {
                  const q = [form.address_street, [form.address_zip, form.address_city].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(", ");
                  return q ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="In Karte öffnen"
                      className="text-primary hover:text-primary/80"
                    >
                      <MapPin className="h-4 w-4" />
                    </a>
                  ) : null;
                })()}
              </div>
              <div className="space-y-3">
                <div>
                  <Label>Straße & Hausnummer</Label>
                  <Input
                    value={form.address_street || ""}
                    onChange={(e) => {
                      setForm({ ...form, address_street: e.target.value });
                      markDirty();
                    }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>PLZ</Label>
                    <Input
                      value={form.address_zip || ""}
                      onChange={(e) => {
                        setForm({ ...form, address_zip: e.target.value });
                        markDirty();
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Ort</Label>
                    <Input
                      value={form.address_city || ""}
                      onChange={(e) => {
                        setForm({ ...form, address_city: e.target.value });
                        markDirty();
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <Label>Notizen</Label>
              <Textarea
                value={form.notes || ""}
                onChange={(e) => {
                  setForm({ ...form, notes: e.target.value });
                  markDirty();
                }}
                rows={4}
              />
            </div>

            <ServiceProviderSection form={form} setForm={setForm} markDirty={markDirty} toast={toast} />
          </TabsContent>

          {/* Personen Tab */}
          <TabsContent value="personen" className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4" /> Personen
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Jede Person hat eigene Kontaktdaten und Bankverbindungen
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={addPerson}>
                <Plus className="h-3 w-3 mr-1" />
                Person hinzufügen
              </Button>
            </div>
            {visiblePersons.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">
                Keine Personen hinterlegt. Fügen Sie mindestens eine Person hinzu.
              </p>
            )}
            {visiblePersons.map((p) => {
              const personName = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Neue Person";
              const isOpen = openPersons[p._localId] ?? false;
              const visiblePhones = p.phones.filter((ph) => !ph._deleted);
              const visibleEmails = p.emails.filter((em) => !em._deleted);
              const visibleBanks = p.banks.filter((bk) => !bk._deleted);

              return (
                <Card key={p._localId} className={p.is_primary ? "border-primary/50" : ""}>
                  <Collapsible open={isOpen} onOpenChange={() => togglePersonOpen(p._localId)}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 rounded-t-lg">
                        <div className="flex items-center gap-2">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-sm font-medium">{personName}</span>
                          {p.position && <span className="text-xs text-muted-foreground">({p.position})</span>}
                          {p.is_primary && (
                            <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                              Hauptkontakt
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {!p.is_primary && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px] px-2"
                              onClick={() => setPrimaryPerson(p._localId)}
                            >
                              Als Hauptkontakt
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7">
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Person löschen?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Möchten Sie {p.first_name || ""} {p.last_name || "diese Person"} wirklich löschen?
                                  Alle zugehörigen Kontaktdaten (Telefon, E-Mail, Bankverbindung) werden ebenfalls
                                  entfernt.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removePerson(p._localId)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Löschen
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-4 space-y-4">
                        {/* Person base data */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs">Anrede</Label>
                            <Select
                              value={p.salutation || ""}
                              onValueChange={(v) => updatePerson(p._localId, "salutation", v)}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Anrede" />
                              </SelectTrigger>
                              <SelectContent>
                                {SALUTATIONS.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Vorname</Label>
                            <Input
                              className="h-8 text-sm"
                              value={p.first_name || ""}
                              onChange={(e) => updatePerson(p._localId, "first_name", e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Nachname</Label>
                            <Input
                              className="h-8 text-sm"
                              value={p.last_name || ""}
                              onChange={(e) => updatePerson(p._localId, "last_name", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Position / Rolle</Label>
                            <Input
                              className="h-8 text-sm"
                              value={p.position || ""}
                              onChange={(e) => updatePerson(p._localId, "position", e.target.value)}
                              placeholder="z.B. Geschäftsführer"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Notizen</Label>
                            <Input
                              className="h-8 text-sm"
                              value={p.notes || ""}
                              onChange={(e) => updatePerson(p._localId, "notes", e.target.value)}
                            />
                          </div>
                        </div>

                        {/* Phones section */}
                        <div className="border-t pt-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" /> Telefon
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() => addPhoneToPerson(p._localId)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Hinzufügen
                            </Button>
                          </div>
                          {visiblePhones.length === 0 && (
                            <p className="text-xs text-muted-foreground">Keine Telefonnummern</p>
                          )}
                          {visiblePhones.map((ph) => (
                            <div key={ph._localId} className="flex items-center gap-2 mb-1.5">
                              <Select
                                value={ph.label || "Mobil"}
                                onValueChange={(v) => updatePhoneInPerson(p._localId, ph._localId, "label", v)}
                              >
                                <SelectTrigger className="w-24 h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {PHONE_LABELS.map((l) => (
                                    <SelectItem key={l} value={l}>
                                      {l}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                className="h-7 text-xs flex-1"
                                value={ph.phone_number}
                                onChange={(e) =>
                                  updatePhoneInPerson(p._localId, ph._localId, "phone_number", e.target.value)
                                }
                                placeholder="Nummer"
                              />
                              {toTelHref(ph.phone_number) && (
                                <a
                                  href={toTelHref(ph.phone_number)!}
                                  title="Anrufen (PhonerLite)"
                                  className="flex-shrink-0"
                                >
                                  <Phone className="h-3.5 w-3.5 text-primary hover:text-primary/80 cursor-pointer" />
                                </a>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => removePhoneFromPerson(p._localId, ph._localId)}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        {/* Emails section */}
                        <div className="border-t pt-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" /> E-Mail
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() => addEmailToPerson(p._localId)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Hinzufügen
                            </Button>
                          </div>
                          {visibleEmails.length === 0 && (
                            <p className="text-xs text-muted-foreground">Keine E-Mail-Adressen</p>
                          )}
                          {visibleEmails.map((em) => (
                            <div key={em._localId} className="flex items-center gap-2 mb-1.5">
                              <Select
                                value={em.label || "Privat"}
                                onValueChange={(v) => updateEmailInPerson(p._localId, em._localId, "label", v)}
                              >
                                <SelectTrigger className="w-24 h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {EMAIL_LABELS.map((l) => (
                                    <SelectItem key={l} value={l}>
                                      {l}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                className="h-7 text-xs flex-1"
                                type="email"
                                value={em.email}
                                onChange={(e) => updateEmailInPerson(p._localId, em._localId, "email", e.target.value)}
                                placeholder="E-Mail"
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => removeEmailFromPerson(p._localId, em._localId)}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        {/* Bank section */}
                        <div className="border-t pt-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                              <Landmark className="h-3 w-3" /> Bankverbindungen
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() => addBankToPerson(p._localId)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Hinzufügen
                            </Button>
                          </div>
                          {visibleBanks.length === 0 && (
                            <p className="text-xs text-muted-foreground">Keine Bankverbindungen</p>
                          )}
                          {visibleBanks.map((bk) => {
                            const ibanKey = `${p._localId}_${bk._localId}`;
                            return (
                              <div key={bk._localId} className="bg-muted/30 rounded-md p-3 mb-2 space-y-2">
                                <div className="flex justify-between">
                                  <span className="text-xs text-muted-foreground">Konto</span>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-5 w-5"
                                    onClick={() => removeBankFromPerson(p._localId, bk._localId)}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-xs">IBAN</Label>
                                    <Input
                                      className={`h-7 text-xs font-mono ${ibanErrors[ibanKey] ? "border-destructive" : ""}`}
                                      value={bk.iban ? formatIban(bk.iban) : ""}
                                      onChange={(e) =>
                                        updateBankInPerson(p._localId, bk._localId, "iban", e.target.value)
                                      }
                                      placeholder="DE89 3704 ..."
                                    />
                                    {ibanErrors[ibanKey] && (
                                      <p className="text-[10px] text-destructive mt-0.5">{ibanErrors[ibanKey]}</p>
                                    )}
                                  </div>
                                  <div>
                                    <Label className="text-xs">BIC</Label>
                                    <Input
                                      className="h-7 text-xs font-mono"
                                      value={bk.bic || ""}
                                      onChange={(e) =>
                                        updateBankInPerson(p._localId, bk._localId, "bic", e.target.value)
                                      }
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Bank</Label>
                                    <Input
                                      className="h-7 text-xs"
                                      value={bk.bank_name || ""}
                                      onChange={(e) =>
                                        updateBankInPerson(p._localId, bk._localId, "bank_name", e.target.value)
                                      }
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Kontoinhaber</Label>
                                    <Input
                                      className="h-7 text-xs"
                                      value={bk.account_holder || ""}
                                      onChange={(e) =>
                                        updateBankInPerson(p._localId, bk._localId, "account_holder", e.target.value)
                                      }
                                    />
                                  </div>
                                </div>
                                <div className="border-t pt-2 mt-1 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        id={`sepa-${bk._localId}`}
                                        checked={!!bk.sepa_mandate_date}
                                        onCheckedChange={(checked) => {
                                          updateBankInPerson(
                                            p._localId,
                                            bk._localId,
                                            "sepa_mandate_date",
                                            checked ? new Date().toISOString().slice(0, 10) : null,
                                          );
                                        }}
                                      />
                                      <Label
                                        htmlFor={`sepa-${bk._localId}`}
                                        className="text-xs cursor-pointer flex items-center gap-1"
                                      >
                                        {bk.sepa_mandate_date && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                                        SEPA-Mandat erteilt
                                      </Label>
                                    </div>
                                    {bk.sepa_mandate_date && (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                            <CalendarIcon className="h-3 w-3" />
                                            {new Date(bk.sepa_mandate_date).toLocaleDateString("de-DE")}
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="end">
                                          <Calendar
                                            mode="single"
                                            selected={bk.sepa_mandate_date ? new Date(bk.sepa_mandate_date) : undefined}
                                            onSelect={(d) =>
                                              updateBankInPerson(
                                                p._localId,
                                                bk._localId,
                                                "sepa_mandate_date",
                                                d ? d.toISOString().slice(0, 10) : null,
                                              )
                                            }
                                            initialFocus
                                            className={cn("p-3 pointer-events-auto")}
                                          />
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                  </div>
                                  {bk.sepa_mandate_date && (
                                    <>
                                      <div>
                                        <Label className="text-xs">SEPA-Mandatsreferenz</Label>
                                        <Input
                                          className="h-7 text-xs font-mono"
                                          value={bk.sepa_mandate_ref || ""}
                                          onChange={(e) =>
                                            updateBankInPerson(
                                              p._localId,
                                              bk._localId,
                                              "sepa_mandate_ref",
                                              e.target.value,
                                            )
                                          }
                                          placeholder="wird automatisch vergeben, z. B. RGI-SEPA-000123"
                                        />
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                          Leer lassen für automatische Vergabe beim Speichern.
                                        </p>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground">
                                        erteilt am{" "}
                                        <span className="font-medium text-foreground">
                                          {new Date(bk.sepa_mandate_date).toLocaleDateString("de-DE")}
                                        </span>
                                      </p>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </TabsContent>

          {/* Gebäude Tab */}
          <TabsContent value="gebaeude" className="mt-4">
            <ContactBuildingAssignments contactId={contact.id} />
          </TabsContent>

          {/* Dokumente Tab */}
          <TabsContent value="dokumente" className="mt-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" /> Verträge & Dokumente
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Alle Dokumente, die dieser Person/Firma in der Stammakte zugeordnet oder freigegeben sind.
              </p>
            </div>
            <ContactDocumentsSection contactId={contact.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ServiceProviderSection({
  form,
  setForm,
  markDirty,
  toast,
}: {
  form: any;
  setForm: (v: any) => void;
  markDirty: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [catSearch, setCatSearch] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  const grouped = (() => {
    const term = catSearch.trim().toLowerCase();
    const out: Record<ServiceProviderGroup, typeof SERVICE_PROVIDER_CATEGORIES> = {} as any;
    SERVICE_PROVIDER_CATEGORIES.forEach((c) => {
      if (term && !c.label.toLowerCase().includes(term)) return;
      (out[c.group] ||= []).push(c);
    });
    return out;
  })();

  const toggleCat = (id: string) => {
    const current: string[] = form.service_provider_categories ?? [];
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    setForm({ ...form, service_provider_categories: next });
    markDirty();
  };

  const geocode = async () => {
    const parts = [form.address_street, form.address_zip, form.address_city, "Germany"].filter(Boolean).join(", ");
    if (!parts) {
      toast({ title: "Keine Adresse", description: "Bitte erst Straße/PLZ/Ort eintragen.", variant: "destructive" });
      return;
    }
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(parts)}`;
      const res = await fetch(url, { headers: { "Accept-Language": "de" } });
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        toast({
          title: "Nicht gefunden",
          description: "Adresse konnte nicht geokodiert werden.",
          variant: "destructive",
        });
        return;
      }
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      setForm({ ...form, address_lat: lat, address_lon: lon });
      markDirty();
      toast({ title: "Geokodiert", description: `${lat.toFixed(5)}, ${lon.toFixed(5)}` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Geocoding fehlgeschlagen", variant: "destructive" });
    } finally {
      setGeocoding(false);
    }
  };

  return (
    <div className="border-t border-border pt-4 mt-4 space-y-4">
      <div className="flex items-start gap-3">
        <Checkbox
          id="sp-pool"
          checked={!!form.is_service_provider_pool}
          onCheckedChange={(v) => {
            setForm({ ...form, is_service_provider_pool: !!v });
            markDirty();
          }}
        />
        <div className="flex-1">
          <Label htmlFor="sp-pool" className="flex items-center gap-2 cursor-pointer">
            <Wrench className="h-4 w-4 text-primary" />
            Firma / Dienstleister
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            Aktivieren, um Gewerke zuzuordnen und in der Adresssuche zu finden.
          </p>
        </div>
      </div>

      {form.is_service_provider_pool && (
        <div className="ml-7 space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Gewerke (Mehrfachauswahl)</Label>
            <Input
              placeholder="Gewerk suchen…"
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              className="h-8 text-xs mt-1 mb-2"
            />
            <div className="space-y-2">
              {(Object.keys(SERVICE_PROVIDER_GROUPS) as ServiceProviderGroup[]).map((g) => {
                const items = grouped[g];
                if (!items || items.length === 0) return null;
                return (
                  <div key={g}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      {SERVICE_PROVIDER_GROUPS[g]}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((cat) => {
                        const selected = (form.service_provider_categories ?? []).includes(cat.id);
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => toggleCat(cat.id)}
                            className={`px-2.5 py-1 rounded-full border text-xs transition ${
                              selected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/50"
                            }`}
                          >
                            {cat.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Notizen zu Gewerken / Spezialitäten</Label>
            <Textarea
              value={form.trade_notes || ""}
              onChange={(e) => {
                setForm({ ...form, trade_notes: e.target.value });
                markDirty();
              }}
              rows={3}
              placeholder="z. B. macht auch Notdienst, faire Preise, spricht Italienisch…"
            />
            <p className="text-xs text-muted-foreground mt-1">Wird in der KI-Suche und Volltextsuche berücksichtigt.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Bewertung</Label>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setForm({ ...form, rating: form.rating === n ? null : n });
                      markDirty();
                    }}
                    className="p-1"
                  >
                    <Star
                      className={`h-5 w-5 ${form.rating && n <= form.rating ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40"}`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Zuletzt beauftragt am</Label>
              <Input
                type="date"
                value={form.last_hired_at || ""}
                onChange={(e) => {
                  setForm({ ...form, last_hired_at: e.target.value || null });
                  markDirty();
                }}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label htmlFor="sp-emergency" className="flex items-center gap-2 cursor-pointer text-sm">
              <Siren className="h-4 w-4 text-destructive" />
              Notdienst / 24h-Verfügbarkeit
            </Label>
            <Switch
              id="sp-emergency"
              checked={!!form.is_emergency_service}
              onCheckedChange={(v) => {
                setForm({ ...form, is_emergency_service: !!v });
                markDirty();
              }}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-dashed border-border p-3">
            <div className="text-xs">
              <p className="font-medium flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> Geo-Koordinaten
              </p>
              <p className="text-muted-foreground">
                {form.address_lat && form.address_lon
                  ? `${Number(form.address_lat).toFixed(5)}, ${Number(form.address_lon).toFixed(5)}`
                  : "Noch nicht geokodiert"}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={geocode} disabled={geocoding}>
              {geocoding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <MapPin className="h-3.5 w-3.5 mr-1" />
              )}
              Adresse geokodieren
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
