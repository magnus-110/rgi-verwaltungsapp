import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CallLog, formatDuration, htmlToText } from "./callLogUtils";
import { toTelHref } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Check, User, FileText, ExternalLink, Loader2, Mail, Building } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";

type Props = {
  /** Filter: nur Anrufe zu diesem Kontakt */
  contactId?: string | null;
  /** Filter: nur Anrufe zu diesem Gebäude */
  buildingId?: string | null;
  /** Kompaktansicht (für Tab im Kontakt/Gebäude) */
  compact?: boolean;
};

export function CallLogList({ contactId, buildingId, compact }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transcriptOpenFor, setTranscriptOpenFor] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["call-logs", { contactId: contactId ?? null, buildingId: buildingId ?? null }],
    queryFn: async () => {
      let q = supabase
        .from("call_logs")
        .select("*, contact:contacts(id, first_name, last_name, company_name, short_name)")
        .order("started_at", { ascending: false })
        .limit(300);
      if (contactId) q = q.eq("contact_id", contactId);
      if (buildingId) q = q.eq("building_id", buildingId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 30_000,
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("call_logs_panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_logs" }, () => {
        qc.invalidateQueries({ queryKey: ["call-logs"] });
        qc.invalidateQueries({ queryKey: ["call-logs-missed-count"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const sorted = useMemo(() => {
    const list = [...items];
    list.sort((a, b) => {
      const ao = a.status === "verpasst" && !a.handled ? 1 : 0;
      const bo = b.status === "verpasst" && !b.handled ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    });
    return list;
  }, [items]);

  const selected = sorted.find((r) => r.id === selectedId) || null;

  async function markHandled(id: string) {
    const { error } = await supabase
      .from("call_logs")
      .update({ handled: true, handled_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else qc.invalidateQueries({ queryKey: ["call-logs"] });
  }

  function callBack(number: string | null) {
    const href = toTelHref(number);
    if (!href) return;
    window.location.href = href;
  }

  function displayName(row: any) {
    const c = row.contact;
    if (c) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
      return name || c.company_name || c.short_name || row.number_raw || "Unbekannt";
    }
    return row.number_raw || "Unbekannte Nummer";
  }

  function dateLabel(s: string) {
    const d = new Date(s);
    return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  }

  return (
    <div className={cn("flex h-full min-h-0", compact ? "flex-col" : "flex-col md:flex-row")}>
      <div className={cn("flex-1 min-h-0 border-r", compact && "border-r-0")}>
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="flex items-center justify-center p-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Lädt …
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Keine Telefonate</div>
          ) : (
            <ul className="divide-y">
              {sorted.map((row) => {
                const isMissed = row.status === "verpasst" && !row.handled;
                const isActive = selectedId === row.id;
                const Icon = row.direction === "incoming"
                  ? (row.status === "verpasst" ? PhoneMissed : PhoneIncoming)
                  : PhoneOutgoing;
                return (
                  <li
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={cn(
                      "px-3 py-2 cursor-pointer hover:bg-muted/60 transition-colors flex items-center gap-3",
                      isActive && "bg-muted",
                      isMissed && "bg-destructive/5"
                    )}
                  >
                    <Icon className={cn(
                      "h-4 w-4 shrink-0",
                      row.status === "verpasst" ? "text-destructive" : "text-muted-foreground"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm truncate", isMissed && "font-semibold")}>
                          {displayName(row)}
                        </span>
                        {isMissed && <Badge variant="destructive" className="text-[10px] h-4 px-1">Verpasst</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {row.number_raw} · {dateLabel(row.started_at)}
                        {row.duration_seconds > 0 && ` · ${formatDuration(row.duration_seconds)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); callBack(row.number_raw); }} title="Rückruf">
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                      {isMissed && (
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); markHandled(row.id); }} title="Als erledigt markieren">
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </div>

      {!compact && (
        <div className="w-full md:w-[420px] shrink-0 min-h-0 flex flex-col">
          {selected ? (
            <CallDetail
              row={selected}
              onContact={(id) => navigate(`/contacts?id=${id}`)}
              onOpenTranscript={() => setTranscriptOpenFor(selected.id)}
              onChanged={() => qc.invalidateQueries({ queryKey: ["call-logs"] })}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
              Wählen Sie ein Telefonat aus
            </div>
          )}
        </div>
      )}

      <TranscriptDialog
        callId={transcriptOpenFor}
        onClose={() => setTranscriptOpenFor(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["call-logs"] })}
      />
    </div>
  );
}

function CallDetail({
  row, onContact, onOpenTranscript, onChanged,
}: { row: any; onContact: (id: string) => void; onOpenTranscript: () => void; onChanged: () => void }) {
  const [note, setNote] = useState<string>(row.note ?? "");
  const { toast } = useToast();
  const navigate = useNavigate();
  const { openCompose } = useComposeEmail();

  const { data: contactExtras } = useQuery({
    queryKey: ["call-contact-extras", row.contact_id],
    enabled: !!row.contact_id,
    queryFn: async () => {
      const [emailsRes, assignsRes] = await Promise.all([
        supabase
          .from("contact_emails")
          .select("email, is_primary")
          .eq("contact_id", row.contact_id)
          .order("is_primary", { ascending: false }),
        supabase
          .from("contact_building_assignments")
          .select("building_id, buildings:building_id(id, name)")
          .eq("contact_id", row.contact_id)
          .eq("is_active", true),
      ]);
      const email = (emailsRes.data || []).find((e: any) => e.email)?.email as string | undefined;
      const buildingsMap = new Map<string, string>();
      for (const a of (assignsRes.data || []) as any[]) {
        const b = a.buildings;
        if (b?.id) buildingsMap.set(b.id, b.name || "Gebäude");
      }
      return {
        email,
        buildings: Array.from(buildingsMap, ([id, name]) => ({ id, name })),
      };
    },
  });

  const email = contactExtras?.email;
  const buildings = contactExtras?.buildings ?? [];
  useEffect(() => { setNote(row.note ?? ""); }, [row.id]);

  // debounced save
  useEffect(() => {
    const t = setTimeout(async () => {
      if ((row.note ?? "") === note) return;
      const { error } = await supabase.from("call_logs").update({ note }).eq("id", row.id);
      if (error) toast({ title: "Notiz nicht gespeichert", description: error.message, variant: "destructive" });
      else onChanged();
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  const Icon = row.direction === "incoming"
    ? (row.status === "verpasst" ? PhoneMissed : PhoneIncoming)
    : PhoneOutgoing;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", row.status === "verpasst" ? "text-destructive" : "text-muted-foreground")} />
          <span className="font-medium">
            {row.contact
              ? ([row.contact.first_name, row.contact.last_name].filter(Boolean).join(" ") || row.contact.company_name || row.number_raw)
              : (row.number_raw || "Unbekannte Nummer")}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {new Date(row.started_at).toLocaleString("de-DE")}{" "}
          · {row.direction === "incoming" ? "eingehend" : "ausgehend"}
          {" · "}{row.status}
          {row.duration_seconds > 0 && ` · ${formatDuration(row.duration_seconds)}`}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {row.number_raw && (
            <Button size="sm" variant="outline" asChild>
              <a href={toTelHref(row.number_raw) ?? "#"}><Phone className="h-3.5 w-3.5 mr-1" />Rückruf</a>
            </Button>
          )}
          {row.contact_id && (
            <Button size="sm" variant="outline" onClick={() => onContact(row.contact_id)}>
              <User className="h-3.5 w-3.5 mr-1" />Kontakt
            </Button>
          )}
          {email && (
            <Button size="sm" variant="outline" onClick={() => openCompose({ prefill: { to: email } })}>
              <Mail className="h-3.5 w-3.5 mr-1" />E-Mail
            </Button>
          )}
          {buildings.length === 1 && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/buildings/${buildings[0].id}`)}>
              <Building className="h-3.5 w-3.5 mr-1" />Zum Gebäude
            </Button>
          )}
          {buildings.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Building className="h-3.5 w-3.5 mr-1" />Zum Gebäude
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {buildings.map((b) => (
                  <DropdownMenuItem key={b.id} onClick={() => navigate(`/buildings/${b.id}`)}>
                    {b.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="sm" variant="outline" onClick={onOpenTranscript}>
            <FileText className="h-3.5 w-3.5 mr-1" />Transkript {row.transcript ? "bearbeiten" : "hinzufügen"}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1">Notiz</div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={6} placeholder="Notiz zum Anruf …" />
          </div>
          {row.transcript && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">Transkript</div>
              <div className="text-sm whitespace-pre-wrap rounded-md border bg-muted/40 p-3 max-h-[300px] overflow-auto">
                {row.transcript}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function TranscriptDialog({
  callId, onClose, onSaved,
}: { callId: string | null; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<"html" | "file">("html");
  const [html, setHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => { if (!callId) { setHtml(""); setTab("html"); } }, [callId]);

  async function handleFile(f: File | null) {
    if (!f) return;
    const txt = await f.text();
    setHtml(txt);
  }

  async function save() {
    if (!callId) return;
    setSaving(true);
    const text = htmlToText(html);
    const { error } = await supabase.from("call_logs").update({ transcript: text }).eq("id", callId);
    setSaving(false);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else { onSaved(); onClose(); toast({ title: "Transkript gespeichert" }); }
  }

  return (
    <Dialog open={!!callId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transkript hinzufügen</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="html">HTML einfügen</TabsTrigger>
            <TabsTrigger value="file">HTML-Datei wählen</TabsTrigger>
          </TabsList>
          <TabsContent value="html" className="mt-3">
            <Textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={12}
              placeholder="HTML aus Transkriptionstool einfügen …" />
          </TabsContent>
          <TabsContent value="file" className="mt-3">
            <input type="file" accept=".html,.htm,text/html" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          </TabsContent>
        </Tabs>
        {html && (
          <div className="mt-2">
            <div className="text-xs text-muted-foreground mb-1">Vorschau (nur Text wird gespeichert):</div>
            <div className="text-sm whitespace-pre-wrap rounded-md border bg-muted/40 p-3 max-h-[200px] overflow-auto">
              {htmlToText(html)}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={save} disabled={!html.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
