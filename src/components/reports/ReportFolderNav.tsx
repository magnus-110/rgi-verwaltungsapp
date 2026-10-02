import { CheckCircle2, ClipboardList, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { REPORT_FOLDER_LABEL, ReportFolder, useReportCounts } from "@/hooks/useReports";
import { REPORT_FOLDER_IDS } from "@/lib/reports";

const ITEMS: { folder: ReportFolder; icon: typeof ClipboardList }[] = [
  { folder: "open", icon: ClipboardList },
  { folder: "progress", icon: Activity },
  { folder: "done", icon: CheckCircle2 },
];

interface Props {
  selectedFolderId: string | null;
  onSelect: (folderId: string) => void;
  /** expanded = Seitenleiste, collapsed = schmale Symbolleiste, mobile = Ordner-Blatt am Handy */
  variant: "expanded" | "collapsed" | "mobile";
}

export function ReportFolderNav({ selectedFolderId, onSelect, variant }: Props) {
  const { data: counts } = useReportCounts();
  const countOf = (f: ReportFolder) => (f === "open" ? counts?.open ?? 0 : f === "progress" ? counts?.progress ?? 0 : 0);

  if (variant === "collapsed") {
    return (
      <div className="mt-2 flex flex-col items-center border-t pt-2">
        {ITEMS.map(({ folder, icon: Icon }) => {
          const id = REPORT_FOLDER_IDS[folder];
          const active = selectedFolderId === id;
          const count = countOf(folder);
          return (
            <button
              key={folder}
              onClick={() => onSelect(id)}
              title={`Meldungen · ${REPORT_FOLDER_LABEL[folder]}`}
              className={cn(
                "relative mb-0.5 flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-4 w-4" />
              {count > 0 && (
                <span
                  className={cn(
                    "absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-0.5 text-[9px]",
                    folder === "open" ? "bg-destructive text-destructive-foreground" : "bg-primary/80 text-white",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  const mobile = variant === "mobile";
  return (
    <div className="mx-2 mt-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-1.5">
      <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-primary">Meldungen</p>
      {ITEMS.map(({ folder, icon: Icon }) => {
        const id = REPORT_FOLDER_IDS[folder];
        const active = selectedFolderId === id;
        const count = countOf(folder);
        return (
          <button
            key={folder}
            onClick={() => onSelect(id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md text-left transition-colors",
              mobile ? "px-3 py-3 text-sm" : "px-2 py-1.5 text-sm",
              active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className={cn("shrink-0", mobile ? "h-5 w-5" : "h-4 w-4")} />
            <span className={cn("flex-1 truncate", folder === "open" && "font-medium")}>
              {REPORT_FOLDER_LABEL[folder]}
            </span>
            {count > 0 && (
              <Badge
                variant={active ? "secondary" : folder === "open" ? "destructive" : "outline"}
                className={cn(mobile ? "text-xs" : "h-5 min-w-[20px] justify-center px-1.5 py-0 text-[10px]")}
              >
                {count}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
