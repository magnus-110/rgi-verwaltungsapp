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
import { Loader2, Plus, Trash2, User, Phone, Mail, CreditCard, MapPin, Building2, ChevronRight } from "lucide-react";
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
    const [{ data: bk }, { data: asg }] = await Promise.all([
      supabase.from("contact_bank_accounts").select("id, iban, account_holder").eq("contact_id", c.id),
      supabase
        .from("contact_building_assignments")
        .select(`
          id, building_id, unit_number, role_in_building, bank_account_id,
          salutation_override, first_name_override, last_name_override, company_name_override,
          address_street_override, address_zip_override, address_city_override,
          phones_override, emails_override, iban_override, iban_holder_override,
          buildings:building_id(name, address)
        `)
        .eq("contact_id", c.id)
        .eq("is_active", true),
    ]);
    setBanks((bk ?? []) as Bank[]);
    setAssignments((asg ?? []) as unknown as AssignmentRow[]);
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
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Meine Wohnungen</h2>
        <p className="text-sm text-muted-foreground">
          Klicken Sie auf eine Wohnung, um Ihre Daten für diese Einheit zu bearbeiten.
        </p>
      </div>
      {assignments.map((a) => {
        const roleLabel = a.role_in_building ? ROLE_LABELS[a.role_in_building] || a.role_in_building : null;
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
                  {roleLabel && <Badge variant="secondary" className="text-xs">{roleLabel}</Badge>}
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
    </div>
  );
};

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
      phones_override: a.phones_override,
      emails_override: a.emails_override,
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
                  onValueChange={(v) => update({ bank_account_id: v === "__none__" ? null : v })}
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
