import { Loader2, MoreHorizontal, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { REPORT_FOLDER_LABEL, Report, ReportFolder, StaffProfile } from "@/hooks/useReports";
import { MiniTag, StaffAvatar } from "./reportUi";
import { shortDate } from "@/lib/reports";

const HINT: Record<ReportFolder, string> = {
  open: "Neu eingegangen, noch niemand zuständig.",
  progress: "Jemand kümmert sich oder es wird gewartet.",
  done: "Abgeschlossen.",
};

interface Props {
  folder: ReportFolder;
  reports: Report[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  staff: Map<string, StaffProfile>;
  onlyMine: boolean;
  onOnlyMineChange: (v: boolean) => void;
  search: string;
  onSearchChange: (v: string) => void;
  onNew: () => void;
  onSettings: () => void;
  /** Hinweis, wenn die gewählte Meldung gerade in einen anderen Ordner gewandert ist. */
  movedTo?: string | null;
}

export function ReportList({
  folder,
  reports,
  loading,
  selectedId,
  onSelect,
  staff,
  onlyMine,
  onOnlyMineChange,
  search,
  onSearchChange,
  onNew,
  onSettings,
  movedTo,
}: Props) {
  const searching = search.trim().length >= 2;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b p-3">
        <div className="flex items-center gap-1">
          <h2 className="flex-1 truncate text-[15px] font-semibold">
            {searching ? "Suche in allen Meldungen" : `Meldungen · ${REPORT_FOLDER_LABEL[folder]}`}
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNew} title="Meldung erfassen (z. B. nach einem Anruf)">
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSettings} title="Schritte und Export (Einstellungen)">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Name, Betreff oder Nummer suchen …"
            className="h-8 pl-8 pr-8 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Suche leeren"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {!searching && (
          <div className="flex items-center gap-3">
            <span className="flex-1 text-[11.5px] text-muted-foreground">{HINT[folder]}</span>
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox checked={onlyMine} onCheckedChange={(v) => onOnlyMineChange(!!v)} className="h-3.5 w-3.5" />
              Nur meine
            </label>
          </div>
        )}
        {movedTo && (
          <p className="rounded-md bg-emerald-500/10 px-2 py-1 text-[11.5px] text-emerald-700 dark:text-emerald-300">
            Die gewählte Meldung liegt jetzt unter „{movedTo}“.
          </p>
        )}
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden …
          </div>
        ) : reports.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            {searching
              ? "Keine Meldung gefunden."
              : folder === "open"
                ? "Alles verteilt. Keine offenen Meldungen."
                : "Keine Meldungen in diesem Ordner."}
          </div>
        ) : (
          <div className="divide-y">
            {reports.map((r) => {
              const unread = !r.is_read;
              const assignee = r.assigned_to ? staff.get(r.assigned_to) : null;
              return (
                <button
                  key={r.id}
                  onClick={() => onSelect(r.id)}
                  className={cn(
                    "grid w-full gap-0.5 px-3.5 py-2.5 text-left transition-colors",
                    selectedId === r.id ? "bg-accent" : "hover:bg-muted/50",
                    unread && "border-l-4 border-l-primary bg-primary/[0.06] pl-2.5",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {r.priority === "urgent" && r.status !== "resolved" && <MiniTag tone="danger">dringend</MiniTag>}
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[13px]",
                        unread ? "font-bold text-foreground" : "text-foreground/90",
                      )}
                    >
                      {r.contact_name || "Unbekannt"}
                    </span>
                    {r.has_new_reply && <MiniTag tone="success">Antwort</MiniTag>}
                    <span className={cn("text-[11px]", unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {shortDate(r.last_activity_at)}
                    </span>
                  </div>
                  <p className={cn("truncate text-[12.5px]", unread ? "font-semibold" : "text-muted-foreground")}>
                    {r.title}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">
                      {r.building?.name || "Ohne Gebäude"}
                      {r.management_mode === "rent" && " · Miete"}
                    </span>
                    {searching && <span className="shrink-0">{REPORT_FOLDER_LABEL[r.status === "open" ? "open" : r.status === "resolved" ? "done" : "progress"]}</span>}
                    {r.status === "waiting" && <MiniTag tone="info">wartet</MiniTag>}
                    <StaffAvatar profile={assignee} empty={!assignee} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
