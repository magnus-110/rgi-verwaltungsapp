import { useEffect, useState } from "react";
import { PortalAbschnitt, PortalBlatt, PortalGruppe, PortalZeile, portalFeld } from "@/components/weg-owner/PortalListe";
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
  const [stammdatenOffen, setStammdatenOffen] = useState(false);

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
  const name = [contact.salutation, contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.company_name || "";

  return (
    <>
      <PortalAbschnitt titel="Meine Wohnungen">
        {assignments.map((a) => (
          <PortalZeile
            key={a.id}
            data-tour="settings-units"
            icon={Building2}
            titel={`${a.buildings?.name || "Wohnung"}${a.unit_number ? ` · WE ${a.unit_number}` : ""}`}
            untertitel="Post, Telefon und Konto für das Hausgeld"
            onClick={() => setOpenId(a.id)}
          />
        ))}
      </PortalAbschnitt>

      <PortalAbschnitt titel="Meine Daten">
        <PortalZeile icon={User} titel="Mein Name" untertitel={name || "Noch nicht hinterlegt"} onClick={() => setStammdatenOffen(true)} />
      </PortalAbschnitt>

      <StammdatenBlatt
        key={`s-${stammdatenOffen}`}
        offen={stammdatenOffen}
        onOffen={setStammdatenOffen}
        contact={contact}
        onSaved={() => { setStammdatenOffen(false); load(); }}
      />

      {openAssignment && (
        <WohnungBlatt
          key={openAssignment.id}
          offen={!!openId}
          onOffen={(o) => !o && setOpenId(null)}
          assignment={openAssignment}
          bankOptions={banks}
          contact={contact}
          onSaved={() => { setOpenId(null); load(); }}
        />
      )}
    </>
  );
};

function Feld({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground/80">{label}</Label>
      {children}
    </div>
  );
}

function StammdatenBlatt({ offen, onOffen, contact, onSaved }: { offen: boolean; onOffen: (o: boolean) => void; contact: Contact; onSaved: () => void }) {
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
      .update({ salutation: salutation || null, first_name: firstName || null, last_name: lastName || null, company_name: companyName || null })
      .eq("id", contact.id);
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Gespeichert" });
    onSaved();
  };

  return (
    <PortalBlatt
      offen={offen}
      onOffen={onOffen}
      titel="Mein Name"
      text="So sprechen wir Sie in Briefen und E-Mails an."
      fuss={
        <Button onClick={save} disabled={!dirty || saving} className="w-full h-12 text-base rounded-[12px]">
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Speichern
        </Button>
      }
    >
      <PortalGruppe>
        <Feld label="Anrede">
          <Select value={salutation || "none"} onValueChange={(v) => setSalutation(v === "none" ? "" : v)}>
            <SelectTrigger className={portalFeld}><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Keine Angabe</SelectItem>
              {SALUTATIONS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
            </SelectContent>
          </Select>
        </Feld>
        <Feld label="Vorname" htmlFor="sd-vor"><Input id="sd-vor" className={portalFeld} autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></Feld>
        <Feld label="Nachname" htmlFor="sd-nach"><Input id="sd-nach" className={portalFeld} autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} /></Feld>
      </PortalGruppe>
      <PortalGruppe hinweis="Nur ausfüllen, wenn die Wohnung einer Firma gehört.">
        <Feld label="Firma" htmlFor="sd-firma"><Input id="sd-firma" className={portalFeld} autoComplete="organization" value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></Feld>
      </PortalGruppe>
    </PortalBlatt>
  );
}

