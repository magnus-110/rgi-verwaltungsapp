import { CheckCircle2, Inbox as InboxIcon, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { INQUIRY_FOLDER_IDS, INQUIRY_FOLDER_LABEL, type InquiryFolder } from "@/lib/inquiries";
import { useInquiryCounts, useIsAdmin } from "@/hooks/useInquiries";

const ITEMS: { folder: InquiryFolder; icon: typeof InboxIcon }[] = [
  { folder: "neu", icon: InboxIcon },
  { folder: "in_bearbeitung", icon: Activity },
  { folder: "erledigt", icon: CheckCircle2 },
];

interface Props {
  selectedFolderId: string | null;
  onSelect: (folderId: string) => void;
  variant: "expanded" | "collapsed" | "mobile";
}

/**
 * Die Anfragen-Ordner (Website-Formulare, Nutzer-App) – gestaltet wie die
 * Meldungs-Ordner. Nur für Admins sichtbar.
 */
export function InquiryFolderNav({ selectedFolderId, onSelect, variant }: Props) {
  const isAdmin = useIsAdmin();
  const { data: counts } = useInquiryCounts();
  if (!isAdmin || !counts?.available) return null;
  const countOf = (f: InquiryFolder) => (f === "neu" ? counts?.neu ?? 0 : 0);

  if (variant === "collapsed") {
    return (
      <>
        <div className="my-2 h-px w-6 bg-border" />
        {ITEMS.map(({ folder, icon: Icon }) => {
          const id = INQUIRY_FOLDER_IDS[folder];
          const active = selectedFolderId === id;
          const count = countOf(folder);
          return (
            <button
              key={folder}
              onClick={() => onSelect(id)}
              title={`Anfragen · ${INQUIRY_FOLDER_LABEL[folder]}`}
              aria-label={`Anfragen · ${INQUIRY_FOLDER_LABEL[folder]}`}
              className={cn(
                "relative mb-0.5 flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-4 w-4" />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] text-destructive-foreground">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </>
    );
  }

  const mobile = variant === "mobile";
  return (
    <div className="p-2 pt-1">
      <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Anfragen</p>
      {ITEMS.map(({ folder, icon: Icon }) => {
        const id = INQUIRY_FOLDER_IDS[folder];
        const active = selectedFolderId === id;
        const count = countOf(folder);
        return (
          <button
            key={folder}
            onClick={() => onSelect(id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md text-sm transition-colors",
              mobile ? "px-3 py-3" : "px-2 py-1.5",
              active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className={cn("shrink-0", mobile ? "h-5 w-5" : "h-4 w-4")} />
            <span className="flex-1 truncate text-left">{INQUIRY_FOLDER_LABEL[folder]}</span>
            {count > 0 && (
              <Badge
                variant={active ? "secondary" : "default"}
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
