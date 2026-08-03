import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  CalendarClock,
  Loader2,
  Paperclip,
  Save,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import { useBulkRecipients, normalizeUnit, type BulkRecipient } from "./useBulkRecipients";
import { BulkRecipientCard, type RecipientGroup } from "./BulkRecipientCard";
import { BulkRecipientDialog } from "./BulkRecipientDialog";
import { BulkDropzone } from "./BulkDropzone";
import type { PlaceholderSamples } from "../usePlaceholderSamples";

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

const PLACEHOLDER_LABELS: Record<string, string> = {
  anrede_brief: "Anrede",
  vorname: "Vorname",
  nachname: "Nachname",
  vollname: "Vollständiger Name",
  einheit: "Einheit",
  gebaeude_name: "Gebäude",
  gebaeude_strasse: "Straße",
  verwalter_name: "Verwalter",
  datum_heute: "Datum heute",
};


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
  const [textOverrides, setTextOverrides] = useState<Record<string, { subject: string | null; body: string | null }>>({});
  const [noDuplicates, setNoDuplicates] = useState(true);
  const [search, setSearch] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState<null | "save" | "send" | "upload">(null);
  const [loaded, setLoaded] = useState(false);
  const [dialog, setDialog] = useState<{ mode: "preview" | "edit"; key: string } | null>(null);

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
        .select("assignment_id, email, attachment_paths, subject, body_html")
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
    const filter = (campaign.recipient_filter as any) || {};
    setSelected(new Set((filter.recipient_keys || []) as string[]));
    if (typeof filter.no_duplicates === "boolean") setNoDuplicates(filter.no_duplicates);
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
    setTextOverrides((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const map: Record<string, { subject: string | null; body: string | null }> = {};
      for (const o of overrides as any[]) {
        if (!o.assignment_id) continue;
        if (!o.subject && !o.body_html) continue;
        map[`${o.assignment_id}|${(o.email || "").toLowerCase()}`] = {
          subject: o.subject ?? null,
          body: o.body_html ?? null,
        };
      }
      return map;
    });
  }, [overrides]);

  /** Empfänger-Karten: je E-Mail-Adresse zusammengefasst (oder je Einheit). */
  const groups = useMemo<RecipientGroup[]>(() => {
    if (!noDuplicates) {
      return recipients.map((r) => ({
        key: r.key,
        keys: [r.key],
        name: r.name,
        email: r.email,
        role: r.role,
        units: r.unitNumber ? [r.unitNumber] : [],
      }));
    }
    const map = new Map<string, RecipientGroup>();
    for (const r of recipients) {
      const id = r.email.toLowerCase();
      const g = map.get(id);
      if (!g) {
        map.set(id, {
          key: r.key,
          keys: [r.key],
          name: r.name,
          email: r.email,
          role: r.role,
          units: r.unitNumber ? [r.unitNumber] : [],
        });
      } else {
        g.keys.push(r.key);
        if (r.unitNumber && !g.units.includes(r.unitNumber)) g.units.push(r.unitNumber);
      }
    }
    return Array.from(map.values());
  }, [recipients, noDuplicates]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const s = search.toLowerCase();
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(s) ||
        g.email.toLowerCase().includes(s) ||
        g.units.some((u) => u.toLowerCase().includes(s)),
    );
  }, [groups, search]);

  const pathsForGroup = (g: RecipientGroup) => {
    const out: string[] = [];
    for (const k of g.keys) for (const p of personal[k] || []) if (!out.includes(p)) out.push(p);
    return out;
  };

  const isSelected = (g: RecipientGroup) => g.keys.some((k) => selected.has(k));
  const selectedGroups = useMemo(() => groups.filter(isSelected), [groups, selected]);

  const toggleGroup = (g: RecipientGroup) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const on = g.keys.some((k) => next.has(k));
      g.keys.forEach((k) => next.delete(k));
      if (!on) next.add(g.key);
      return next;
    });

  const selectAll = () => setSelected(new Set(filteredGroups.map((g) => g.key)));
  const selectNone = () => setSelected(new Set());
  const selectOnePerUnit = () => {
    const seen = new Set<string>();
    const next = new Set<string>();
    for (const g of filteredGroups) {
      const u = g.units[0] || g.email;
      if (seen.has(u)) continue;
      seen.add(u);
      next.add(g.key);
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
    setBody(body.slice(0, start) + token + body.slice(end));
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
        const targets: BulkRecipient[] = unit ? recipients.filter((r) => r.unitKey === unit) : [];
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
        description:
          unmatched > 0 ? `${unmatched} ohne passende Einheitennummer (z. B. "0001_...") übersprungen.` : undefined,
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

  const removePathFromGroup = (g: RecipientGroup, path: string) =>
    setPersonal((prev) => {
      const next = { ...prev };
      for (const k of g.keys) next[k] = (next[k] || []).filter((p) => p !== path);
      return next;
    });

  const persist = async (status?: string) => {
    const keys = Array.from(selected);
    const unitLabels: Record<string, string> = {};
    for (const g of selectedGroups) if (g.units.length > 1) unitLabels[g.key] = g.units.join(", ");

    const update: any = {
      name: name.trim() || "Rundmail",
      subject_override: subject || null,
      body_html_override: body || null,
      email_account_id: accountId || null,
      attachment_paths: generalPaths,
      recipient_filter: {
        roles: [],
        contact_ids: [],
        assignment_ids: [],
        recipient_keys: keys,
        no_duplicates: noDuplicates,
        unit_labels: unitLabels,
      },
      recipient_count: keys.length,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    };
    if (status) update.status = status;
    const { error } = await supabase.from("comm_campaigns").update(update).eq("id", campaignId);
    if (error) throw error;

    await supabase.from("comm_recipient_overrides").delete().eq("campaign_id", campaignId);
    const rows = selectedGroups
      .map((g) => {
        const paths = pathsForGroup(g);
        const ov = textOverrides[g.key];
        if (paths.length === 0 && !ov?.subject && !ov?.body) return null;
        const r = recipients.find((x) => x.key === g.key);
        if (!r) return null;
        return {
          campaign_id: campaignId,
          contact_id: r.contactId,
          assignment_id: r.assignmentId,
          email: r.email,
          attachment_paths: paths,
          subject: ov?.subject ?? null,
          body_html: ov?.body ?? null,
        };
      })
      .filter(Boolean);
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

    const withoutAttachment = selectedGroups.filter((g) => pathsForGroup(g).length === 0).length;
    const hint = withoutAttachment > 0 ? `\n${withoutAttachment} davon ohne persönlichen Anhang.` : "";
    if (!confirm(`Rundmail jetzt an ${selected.size} Empfänger senden?${hint}`)) return;
    setBusy("send");
    try {
      await persist("draft");
      const { data, error } = await supabase.functions.invoke("comm-send-bulk-email", {
        body: { campaign_id: campaignId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({
        title: "Versand abgeschlossen",
        description: `${(data as any)?.ok ?? 0} gesendet, ${(data as any)?.failed ?? 0} fehlgeschlagen`,
      });
      qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
      onBack();
    } catch (e: any) {
      toast({ title: "Versand fehlgeschlagen", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const dialogGroup = dialog ? groups.find((g) => g.key === dialog.key) || null : null;
  const dialogSamples: PlaceholderSamples = useMemo(() => {
    if (!dialogGroup) return {};
    const parts = dialogGroup.name.replace(/\s*\(.*\)$/, "").split(" ");
    return {
      vollname: dialogGroup.name,
      vorname: parts.slice(0, -1).join(" ") || dialogGroup.name,
      nachname: parts.slice(-1)[0] || "",
      anrede_brief: `Sehr geehrte Damen und Herren,`,
      email: dialogGroup.email,
      einheit: dialogGroup.units.join(", "),
      rolle: dialogGroup.role || "",
      gebaeude_name: building?.name || "",
      gebaeude_strasse: (building as any)?.address || "",
      datum_heute: new Date().toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }),
    };
  }, [dialogGroup, building]);

  const personalCount = selectedGroups.filter((g) => pathsForGroup(g).length > 0).length;

  return (
    <div className="flex flex-col h-full min-h-0 bg-muted/10">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-background/80 backdrop-blur shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Zurück">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name der Rundmail"
          className="max-w-xs h-9 border-0 bg-transparent px-1 text-base font-medium shadow-none focus-visible:ring-0"
        />
        {building && (
          <Badge variant="secondary" className="hidden sm:inline-flex font-normal">
            {building.name}
          </Badge>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={handleSave} disabled={busy !== null}>
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Speichern
        </Button>
        <Button size="sm" className="rounded-full px-4" onClick={handleSend} disabled={busy !== null}>
          {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
          {scheduledAt ? "Planen" : `Senden (${selected.size})`}
        </Button>
      </div>

      <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_440px] divide-y lg:divide-y-0 lg:divide-x overflow-auto lg:overflow-hidden">
        {/* Links: Inhalt + Anhänge */}
        <ScrollArea className="min-h-0">
          <div className="mx-auto w-full max-w-3xl p-4 space-y-4">
            {/* Nachrichtenkarte */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 border-b bg-muted/20">
                <div className="flex min-w-[240px] flex-1 items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Von</span>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger className="h-8 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus:ring-0">
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
                <div className="flex items-center gap-2">
                  {scheduledAt ? (
                    <>
                      <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className="h-8 w-[200px] border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setScheduledAt("")}
                        aria-label="Terminierung entfernen"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() => {
                        const d = new Date(Date.now() + 3600_000);
                        d.setMinutes(0, 0, 0);
                        const pad = (n: number) => String(n).padStart(2, "0");
                        setScheduledAt(
                          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
                        );
                      }}
                    >
                      <CalendarClock className="h-3.5 w-3.5 mr-1" />
                      Später senden
                    </Button>
                  )}
                </div>
              </div>

              <div className="border-b px-4">
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Betreff"
                  className="h-12 border-0 bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0"
                />
              </div>

              <Textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={16}
                placeholder={"{{anrede_brief}}\n\n..."}
                className="min-h-[320px] resize-none border-0 bg-transparent px-4 py-3 text-sm leading-relaxed shadow-none focus-visible:ring-0"
              />

              <div className="flex flex-wrap items-center gap-1 border-t bg-muted/20 px-3 py-2">
                <span className="mr-1 text-[11px] uppercase tracking-wide text-muted-foreground">Platzhalter</span>
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => insertPlaceholder(p)}
                    className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {PLACEHOLDER_LABELS[p] || p}
                  </button>
                ))}
              </div>
            </div>

            {/* Anhänge */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm">Anhänge für alle</Label>
                </div>
                <BulkDropzone
                  title="Dateien ablegen oder wählen"
                  hint="Gehen an jeden ausgewählten Empfänger."
                  busy={busy === "upload"}
                  disabled={busy !== null}
                  onFiles={handleGeneralUpload}
                >
                  <div className="flex flex-wrap gap-1.5">
                    {generalPaths.length === 0 && (
                      <span className="text-xs text-muted-foreground">Keine gemeinsamen Anhänge</span>
                    )}
                    {generalPaths.map((p) => (
                      <Badge key={p} variant="secondary" className="gap-1 font-normal">
                        <Paperclip className="h-3 w-3" />
                        {fileLabel(p)}
                        <button type="button" onClick={() => setGeneralPaths((x) => x.filter((y) => y !== p))}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </BulkDropzone>
              </div>

              <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm">Persönliche Anhänge</Label>
                </div>
                <BulkDropzone
                  title="Dateien ablegen – automatisch zuordnen"
                  hint={
                    <>
                      Zuordnung über die Einheitennummer am Dateianfang, z. B. <code>0001_Einzelabrechnung.pdf</code> →
                      Einheit 1. Adressen mit mehreren Einheiten erhalten alle Dateien in einer E-Mail.
                    </>
                  }
                  busy={busy === "upload"}
                  disabled={busy !== null}
                  onFiles={handlePersonalUpload}
                >
                  <p className="text-xs text-muted-foreground">
                    {personalCount} von {selectedGroups.length} ausgewählten Empfängern haben einen persönlichen Anhang.
                    Einzelne Dateien lassen sich auch direkt auf eine Empfänger-Karte ziehen.
                  </p>
                </BulkDropzone>
              </div>
            </div>
          </div>
        </ScrollArea>


        {/* Rechts: Empfänger-Karten */}
        <div className="flex flex-col min-h-0 bg-muted/20">
          <div className="p-3 space-y-2.5 border-b shrink-0 bg-background/60 backdrop-blur">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9 rounded-full bg-background"
                placeholder="Name, E-Mail oder Einheit suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="secondary" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={selectAll}>
                Alle
              </Button>
              <Button variant="secondary" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={selectOnePerUnit}>
                Eine je Einheit
              </Button>
              <Button variant="secondary" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={selectNone}>
                Keine
              </Button>
              <div className="flex items-center gap-1.5 ml-auto">
                <Switch id="nodup" checked={noDuplicates} onCheckedChange={(v) => setNoDuplicates(!!v)} />
                <Label htmlFor="nodup" className="text-xs cursor-pointer">
                  Kein Doppel
                </Label>
              </div>
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {recipientsLoading
                ? "Lade Empfänger..."
                : `${selectedGroups.length} von ${groups.length} ausgewählt · ${personalCount} mit persönlichem Anhang`}
            </p>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 space-y-2">
              {!recipientsLoading && filteredGroups.length === 0 && (
                <p className="text-sm text-muted-foreground">Keine E-Mail-Adressen gefunden.</p>
              )}
              {filteredGroups.map((g) => (
                <BulkRecipientCard
                  key={g.key}
                  group={g}
                  selected={isSelected(g)}
                  paths={pathsForGroup(g)}
                  hasOverride={!!(textOverrides[g.key]?.subject || textOverrides[g.key]?.body)}
                  busy={busy !== null}
                  onToggle={() => toggleGroup(g)}
                  onRemovePath={(p) => removePathFromGroup(g, p)}
                  onAddFiles={(files) => addPersonalToKey(g.key, files)}
                  onPreview={() => setDialog({ mode: "preview", key: g.key })}
                  onEdit={() => setDialog({ mode: "edit", key: g.key })}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      <BulkRecipientDialog
        open={!!dialog}
        mode={dialog?.mode || "preview"}
        group={dialogGroup}
        baseSubject={subject}
        baseBody={body}
        override={dialog ? textOverrides[dialog.key] : undefined}
        samples={dialogSamples}
        attachments={dialogGroup ? [...generalPaths, ...pathsForGroup(dialogGroup)] : []}
        onOpenChange={(v) => !v && setDialog(null)}
        onSaveOverride={(key, s, b) =>
          setTextOverrides((prev) => {
            const next = { ...prev };
            if (!s && !b) delete next[key];
            else next[key] = { subject: s, body: b };
            return next;
          })
        }
      />
    </div>
  );
};

export { normalizeUnit };
