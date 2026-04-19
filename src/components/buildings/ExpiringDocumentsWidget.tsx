import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, FileText } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";

interface ExpiringDocumentsWidgetProps {
  buildingId: string;
  onSelectDocuments?: () => void;
}

export function ExpiringDocumentsWidget({ buildingId, onSelectDocuments }: ExpiringDocumentsWidgetProps) {
  const { data: files = [] } = useQuery({
    queryKey: ["expiring-files", buildingId],
    queryFn: async () => {
      const in90 = new Date();
      in90.setDate(in90.getDate() + 90);
      const { data } = await supabase
        .from("building_files")
        .select("id, display_name, valid_until")
        .eq("building_id", buildingId)
        .is("deleted_at", null)
        .eq("is_current_version", true)
        .not("valid_until", "is", null)
        .lte("valid_until", in90.toISOString().split("T")[0])
        .order("valid_until", { ascending: true })
        .limit(5);
      return data || [];
    },
  });

  if (files.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold">Ablaufende Dokumente</h3>
        <Badge variant="secondary" className="ml-auto text-[10px]">{files.length}</Badge>
      </div>
      <div className="space-y-2">
        {files.map((f: any) => {
          const daysLeft = differenceInDays(new Date(f.valid_until), new Date());
          return (
            <button
              key={f.id}
              onClick={onSelectDocuments}
              className="w-full text-left flex items-center gap-2 p-2 rounded hover:bg-muted/50 transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs flex-1 truncate">{f.display_name}</span>
              <Badge variant={daysLeft < 30 ? "destructive" : "outline"} className="text-[10px]">
                {daysLeft < 0 ? "abgelaufen" : `${daysLeft} Tage`}
              </Badge>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
