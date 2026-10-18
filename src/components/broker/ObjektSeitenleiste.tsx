import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, ExternalLink, Mail, Phone, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateContactDialog } from "@/components/contacts/CreateContactDialog";
import { ContactPicker } from "./ContactPicker";
import { Segmente } from "./MaklerUi";
import { ZielgruppeFelder } from "./Zielgruppe";
import { useGesuche } from "@/hooks/useGesuche";
import { passtZu } from "@/lib/gesuche";
import { useBrokerAccess, useBrokerDocuments, useBrokerStaff, useMaklerNeuLaden } from "@/hooks/useMakler";
import {
  UNTERLAGEN_CHECKLISTE,
  db,
  fehler,
  kategorieLabel,
  objektAendern,
  personName,
  type BrokerProperty,
  type WebsiteStand,
} from "@/lib/makler";
import { cn } from "@/lib/utils";

function Karte({ titel, children, className }: { titel: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 sm:p-5", className)}>
      <h2 className="font-display text-base font-semibold mb-3">{titel}</h2>
      {children}
    </section>
  );
}

function SchalterZeile({ id, label, hilfe, checked, onChange, disabled }: {
  id: string;
  label: string;
  hilfe?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-11">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer">{label}</Label>
        {hilfe && <p className="text-xs text-muted-foreground">{hilfe}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

/** Zahl, die beim Verlassen gespeichert wird. */
function ReihenfolgeFeld({ id, label, wert, onSave, disabled }: {
  id: string;
  label: string;
  wert: number | null;
  onSave: (v: number | null) => void;
  disabled?: boolean;
}) {
  const [t, setT] = useState(wert == null ? "" : String(wert));
  useEffect(() => setT(wert == null ? "" : String(wert)), [wert]);
  return (
    <div className="flex items-center justify-between gap-3 min-h-11">
      <Label htmlFor={id} className={cn("text-sm", disabled && "text-muted-foreground")}>{label}</Label>
      <Input
        id={id}
        className="h-11 w-24 text-right"
        inputMode="numeric"
        disabled={disabled}
        value={t}
        placeholder="–"
        onChange={(e) => setT(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={() => {
          const n = t === "" ? null : Number(t);
          if (n !== wert) onSave(n);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
    </div>
  );
}

export function ObjektSeitenleiste({ p, onUnterlagen }: { p: BrokerProperty; onUnterlagen: () => void }) {
  const { isAdmin } = useBrokerAccess();
  const neuLaden = useMaklerNeuLaden();
  const { makler, nachId } = useBrokerStaff();
  const { data: unterlagen = [] } = useBrokerDocuments(p.id);
  const [neuKontakt, setNeuKontakt] = useState(false);

  const aendern = async (patch: Record<string, unknown>, ok?: string) => {
    try {
      await objektAendern(p.id, patch);
      if (ok) toast.success(ok);
      neuLaden();
    } catch (e) {
      fehler("Änderung konnte nicht gespeichert werden", e);
    }
  };

  const sichtbar = p.status === "vermarktung" || p.status === "reserviert";
  const zustaendig = p.assigned_to ? nachId.get(p.assigned_to) : undefined;
  const standOptionen: { key: WebsiteStand; label: string }[] = [
    { key: "aktiv", label: "Aktiv" },
    { key: "reserviert", label: "Reserviert" },
    p.listing_type === "sale" ? { key: "verkauft", label: "Verkauft" } : { key: "vermietet", label: "Vermietet" },
  ];
  // Falls ein Objekt von Kauf auf Miete gewechselt hat, den alten Wert trotzdem zeigen.
  if (!standOptionen.some((o) => o.key === p.website_state)) {
    standOptionen.push({ key: p.website_state, label: p.website_state === "verkauft" ? "Verkauft" : "Vermietet" });
  }

  return (
    <div className="space-y-4">
      <Karte titel="Wo wird es gezeigt?">
        <div className="divide-y">
          <SchalterZeile id="sw-web" label="Website" checked={p.show_on_website} onChange={(v) => aendern({ show_on_website: v })} />
          <SchalterZeile id="sw-app" label="Nutzer-App" hilfe="Für angemeldete Eigentümer und Mieter" checked={p.show_in_portal} onChange={(v) => aendern({ show_in_portal: v })} />
        </div>
        {p.show_in_portal && (
          <div className="mt-2 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <ZielgruppeFelder
              idPrefix="obj"
              zielgruppe={p.portal_zielgruppe ?? "alle"}
              orte={p.portal_orte ?? []}
              gebaeude={p.portal_gebaeude ?? []}
              onChange={(patch) =>
                aendern({
                  ...(patch.zielgruppe ? { portal_zielgruppe: patch.zielgruppe } : {}),
                  ...(patch.orte ? { portal_orte: patch.orte } : {}),
                  ...(patch.gebaeude ? { portal_gebaeude: patch.gebaeude } : {}),
                })
              }
            />
            <div className="space-y-1.5">
              <Label htmlFor="obj-bis">Sichtbar bis (leer = ohne Ende)</Label>
              <Input id="obj-bis" type="date" className="h-11" value={p.portal_bis ?? ""} onChange={(e) => aendern({ portal_bis: e.target.value || null })} />
            </div>
            <SchalterZeile
              id="sw-start"
              label="Darf auf der Startseite erscheinen"
              hilfe="Nur bei Eigentümern, die das in ihren Einstellungen erlaubt haben"
              checked={!!p.portal_startseite}
              onChange={(v) => aendern({ portal_startseite: v })}
            />
          </div>
        )}
        <PassendeSuchauftraege p={p} />
        <p className={cn("mt-3 rounded-lg px-3 py-2 text-xs", sichtbar ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground")}>
          Auf Website und Nutzer-App erscheinen nur Objekte mit dem Stand „In Vermarktung" oder „Reserviert".
          Abgeschlossene Objekte erscheinen als Referenz, wenn „Als Referenz zeigen" an ist.
        </p>

        <div className="mt-4 space-y-1.5">
          <Label>Anzeige auf der Website</Label>
          <Segmente className="w-full" wert={p.website_state} onChange={(v) => aendern({ website_state: v })} optionen={standOptionen} />
        </div>

        <div className="mt-4 divide-y border-t">
          <SchalterZeile id="sw-ref" label="Als Referenz zeigen" checked={p.is_reference} onChange={(v) => aendern({ is_reference: v })} />
          <ReihenfolgeFeld id="ref-order" label="Reihenfolge bei den Referenzen" wert={p.reference_order} disabled={!p.is_reference} onSave={(v) => aendern({ reference_order: v })} />
          <SchalterZeile id="sw-schaufenster" label="Im Schaufenster zeigen" hilfe="Bildschirm im Büro-Fenster" checked={!p.display_hidden} onChange={(v) => aendern({ display_hidden: !v })} />
          <ReihenfolgeFeld id="disp-order" label="Reihenfolge im Schaufenster" wert={p.display_order} disabled={p.display_hidden} onSave={(v) => aendern({ display_order: v })} />
        </div>
      </Karte>

      <Karte titel="Zuständig">
        {isAdmin ? (
          <Select value={p.assigned_to ?? "__keiner__"} onValueChange={(v) => aendern({ assigned_to: v === "__keiner__" ? null : v }, "Zuständigkeit geändert")}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Niemand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__keiner__" className="min-h-10">— niemand —</SelectItem>
              {makler.map((m) => <SelectItem key={m.user_id} value={m.user_id} className="min-h-10">{personName(m)}</SelectItem>)}
              {p.assigned_to && !makler.some((m) => m.user_id === p.assigned_to) && zustaendig && (
                <SelectItem value={p.assigned_to} className="min-h-10">{personName(zustaendig)}</SelectItem>
              )}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm">{zustaendig ? personName(zustaendig) : "Niemand"}</p>
        )}
        {!isAdmin && <p className="text-xs text-muted-foreground mt-1">Ändern können nur Administratoren.</p>}
      </Karte>

      <Karte titel="Eigentümer">
        <div className="flex gap-2">
          <ContactPicker
            className="flex-1 min-w-0"
            value={p.owner_contact_id}
            placeholder="Eigentümer suchen…"
            onChange={(id) => aendern({ owner_contact_id: id }, id ? "Eigentümer gespeichert" : "Eigentümer entfernt")}
          />
          <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setNeuKontakt(true)}>
            <UserPlus className="h-4 w-4 mr-1" />Neu
          </Button>
        </div>
        {p.owner_contact_id && <EigentuemerDaten contactId={p.owner_contact_id} />}
        <CreateContactDialog
          open={neuKontakt}
          onOpenChange={setNeuKontakt}
          title="Eigentümer anlegen"
          onCreated={async (id) => {
            if (id) await aendern({ owner_contact_id: id }, "Eigentümer gespeichert");
          }}
        />
      </Karte>

      <Karte titel="Unterlagen">
        <ul className="space-y-1">
          {UNTERLAGEN_CHECKLISTE.map((k) => {
            const da = unterlagen.some((u) => u.category === k);
            return (
              <li key={k} className="flex items-center gap-2 text-sm min-h-9">
                {da ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                <span className={da ? "" : "text-muted-foreground"}>{kategorieLabel(k)}</span>
              </li>
            );
          })}
        </ul>
        <Button variant="outline" className="h-11 w-full mt-3" onClick={onUnterlagen}>Unterlagen öffnen</Button>
      </Karte>
    </div>
  );
}

function EigentuemerDaten({ contactId }: { contactId: string }) {
  const { data, error } = useQuery({
    queryKey: ["broker", "owner-data", contactId],
    queryFn: async () => {
      const [m, t] = await Promise.all([
        db.from("contact_emails").select("id, email, label, is_primary").eq("contact_id", contactId).order("is_primary", { ascending: false }),
        db.from("contact_phones").select("id, phone_number, label").eq("contact_id", contactId),
      ]);
      if (m.error) throw m.error;
      if (t.error) throw t.error;
      return {
        mails: (m.data ?? []) as { id: string; email: string; label: string | null }[],
        tels: (t.data ?? []) as { id: string; phone_number: string; label: string | null }[],
      };
    },
  });
  useEffect(() => {
    if (error) fehler("Kontaktdaten des Eigentümers konnten nicht geladen werden", error);
  }, [error]);

  return (
    <div className="mt-3 space-y-1">
      {data?.mails.map((m) => (
        <a key={m.id} href={`mailto:${m.email}`} className="flex items-center gap-2 text-sm min-h-9 hover:text-primary">
          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate">{m.email}</span>
          {m.label && <span className="text-xs text-muted-foreground">({m.label})</span>}
        </a>
      ))}
      {data?.tels.map((t) => (
        <a key={t.id} href={`tel:${t.phone_number.replace(/\s/g, "")}`} className="flex items-center gap-2 text-sm min-h-9 hover:text-primary">
          <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate">{t.phone_number}</span>
          {t.label && <span className="text-xs text-muted-foreground">({t.label})</span>}
        </a>
      ))}
      {data && data.mails.length === 0 && data.tels.length === 0 && (
        <p className="text-xs text-muted-foreground">Keine E-Mail-Adresse oder Telefonnummer hinterlegt.</p>
      )}
      <Link to={`/contacts?id=${contactId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11">
        <ExternalLink className="h-4 w-4" />In Adressen öffnen
      </Link>
    </div>
  );
}

/** Hinweis: welche freigegebenen Gesuche/Suchaufträge grob zum Objekt passen. */
function PassendeSuchauftraege({ p }: { p: BrokerProperty }) {
  const { data: gesuche = [] } = useGesuche();
  const passend = gesuche.filter((g) => g.status === "sichtbar" && passtZu(g, p));
  if (passend.length === 0) return null;
  return (
    <Link to="/makler/gesuche" className="mt-3 flex min-h-11 items-center justify-between rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 hover:bg-sky-100">
      <span>{passend.length === 1 ? "1 Suchauftrag passt" : `${passend.length} Suchaufträge passen`}</span>
      <span className="text-xs">ansehen ›</span>
    </Link>
  );
}
