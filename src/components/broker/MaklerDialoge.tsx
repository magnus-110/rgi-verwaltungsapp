import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContactPicker } from "./ContactPicker";
import { Segmente } from "./MaklerUi";
import { useBrokerAccess, useBrokerProperties, useMaklerNeuLaden } from "@/hooks/useMakler";
import { LEAD_LABEL, QUELLEN, db, fehler, schrittIndex, type LeadStatus } from "@/lib/makler";

// ---------------------------------------------------------------------------
// Neues Objekt – nur das Nötigste
// ---------------------------------------------------------------------------
export function NeuesObjektDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { userId } = useBrokerAccess();
  const neuLaden = useMaklerNeuLaden();
  const navigate = useNavigate();
  const [titel, setTitel] = useState("");
  const [art, setArt] = useState<"sale" | "rent">("rent");
  const [plz, setPlz] = useState("");
  const [ort, setOrt] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    if (open) {
      setTitel("");
      setArt("rent");
      setPlz("");
      setOrt("");
    }
  }, [open]);

  const anlegen = async () => {
    if (!titel.trim()) return void toast.error("Bitte einen Titel eingeben.");
    if (!ort.trim()) return void toast.error("Bitte den Ort eingeben.");
    setLaeuft(true);
    const { data, error } = await db
      .from("broker_properties")
      .insert({
        title: titel.trim(),
        listing_type: art,
        city: ort.trim(),
        postal_code: plz.trim() || null,
        status: "entwurf",
        is_active: false,
        assigned_to: userId,
        created_by: userId,
        features: [],
      })
      .select("id")
      .single();
    setLaeuft(false);
    if (error) return fehler("Objekt konnte nicht angelegt werden", error);
    toast.success("Objekt angelegt");
    neuLaden();
    onOpenChange(false);
    navigate(`/makler/objekte/${data.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neues Objekt</DialogTitle>
          <DialogDescription>Alles Weitere können Sie später ergänzen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="neu-titel">Titel</Label>
            <Input id="neu-titel" className="h-11" autoFocus value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. 3-Zimmer-Wohnung mit Bergblick" />
          </div>
          <div className="space-y-1.5">
            <Label>Kauf oder Miete?</Label>
            <Segmente
              className="w-full"
              wert={art}
              onChange={setArt}
              optionen={[{ key: "rent", label: "Miete" }, { key: "sale", label: "Kauf" }]}
            />
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="neu-plz">PLZ</Label>
              <Input id="neu-plz" className="h-11" inputMode="numeric" value={plz} onChange={(e) => setPlz(e.target.value)} placeholder="optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="neu-ort">Ort</Label>
              <Input id="neu-ort" className="h-11" value={ort} onChange={(e) => setOrt(e.target.value)} placeholder="z. B. Pfronten" />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-11" onClick={anlegen} disabled={laeuft}>
            {laeuft && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Neuer Interessent
// ---------------------------------------------------------------------------
export function NeuerInteressentDialog({
  open,
  onOpenChange,
  propertyId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Fest vorgegebenes Objekt (dann keine Auswahl). */
  propertyId?: string;
}) {
  const { userId } = useBrokerAccess();
  const neuLaden = useMaklerNeuLaden();
  const navigate = useNavigate();
  const { data: objekte = [] } = useBrokerProperties();
  const [objekt, setObjekt] = useState(propertyId ?? "");
  const [weg, setWeg] = useState<"neu" | "kontakt">("neu");
  const [kontaktId, setKontaktId] = useState<string | null>(null);
  const [kontaktName, setKontaktName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [quelle, setQuelle] = useState("telefon");
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    if (open) {
      setObjekt(propertyId ?? "");
      setWeg("neu");
      setKontaktId(null);
      setKontaktName("");
      setName("");
      setEmail("");
      setTelefon("");
      setQuelle("telefon");
    }
  }, [open, propertyId]);

  const aktiveObjekte = objekte.filter((o) => o.status !== "abgeschlossen" || o.id === propertyId);

  const anlegen = async () => {
    if (!objekt) return void toast.error("Bitte ein Objekt wählen.");
    if (weg === "kontakt" && !kontaktId) return void toast.error("Bitte einen Kontakt wählen.");
    if (weg === "neu" && !name.trim()) return void toast.error("Bitte mindestens einen Namen eingeben.");
    setLaeuft(true);
    try {
      let extName = name.trim() || null;
      let extEmail = email.trim() || null;
      let extTel = telefon.trim() || null;
      if (weg === "kontakt" && kontaktId) {
        extName = kontaktName || null;
        const [m, t] = await Promise.all([
          db.from("contact_emails").select("email, is_primary").eq("contact_id", kontaktId).order("is_primary", { ascending: false }).limit(1),
          db.from("contact_phones").select("phone_number").eq("contact_id", kontaktId).limit(1),
        ]);
        if (m.error) throw m.error;
        if (t.error) throw t.error;
        extEmail = (m.data?.[0] as { email?: string } | undefined)?.email ?? null;
        extTel = (t.data?.[0] as { phone_number?: string } | undefined)?.phone_number ?? null;
      }
      const { data, error } = await db
        .from("broker_leads")
        .insert({
          property_id: objekt,
          contact_id: weg === "kontakt" ? kontaktId : null,
          external_name: extName,
          external_email: extEmail,
          external_phone: extTel,
          status: "neu",
          source: quelle,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Interessent angelegt");
      neuLaden();
      onOpenChange(false);
      navigate(`/makler/interessenten/${data.id}`);
    } catch (e) {
      fehler("Interessent konnte nicht angelegt werden", e);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neuer Interessent</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!propertyId && (
            <div className="space-y-1.5">
              <Label>Objekt</Label>
              <Select value={objekt} onValueChange={setObjekt}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Objekt wählen…" /></SelectTrigger>
                <SelectContent>
                  {aktiveObjekte.map((o) => (
                    <SelectItem key={o.id} value={o.id} className="min-h-10">
                      {o.title}{o.city ? ` · ${o.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Segmente
            className="w-full"
            wert={weg}
            onChange={setWeg}
            optionen={[{ key: "neu", label: "Neu eingeben" }, { key: "kontakt", label: "Aus Adressen" }]}
          />
          {weg === "kontakt" ? (
            <div className="space-y-1.5">
              <Label>Kontakt</Label>
              <ContactPicker
                className="w-full"
                value={kontaktId}
                allowNone={false}
                onChange={(id, l) => { setKontaktId(id); setKontaktName(l ?? ""); }}
              />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="li-name">Name</Label>
                <Input id="li-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="li-mail">E-Mail</Label>
                <Input id="li-mail" className="h-11" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="li-tel">Telefon</Label>
                <Input id="li-tel" className="h-11" type="tel" inputMode="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="optional" />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Wie kam die Anfrage?</Label>
            <Select value={quelle} onValueChange={setQuelle}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUELLEN.map((q) => <SelectItem key={q.key} value={q.key} className="min-h-10">{q.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-11" onClick={anlegen} disabled={laeuft}>
            {laeuft && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Besichtigung planen
// ---------------------------------------------------------------------------
export function BesichtigungDialog({
  open,
  onOpenChange,
  lead,
  objektTitel,
  leadName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead: { id: string; property_id: string; status: LeadStatus };
  objektTitel: string;
  leadName: string;
}) {
  const { userId } = useBrokerAccess();
  const qcKalender = useQueryClient();
  const neuLaden = useMaklerNeuLaden();
  const [tag, setTag] = useState("");
  const [zeit, setZeit] = useState("10:00");
  const [dauer, setDauer] = useState("45");
  const [notiz, setNotiz] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    if (open) {
      const morgen = new Date(Date.now() + 86_400_000);
      setTag(`${morgen.getFullYear()}-${String(morgen.getMonth() + 1).padStart(2, "0")}-${String(morgen.getDate()).padStart(2, "0")}`);
      setZeit("10:00");
      setDauer("45");
      setNotiz("");
    }
  }, [open]);

  const planen = async () => {
    if (!tag || !zeit) return void toast.error("Bitte Tag und Uhrzeit wählen.");
    if (!userId) return void toast.error("Bitte neu anmelden.");
    const start = new Date(`${tag}T${zeit}:00`);
    if (isNaN(start.getTime())) return void toast.error("Datum oder Uhrzeit ist ungültig.");
    const ende = new Date(start.getTime() + Number(dauer) * 60_000);
    setLaeuft(true);
    try {
      const { data: termin, error } = await db
        .from("calendar_events")
        .insert({
          title: `Besichtigung: ${objektTitel} – ${leadName}`,
          description: notiz.trim() || null,
          start_datetime: start.toISOString(),
          end_datetime: ende.toISOString(),
          is_all_day: false,
          broker_property_id: lead.property_id,
          broker_lead_id: lead.id,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: e2 } = await db.from("broker_lead_events").insert({
        lead_id: lead.id,
        event_type: "viewing",
        title: `Besichtigung geplant: ${start.toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} Uhr`,
        body: notiz.trim() || null,
        calendar_event_id: termin.id,
        occurred_at: new Date().toISOString(),
        created_by: userId,
      });
      if (e2) throw e2;
      if (schrittIndex(lead.status) < schrittIndex("besichtigung")) {
        const { error: e3 } = await db.from("broker_leads").update({ status: "besichtigung" }).eq("id", lead.id);
        if (e3) throw e3;
      }
      toast.success("Besichtigung eingetragen", { description: "Der Termin steht im Kalender." });
      neuLaden();
      qcKalender.invalidateQueries({ queryKey: ["calendar-events"] });
      onOpenChange(false);
    } catch (e) {
      fehler("Besichtigung konnte nicht eingetragen werden", e);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Besichtigung planen</DialogTitle>
          <DialogDescription>{leadName} · {objektTitel}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="b-tag">Tag</Label>
              <Input id="b-tag" type="date" className="h-11" value={tag} onChange={(e) => setTag(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-zeit">Uhrzeit</Label>
              <Input id="b-zeit" type="time" className="h-11" value={zeit} onChange={(e) => setZeit(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Dauer</Label>
            <Select value={dauer} onValueChange={setDauer}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[["30", "30 Minuten"], ["45", "45 Minuten"], ["60", "1 Stunde"], ["90", "1½ Stunden"]].map(([v, l]) => (
                  <SelectItem key={v} value={v} className="min-h-10">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-notiz">Notiz (optional)</Label>
            <Textarea id="b-notiz" rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Treffpunkt vor dem Haus" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-11" onClick={planen} disabled={laeuft}>
            {laeuft && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Eintragen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Abschluss: Zusage oder Absage (mit kurzem Grund)
// ---------------------------------------------------------------------------
export function AusgangDialog({
  open,
  onOpenChange,
  nurAbsage,
  onWahl,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Direkt nach dem Grund fragen (Absage schon gewählt). */
  nurAbsage?: boolean;
  onWahl: (status: Extract<LeadStatus, "abschluss" | "absage">, grund?: string) => void | Promise<void>;
}) {
  const [absage, setAbsage] = useState(!!nurAbsage);
  const [grund, setGrund] = useState("");
  useEffect(() => {
    if (open) {
      setAbsage(!!nurAbsage);
      setGrund("");
    }
  }, [open, nurAbsage]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{absage ? "Absage" : "Wie ist es ausgegangen?"}</DialogTitle>
        </DialogHeader>
        {!absage ? (
          <div className="grid grid-cols-2 gap-3">
            <Button className="h-14 bg-emerald-600 hover:bg-emerald-700" onClick={() => onWahl("abschluss")}>
              {LEAD_LABEL.abschluss}
            </Button>
            <Button variant="outline" className="h-14 border-red-200 text-red-700 hover:bg-red-50" onClick={() => setAbsage(true)}>
              {LEAD_LABEL.absage}
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="absage-grund">Kurzer Grund (optional)</Label>
            <Input id="absage-grund" autoFocus className="h-11" value={grund} onChange={(e) => setGrund(e.target.value)} placeholder="z. B. zu teuer, anderes Objekt gefunden" />
          </div>
        )}
        {absage && (
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button className="h-11" onClick={() => onWahl("absage", grund)}>Absage speichern</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
