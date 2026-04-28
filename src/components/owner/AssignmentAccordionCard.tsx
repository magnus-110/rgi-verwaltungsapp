import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Building2, Loader2, Plus, Trash2, MapPin, Phone, Mail, CreditCard, User } from "lucide-react";
import { SALUTATIONS } from "@/lib/salutations";
import { UNIT_KIND_LABELS, UNIT_KIND_ICONS, isApartment, type UnitKind } from "@/lib/secondaryUnits";

export interface AssignmentRow {
  id: string;
  building_id: string;
  unit_number: string | null;
  role_in_building: string | null;
  unit_kind?: string | null;
  billing_mode?: string | null;
  parent_assignment_id?: string | null;
  buildings?: { name: string | null; address: string | null } | null;
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
}

export interface BankOption {
  id: string;
  iban: string | null;
  account_holder: string | null;
}

interface Props {
  assignments: AssignmentRow[];
  bankOptions: BankOption[];
  onChanged: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Eigentümer",
  tenant: "Mieter",
  beirat: "Verwaltungsbeirat",
  weg_vorsitz: "WEG-Vorsitz",
};

export const AssignmentAccordionCard = ({ assignments, bankOptions, onChanged }: Props) => {
  if (assignments.length === 0) return null;

  // Konsolidierung: Hauptwohnungen + Nebeneinheiten zusammenführen
  // Hauptwohnung = unit_kind 'apartment' oder leer; Nebeneinheit = sonst.
  // Zuordnung: Nebeneinheit gehört zur Hauptwohnung mit gleicher parent_assignment_id (= main.id),
  // oder fällt zurück auf "lose" (eigene Karte) falls kein parent gesetzt.
  const mainAssignments = assignments.filter((a) => isApartment(a.unit_kind));
  const subUnits = assignments.filter((a) => !isApartment(a.unit_kind));
  const subsByParent = new Map<string, AssignmentRow[]>();
  const looseSubs: AssignmentRow[] = [];
  for (const s of subUnits) {
    if (s.parent_assignment_id && mainAssignments.some((m) => m.id === s.parent_assignment_id)) {
      const arr = subsByParent.get(s.parent_assignment_id) || [];
      arr.push(s);
      subsByParent.set(s.parent_assignment_id, arr);
    } else {
      // Keine Hauptwohnung gefunden → eigene Karte (z.B. reine TG-Liegenschaft)
      looseSubs.push(s);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5" /> Meine Einheiten
        </CardTitle>
        <CardDescription>
          Pro Einheit können abweichende Daten (Adresse, Kontakt, Bank) hinterlegt werden.
          Nebeneinheiten (z.B. Stellplätze) werden bei der Hauptwohnung mit angezeigt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          {mainAssignments.map((a) => (
            <AssignmentItem
              key={a.id}
              assignment={a}
              subUnits={subsByParent.get(a.id) || []}
              bankOptions={bankOptions}
              onChanged={onChanged}
            />
          ))}
          {looseSubs.map((a) => (
            <AssignmentItem key={a.id} assignment={a} subUnits={[]} bankOptions={bankOptions} onChanged={onChanged} />
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
};

function AssignmentItem({
  assignment,
  subUnits = [],
  bankOptions,
  onChanged,
}: {
  assignment: AssignmentRow;
  subUnits?: AssignmentRow[];
  bankOptions: BankOption[];
  onChanged: () => void;
}) {
  const [a, setA] = useState<AssignmentRow>(assignment);
  const [saving, setSaving] = useState(false);

  const hasOverrides =
    a.salutation_override || a.first_name_override || a.last_name_override || a.company_name_override ||
    a.address_street_override || a.address_zip_override || a.address_city_override ||
    (a.phones_override && a.phones_override.length > 0) ||
    (a.emails_override && a.emails_override.length > 0) ||
    a.iban_override;

  const update = (patch: Partial<AssignmentRow>) => setA({ ...a, ...patch });

  const save = async (patch: Partial<AssignmentRow>) => {
    setSaving(true);
    const { error } = await supabase.functions.invoke("owner-update-assignment", {
      body: { assignment_id: a.id, patch },
    });
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Gespeichert" });
    onChanged();
  };

  const saveAll = async () => {
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
    await save(patch);
  };

  const buildingLabel = a.buildings?.name || (isApartment(a.unit_kind) ? "Wohnung" : (UNIT_KIND_LABELS[(a.unit_kind as UnitKind)] || "Einheit"));
  const unitLabel = a.unit_number ? ` · WE ${a.unit_number}` : "";
  const roleLabel = a.role_in_building ? ROLE_LABELS[a.role_in_building] || a.role_in_building : null;

  return (
    <AccordionItem value={a.id}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2 flex-1 text-left flex-wrap">
          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-medium">{buildingLabel}{unitLabel}</span>
          {roleLabel && <Badge variant="secondary" className="ml-1">{roleLabel}</Badge>}
          {subUnits.map((s) => (
            <Badge key={s.id} variant="outline" className="gap-1">
              <span aria-hidden>{UNIT_KIND_ICONS[(s.unit_kind as UnitKind)] || "📦"}</span>
              {UNIT_KIND_LABELS[(s.unit_kind as UnitKind)] || "Einheit"}
              {s.unit_number ? ` ${s.unit_number}` : ""}
            </Badge>
          ))}
          {hasOverrides && <Badge variant="outline" className="ml-auto mr-2">Eigene Angaben</Badge>}
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-5 pt-2">
        {a.buildings?.address && (
          <p className="text-xs text-muted-foreground -mt-1">{a.buildings.address}</p>
        )}

        {subUnits.length > 0 && (
          <section className="space-y-1 rounded-md border bg-muted/30 p-3">
            <div className="text-sm font-medium">Zugeordnete Nebeneinheiten</div>
            <ul className="text-sm text-muted-foreground space-y-0.5">
              {subUnits.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span aria-hidden>{UNIT_KIND_ICONS[(s.unit_kind as UnitKind)] || "📦"}</span>
                  <span>
                    {UNIT_KIND_LABELS[(s.unit_kind as UnitKind)] || "Einheit"}
                    {s.unit_number ? ` ${s.unit_number}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              Diese Einheiten werden gemeinsam mit dieser Wohnung abgerechnet.
            </p>
          </section>
        )}

        {/* Personendaten Override */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <User className="w-4 h-4" /> Persönliche Daten (für diese Wohnung)
          </div>
          <p className="text-xs text-muted-foreground">
            Leer lassen, wenn Ihre allgemeinen Stammdaten gelten.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Anrede</Label>
              <Select
                value={a.salutation_override ?? "__none__"}
                onValueChange={(v) => update({ salutation_override: v === "__none__" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— (Standard)</SelectItem>
                  {SALUTATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Firma</Label>
              <Input value={a.company_name_override ?? ""} onChange={(e) => update({ company_name_override: e.target.value || null })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vorname</Label>
              <Input value={a.first_name_override ?? ""} onChange={(e) => update({ first_name_override: e.target.value || null })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nachname</Label>
              <Input value={a.last_name_override ?? ""} onChange={(e) => update({ last_name_override: e.target.value || null })} />
            </div>
          </div>
        </section>

        {/* Adresse Override */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="w-4 h-4" /> Postanschrift (für diese Wohnung)
          </div>
          <Input
            placeholder="Straße & Hausnummer"
            value={a.address_street_override ?? ""}
            onChange={(e) => update({ address_street_override: e.target.value || null })}
          />
          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="PLZ"
              value={a.address_zip_override ?? ""}
              onChange={(e) => update({ address_zip_override: e.target.value || null })}
            />
            <Input
              className="col-span-2"
              placeholder="Ort"
              value={a.address_city_override ?? ""}
              onChange={(e) => update({ address_city_override: e.target.value || null })}
            />
          </div>
        </section>

        {/* Telefon Override */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Phone className="w-4 h-4" /> Telefonnummern (für diese Wohnung)
          </div>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => update({ phones_override: [...(a.phones_override ?? []), { phone_number: "" }] })}
          >
            <Plus className="h-4 w-4 mr-1" /> Telefonnummer hinzufügen
          </Button>
        </section>

        {/* Email Override */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Mail className="w-4 h-4" /> E-Mail-Adressen (für diese Wohnung)
          </div>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => update({ emails_override: [...(a.emails_override ?? []), { email: "" }] })}
          >
            <Plus className="h-4 w-4 mr-1" /> E-Mail hinzufügen
          </Button>
        </section>

        {/* Bank — Auswahl aus globalen Konten ODER eigene IBAN für diese Wohnung */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CreditCard className="w-4 h-4" /> Bankverbindung (für diese Wohnung)
          </div>
          {bankOptions.length > 0 && (
            <div className="space-y-1">
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
          <div className="space-y-1">
            <Label className="text-xs">… oder eigene IBAN nur für diese Wohnung</Label>
            <Input
              className="font-mono"
              placeholder="DE00 0000 0000 0000 0000 00"
              value={a.iban_override ?? ""}
              onChange={(e) => update({ iban_override: e.target.value || null })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kontoinhaber (falls abweichend)</Label>
            <Input
              placeholder="Vor- und Nachname"
              value={a.iban_holder_override ?? ""}
              onChange={(e) => update({ iban_holder_override: e.target.value || null })}
            />
          </div>
        </section>

        <div className="flex justify-end pt-2">
          <Button onClick={saveAll} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Speichern
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
