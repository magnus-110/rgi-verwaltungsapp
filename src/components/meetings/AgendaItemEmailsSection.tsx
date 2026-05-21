import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, ChevronDown, ChevronRight, Maximize2, ExternalLink } from "lucide-react";
import { format as formatDate } from "date-fns";
import { de } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { EmailHtmlBody } from "@/components/email/EmailHtmlBody";

interface Props {
  agendaItemId: string;
}

export const AgendaItemEmailsSection = ({ agendaItemId }: Props) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [detailEmailId, setDetailEmailId] = useState<string | null>(null);

  const { data: emails = [] } = useQuery({
    queryKey: ["etv-agenda-item-emails", agendaItemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("id, subject, from_name, from_address, date, ai_summary, body_text, body_html")
        .eq("etv_agenda_item_id", agendaItemId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!agendaItemId,
  });

  const detailEmail = emails.find((e: any) => e.id === detailEmailId);

  if (emails.length === 0) return null;

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="border rounded-md bg-muted/20">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between h-9 px-3 text-xs font-medium">
              <span className="flex items-center gap-2">
                {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <Mail className="h-3.5 w-3.5" />
                Zugeordnete E-Mails
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{emails.length}</Badge>
              </span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-2 pb-2 space-y-1">
              {emails.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-background/60 group">
                  <button
                    onClick={() => setDetailEmailId(e.id)}
                    className="flex-1 min-w-0 text-left"
                    title="Vergrößert anzeigen"
                  >
                    <p className="text-xs font-medium truncate">{e.subject || "(Kein Betreff)"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {e.from_name || e.from_address}
                      {e.date && ` · ${formatDate(new Date(e.date), "dd.MM.yyyy", { locale: de })}`}
                    </p>
                  </button>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Groß anzeigen" onClick={() => setDetailEmailId(e.id)}>
                      <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Im Posteingang" onClick={() => navigate(`/inbox?email=${e.id}`)}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <Dialog open={!!detailEmailId} onOpenChange={(o) => { if (!o) setDetailEmailId(null); }}>
        <DialogContent className="max-w-3xl max-h-[85dvh] overflow-y-auto">
          {detailEmail && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base pr-6">{detailEmail.subject || "(Kein Betreff)"}</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Von {detailEmail.from_name || detailEmail.from_address}
                  {detailEmail.date && ` · ${formatDate(new Date(detailEmail.date), "dd.MM.yyyy HH:mm", { locale: de })}`}
                </p>
              </DialogHeader>
              {detailEmail.ai_summary && (
                <div className="rounded-md border bg-muted/30 p-3 text-xs">
                  <p className="font-medium mb-1">KI-Zusammenfassung</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">{detailEmail.ai_summary}</p>
                </div>
              )}
              <div className="text-sm">
                {detailEmail.body_html ? (
                  <EmailHtmlBody html={detailEmail.body_html} emailId={detailEmail.id} />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm">{detailEmail.body_text || ""}</pre>
                )}
              </div>
              <div className="flex justify-end pt-2 border-t">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/inbox?email=${detailEmail.id}`)}>
                  <ExternalLink className="h-3.5 w-3.5" /> Im Posteingang öffnen
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
