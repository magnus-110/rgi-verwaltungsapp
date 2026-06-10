import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyTag } from "./types";
import { KeySignatureOverlay } from "./KeySignatureOverlay";
import { useAuth } from "@/hooks/useAuth";
import { ChevronDown, PenLine, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

interface Props { open: boolean; onClose: () => void; tag: KeyTag; buildingId: string; }

export const KeyLoanDialog = ({ open, onClose, tag, buildingId }: Props) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactLabel, setContactLabel] = useState<string>("");
  const [contactSearch, setContactSearch] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [openReturn, setOpenReturn] = useState(false);
  const [dueDate, setDueDate] = useState(() => format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd"));
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [sendConfirmation, setSendConfirmation] = useState(false);
  const [sendOverdueReminder, setSendOverdueReminder] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);

  useEffect(() => { if (open) { setContactId(null); setContactLabel(""); setName(""); setEmail(""); setSignature(null); setNotes(""); setRequiresSignature(false); setSendConfirmation(false); setSendOverdueReminder(false); setOpenReturn(false); setDueDate(format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd")); }}, [open]);

  const { data: building } = useQuery({
    queryKey: ["building-label", buildingId],
    queryFn: async () => (await supabase.from("buildings").select("name").eq("id", buildingId).maybeSingle()).data,
    enabled: open && !!buildingId,
  });
  const buildingLabel = building?.name || "";

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-search", contactSearch],
    queryFn: async () => {
      const q = supabase
        .from("contacts")
        .select("id, company_name, contact_persons(first_name, last_name, is_primary, contact_emails(email))")
        .limit(20)
        .order("is_primary", { foreignTable: "contact_persons", ascending: false });
      if (contactSearch) q.ilike("company_name", `%${contactSearch}%`);
      return (await q).data ?? [];
    },
    enabled: open,
  });

  const persistLoan = async (sig: string | null) => {
    if (!contactId && !name) { toast.error("Kontakt oder Name angeben"); return; }
    if (requiresSignature && !sig) { toast.error("Unterschrift fehlt"); return; }
    setSaving(true);
    const { data: inserted, error } = await supabase.from("key_loans").insert({
      tag_id: tag.id,
      building_id: buildingId,
      borrower_contact_id: contactId,
      borrower_name: name || contactLabel || null,
      borrower_email: email || null,
      due_at: openReturn ? null : new Date(dueDate + "T23:59:59").toISOString(),
      requires_signature: requiresSignature,
      signature_data: sig,
      send_confirmation_email: sendConfirmation,
      send_overdue_reminder: sendOverdueReminder && !openReturn,
      issued_by_user_id: user?.id,
      notes: notes || null,
    }).select("id").maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }

    if (sendConfirmation && inserted?.id) {
      supabase.functions.invoke("send-key-email", { body: { loan_id: inserted.id, event: "issued" } })
        .then(({ error: e }) => { if (e) toast.warning("Webhook-Versand fehlgeschlagen: " + e.message); });
    }

    qc.invalidateQueries({ queryKey: ["key-loans-active", buildingId] });
    qc.invalidateQueries({ queryKey: ["key-tags", buildingId] });
    qc.invalidateQueries({ queryKey: ["key-events", buildingId] });
    qc.invalidateQueries({ queryKey: ["outstanding-keys"] });
    toast.success("Schlüssel ausgegeben");
    onClose();
  };

  const save = () => persistLoan(signature);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader><DialogTitle>Schlüssel ausgeben · <span className="font-mono">{tag.tag_number}</span></DialogTitle></DialogHeader>
          <div className="space-y-3">
          <div>
            <Label>Kontakt (optional)</Label>
            <Popover open={contactPopoverOpen} onOpenChange={setContactPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  {contactLabel || "Kontakt suchen…"}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Suchen…" value={contactSearch} onValueChange={setContactSearch} />
                  <CommandList>
                    <CommandEmpty>Keine Treffer</CommandEmpty>
                    {contacts.map((c: any) => {
                      const persons = (c.contact_persons ?? []) as any[];
                      const primary = persons.find((p) => p.is_primary) ?? persons[0];
                      const personName = primary ? [primary.first_name, primary.last_name].filter(Boolean).join(" ") : "";
                      const displayLabel = personName || c.company_name || "—";
                      const subLabel = personName && c.company_name ? c.company_name : "";
                      const mail = primary?.contact_emails?.[0]?.email;
                      return (
                        <CommandItem key={c.id} value={c.id} onSelect={() => {
                          setContactId(c.id);
                          setContactLabel(displayLabel + (subLabel ? ` (${subLabel})` : ""));
                          setName(personName || c.company_name || "");
                          setEmail(mail || "");
                          setContactPopoverOpen(false);
                        }}>
                          <div className="flex flex-col">
                            <span>{displayLabel}{mail && <span className="text-xs text-muted-foreground ml-2">{mail}</span>}</span>
                            {subLabel && <span className="text-xs text-muted-foreground">{subLabel}</span>}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-2 gap-2 min-w-0">
            <div className="min-w-0"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="min-w-0"><Label>E-Mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <div>
            <Label>Rückgabe bis {openReturn ? "" : "*"}</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={openReturn} />
            <label className="flex items-center gap-2 text-sm mt-2">
              <Checkbox checked={openReturn} onCheckedChange={(v) => setOpenReturn(!!v)} />
              Offene Rückgabe (z.B. Hausmeister – kein festes Datum)
            </label>
            {!openReturn && <p className="text-xs text-muted-foreground mt-1">Standard: 1 Woche</p>}
          </div>
          <div className="space-y-2 pt-2 border-t border-border">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={requiresSignature} onCheckedChange={(v) => setRequiresSignature(!!v)} /> Unterschrift erforderlich</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={sendConfirmation} onCheckedChange={(v) => setSendConfirmation(!!v)} /> Bestätigungs­mail senden (via Make.com)</label>
            <label className={`flex items-center gap-2 text-sm ${openReturn ? "opacity-50" : ""}`}>
              <Checkbox checked={sendOverdueReminder && !openReturn} disabled={openReturn} onCheckedChange={(v) => setSendOverdueReminder(!!v)} />
              Mahnmail bei Überfälligkeit
            </label>
          </div>
          {requiresSignature && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              {signature ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-medium">Unterschrift erfasst</span>
                  </div>
                  <div className="rounded-md border border-border bg-background p-2">
                    <img src={signature} alt="Unterschrift" className="h-16 w-auto mx-auto" />
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => setSignOpen(true)}>
                    Erneut unterschreiben
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Die Unterschrift wird im nächsten Schritt im Vollbild-Übergabeprotokoll erfasst.
                </p>
              )}
            </div>
          )}
          <div><Label>Notiz</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          {requiresSignature && !signature ? (
            <Button
              onClick={() => {
                if (!contactId && !name) { toast.error("Kontakt oder Name angeben"); return; }
                setSignOpen(true);
              }}
              className="gap-2"
            >
              <PenLine className="h-4 w-4" /> Jetzt unterschreiben
            </Button>
          ) : (
            <Button onClick={save} disabled={saving}>Ausgeben</Button>
          )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KeySignatureOverlay
        open={signOpen}
        onCancel={() => setSignOpen(false)}
        onConfirm={(png) => { setSignature(png); setSignOpen(false); persistLoan(png); }}
        tag={tag}
        borrowerName={name || contactLabel}
        dueDate={openReturn ? "" : dueDate}
        buildingLabel={buildingLabel}
        photoPath={tag.photo_path}
      />
    </>
  );
};