function WohnungBlatt({
  offen,
  onOffen,
  assignment,
  bankOptions,
  contact,
  onSaved,
}: {
  offen: boolean;
  onOffen: (o: boolean) => void;
  assignment: AssignmentRow;
  bankOptions: Bank[];
  contact: Contact;
  onSaved: () => void;
}) {
  const [a, setA] = useState<AssignmentRow>(assignment);
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<AssignmentRow>) => setA((x) => ({ ...x, ...patch }));
  const title = `${a.buildings?.name || "Wohnung"}${a.unit_number ? ` · WE ${a.unit_number}` : ""}`;

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
      // Gespeichert in der Form der Datenbank: Telefon {number, note}, E-Mail {address}
      phones_override: a.phones_override
        ? a.phones_override.filter((p) => (p.phone_number ?? "").trim().length > 0).map((p) => ({ number: p.phone_number, note: "" })) as any
        : null,
      emails_override: a.emails_override
        ? a.emails_override.filter((e) => (e.email ?? "").trim().length > 0).map((e) => ({ address: e.email })) as any
        : null,
      iban_override: a.iban_override,
      iban_holder_override: a.iban_holder_override,
      bank_account_id: a.bank_account_id,
    };
    const { error } = await supabase.functions.invoke("owner-update-assignment", { body: { assignment_id: a.id, patch } });
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Gespeichert" });
    onSaved();
  };

  const listenFeld = (
    art: "phones_override" | "emails_override",
    schluessel: "phone_number" | "email",
    platzhalter: string,
    typ: string,
    knopf: string,
  ) => {
    const liste = ((a[art] as any[]) ?? []) as any[];
    return (
      <div className="space-y-2">
        {liste.map((eintrag, idx) => (
          <div key={idx} className="flex gap-2">
            <Input
              type={typ}
              aria-label={platzhalter}
              className={portalFeld}
              placeholder={platzhalter}
              value={eintrag[schluessel]}
              onChange={(e) => {
                const next = [...liste];
                next[idx] = { [schluessel]: e.target.value };
                update({ [art]: next } as any);
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${platzhalter} entfernen`}
              className="h-12 w-12 shrink-0 text-muted-foreground"
              onClick={() => {
                const next = liste.filter((_, i) => i !== idx);
                update({ [art]: next.length ? next : null } as any);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => update({ [art]: [...liste, { [schluessel]: "" }] } as any)}
          className="w-full min-h-[48px] flex items-center justify-center gap-2 text-sm font-medium text-[#B35500] border border-dashed border-primary/40 rounded-[10px] hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" /> {knopf}
        </button>
      </div>
    );
  };

  return (
    <PortalBlatt
      offen={offen}
      onOffen={onOffen}
      titel={title}
      text="Leere Felder übernehmen Ihre allgemeinen Angaben."
      fuss={
        <Button onClick={save} disabled={saving} className="w-full h-12 text-base rounded-[12px]">
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Speichern
        </Button>
      }
    >
      <PortalGruppe titel="Post für diese Wohnung geht an">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Feld label="Anrede">
              <Select
                value={a.salutation_override ?? (contact.salutation ?? "__none__")}
                onValueChange={(v) => update({ salutation_override: v === "__none__" ? null : v })}
              >
                <SelectTrigger className={portalFeld}><SelectValue placeholder={contact.salutation || "Bitte wählen"} /></SelectTrigger>
                <SelectContent>{SALUTATIONS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
              </Select>
            </Feld>
          </div>
          <Feld label="Vorname" htmlFor="w-vor"><Input id="w-vor" className={portalFeld} placeholder={contact.first_name ?? ""} value={a.first_name_override ?? ""} onChange={(e) => update({ first_name_override: e.target.value || null })} /></Feld>
          <Feld label="Nachname" htmlFor="w-nach"><Input id="w-nach" className={portalFeld} placeholder={contact.last_name ?? ""} value={a.last_name_override ?? ""} onChange={(e) => update({ last_name_override: e.target.value || null })} /></Feld>
        </div>
        <Feld label="Straße und Hausnummer" htmlFor="w-str"><Input id="w-str" className={portalFeld} autoComplete="street-address" placeholder={contact.address_street ?? ""} value={a.address_street_override ?? ""} onChange={(e) => update({ address_street_override: e.target.value || null })} /></Feld>
        <div className="grid grid-cols-3 gap-3">
          <Feld label="PLZ" htmlFor="w-plz"><Input id="w-plz" inputMode="numeric" className={portalFeld} autoComplete="postal-code" placeholder={contact.address_zip ?? ""} value={a.address_zip_override ?? ""} onChange={(e) => update({ address_zip_override: e.target.value || null })} /></Feld>
          <div className="col-span-2">
            <Feld label="Ort" htmlFor="w-ort"><Input id="w-ort" className={portalFeld} autoComplete="address-level2" placeholder={contact.address_city ?? ""} value={a.address_city_override ?? ""} onChange={(e) => update({ address_city_override: e.target.value || null })} /></Feld>
          </div>
        </div>
      </PortalGruppe>

      <PortalGruppe titel="Telefon">
        {listenFeld("phones_override", "phone_number", "Telefonnummer", "tel", "Telefonnummer hinzufügen")}
      </PortalGruppe>

      <PortalGruppe titel="E-Mail für diese Wohnung" hinweis="Hierhin schicken wir zum Beispiel Abrechnungen. Ihre Anmelde-E-Mail ändern Sie unter „Anmeldung und Sicherheit“.">
        {listenFeld("emails_override", "email", "E-Mail-Adresse", "email", "E-Mail hinzufügen")}
      </PortalGruppe>

      <PortalGruppe titel="Konto für das Hausgeld">
        {bankOptions.length > 0 && (
          <Feld label="Gespeichertes Konto wählen">
            <Select
              value={a.bank_account_id ?? "__none__"}
              onValueChange={(v) => {
                if (v === "__none__") return update({ bank_account_id: null });
                const sel = bankOptions.find((b) => b.id === v);
                update({ bank_account_id: v, iban_override: sel?.iban ?? null, iban_holder_override: sel?.account_holder ?? null });
              }}
            >
              <SelectTrigger className={portalFeld}><SelectValue placeholder="Keine Auswahl" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Keine Auswahl</SelectItem>
                {bankOptions.map((b) => <SelectItem key={b.id} value={b.id}>{(b.account_holder ?? "Konto")} · {b.iban || "ohne IBAN"}</SelectItem>)}
              </SelectContent>
            </Select>
          </Feld>
        )}
        <Feld label="Kontoinhaber" htmlFor="w-inh"><Input id="w-inh" className={portalFeld} placeholder="Vor- und Nachname" value={a.iban_holder_override ?? ""} onChange={(e) => update({ iban_holder_override: e.target.value || null })} /></Feld>
        <Feld label="IBAN" htmlFor="w-iban"><Input id="w-iban" className={`${portalFeld} font-mono tracking-wide`} placeholder="DE00 0000 0000 0000 0000 00" value={a.iban_override ?? ""} onChange={(e) => update({ iban_override: e.target.value || null })} /></Feld>
      </PortalGruppe>
    </PortalBlatt>
  );
}
