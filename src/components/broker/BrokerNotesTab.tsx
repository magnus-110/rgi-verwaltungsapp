import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const BrokerNotesTab = ({ propertyId }: { propertyId: string }) => {
  const [body, setBody] = useState("");
  const qc = useQueryClient();

  const { data: notes = [] } = useQuery({
    queryKey: ['broker-notes', propertyId],
    queryFn: async () => {
      const { data } = await supabase.from('broker_property_notes' as any)
        .select('*').eq('property_id', propertyId).order('created_at', { ascending: false });
      return data || [];
    },
  });

  const add = async () => {
    if (!body.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('broker_property_notes' as any).insert({
      property_id: propertyId, body: body.trim(), created_by: user?.id,
    } as any);
    if (error) { toast.error(error.message); return; }
    setBody("");
    qc.invalidateQueries({ queryKey: ['broker-notes', propertyId] });
  };

  const del = async (id: string) => {
    await supabase.from('broker_property_notes' as any).delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['broker-notes', propertyId] });
  };

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardContent className="p-3 space-y-2">
          <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Neue Notiz…" rows={3} />
          <div className="flex justify-end">
            <Button onClick={add} size="sm" disabled={!body.trim()}><Plus className="h-4 w-4 mr-1" />Hinzufügen</Button>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {notes.map((n: any) => (
          <Card key={n.id}>
            <CardContent className="p-3 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">{new Date(n.created_at).toLocaleString('de-DE')}</p>
                <p className="text-sm whitespace-pre-wrap">{n.body}</p>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => del(n.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {notes.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Noch keine Notizen</p>}
      </div>
    </div>
  );
};
