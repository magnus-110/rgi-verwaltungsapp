import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Segmente } from "@/components/broker/MaklerUi";
import { useBrokerAccess, useBrokerLeads, useBrokerProperties, MK } from "@/hooks/useMakler";
import { LEAD_LABEL, db, fehler, leadName } from "@/lib/makler";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailId: string;
}

/**
 * E-Mail einem Makler-Objekt zuordnen – und dabei einen vorhandenen
 * Interessenten wählen oder aus dem Absender einen neuen anlegen.
 */
export const MaklerZuordnenDialog = ({ open, onOpenChange, emailId }: Props) => {
  const qc = useQueryClient();
  const { userId } = useBrokerAccess();
  const { data: objekte = [] } = useBrokerProperties();
  const [objekt, setObjekt] = useState("");
  const [weg, setWeg] = useState<"neu" | "vorhanden" | "ohne">("neu");
  const [leadId, setLeadId] = useState("");
  const [name, setName] = useState("");
  const [adresse, setAdresse] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const { data: mail } = useQuery({
    queryKey: [MK, "zuordnen-mail", emailId],
    enabled: open && !!emailId,
    queryFn: async () => {
      const { data, error } = await db
        .from("emails")
        .select("id, subject, from_name, from_address, date, broker_property_id, broker_lead_id")
        .eq("id", emailId)
        .maybeSingle();
      if (error) {
        fehler("E-Mail konnte nicht geladen werden", error);
        return null;
      }
      return data as {
        id: string; subject: string | null; from_name: string | null; from_address: string | null;
        date: string | null; broker_property_id: string | null; broker_lead_id: string | null;
      } | null;
    },
  });
  const { data: leadsDaten } = useBrokerLeads();
  const leads = (leadsDaten ?? []).filter((l) => l.property_id === objekt);

  useEffect(() => {
    if (!open || !mail) return;
    setObjekt(mail.broker_property_id ?? "");
    setLeadId(mail.broker_lead_id ?? "");
    setWeg(mail.broker_lead_id ? "vorhanden" : "neu");
    setName(mail.from_name ?? "");
    setAdresse(mail.from_address ?? "");
  }, [open, mail]);

  // Gibt es den Absender beim Objekt schon? Dann vorschlagen.
  useEffect(() => {
    if (!objekt || !mail?.from_address || mail.broker_lead_id) return;
    const treffer = (leadsDaten ?? []).find(
      (l) => l.property_id === objekt && (l.external_email ?? "").toLowerCase() === mail.from_address!.toLowerCase(),
    );
    if (treffer) {
      setWeg("vorhanden");
      setLeadId(treffer.id);
    }
  }, [objekt, mail, leadsDaten]);

  const zuordnen = async () => {
    if (!objekt) return void toast.error("Bitte ein Objekt wählen.");
    if (weg === "vorhanden" && !leadId) return void toast.error("Bitte einen Interessenten wählen.");
    if (weg === "neu" && !name.trim() && !adresse.trim()) return void toast.error("Bitte Name oder E-Mail-Adresse eingeben.");
    setLaeuft(true);
    try {
      let lead: string | null = weg === "vorhanden" ? leadId : null;
      if (weg === "neu") {
        const { data, error } = await db
          .from("broker_leads")
          .insert({
            property_id: objekt,
            external_name: name.trim() || null,
            external_email: adresse.trim() || null,
            status: "neu",
            source: "email",
            created_by: userId,
          })
          .select("id")
          .single();
        if (error) throw error;
        lead = data.id;
      }
      const { data: geaendert, error: e1 } = await db
        .from("emails")
        .update({ broker_property_id: objekt, broker_lead_id: lead })
        .eq("id", emailId)
        .select("id");
      if (e1) throw e1;
      if (!geaendert || geaendert.length === 0) throw new Error("Keine Berechtigung, diese E-Mail zu ändern.");
      if (lead) {
        const { error: e2 } = await db.from("broker_lead_events").insert({
          lead_id: lead,
          event_type: "email",
          title: mail?.subject ? `E-Mail: ${mail.subject}` : "E-Mail zugeordnet",
          email_id: emailId,
          occurred_at: mail?.date ?? new Date().toISOString(),
          created_by: userId,
        });
        if (e2) throw e2;
      }
      toast.success(weg === "neu" ? "Interessent angelegt und E-Mail zugeordnet" : "E-Mail zugeordnet");
      qc.invalidateQueries({ queryKey: ["emails"] });
      qc.invalidateQueries({ queryKey: [MK] });
      onOpenChange(false);
    } catch (e) {
      fehler("Zuordnen hat nicht geklappt", e);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Makler zuordnen</DialogTitle>
          {mail && <DialogDescription className="truncate">{mail.subject || "(ohne Betreff)"} · {mail.from_name || mail.from_address}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Objekt</Label>
            <Select value={objekt} onValueChange={(v) => { setObjekt(v); setLeadId(""); }}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Objekt wählen…" /></SelectTrigger>
              <SelectContent>
                {objekte
                  .filter((o) => o.status !== "abgeschlossen" || o.id === objekt)
                  .map((o) => (
                    <SelectItem key={o.id} value={o.id} className="min-h-10">
                      {o.title}{o.city ? ` · ${o.city}` : ""} ({o.listing_type === "sale" ? "Kauf" : "Miete"})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {objekt && (
            <>
              <Segmente
                className="w-full"
                wert={weg}
                onChange={setWeg}
                optionen={[
                  { key: "neu", label: "Neuer Interessent" },
                  { key: "vorhanden", label: "Vorhandener" },
                  { key: "ohne", label: "Nur Objekt" },
                ]}
              />
              {weg === "neu" && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Aus dem Absender dieser E-Mail:</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="mz-name">Name</Label>
                    <Input id="mz-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mz-mail">E-Mail</Label>
                    <Input id="mz-mail" className="h-11" type="email" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
                  </div>
                </div>
              )}
              {weg === "vorhanden" && (
                <div className="space-y-1.5">
                  <Label>Interessent</Label>
                  {leads.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Zu diesem Objekt gibt es noch keine Interessenten.</p>
                  ) : (
                    <Select value={leadId} onValueChange={setLeadId}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Interessent wählen…" /></SelectTrigger>
                      <SelectContent>
                        {leads.map((l) => (
                          <SelectItem key={l.id} value={l.id} className="min-h-10">
                            {leadName(l)} · {LEAD_LABEL[l.status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-11" onClick={zuordnen} disabled={laeuft || !objekt}>
            {laeuft && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Zuordnen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
