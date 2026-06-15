import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, User, Phone, Mail, CreditCard, MapPin, Building2, ChevronRight, Info } from "lucide-react";
import { SALUTATIONS } from "@/lib/salutations";

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

interface Bank {
  id: string;
  iban: string | null;
  account_holder: string | null;
}

interface AssignmentRow {
  id: string;
  building_id: string;
  unit_number: string | null;
  role_in_building: string | null;
  bank_account_id: string | null;
  salutation_override: string | null;
  first_name_override: string | null;
  last_name_override: string | null;
  company_name_override: string | null;
  address_street_override: string | null;
  address_zip_override: string | null;
  address_city_override: string | null;
  phones_override: { phone_number: string }[] | null;
  emails_override: { email: string }[] | null;
  iban_override: string | null;
  iban_holder_override: string | null;
  buildings?: { name: string | null; address: string | null } | null;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Eigentümer",
  tenant: "Mieter",
  beirat: "Verwaltungsbeirat",
  weg_vorsitz: "WEG-Vorsitz",
};

export const OwnerSelfServiceSection = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState<Contact | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

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

    // Find the contact_person linked to this user (if any) for global phones/emails
    const { data: persons } = await supabase
      .from("contact_persons")
      .select("id")
      .eq("contact_id", c.id);
    const personIds = (persons ?? []).map((p: any) => p.id);

    const bkRes = await supabase
      .from("contact_bank_accounts")
      .select("id, iban, account_holder")
      .eq("contact_id", c.id);
    const asgRes = await supabase
      .from("contact_building_assignments")
      .select(`
        id, building_id, unit_number, role_in_building, bank_account_id,
        salutation_override, first_name_override, last_name_override, company_name_override,
        address_street_override, address_zip_override, address_city_override,
        phones_override, emails_override, iban_override, iban_holder_override,
        buildings:building_id(name, address)
      `)
      .eq("contact_id", c.id)
      .eq("is_active", true);
    const bk = bkRes.data;
    const asg = asgRes.data;

    let globalPhones: any[] = [];
    let globalEmails: any[] = [];
    if (personIds.length) {
      const ph: any = await (supabase as any).from("contact_phones").select("phone_number").in("contact_person_id", personIds);
      const em: any = await (supabase as any).from("contact_emails").select("email").in("contact_person_id", personIds);
      globalPhones = (ph.data ?? []) as any[];
      globalEmails = (em.data ?? []) as any[];
    }
    setBanks((bk ?? []) as Bank[]);

    const globalPhonesArr = (globalPhones ?? [])
      .map((p: any) => ({ phone_number: p?.phone_number ?? "" }))
      .filter((p) => p.phone_number);
    const globalEmailsArr = (globalEmails ?? [])
      .map((e: any) => ({ email: e?.email ?? "" }))
      .filter((e) => e.email);

    // Pick a default bank (first one) for prefill if no bank_account_id is set
    const defaultBank = (bk ?? [])[0] as Bank | undefined;

    // Normalize phones/emails AND prefill empty override fields with global/contact data
    const normalized = (asg ?? []).map((row: any) => {
      const phonesNorm: { phone_number: string }[] | null = Array.isArray(row.phones_override)
        ? row.phones_override
            .map((p: any) => ({ phone_number: p?.phone_number ?? p?.number ?? "" }))
            .filter((p: any) => p.phone_number)
        : null;
      const emailsNorm: { email: string }[] | null = Array.isArray(row.emails_override)
        ? row.emails_override
            .map((e: any) => ({ email: e?.email ?? e?.address ?? "" }))
            .filter((e: any) => e.email)
        : null;

      return {
        ...row,
        salutation_override: row.salutation_override ?? c.salutation ?? null,
        first_name_override: row.first_name_override ?? c.first_name ?? null,
        last_name_override: row.last_name_override ?? c.last_name ?? null,
        company_name_override: row.company_name_override ?? c.company_name ?? null,
        address_street_override: row.address_street_override ?? c.address_street ?? null,
        address_zip_override: row.address_zip_override ?? c.address_zip ?? null,
        address_city_override: row.address_city_override ?? c.address_city ?? null,
        phones_override: phonesNorm && phonesNorm.length > 0
          ? phonesNorm
          : (globalPhonesArr.length > 0 ? globalPhonesArr : null),
        emails_override: emailsNorm && emailsNorm.length > 0
          ? emailsNorm
          : (globalEmailsArr.length > 0 ? globalEmailsArr : null),
        iban_override: row.iban_override ?? defaultBank?.iban ?? null,
        iban_holder_override: row.iban_holder_override ?? defaultBank?.account_holder ?? null,
        bank_account_id: row.bank_account_id ?? defaultBank?.id ?? null,
      };
    });
    setAssignments(normalized as unknown as AssignmentRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.user_id]);

  if (loading) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Lade Wohnungen...
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

  if (assignments.length === 0) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground">
        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Noch keine Wohnungen zugeordnet.</p>
        <p className="text-sm mt-1">Wenden Sie sich an die Verwaltung.</p>
      </CardContent></Card>
    );
  }

  const openAssignment = assignments.find((a) => a.id === openId) ?? null;

  return (
    <>
      <StammdatenCard contact={contact} onSaved={load} />

      <Card data-tour="settings-units">

        <CardHeader>
          <CardTitle>Meine Wohnungen</CardTitle>
          <p className="text-sm text-muted-foreground">
            Hier sehen Sie alle Ihnen zugeordneten Wohnungen. Klicken Sie auf eine Wohnung, um je Gebäude individuelle Informationen (z. B. Anrede, Adresse, Kontaktdaten) und Ihre Bankverbindung für diese Einheit zu hinterlegen oder zu ändern.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {assignments.map((a) => {
            const unit = a.unit_number ? ` · WE ${a.unit_number}` : "";
            return (
              <Card
                key={a.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setOpenId(a.id)}
              >
                <CardContent className="py-4 flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">
                        {a.buildings?.name || "Wohnung"}{unit}
                      </span>
                    </div>
                    {a.buildings?.address && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{a.buildings.address}</p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardContent>
              </Card>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {openAssignment && (
            <AssignmentEditor
              assignment={openAssignment}
              bankOptions={banks}
              contact={contact}
              onSaved={() => { setOpenId(null); load(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

function StammdatenCard({ contact, onSaved }: { contact: Contact; onSaved: () => void }) {
  const [salutation, setSalutation] = useState(contact.salutation ?? "");
  const [firstName, setFirstName] = useState(contact.first_name ?? "");
  const [lastName, setLastName] = useState(contact.last_name ?? "");
  const [companyName, setCompanyName] = useState(contact.company_name ?? "");
  const [saving, setSaving] = useState(false);
  const dirty =
    (contact.salutation ?? "") !== salutation ||
    (contact.first_name ?? "") !== firstName ||
    (contact.last_name ?? "") !== lastName ||
    (contact.company_name ?? "") !== companyName;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("contacts")
      .update({
        salutation: salutation || null,
        first_name: firstName || null,
        last_name: lastName || null,
        company_name: companyName || null,
      })
      .eq("id", contact.id);
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Stammdaten gespeichert" });
    onSaved();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="w-4 h-4" /> Meine Stammdaten
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Diese Daten gelten allgemein und werden mit der Verwaltung synchronisiert.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Anrede</Label>
            <Select value={salutation || "none"} onValueChange={(v) => setSalutation(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {SALUTATIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vorname</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label>Nachname</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Firma (optional)</Label>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={!dirty || saving} size="sm">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Speichern...</> : "Speichern"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}



function AssignmentEditor({
  assignment,
  bankOptions,
  contact,
  onSaved,
}: {
  assignment: AssignmentRow;
  bankOptions: Bank[];
  contact: Contact;
  onSaved: () => void;
}) {
  const [a, setA] = useState<AssignmentRow>(assignment);
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<AssignmentRow>) => setA((x) => ({ ...x, ...patch }));

  const unit = a.unit_number ? ` · WE ${a.unit_number}` : "";
  const title = `${a.buildings?.name || "Wohnung"}${unit}`;

  const save = async () => {
    setSaving(true);
    const patch: Partial<AssignmentRow> = {
      salutation_override: a.salutation_override,
      first_name_override: a.first_name_override,
      last_name_override: a.last_name_override,
      company_name_override: a.company_name_override,
      address_street_override: a.address_street_override,
      address_zip_override: a.address_zip_override,
      address_city_override: a.address_city_override,
      // Persist in canonical DB shape: phones {number, note}, emails {address}
      phones_override: a.phones_override
        ? a.phones_override
            .filter((p) => (p.phone_number ?? "").trim().length > 0)
            .map((p) => ({ number: p.phone_number, note: "" })) as any
        : null,
      emails_override: a.emails_override
        ? a.emails_override
            .filter((e) => (e.email ?? "").trim().length > 0)
            .map((e) => ({ address: e.email })) as any
        : null,
      iban_override: a.iban_override,
      iban_holder_override: a.iban_holder_override,
      bank_account_id: a.bank_account_id,
    };
    const { error } = await supabase.functions.invoke("owner-update-assignment", {
      body: { assignment_id: a.id, patch },
    });
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Gespeichert" });
    onSaved();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5" /> {title}
        </DialogTitle>
        <DialogDescription>
          Hinterlegen Sie hier Ihre Daten für diese Wohnung. Leere Felder verwenden Ihre allgemeinen Stammdaten.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 mt-2">
        {/* Persönliche Daten */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4" /> Persönliche Daten
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Anrede</Label>
                <Select
                  value={a.salutation_override ?? (contact.salutation ?? "__none__")}
                  onValueChange={(v) => update({ salutation_override: v === "__none__" ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={contact.salutation || "Bitte wählen"} />
                  </SelectTrigger>
                  <SelectContent>
                    {SALUTATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vorname</Label>
                <Input
                  placeholder={contact.first_name ?? ""}
                  value={a.first_name_override ?? ""}
                  onChange={(e) => update({ first_name_override: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nachname</Label>
                <Input
                  placeholder={contact.last_name ?? ""}
                  value={a.last_name_override ?? ""}
                  onChange={(e) => update({ last_name_override: e.target.value || null })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Straße &amp; Hausnummer</Label>
              <Input
                placeholder={contact.address_street ?? ""}
                value={a.address_street_override ?? ""}
                onChange={(e) => update({ address_street_override: e.target.value || null })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">PLZ</Label>
                <Input
                  placeholder={contact.address_zip ?? ""}
                  value={a.address_zip_override ?? ""}
                  onChange={(e) => update({ address_zip_override: e.target.value || null })}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Ort</Label>
                <Input
                  placeholder={contact.address_city ?? ""}
                  value={a.address_city_override ?? ""}
                  onChange={(e) => update({ address_city_override: e.target.value || null })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Kontaktinfos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="w-4 h-4" /> Kontaktinfos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-2 p-3 bg-muted/50 border border-muted rounded-md text-xs text-muted-foreground">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Diese E-Mail-Adressen werden für Korrespondenz zu <b>dieser Wohnung</b> verwendet (z.B. Abrechnungen).
                Ihre <b>Login-E-Mail</b> ändern Sie in den Einstellungen unter „Login-E-Mail".
              </span>
            </div>
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Telefonnummern</Label>
              {(a.phones_override ?? []).map((p, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    placeholder="Telefonnummer"
                    value={p.phone_number}
                    onChange={(e) => {
                      const next = [...(a.phones_override ?? [])];
                      next[idx] = { phone_number: e.target.value };
                      update({ phones_override: next });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const next = (a.phones_override ?? []).filter((_, i) => i !== idx);
                      update({ phones_override: next.length ? next : null });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => update({ phones_override: [...(a.phones_override ?? []), { phone_number: "" }] })}
                className="w-full px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium text-primary border border-dashed border-primary/40 rounded-md hover:bg-accent/40 transition"
              >
                <span className="size-[22px] rounded-full border-[1.5px] border-primary bg-accent grid place-items-center">
                  <Plus className="size-3" strokeWidth={2.5} />
                </span>
                Telefonnummer hinzufügen
              </button>
            </div>

            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> E-Mail-Adressen</Label>
              {(a.emails_override ?? []).map((em, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    placeholder="E-Mail"
                    value={em.email}
                    onChange={(e) => {
                      const next = [...(a.emails_override ?? [])];
                      next[idx] = { email: e.target.value };
                      update({ emails_override: next });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const next = (a.emails_override ?? []).filter((_, i) => i !== idx);
                      update({ emails_override: next.length ? next : null });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => update({ emails_override: [...(a.emails_override ?? []), { email: "" }] })}
                className="w-full px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium text-primary border border-dashed border-primary/40 rounded-md hover:bg-accent/40 transition"
              >
                <span className="size-[22px] rounded-full border-[1.5px] border-primary bg-accent grid place-items-center">
                  <Plus className="size-3" strokeWidth={2.5} />
                </span>
                E-Mail hinzufügen
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Bank */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Bankverbindung
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bankOptions.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Bestehende Bankverbindung wählen</Label>
                <Select
                  value={a.bank_account_id ?? "__none__"}
                  onValueChange={(v) => {
                    if (v === "__none__") {
                      update({ bank_account_id: null });
                      return;
                    }
                    const sel = bankOptions.find((b) => b.id === v);
                    update({
                      bank_account_id: v,
                      iban_override: sel?.iban ?? null,
                      iban_holder_override: sel?.account_holder ?? null,
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="— Keine Auswahl —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Keine Auswahl —</SelectItem>
                    {bankOptions.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {(b.account_holder ?? "Konto")} · {b.iban || "ohne IBAN"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Kontoinhaber</Label>
              <Input
                placeholder="Vor- und Nachname"
                value={a.iban_holder_override ?? ""}
                onChange={(e) => update({ iban_holder_override: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">IBAN</Label>
              <Input
                className="font-mono"
                placeholder="DE00 0000 0000 0000 0000 00"
                value={a.iban_override ?? ""}
                onChange={(e) => update({ iban_override: e.target.value || null })}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pt-2 border-t">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Speichern
          </Button>
        </div>
      </div>
    </>
  );
}
