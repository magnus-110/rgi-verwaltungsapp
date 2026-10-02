import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  Send,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/onboarding/ui/SectionCard";
import { EmbeddedInput } from "@/components/onboarding/ui/InlineField";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { currentStandOf, parseAttachments } from "@/hooks/useReports";
import {
  PortalMode,
  PortalReport,
  useCreatePortalReport,
  usePortalReply,
  usePortalReportEvents,
  usePortalReports,
  usePortalReportsLive,
  useReporterContext,
} from "@/hooks/usePortalReports";
import { errorMessage } from "@/lib/reports";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * „Meine Meldungen“ im Eigentümer- und Mieterportal.
 *
 * Wie eine Paketverfolgung: oben der aktuelle Stand, darunter nur Schritte,
 * die schon passiert sind. Nachrichten der Verwaltung stehen darunter.
 * Antworten ist möglich, wenn die Verwaltung darum bittet.
 */
export function PortalReports({ mode }: { mode: PortalMode }) {
  const { data: reports = [], isLoading } = usePortalReports();
  usePortalReportsLive();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const selected = reports.find((r) => r.id === selectedId) || null;

  const open = reports.filter((r) => r.status !== "resolved");
  const closed = reports.filter((r) => r.status === "resolved");

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-base text-muted-foreground">Laden …</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-xl space-y-5 px-4 py-5 md:max-w-2xl">
        {selected ? (
          <PortalReportDetail report={selected} onBack={() => setSelectedId(null)} />
        ) : (
          <>
            <div className="space-y-2 pt-1">
              <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground">Meldungen</h1>
              <p className="text-[13px] text-muted-foreground">
                Melden Sie Schäden und Anliegen — hier sehen Sie jederzeit, wie weit wir sind.
              </p>
            </div>

            <Button
              data-tour="reports-new"
              onClick={() => setCreateOpen(true)}
              className="h-12 w-full rounded-[14px] text-[15px] font-medium shadow-sm"
            >
              <Plus className="mr-2 h-5 w-5" />
              Neue Meldung
            </Button>

            <section data-tour="reports-list" className="space-y-5">
              {reports.length === 0 ? (
                <div className="rounded-[14px] border border-border/60 bg-card p-8 text-center shadow-sm">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                    <AlertCircle className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="mb-1 font-display text-[15px] font-semibold text-foreground">Noch keine Meldungen</p>
                  <p className="text-[13px] text-muted-foreground">Erstellen Sie Ihre erste Meldung an die Verwaltung.</p>
                </div>
              ) : (
                <>
                  <ReportGroup title="Offen" reports={open} onOpen={setSelectedId} empty="Keine offenen Meldungen." />
                  {closed.length > 0 && <ReportGroup title="Abgeschlossen" reports={closed} onOpen={setSelectedId} />}
                </>
              )}
            </section>
          </>
        )}
      </div>

      <NewReportDialog mode={mode} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function ReportGroup({
  title,
  reports,
  onOpen,
  empty,
}: {
  title: string;
  reports: PortalReport[];
  onOpen: (id: string) => void;
  empty?: string;
}) {
  return (
    <div>
      <h2 className="mb-2 px-1 font-display text-[11px] font-semibold uppercase tracking-[0.6px] text-muted-foreground/80">
        {title}
      </h2>
      {reports.length === 0 && empty ? (
        <p className="rounded-[14px] border border-border/60 bg-card px-4 py-3 text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => onOpen(r.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-[14px] border border-border/60 bg-card px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-muted/40",
                r.reply_open && r.status !== "resolved" && "border-l-4 border-emerald-500/70 border-l-emerald-500",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] font-semibold leading-tight tracking-tight text-foreground">{r.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
                  {r.reply_open && r.status !== "resolved" && (
                    <span className="rounded-full bg-emerald-600 px-2 py-px text-[10.5px] font-semibold text-white">
                      Rückmeldung erbeten
                    </span>
                  )}
                  <span className={cn(r.status === "resolved" ? "text-emerald-700" : "text-foreground/80")}>
                    {currentStandOf(r)}
                  </span>
                  <span>· {r.report_number}</span>
                  <span>· {fmtDate(r.created_at)}</span>
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PortalReportDetail({ report, onBack }: { report: PortalReport; onBack: () => void }) {
  const { data: events = [] } = usePortalReportEvents(report.id);
  const reply = usePortalReply();
  const [text, setText] = useState("");
  const done = report.status === "resolved";
  const steps = events.filter((e) => e.kind === "step");
  const messages = events.filter((e) => e.kind === "message" || e.kind === "reply");
  const last = steps[steps.length - 1];
  const attachments = useAttachmentLinks(report);

  // Bisherige Schritte (neueste oben), „Eingegangen“ als erster Schritt.
  const history = useMemo(() => {
    if (steps.length === 0 && report.status === "open") return [];
    const list = [
      { label: "Eingegangen", at: report.created_at },
      ...steps.slice(0, -1).map((s) => ({ label: s.step_label || "", at: s.created_at })),
    ];
    return list.reverse();
  }, [steps, report.created_at, report.status]);

  const send = async () => {
    if (!text.trim()) return;
    try {
      await reply.mutateAsync({ reportId: report.id, body: text });
      setText("");
      toast({ title: "Antwort gesendet", description: "Die Verwaltung hat Ihre Nachricht erhalten." });
    } catch (e) {
      toast({ title: "Nicht gesendet", description: errorMessage(e, "Bitte später erneut versuchen."), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 pt-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Meine Meldungen
      </button>

      <div className="space-y-3 rounded-[14px] border border-border/60 bg-card p-4 shadow-sm">
        <p className="text-[11.5px] text-muted-foreground">
          {report.report_number} · gemeldet am {fmtDate(report.created_at)}
          {report.building?.name ? ` · ${report.building.name}` : ""}
        </p>
        <h1 className="font-display text-[19px] font-semibold leading-tight tracking-tight">{report.title}</h1>

        <div className={cn("rounded-xl px-3.5 py-3", done ? "bg-emerald-500/10" : "bg-primary/10")}>
          <p
            className={cn(
              "text-[10.5px] font-semibold uppercase tracking-[0.6px]",
              done ? "text-emerald-700" : "text-primary",
            )}
          >
            {done ? "Abgeschlossen" : "Aktueller Stand"}
          </p>
          <p className="flex items-center gap-1.5 text-[15px] font-semibold">
            {done && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            {last?.step_label || currentStandOf(report)}
          </p>
          <p className="text-[13px] text-foreground/80">
            {last?.body || (report.status === "open" ? "Ihre Meldung ist bei uns angekommen." : "")}
          </p>
          {last && <p className="mt-0.5 text-[11px] text-muted-foreground">{fmtDateTime(last.created_at)}</p>}
        </div>

        {history.length > 0 && (
          <div className="ml-1.5 border-l-2 border-border">
            {history.map((h, i) => (
              <div key={i} className="relative pb-3 pl-4 text-[13px]">
                <span className="absolute -left-[6px] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                {h.label}
                <span className="block text-[11px] text-muted-foreground">{fmtDateTime(h.at)}</span>
              </div>
            ))}
          </div>
        )}

        <details className="group rounded-lg bg-muted/40 px-3 py-2 text-[13px]">
          <summary className="cursor-pointer list-none text-muted-foreground group-open:mb-2">
            Ihre Meldung anzeigen
          </summary>
          <p className="whitespace-pre-wrap text-foreground/85">{report.description}</p>
          {attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {attachments.map((a, i) => (
                <a
                  key={i}
                  href={a.url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5",
                    a.url ? "hover:bg-muted" : "pointer-events-none text-muted-foreground",
                  )}
                >
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="truncate">{a.name}</span>
                </a>
              ))}
            </div>
          )}
        </details>
      </div>

      <div className="space-y-3 rounded-[14px] border border-border/60 bg-card p-4 shadow-sm">
        <p className="text-[12px] font-semibold">Nachrichten</p>
        {messages.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Noch keine Nachrichten.</p>
        ) : (
          <div className="grid gap-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[88%] rounded-xl px-3 py-2 text-[13px]",
                  m.kind === "message"
                    ? "justify-self-start rounded-bl-sm bg-sky-500/10"
                    : "justify-self-end rounded-br-sm bg-primary/10",
                )}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-1 text-[10.5px] text-muted-foreground">
                  {m.kind === "message" ? "Ihre Verwaltung" : "Sie"} · {fmtDateTime(m.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}

        {report.reply_open && !done ? (
          <div className="space-y-2 rounded-xl border-[1.5px] border-emerald-500 p-3">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700">
              <Reply className="h-3.5 w-3.5" /> Die Verwaltung bittet um Ihre Rückmeldung
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Ihre Antwort …"
              className="w-full resize-y rounded-lg border-0 bg-[hsl(var(--input))] px-3 py-2.5 text-[14px] outline-none"
            />
            <Button onClick={send} disabled={reply.isPending || !text.trim()} className="w-full gap-2 rounded-[12px]">
              {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Antwort senden
            </Button>
          </div>
        ) : (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
            {done
              ? "Diese Meldung ist abgeschlossen. Bei einem neuen Anliegen legen Sie bitte eine neue Meldung an."
              : "Wir halten Sie hier auf dem Laufenden. Antworten können Sie, sobald wir Sie um eine Rückmeldung bitten."}
          </p>
        )}
      </div>
    </div>
  );
}

function useAttachmentLinks(report: PortalReport) {
  const list = parseAttachments(report.attachments);
  const { data = [] } = useQuery({
    queryKey: ["portal-report-attachments", report.id],
    enabled: list.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () =>
      Promise.all(
        list.map(async (a) => {
          const { data } = await supabase.storage.from("report-attachments").createSignedUrl(a.path, 3600);
          return { name: a.name, url: data?.signedUrl ?? null };
        }),
      ),
  });
  return data;
}

// ---------------------------------------------------------------------------
// Neue Meldung
// ---------------------------------------------------------------------------

const InlineEditField = ({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
}) => {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="min-w-[70px] text-sm text-muted-foreground">{label}:</span>
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
          className="h-8 text-base"
        />
      </div>
    );
  }
  return (
    <div
      className="group -mx-2 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/50"
      onClick={() => setEditing(true)}
    >
      <span className="min-w-[70px] text-sm text-muted-foreground">{label}:</span>
      <span className="text-base text-foreground">{value || "—"}</span>
      <Pencil className="ml-auto h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
};

function NewReportDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: PortalMode;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: ctx } = useReporterContext(mode);
  const create = useCreatePortalReport(mode);
  const [contactOpen, setContactOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!open || !ctx) return;
    setName(ctx.contactName);
    setEmail(ctx.contactEmail);
    setPhone(ctx.contactPhone);
    setBuildingId(ctx.buildings.length === 1 ? ctx.buildings[0].id : "");
    setTitle("");
    setDescription("");
    setFiles([]);
    setContactOpen(false);
  }, [open, ctx]);

  const buildings = ctx?.buildings || [];
  const building = buildings.find((b) => b.id === buildingId);

  const submit = async () => {
    const needsBuilding = buildings.length > 0;
    if (!title.trim() || !description.trim() || !name.trim() || !email.trim() || (needsBuilding && !buildingId)) {
      toast({
        title: "Bitte vervollständigen",
        description: "Bitte füllen Sie alle Pflichtfelder aus, einschließlich Gebäude-Auswahl.",
        variant: "destructive",
      });
      return;
    }
    try {
      await create.mutateAsync({
        buildingId: buildingId || null,
        buildingLabel: building ? `${building.name}${building.address ? ` - ${building.address}` : ""}` : "",
        title,
        description,
        contactName: name,
        contactEmail: email,
        contactPhone: phone,
        files,
      });
      toast({ title: "Meldung gesendet", description: "Sie sehen den Stand jederzeit hier unter „Meldungen“." });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Fehler", description: errorMessage(e, "Meldung konnte nicht erstellt werden."), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden bg-[hsl(35_25%_96%)] p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b border-border/40 bg-card px-5 pb-3 pt-5">
          <DialogTitle className="font-display text-[20px] !font-normal leading-tight tracking-tight">Neue Meldung</DialogTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Beschreiben Sie kurz, worum es geht — wir kümmern uns darum.</p>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-4 py-4">
          <SectionCard label="Kontakt" flat>
            <Collapsible open={contactOpen} onOpenChange={setContactOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[15px] font-semibold text-primary">
                    {name.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-foreground">{name || "Name nicht gesetzt"}</p>
                    <p className="text-[11px] text-muted-foreground">Ihre Kontaktdaten</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
                  <span>Details</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", contactOpen && "rotate-180")} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 border-t border-border/40 px-4 pb-3 pt-1">
                  <p className="pt-2 text-[11px] text-muted-foreground">Zum Bearbeiten auf ein Feld tippen</p>
                  <InlineEditField label="Name" value={name} onChange={setName} />
                  <InlineEditField label="E-Mail" value={email} onChange={setEmail} type="email" />
                  <InlineEditField label="Telefon" value={phone} onChange={setPhone} type="tel" />
                  {buildings.length === 1 && (
                    <div className="flex items-center gap-2 py-1">
                      <span className="min-w-[70px] text-[13px] text-muted-foreground">Gebäude</span>
                      <span className="truncate text-[14px] text-foreground">{buildings[0].name}</span>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </SectionCard>

          {buildings.length > 1 && (
            <SectionCard label="Gebäude">
              <div className="px-4 py-3">
                <Select value={buildingId} onValueChange={setBuildingId}>
                  <SelectTrigger className="h-11 w-full rounded-lg border-0 bg-[hsl(var(--input))] text-[14px] focus:ring-0 focus:ring-offset-0">
                    <SelectValue placeholder="Bitte wählen Sie ein Gebäude" />
                  </SelectTrigger>
                  <SelectContent>
                    {buildings.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                        {b.address ? ` — ${b.address}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </SectionCard>
          )}

          <SectionCard label="Ihre Meldung">
            <div className="space-y-2.5 px-4 py-3">
              <label className="block text-[12px] text-muted-foreground" htmlFor="portal-report-title">
                Was ist das Problem? <span className="text-primary">*</span>
              </label>
              <EmbeddedInput
                id="portal-report-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z. B. Heizung funktioniert nicht"
              />
            </div>
            <div className="space-y-2.5 px-4 py-3">
              <label className="block text-[12px] text-muted-foreground" htmlFor="portal-report-description">
                Beschreibung <span className="text-primary">*</span>
              </label>
              <textarea
                id="portal-report-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Beschreiben Sie das Problem so genau wie möglich"
                rows={4}
                className="w-full resize-y rounded-lg border-0 bg-[hsl(var(--input))] px-3 py-2.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:bg-[hsl(35_25%_92%)]"
              />
            </div>
          </SectionCard>

          <SectionCard label="Fotos oder Dokumente">
            <div className="space-y-2 px-4 py-3">
              <label
                htmlFor="portal-report-files"
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[hsl(var(--input))] px-3 py-3 text-[13px] text-foreground/80 transition-colors hover:bg-[hsl(35_25%_92%)]"
              >
                <Upload className="h-4 w-4" />
                {files.length > 0 ? `${files.length} Datei${files.length === 1 ? "" : "en"} ausgewählt` : "Dateien auswählen"}
              </label>
              <input
                id="portal-report-files"
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => {
                  const picked = e.target.files ? Array.from(e.target.files) : [];
                  setFiles((prev) => [...prev, ...picked]);
                  e.target.value = "";
                }}
                className="hidden"
              />
              {files.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center justify-between gap-2 rounded-lg bg-[hsl(var(--input))] px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-[13px]">{file.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Anhang entfernen"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        <div className="border-t border-border/60 bg-card px-4 py-3">
          <Button onClick={submit} className="h-12 w-full rounded-[14px] text-[15px] font-medium" disabled={create.isPending}>
            {create.isPending ? "Wird gesendet…" : "Meldung absenden"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
