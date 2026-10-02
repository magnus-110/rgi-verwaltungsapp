import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { REPORT_CHANNEL_LABEL, ReportChannel, useCreateReport } from "@/hooks/useReports";
import { errorMessage } from "@/lib/reports";

export interface ReportPrefill {
  title?: string;
  description?: string;
  contactName?: string;
  contactEmail?: string;
  buildingId?: string | null;
  sourceEmailId?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Gesetzt, wenn die Meldung aus einer E-Mail übernommen wird. */
  prefill?: ReportPrefill | null;
  onCreated?: (report: { id: string; report_number: string; status: string }) => void;
}

const MANUAL_CHANNELS: ReportChannel[] = ["phone", "letter", "in_person", "email"];

/** Meldung von Hand erfassen (Anruf, Brief) oder aus einer E-Mail übernehmen. */
export function CreateReportDialog({ open, onOpenChange, prefill, onCreated }: Props) {
  const fromEmail = !!prefill?.sourceEmailId;
  const create = useCreateReport();
  const [buildingId, setBuildingId] = useState("");
  const [channel, setChannel] = useState<ReportChannel>("phone");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-for-reports"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, management_mode")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!open) return;
    setBuildingId(prefill?.buildingId || "");
    setChannel(fromEmail ? "email" : "phone");
    setTitle(prefill?.title || "");
    setDescription(prefill?.description || "");
    setName(prefill?.contactName || "");
    setEmail(prefill?.contactEmail || "");
    setPhone("");
    // Nur beim Öffnen übernehmen — sonst würde jede Eingabe wieder überschrieben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    const building = buildings.find((b) => b.id === buildingId);
    if (!building || !title.trim()) {
      toast.error("Bitte Gebäude und Betreff angeben");
      return;
    }
    try {
      const created = await create.mutateAsync({
        buildingId,
        managementMode: building.management_mode as "weg" | "rent",
        title,
        description,
        contactName: name,
        contactEmail: email,
        contactPhone: phone,
        channel,
        sourceEmailId: prefill?.sourceEmailId ?? null,
      });
      toast.success(`Meldung ${created.report_number} angelegt`);
      onOpenChange(false);
      onCreated?.(created);
    } catch (e) {
      toast.error(errorMessage(e, "Meldung konnte nicht angelegt werden"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{fromEmail ? "Als Meldung übernehmen" : "Meldung erfassen"}</DialogTitle>
          <DialogDescription>
            {fromEmail
              ? "Die E-Mail bleibt im Postfach und ist mit der Meldung verknüpft."
              : "Zum Beispiel nach einem Anruf oder Brief."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Gebäude *</p>
              <Select value={buildingId} onValueChange={setBuildingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Gebäude wählen" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                      {b.management_mode === "rent" ? " (Miete)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Eingang über</p>
              <Select value={channel} onValueChange={(v) => setChannel(v as ReportChannel)} disabled={fromEmail}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {REPORT_CHANNEL_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="new-report-title">
              Betreff *
            </label>
            <Input
              id="new-report-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Haustür schließt nicht mehr"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="new-report-text">
              {fromEmail ? "Text" : "Notiz zum Gespräch"}
            </label>
            <Textarea id="new-report-text" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <label className="text-sm font-medium" htmlFor="new-report-name">
                Melder
              </label>
              <Input id="new-report-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="new-report-mail">
                E-Mail
              </label>
              <Input id="new-report-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="new-report-phone">
                Telefon
              </label>
              <Input id="new-report-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Von Hand erfasste Meldungen haben keinen Portalzugang. Nachrichten an den Melder gehen deshalb per E-Mail —
            dafür die Adresse eintragen.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Meldung anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
