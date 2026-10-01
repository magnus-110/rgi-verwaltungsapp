import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Mail, PenLine, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";
import { currentSigner, useMySignature } from "@/lib/documentSigning";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignaturePad } from "@/components/buildings/keys/SignaturePad";
import { contactEmail, contactName, useAttendees } from "./useAttendees";

const db = supabase as any;

type Role = "leiter" | "protokollant" | "eigentuemer";
const ROLES: { key: Role; label: string; hint: string }[] = [
  { key: "leiter", label: "Versammlungsleitung", hint: "meist die Verwaltung" },
  { key: "protokollant", label: "Protokollführung", hint: "wer das Protokoll geführt hat" },
  { key: "eigentuemer", label: "Wohnungseigentümer/in", hint: "ein in der Versammlung anwesender Eigentümer" },
];

interface Props { meeting: any; onFiled?: () => void }

/**
 * Unterschriften unter dem Protokoll (§ 24 Abs. 6 WEG): direkt in der App – mit der
 * hinterlegten eigenen Unterschrift oder am Gerät – oder per Link, z. B. an einen Eigentümer.
 * Sobald alle drei vorliegen, wird das Protokoll final erstellt und abgelegt.
 */
export const SignaturePanel = ({ meeting, onFiled }: Props) => {
  const meetingId = meeting.id as string;
  const { toast } = useToast();
  const qc = useQueryClient();
  const { openCompose } = useComposeEmail();
  const { data: mySignature } = useMySignature();
  const { data: attendees = [] } = useAttendees(meetingId);

  const { data: signatures = [], isFetched: sigsFetched } = useQuery({
    queryKey: ["etv-protocol-signatures", meetingId],
    queryFn: async () => (await supabase.from("etv_protocol_signatures").select("*").eq("meeting_id", meetingId)).data || [],
    refetchInterval: 20_000,
  });
  const { data: requests = [] } = useQuery({
    queryKey: ["etv-sign-requests", meetingId],
    queryFn: async () => (await db.from("etv_protocol_sign_requests").select("*").eq("meeting_id", meetingId).neq("status", "zurueckgezogen").order("created_at", { ascending: false })).data || [],
    refetchInterval: 20_000,
  });

  const [padRole, setPadRole] = useState<Role | null>(null);
  const [padName, setPadName] = useState("");
  const [padPng, setPadPng] = useState<string | null>(null);
  const [linkRole, setLinkRole] = useState<Role | null>(null);
  const [linkPerson, setLinkPerson] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkEmail, setLinkEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);

  const sigOf = (r: Role) => signatures.find((s: any) => s.role === r);
  const reqOf = (r: Role) => requests.find((x: any) => x.role === r && x.status === "offen");
  const allSigned = ROLES.every((r) => sigOf(r.key));
  const filed = !!meeting.protocol_filed_at;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["etv-protocol-signatures", meetingId] });
    qc.invalidateQueries({ queryKey: ["etv-sign-requests", meetingId] });
    qc.invalidateQueries({ queryKey: ["etv-meeting-stats", meetingId] });
    qc.invalidateQueries({ queryKey: ["etv-meetings"] });
  };

  const defaultName = (r: Role) => (r === "leiter" ? meeting.meeting_chair || "" : r === "protokollant" ? meeting.minutes_taker || "" : "");

  const store = async (role: Role, name: string, png: string, contactId: string | null = null) => {
    await supabase.from("etv_protocol_signatures").delete().eq("meeting_id", meetingId).eq("role", role);
    const { error } = await supabase.from("etv_protocol_signatures").insert({ meeting_id: meetingId, role, signer_name: name, signature_png: png, signer_contact_id: contactId } as any);
    if (error) throw error;
    // offene Link-Anfrage für diese Rolle erledigt sich damit
    await db.from("etv_protocol_sign_requests").update({ status: "zurueckgezogen" }).eq("meeting_id", meetingId).eq("role", role).eq("status", "offen");
  };

  const signWithMine = async (role: Role) => {
    if (!mySignature) return;
    setBusy(role);
    try {
      const me = await currentSigner();
      await store(role, defaultName(role) || me.name, mySignature);
      toast({ title: "Unterschrieben" });
      refresh();
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const savePad = async () => {
    if (!padRole || !padPng || !padName.trim()) return;
    setBusy(padRole);
    try {
      await store(padRole, padName.trim(), padPng);
      toast({ title: "Unterschrift gespeichert" });
      setPadRole(null);
      refresh();
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const removeSignature = async (role: Role) => {
    if (!confirm("Unterschrift entfernen?")) return;
    await supabase.from("etv_protocol_signatures").delete().eq("meeting_id", meetingId).eq("role", role);
    refresh();
  };

  const linkFor = (token: string) => `${window.location.origin}/protokoll-unterschreiben/${token}`;

  const composeRequest = (req: any) => {
    const b = meeting.buildings?.name || "";
    const date = meeting.meeting_date ? new Date(meeting.meeting_date).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : "";
    openCompose({
      prefill: {
        to: req.email || "",
        subject: `Bitte Protokoll unterschreiben – WEG ${b}${date ? `, Versammlung vom ${date}` : ""}`,
        bodyText:
          `Guten Tag ${req.signer_name},\n\n` +
          `anbei der Link zum Protokoll der Eigentümerversammlung${date ? ` vom ${date}` : ""}. ` +
          `Sie können es dort lesen und direkt am Handy oder PC unterschreiben – eine Anmeldung ist nicht nötig:\n\n` +
          `${linkFor(req.token)}\n\n` +
          `Der Link ist 30 Tage gültig.\n\nVielen Dank und freundliche Grüße`,
      },
    });
  };

  const createRequest = async () => {
    if (!linkRole || !linkName.trim()) return;
    setBusy(linkRole);
    try {
      await db.from("etv_protocol_sign_requests").update({ status: "zurueckgezogen" }).eq("meeting_id", meetingId).eq("role", linkRole).eq("status", "offen");
      const person = attendees.find((a: any) => a.contact_building_assignments?.contacts?.id === linkPerson);
      const { data, error } = await db
        .from("etv_protocol_sign_requests")
        .insert({ meeting_id: meetingId, role: linkRole, signer_name: linkName.trim(), email: linkEmail.trim() || null, signer_contact_id: person ? linkPerson : null })
        .select("*")
        .single();
      if (error) throw error;
      try { await navigator.clipboard.writeText(linkFor(data.token)); } catch { /* egal */ }
      composeRequest(data);
      toast({ title: "Link erstellt", description: "Eine E-Mail mit dem Link ist vorbereitet. Der Link liegt auch in der Zwischenablage." });
      setLinkRole(null);
      refresh();
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (req: any) => {
    await db.from("etv_protocol_sign_requests").update({ status: "zurueckgezogen" }).eq("id", req.id);
    refresh();
  };

  const file = async () => {
    setFiling(true);
    try {
      const { data, error } = await supabase.functions.invoke("etv-finalize-signed-protocol", { body: { meeting_id: meetingId } });
      if (error) {
        let msg = error.message;
        try { const b = await (error as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* Standard */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      await db.from("etv_meetings").update({ protocol_filed_at: new Date().toISOString() }).eq("id", meetingId);
      qc.invalidateQueries({ queryKey: ["etv-meeting", meetingId] });
      refresh();
      toast({ title: "Protokoll abgelegt", description: "Das unterschriebene Protokoll liegt in den Gebäude-Dokumenten." });
      onFiled?.();
    } catch (e: any) {
      toast({ title: "Ablage fehlgeschlagen", description: e?.message, variant: "destructive" });
    } finally {
      setFiling(false);
    }
  };

  // Automatisch ablegen, sobald die letzte Unterschrift in der App dazukommt
  // (nur beim Wechsel von „unvollständig“ zu „vollständig“ in dieser Sitzung)
  const autoTried = useRef(false);
  const wasComplete = useRef<boolean | null>(null);
  useEffect(() => {
    if (!sigsFetched) return;
    if (wasComplete.current === null) { wasComplete.current = allSigned; return; }
    if (allSigned && !wasComplete.current && !filed && !autoTried.current) {
      autoTried.current = true;
      file();
    }
    wasComplete.current = allSigned;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSigned, filed, sigsFetched]);

  const owners = Array.from(new Map(attendees.map((a: any) => [a.contact_building_assignments?.contacts?.id, a])).values())
    .filter((a: any) => a?.contact_building_assignments?.contacts)
    .sort((a: any, b: any) => (b.attendance_type === "present" ? 1 : 0) - (a.attendance_type === "present" ? 1 : 0));

  return (
    <div className="space-y-3">
      {ROLES.map((r) => {
        const sig = sigOf(r.key);
        const req = reqOf(r.key);
        return (
          <div key={r.key} className="space-y-2.5 rounded-xl border p-3.5">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{r.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{sig ? sig.signer_name : req ? `${req.signer_name}${req.email ? ` · ${req.email}` : ""}` : r.hint}</span>
              </span>
              <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                sig ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : req ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
                {sig ? "unterschrieben" : req ? "wartet" : "offen"}
              </span>
            </div>
            {sig ? (
              <div className="flex items-end justify-between gap-3">
                <img src={sig.signature_png} alt={`Unterschrift ${sig.signer_name}`} className="h-12 max-w-[180px] object-contain" />
                <span className="text-right text-[11px] text-muted-foreground">
                  {sig.signed_at ? new Date(sig.signed_at).toLocaleDateString("de-DE") : ""}
                  {!filed && <button type="button" className="ml-2 font-semibold text-primary" onClick={() => removeSignature(r.key)}>Entfernen</button>}
                </span>
              </div>
            ) : req ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Link gesendet {new Date(req.created_at).toLocaleDateString("de-DE")}</span>
                <span className="flex gap-3">
                  <button type="button" className="font-semibold text-primary" onClick={() => composeRequest(req)}>Erinnern</button>
                  <button type="button" className="font-semibold text-muted-foreground hover:text-foreground" onClick={() => withdraw(req)}>Zurückziehen</button>
                  <button type="button" className="font-semibold text-muted-foreground hover:text-foreground" onClick={() => { setPadRole(r.key); setPadName(req.signer_name); setPadPng(null); }}>Doch hier</button>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {r.key !== "eigentuemer" && mySignature && (
                  <Button size="sm" className="h-8 gap-1.5" disabled={busy === r.key} onClick={() => signWithMine(r.key)}>
                    {busy === r.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Mit meiner Unterschrift
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => { setPadRole(r.key); setPadName(defaultName(r.key)); setPadPng(null); }}>
                  <PenLine className="h-3.5 w-3.5" /> Hier unterschreiben
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => { setLinkRole(r.key); setLinkPerson(""); setLinkName(defaultName(r.key)); setLinkEmail(""); }}>
                  <Send className="h-3.5 w-3.5" /> Zur Unterschrift senden
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {!mySignature && (
        <p className="text-xs text-muted-foreground">Tipp: Unter Einstellungen → „Meine Unterschrift“ hinterlegst du deine Unterschrift, dann reicht hier ein Klick.</p>
      )}
      {allSigned && !filed && (
        <Button className="w-full gap-2" disabled={filing} onClick={file}>{filing && <Loader2 className="h-4 w-4 animate-spin" />} Jetzt final erstellen und ablegen</Button>
      )}

      <Dialog open={!!padRole} onOpenChange={(o) => !o && setPadRole(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{ROLES.find((r) => r.key === padRole)?.label} – unterschreiben</DialogTitle>
            <DialogDescription>Mit Finger, Stift oder Maus.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Vor- und Nachname</Label><Input value={padName} onChange={(e) => setPadName(e.target.value)} /></div>
            <SignaturePad value={padPng} onChange={setPadPng} height={240} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPadRole(null)}>Abbrechen</Button>
            <Button disabled={!padPng || !padName.trim() || !!busy} onClick={savePad}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkRole} onOpenChange={(o) => !o && setLinkRole(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Zur Unterschrift senden</DialogTitle>
            <DialogDescription>Die Person bekommt einen Link, sieht das Protokoll und unterschreibt ohne Anmeldung. Der Link gilt 30 Tage.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            {linkRole === "eigentuemer" && (
              <div className="space-y-1.5">
                <Label>Eigentümer</Label>
                <Select
                  value={linkPerson}
                  onValueChange={(v) => {
                    setLinkPerson(v);
                    const a = attendees.find((x: any) => x.contact_building_assignments?.contacts?.id === v);
                    const c = a?.contact_building_assignments?.contacts;
                    setLinkName(contactName(c));
                    setLinkEmail(contactEmail(c) || "");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Eigentümer wählen …" /></SelectTrigger>
                  <SelectContent>
                    {owners.map((a: any) => {
                      const c = a.contact_building_assignments.contacts;
                      return (
                        <SelectItem key={c.id} value={c.id}>
                          {contactName(c)}{a.attendance_type === "present" ? " · war anwesend" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5"><Label>Name</Label><Input value={linkName} onChange={(e) => setLinkName(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>E-Mail</Label>
              <Input type="email" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} placeholder="name@beispiel.de" />
              <p className="text-xs text-muted-foreground"><Mail className="mr-1 inline h-3 w-3" />Es öffnet sich eine vorbereitete E-Mail in deinem Postfach – du kannst sie vor dem Senden anpassen.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkRole(null)}>Abbrechen</Button>
            <Button disabled={!linkName.trim() || !!busy} onClick={createRequest}>Link erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
