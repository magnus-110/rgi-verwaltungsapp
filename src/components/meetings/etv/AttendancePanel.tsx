import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, FileText, Loader2, Search, Shield, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getHeadWeight } from "@/lib/etvHeadcount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ProxyInstructionsMatrix } from "../ProxyInstructionsMatrix";
import { Segmented, EmptyState } from "./ui";
import { contactName, contactSortName, initAttendees, useAttendees, useBuildingContacts } from "./useAttendees";

interface Props {
  meetingId: string;
  buildingId: string;
  /** vorbereitung = Rückmeldungen, Vollmachten, Weisungen · live = zusätzlich Anwesenheit abhaken */
  mode: "vorbereitung" | "live";
}

type Filter = "alle" | "offen" | "anwesend" | "vollmacht";

/**
 * Teilnehmer, Vollmachten und Vorab-Weisungen – in der Einladungsphase zum Erfassen
 * der Rückmeldungen, in der Durchführung zusätzlich zum Abhaken der Anwesenheit.
 */
export const AttendancePanel = ({ meetingId, buildingId, mode }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: attendees = [], isLoading } = useAttendees(meetingId);
  const { data: contacts = [] } = useBuildingContacts(buildingId);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("alle");
  const [busyInit, setBusyInit] = useState(false);

  // Vollmacht-Dialog
  const [proxyFor, setProxyFor] = useState<any | null>(null);
  const [proxyType, setProxyType] = useState("manager");
  const [proxyContactId, setProxyContactId] = useState("");
  const [proxyExternal, setProxyExternal] = useState("");
  const [proxyVia, setProxyVia] = useState("email");
  const [proxyFile, setProxyFile] = useState<File | null>(null);

  const { data: agendaItems = [] } = useQuery({
    queryKey: ["etv-agenda-items-live", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase.from("etv_agenda_items").select("*").eq("meeting_id", meetingId).order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["etv-attendees-live", meetingId] });

  const contactLabel = (id: string | null) => {
    const c = contacts.find((x: any) => x.contacts?.id === id);
    return c ? contactName(c.contacts) : "Eigentümer";
  };

  const proxyLabel = (a: any) =>
    a.proxy_type === "manager" ? "Verwaltung" : a.proxy_type === "owner" ? contactLabel(a.proxy_contact_id) : a.proxy_external_name || "externe Person";

  const isIn = (a: any) => a.attendance_type === "present" || (a.attendance_type === "proxy" && !!a.checked_in_at);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return attendees.filter((a: any) => {
      const cba = a.contact_building_assignments;
      const name = contactName(cba?.contacts).toLowerCase();
      if (needle && !name.includes(needle) && !String(cba?.unit_number || "").toLowerCase().includes(needle)) return false;
      if (filter === "anwesend") return isIn(a);
      if (filter === "offen") return !isIn(a);
      if (filter === "vollmacht") return !!a.proxy_type;
      return true;
    });
  }, [attendees, q, filter]);

  const checkIn = useMutation({
    mutationFn: async ({ a, present }: { a: any; present: boolean }) => {
      const { error } = await supabase.from("etv_attendees").update({
        attendance_type: present ? (a.proxy_type ? "proxy" : "present") : a.proxy_type ? "proxy" : "absent",
        checked_in_at: present ? new Date().toISOString() : null,
      }).eq("id", a.id);
      if (error) throw error;
    },
    onMutate: async ({ a, present }) => {
      const key = ["etv-attendees-live", meetingId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<any[]>(key) || [];
      qc.setQueryData(key, prev.map((x) => (x.id === a.id
        ? { ...x, attendance_type: present ? (a.proxy_type ? "proxy" : "present") : a.proxy_type ? "proxy" : "absent", checked_in_at: present ? new Date().toISOString() : null }
        : x)));
      return { prev, key };
    },
    onError: (e: any, _v, ctx) => { if (ctx) qc.setQueryData(ctx.key, ctx.prev); toast({ title: "Fehler", description: e.message, variant: "destructive" }); },
    onSettled: refresh,
  });

  const saveProxy = useMutation({
    mutationFn: async () => {
      const a = proxyFor;
      const { data: { user } } = await supabase.auth.getUser();
      let documentFileId: string | null = null;
      if (proxyFile) {
        if (proxyFile.size > 50 * 1024 * 1024) throw new Error(`${proxyFile.name}: max. 50 MB`);
        const ext = proxyFile.name.split(".").pop();
        const path = `${buildingId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("building-files").upload(path, proxyFile);
        if (upErr) throw upErr;
        const { data: cat } = await supabase.from("building_file_categories").select("id").eq("building_id", buildingId).ilike("name", "%vollmacht%").limit(1).maybeSingle();
        const { data: inserted, error: insErr } = await (supabase.from("building_files") as any)
          .insert({
            display_name: proxyFile.name, file_path: path, file_size: proxyFile.size, mime_type: proxyFile.type,
            category_id: cat?.id || null, building_id: buildingId, uploaded_by: user?.id, management_mode: "weg",
            visibility_role: "intern", visible_to_users: false, source: "manual",
          })
          .select("id").single();
        if (insErr) throw insErr;
        documentFileId = inserted.id;
      }
      const { error } = await (supabase.from("etv_attendees") as any).update({
        attendance_type: "proxy",
        proxy_type: proxyType,
        proxy_contact_id: proxyType === "owner" ? proxyContactId || null : null,
        proxy_external_name: proxyType === "external" ? proxyExternal.trim() || null : null,
        proxy_token: proxyType === "external" ? (a.proxy_token || crypto.randomUUID()) : null,
        ...(documentFileId ? { proxy_document_file_id: documentFileId } : {}),
        proxy_source: "admin_manual",
        proxy_granted_via: proxyVia,
        proxy_recorded_by: user?.id || null,
        proxy_recorded_at: new Date().toISOString(),
      }).eq("id", a.id);
      if (error) throw error;
      return proxyType === "external" ? (a.proxy_token || null) : null;
    },
    onSuccess: async () => {
      const { data } = await supabase.from("etv_attendees").select("proxy_token").eq("id", proxyFor.id).maybeSingle();
      if (proxyType === "external" && data?.proxy_token) {
        try { await navigator.clipboard.writeText(`${window.location.origin}/etv-proxy/${data.proxy_token}`); } catch { /* egal */ }
        toast({ title: "Vollmacht gespeichert", description: "Der Abstimmungs-Link für die bevollmächtigte Person wurde kopiert." });
      } else {
        toast({ title: "Vollmacht gespeichert" });
      }
      setProxyFor(null);
      refresh();
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const removeProxy = async (a: any) => {
    if (!confirm("Vollmacht entfernen?")) return;
    const { error } = await (supabase.from("etv_attendees") as any).update({
      attendance_type: "absent", checked_in_at: null, proxy_type: null, proxy_contact_id: null, proxy_external_name: null,
      proxy_token: null, proxy_document_file_id: null, proxy_source: null, proxy_granted_via: null,
    }).eq("id", a.id);
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Vollmacht entfernt" });
    refresh();
  };

  const openDoc = async (path: string) => {
    const { data } = await supabase.storage.from("building-files").createSignedUrl(path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const init = async () => {
    setBusyInit(true);
    try {
      const n = await initAttendees(meetingId, buildingId);
      toast({ title: n ? `${n} Eigentümer geladen` : "Teilnehmerliste ist aktuell" });
      refresh();
      qc.invalidateQueries({ queryKey: ["etv-heads", meetingId] });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message, variant: "destructive" });
    } finally {
      setBusyInit(false);
    }
  };

  const presentCount = attendees.filter(isIn).length;

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (attendees.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="Noch keine Teilnehmerliste"
        text="Die Liste wird aus den aktiven Eigentümern der Liegenschaft erstellt. Danach kannst du Rückmeldungen, Vollmachten und Weisungen eintragen."
        action={<Button onClick={init} disabled={busyInit}>{busyInit && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Eigentümer laden</Button>}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name oder Wohnungsnummer suchen …" className="h-10 pl-9" />
        </div>
        <Segmented
          size="sm"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: "alle", label: "Alle", count: attendees.length },
            { value: mode === "live" ? "anwesend" : "vollmacht", label: mode === "live" ? "Anwesend" : "Vollmacht", count: mode === "live" ? presentCount : attendees.filter((a: any) => a.proxy_type).length },
            ...(mode === "live" ? [{ value: "offen" as Filter, label: "Fehlen", count: attendees.length - presentCount }] : []),
          ]}
        />
        <div className="flex gap-2">
          <ProxyInstructionsMatrix
            meetingId={meetingId}
            agendaItems={agendaItems as any}
            attendees={attendees as any}
            trigger={<Button size="sm" variant="outline" className="h-10 gap-1.5"><FileSignature className="h-4 w-4" /> Weisungen eintragen</Button>}
          />
          <Button size="sm" variant="ghost" className="h-10" onClick={init} disabled={busyInit} title="Neue Eigentümer der Liegenschaft ergänzen">
            {busyInit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Abgleichen"}
          </Button>
        </div>
      </div>

      <div className="max-h-[520px] overflow-y-auto rounded-xl border">
        {rows.map((a: any) => {
          const cba = a.contact_building_assignments;
          const instr = a.pre_vote_instructions ? Object.keys(a.pre_vote_instructions).length : 0;
          const self = a.self_reported_type;
          return (
            <div key={a.id} className={cn("grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b px-3.5 py-2 last:border-0 md:grid-cols-[44px_minmax(0,1fr)_minmax(0,1.7fr)_auto]", mode === "live" && isIn(a) && "bg-emerald-50/50 dark:bg-emerald-950/20")}>
              <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">{cba?.unit_number || "–"}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{contactSortName(cba?.contacts)}</span>
                {getHeadWeight(a) === 0 && <span className="block text-[11px] text-muted-foreground">mit anderer Einheit zusammengefasst</span>}
              </span>
              <span className="hidden min-w-0 flex-wrap items-center gap-1.5 md:flex">
                {self && (
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                    self === "present" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : self === "proxy" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-muted text-muted-foreground")}>
                    {self === "present" ? "Zusage" : self === "proxy" ? "will Vollmacht" : "Absage"}
                  </span>
                )}
                {a.proxy_type && (
                  <span className="flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    Vollmacht an {proxyLabel(a)}
                    <button type="button" aria-label="Vollmacht entfernen" onClick={() => removeProxy(a)} className="opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
                  </span>
                )}
                {a.proxy_document?.file_path && (
                  <button type="button" title="Vollmacht-Dokument öffnen" onClick={() => openDoc(a.proxy_document.file_path)} className="text-primary"><FileText className="h-3.5 w-3.5" /></button>
                )}
                {instr > 0 && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{instr} Weisung{instr === 1 ? "" : "en"}</span>}
              </span>
              <span className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 px-2 text-xs"
                  onClick={() => {
                    setProxyFor(a);
                    setProxyType(a.proxy_type || "manager");
                    setProxyContactId(a.proxy_contact_id || "");
                    setProxyExternal(a.proxy_external_name || "");
                    setProxyVia(a.proxy_granted_via || "email");
                    setProxyFile(null);
                  }}
                >
                  <Shield className="h-3.5 w-3.5 text-blue-600" /> <span className="hidden sm:inline">Vollmacht</span>
                </Button>
                {mode === "live" && (
                  <Switch aria-label={`${contactName(cba?.contacts)} anwesend`} checked={isIn(a)} onCheckedChange={(v) => checkIn.mutate({ a, present: v })} />
                )}
              </span>
            </div>
          );
        })}
        {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Niemand passt zur Suche.</p>}
      </div>

      <Dialog open={!!proxyFor} onOpenChange={(o) => !o && setProxyFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vollmacht erfassen</DialogTitle>
            <DialogDescription>{proxyFor ? `${proxyFor.contact_building_assignments?.unit_number || ""} ${contactName(proxyFor.contact_building_assignments?.contacts)}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Bevollmächtigt ist</Label>
              <Select value={proxyType} onValueChange={setProxyType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">die Verwaltung</SelectItem>
                  <SelectItem value="owner">ein anderer Eigentümer</SelectItem>
                  <SelectItem value="external">eine andere Person</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {proxyType === "owner" && (
              <div className="space-y-1.5">
                <Label>Eigentümer</Label>
                <Select value={proxyContactId} onValueChange={setProxyContactId}>
                  <SelectTrigger><SelectValue placeholder="Eigentümer wählen …" /></SelectTrigger>
                  <SelectContent>
                    {Array.from(new Map(contacts.map((c: any) => [c.contacts.id, c.contacts])).values()).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{contactName(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {proxyType === "external" && (
              <div className="space-y-1.5">
                <Label htmlFor="px-ext">Name der Person</Label>
                <Input id="px-ext" value={proxyExternal} onChange={(e) => setProxyExternal(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Vollmacht erhalten per</Label>
              <Select value={proxyVia} onValueChange={setProxyVia}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">E-Mail</SelectItem>
                  <SelectItem value="paper">Papier</SelectItem>
                  <SelectItem value="app">App</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vollmacht-Dokument (optional)</Label>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.eml,.msg,.doc,.docx" onChange={(e) => setProxyFile(e.target.files?.[0] || null)} />
              <p className="text-xs text-muted-foreground">Nachweis in Textform (§ 25 Abs. 3 WEG). Wird in den Gebäude-Dokumenten abgelegt.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProxyFor(null)}>Abbrechen</Button>
            <Button onClick={() => saveProxy.mutate()} disabled={saveProxy.isPending || (proxyType === "owner" && !proxyContactId)}>
              {saveProxy.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
