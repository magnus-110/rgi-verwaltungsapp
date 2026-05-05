import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Plus, Pencil, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  EmailTemplate,
  trackTemplateUsage,
  useEmailTemplates,
} from "@/hooks/useEmailTemplates";
import { resolveTemplate, TemplateContext } from "@/lib/emailTemplateVars";
import { EmailTemplateEditorDialog } from "./EmailTemplateEditorDialog";

interface Props {
  context: TemplateContext;
  currentSubject?: string;
  onInsert: (data: { subject: string; body: string; subjectReplaced: boolean }) => void;
  /** Optional small/large button size */
  size?: "sm" | "icon";
}

export function EmailTemplatePicker({ context, currentSubject, onInsert, size = "icon" }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: templates = [], isLoading } = useEmailTemplates();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q) ||
        (t.subject || "").toLowerCase().includes(q)
    );
  }, [templates, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, EmailTemplate[]>();
    for (const t of filtered) {
      const k = t.category || "Allgemein";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const handlePick = async (t: EmailTemplate) => {
    setBusy(true);
    try {
      const resolved = await resolveTemplate(t.subject, t.body, context);
      const subjectReplaced = !!currentSubject && !!resolved.subject && currentSubject !== resolved.subject;
      onInsert({ subject: resolved.subject, body: resolved.body, subjectReplaced });
      trackTemplateUsage(t.id, t.usage_count).catch(() => {});
      if (resolved.unresolved.length > 0) {
        toast.warning(`${resolved.unresolved.length} Platzhalter konnten nicht aufgelöst werden`, {
          description: resolved.unresolved.join(" "),
        });
      } else {
        toast.success(`Vorlage „${t.name}" eingefügt`);
      }
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Vorlage konnte nicht eingefügt werden");
    } finally {
      setBusy(false);
    }
  };

  const openEditor = (t: EmailTemplate | null) => {
    setEditing(t);
    setEditorOpen(true);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size={size}
                  className={size === "icon" ? "h-9 w-9 text-muted-foreground hover:text-foreground" : ""}
                  type="button"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-5 w-5" />}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Vorlage einfügen</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <PopoverContent className="w-[380px] p-0" align="start" side="top">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Vorlage suchen…"
                className="h-8 pl-7 text-sm"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-[340px] overflow-y-auto">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 mx-auto animate-spin" />
              </div>
            ) : grouped.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {templates.length === 0 ? "Noch keine Vorlagen vorhanden" : "Keine Treffer"}
              </div>
            ) : (
              grouped.map(([cat, items]) => (
                <div key={cat} className="py-1">
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {cat}
                  </div>
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className="group flex items-start gap-2 px-3 py-1.5 hover:bg-accent cursor-pointer"
                      onClick={() => handlePick(t)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{t.name}</div>
                        {t.subject && (
                          <div className="text-xs text-muted-foreground truncate">{t.subject}</div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditor(t);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start h-8"
              onClick={() => openEditor(null)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Neue Vorlage
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <EmailTemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editing}
      />
    </>
  );
}
