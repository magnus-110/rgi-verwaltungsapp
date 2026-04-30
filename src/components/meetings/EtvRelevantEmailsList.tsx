import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, ExternalLink, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Props {
  meetingId: string;
  buildingId: string;
}

export const EtvRelevantEmailsList = ({ meetingId, buildingId }: Props) => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ["etv-relevant-emails", buildingId, meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("id, subject, from_name, from_address, date, ai_summary, etv_meeting_id")
        .eq("building_id", buildingId)
        .eq("is_etv_relevant", true)
        .or(`etv_meeting_id.eq.${meetingId},etv_meeting_id.is.null`)
        .order("date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!buildingId,
  });

  const removeMark = async (id: string) => {
    const { error } = await supabase
      .from("emails")
      .update({ is_etv_relevant: false, etv_meeting_id: null })
      .eq("id", id);
    if (error) {
      toast.error("Fehler beim Entfernen");
      return;
    }
    qc.invalidateQueries({ queryKey: ["etv-relevant-emails"] });
    qc.invalidateQueries({ queryKey: ["emails"] });
    toast.success("ETV-Markierung entfernt");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Eingegangene E-Mails zur Versammlung
          {emails.length > 0 && <Badge variant="secondary">{emails.length}</Badge>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          E-Mails, die für diese Versammlung oder allgemein als ETV-relevant markiert wurden.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Wird geladen…</p>
        ) : emails.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine markierten E-Mails. Markiere E-Mails im Posteingang über das Stimmzettel-Symbol.
          </p>
        ) : (
          <div className="space-y-2">
            {emails.map((e: any) => (
              <div
                key={e.id}
                className="flex items-start justify-between gap-2 p-3 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">
                      {e.subject || "(Kein Betreff)"}
                    </span>
                    {!e.etv_meeting_id && (
                      <Badge variant="outline" className="text-[10px]">Allgemein</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {e.from_name || e.from_address}
                    {e.date && ` · ${new Date(e.date).toLocaleString("de-DE")}`}
                  </p>
                  {e.ai_summary && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.ai_summary}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Im Posteingang öffnen"
                    onClick={() => navigate(`/inbox?email=${e.id}`)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:text-destructive"
                    title="Markierung entfernen"
                    onClick={() => removeMark(e.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
