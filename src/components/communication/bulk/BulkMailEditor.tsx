import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Loader2,
  Paperclip,
  Save,
  Search,
  Send,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useBulkRecipients, normalizeUnit, type BulkRecipient } from "./useBulkRecipients";

interface Props {
  campaignId: string;
  onBack: () => void;
}

const PLACEHOLDERS = [
  "anrede_brief",
  "vorname",
  "nachname",
  "vollname",
  "einheit",
  "gebaeude_name",
  "gebaeude_strasse",
  "verwalter_name",
  "datum_heute",
];

const fileLabel = (path: string) => (path.split("/").pop() || path).replace(/^\d+_/, "");

export const BulkMailEditor = ({ campaignId, onBack }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [accountId, setAccountId] = useState("");
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generalPaths, setGeneralPaths] = useState<string[]>([]);
  const [personal, setPersonal] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState<null | "save" | "send" | "upload">(null);
  const [loaded, setLoaded] = useState(false);

  const { data: campaign } = useQuery({
    queryKey: ["bulk-campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from("comm_campaigns").select("*").eq("id", campaignId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: overrides = [] } = useQuery({
    queryKey: ["bulk-campaign-overrides", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comm_recipient_overrides")
        .select("assignment_id, email, attachment_paths")
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["email-accounts-bulk"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_accounts")
        .select("id, display_name, email_address")
        .eq("is_active", true)
        .order("display_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: building } = useQuery({
    queryKey: ["bulk-building", buildingId],
    enabled: !!buildingId,
    queryFn: async () => {
      const { data } = await supabase.from("buildings").select("name, address").eq("id", buildingId!).maybeSingle();
      return data;
    },
  });

  const { data: recipients = [], isLoading: recipientsLoading } = useBulkRecipients(buildingId);

  // Initial hydration
  useEffect(() => {
    if (!campaign || loaded) return;
    setName(campaign.name || "");
    setSubject(campaign.subject_override || "");
    setBody(campaign.body_html_override || "");
    setAccountId(campaign.email_account_id || "");
    setBuildingId(campaign.building_id);
    setGeneralPaths((campaign.attachment_paths || []) as string[]);
    const keys = ((campaign.recipient_filter as any)?.recipient_keys || []) as string[];
    setSelected(new Set(keys));
    if (campaign.scheduled_at) setScheduledAt(new Date(campaign.scheduled_at).toISOString().slice(0, 16));
    setLoaded(true);
  }, [campaign, loaded]);

  useEffect(() => {
    if (overrides.length === 0) return;
    setPersonal((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const map: Record<string, string[]> = {};
      for (const o of overrides as any[]) {
        if (!o.assignment_id) continue;
        map[`${o.assignment_id}|${(o.email || "").toLowerCase()}`] = (o.attachment_paths || []) as string[];
      }
      return map;
    });
  }, [overrides]);

  const filtered = useMemo(() => {
    if (!search.trim()) return recipients;
    const s = search.toLowerCase();
    return recipients.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.email.toLowerCase().includes(s) ||
        (r.unitNumber || "").toLowerCase().includes(s),
    );
  }, [recipients, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, BulkRecipient[]>();
    for (const r of filtered) {
      const k = r.unitNumber || "—";
      const arr = map.get(k) || [];
      arr.push(r);
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const selectedRecipients = useMemo(() => recipients.filter((r) => selected.has(r.key)), [recipients, selected]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const selectAll = () => setSelected(new Set(filtered.map((r) => r.key)));
  const selectNone = () => setSelected(new Set());
  const selectOnePerUnit = () => {
    const seen = new Set<string>();
    const next = new Set<string>();
    for (const r of filtered) {
      const u = r.unitNumber || r.contactId;
      if (seen.has(u)) continue;
      seen.add(u);
      next.add(r.key);
    }
    setSelected(next);
  };

  const insertPlaceholder = (v: string) => {
    const el = bodyRef.current;
    const token = `{{${v}}}`;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const uploadFile = async (file: File, folder: "attachments" | "personal") => {
    const path = `campaigns/${campaignId}/${folder}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await supabase.storage.from("comm-assets").upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  };

  const handleGeneralUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy("upload");
    try {
      const paths: string[] = [];
      for (const f of Array.from(files)) paths.push(await uploadFile(f, "attachments"));
      setGeneralPaths((p) => [...p, ...paths]);
    } catch (e: any) {
      toast({ title: "Upload fehlgeschlagen", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handlePersonalUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy("upload");
    let matched = 0;
    let unmatched = 0;
    try {
      for (const f of Array.from(files)) {
        const prefix = f.name.match(/^\s*(\d+)\s*[_\-. ]/)?.[1];
        const unit = prefix ? String(Number(prefix)) : null;
        const targets = unit
          ? recipients.filter((r) => r.unitKey === unit && (selected.size === 0 || selected.has(r.key)))
          : [];
        if (targets.length === 0) {
          unmatched++;
          continue;
        }
        const path = await uploadFile(f, "personal");
        setPersonal((prev) => {
          const next = { ...prev };
          for (const t of targets) next[t.key] = [...(next[t.key] || []), path];
          return next;
        });
        matched++;
      }
      toast({
        title: `${matched} Datei(en) zugeordnet`,
        description: unmatched > 0 ? `${unmatched} ohne passende Einheitennummer (z. B. "0001_...") übersprungen.` : undefined,
        variant: unmatched > 0 ? "destructive" : "default",
      });
    } catch (e: any) {
      toast({ title: "Upload fehlgeschlagen", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const addPersonalToKey = async (key: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy("upload");
    try {
      const paths: string[] = [];
      for (const f of Array.from(files)) paths.push(await uploadFile(f, "personal"));
      setPersonal((prev) => ({ ...prev, [key]: [...(prev[key] || []), ...paths] }));
    } catch (e: any) {
      toast({ title: "Upload fehlgeschlagen", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const removePersonal = (key: string, path: string) =>
    setPersonal((prev) => ({ ...prev, [key]: (prev[key] || []).filter((p) => p !== path) }));

  const persist = async (status?: string) => {
    const keys = Array.from(selected);
    const update: any = {
      name: name.trim() || "Rundmail",
      subject_override: subject || null,
      body_html_override: body || null,
      email_account_id: accountId || null,
      attachment_paths: generalPaths,
      recipient_filter: { roles: [], contact_ids: [], assignment_ids: [], recipient_keys: keys },
      recipient_count: keys.length,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    };
    if (status) update.status = status;
    const { error } = await supabase.from("comm_campaigns").update(update).eq("id", campaignId);
    if (error) throw error;

    await supabase.from("comm_recipient_overrides").delete().eq("campaign_id", campaignId);
    const rows = Object.entries(personal)
      .filter(([key, paths]) => paths.length > 0 && selected.has(key))
      .map(([key, paths]) => {
        const r = recipients.find((x) => x.key === key);
        return {
          campaign_id: campaignId,
          contact_id: r?.contactId || null,
          assignment_id: r?.assignmentId || null,
          email: r?.email || null,
          attachment_paths: paths,
        };
      })
      .filter((r) => !!r.assignment_id);
    if (rows.length > 0) {
      const { error: oErr } = await supabase.from("comm_recipient_overrides").insert(rows as any);
      if (oErr) throw oErr;
    }
    qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
  };

  const handleSave = async () => {
    setBusy("save");
    try {
      await persist("draft");
      toast({ title: "Entwurf gespeichert" });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleSend = async () => {
    if (!accountId) return toast({ title: "Bitte Absender-Konto wählen", variant: "destructive" });
    if (!subject.trim() || !body.trim()) return toast({ title: "Betreff und Text erforderlich", variant: "destructive" });
    if (selected.size === 0) return toast({ title: "Keine Empfänger ausgewählt", variant: "destructive" });

    if (scheduledAt) {
      const when = new Date(scheduledAt);
      if (isNaN(when.getTime()) || when <= new Date())
        return toast({ title: "Zeitpunkt muss in der Zukunft liegen", variant: "destructive" });
      setBusy("send");
      try {
        await persist("scheduled");
        toast({ title: "Versand geplant" });
        onBack();
      } catch (e: any) {
        toast({ title: "Fehler", description: e?.message, variant: "destructive" });
      } finally {
        setBusy(null);
      }
      return;
    }

    if (!confirm(`Rundmail jetzt an ${selected.size} Empfänger senden?`)) return;
    setBusy("send");
    try {
      await persist("draft");
      const { data, error } = await supabase.functions.invoke("comm-send-bulk-email", {
        body: { campaign_id: campaignId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Versand abgeschlossen", description: `${(data as any)?.ok ?? 0} gesendet, ${(data as any)?.failed ?? 0} fehlgeschlagen` });
      qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
      onBack();
    } catch (e: any) {
      toast({ title: "Versand fehlgeschlagen", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const personalCount = selectedRecipients.filter((r) => (personal[r.key] || []).length > 0).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 p-3 border-b shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Zurück">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name der Rundmail"
          className="max-w-xs h-9"
        />
        {building && (
          <Badge variant="outline" className="hidden sm:inline-flex">
            {building.name}
          </Badge>
        )}
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleSave} disabled={busy !== null}>
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Speichern
        </Button>
        <Button size="sm" onClick={handleSend} disabled={busy !== null}>
          {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
          {scheduledAt ? "Planen" : `Senden (${selected.size})`}
        </Button>
      </div>

      <Tabs defaultValue="nachricht" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-2 self-start">
          <TabsTrigger value="nachricht">Nachricht</TabsTrigger>
          <TabsTrigger value="empfaenger">Empfänger ({selected.size})</TabsTrigger>
          <TabsTrigger value="anhaenge">Anhänge ({generalPaths.length + personalCount})</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 min-h-0">
          <TabsContent value="nachricht" className="p-4 space-y-4 mt-0">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Absender</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="E-Mail-Konto wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.display_name} ({a.email_address})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Geplanter Versand (optional)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Betreff</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Betreff" />
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1">
                <Label className="mr-2">Text</Label>
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => insertPlaceholder(p)}
                    className="text-[11px] px-1.5 py-0.5 rounded border text-muted-foreground hover:bg-muted"
                  >
                    {`{{${p}}}`}
                  </button>
                ))}
              </div>
              <Textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={16}
                placeholder={"{{anrede_brief}}\n\n..."}
                className="font-sans"
              />
            </div>
          </TabsContent>

          <TabsContent value="empfaenger" className="p-4 space-y-3 mt-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 h-9"
                  placeholder="Name, E-Mail oder Einheit suchen..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={selectAll}>
                Alle
              </Button>
              <Button variant="outline" size="sm" onClick={selectOnePerUnit}>
                Eine je Einheit
              </Button>
              <Button variant="outline" size="sm" onClick={selectNone}>
                Keine
              </Button>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              {recipientsLoading ? "Lade Empfänger..." : `${selected.size} von ${recipients.length} Adressen ausgewählt`}
            </p>

            <div className="space-y-3">
              {grouped.map(([unit, rows]) => (
                <Card key={unit} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{unit === "—" ? "Ohne Einheit" : `Einheit ${unit}`}</p>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          const allOn = rows.every((r) => next.has(r.key));
                          rows.forEach((r) => (allOn ? next.delete(r.key) : next.add(r.key)));
                          return next;
                        })
                      }
                    >
                      umschalten
                    </button>
                  </div>
                  <div className="space-y-1">
                    {rows.map((r) => (
                      <label
                        key={r.key}
                        className="flex items-center gap-3 p-1.5 rounded hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox checked={selected.has(r.key)} onCheckedChange={() => toggle(r.key)} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">{r.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                        </div>
                        {r.role && (
                          <Badge variant="secondary" className="capitalize text-[10px]">
                            {r.role}
                          </Badge>
                        )}
                        {(personal[r.key] || []).length > 0 && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Paperclip className="h-3 w-3" />
                            {(personal[r.key] || []).length}
                          </Badge>
                        )}
                      </label>
                    ))}
                  </div>
                </Card>
              ))}
              {!recipientsLoading && grouped.length === 0 && (
                <p className="text-sm text-muted-foreground">Keine E-Mail-Adressen im Gebäude gefunden.</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="anhaenge" className="p-4 space-y-6 mt-0">
            <div className="space-y-2">
              <Label>Anhänge für alle</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild disabled={busy !== null}>
                  <label className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-1" /> Dateien wählen
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleGeneralUpload(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                </Button>
                {busy === "upload" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <div className="flex flex-wrap gap-2">
                {generalPaths.map((p) => (
                  <Badge key={p} variant="secondary" className="gap-1">
                    {fileLabel(p)}
                    <button type="button" onClick={() => setGeneralPaths((x) => x.filter((y) => y !== p))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Persönliche Anhänge je Empfänger</Label>
              <p className="text-xs text-muted-foreground">
                Dateien werden automatisch anhand der Einheitennummer am Dateianfang zugeordnet, z. B.
                <code className="mx-1">0001_Einzelabrechnung.pdf</code> → Einheit 1.
              </p>
              <Button variant="outline" size="sm" asChild disabled={busy !== null}>
                <label className="cursor-pointer">
                  <Upload className="h-4 w-4 mr-1" /> Dateien automatisch zuordnen
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handlePersonalUpload(e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </Button>

              <div className="space-y-2 pt-2">
                {selectedRecipients.length === 0 && (
                  <p className="text-sm text-muted-foreground">Zuerst Empfänger auswählen.</p>
                )}
                {selectedRecipients.map((r) => {
                  const paths = personal[r.key] || [];
                  return (
                    <Card key={r.key} className={cn("p-3 flex flex-wrap items-center gap-2", paths.length === 0 && "opacity-80")}>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">
                          {r.unitNumber ? `${r.unitNumber} · ` : ""}
                          {r.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {paths.map((p) => (
                          <Badge key={p} variant="secondary" className="gap-1">
                            {fileLabel(p)}
                            <button type="button" onClick={() => removePersonal(r.key, p)}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <Button variant="ghost" size="sm" asChild disabled={busy !== null}>
                        <label className="cursor-pointer">
                          <Paperclip className="h-4 w-4" />
                          <input
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              addPersonalToKey(r.key, e.target.files);
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </Button>
                    </Card>
                  );
                })}
              </div>
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};

export { normalizeUnit };
