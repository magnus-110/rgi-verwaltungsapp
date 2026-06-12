import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const FOLDERS = [
  ["Bilder","broker-bilder"],
  ["Exposé","broker-expose"],
  ["Grundrisse","broker-grundrisse"],
  ["Energieausweis","broker-energieausweis"],
  ["Grundbuchauszug","broker-grundbuch"],
  ["Katasterauszug","broker-kataster"],
  ["Teilungserklärung","broker-teilungserklaerung"],
  ["Protokolle","broker-protokolle"],
  ["Abrechnungen","broker-abrechnungen"],
  ["Wirtschaftsplan","broker-wirtschaftsplan"],
];

export const BrokerDocumentsTab = ({ propertyId }: { propertyId: string }) => {
  const [activeFolder, setActiveFolder] = useState(FOLDERS[0][1]);
  const qc = useQueryClient();

  const { data: cats = [] } = useQuery({
    queryKey: ['broker-categories', propertyId],
    queryFn: async () => {
      await supabase.rpc('ensure_broker_categories' as any, { p_property_id: propertyId });
      const slugs = FOLDERS.map(([, slug]) => `${slug}-${propertyId}`);
      const { data } = await supabase.from('building_file_categories').select('id, slug, name').in('slug', slugs);
      return data || [];
    },
  });

  const activeCategoryId = cats.find((c: any) => c.slug === `${activeFolder}-${propertyId}`)?.id;

  const { data: files = [] } = useQuery({
    queryKey: ['broker-files', propertyId, activeCategoryId],
    enabled: !!activeCategoryId,
    queryFn: async () => {
      const { data } = await (supabase.from('building_files') as any)
        .select('id, display_name, file_size, created_at')
        .eq('broker_property_id', propertyId)
        .eq('category_id', activeCategoryId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const handleUpload = async (file: File) => {
    if (!activeCategoryId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const path = `broker/${propertyId}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from('building-files').upload(path, file);
    if (upErr) { toast.error(upErr.message); return; }
    const { error: insErr } = await supabase.from('building_files').insert({
      display_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
      category_id: activeCategoryId,
      broker_property_id: propertyId,
      uploaded_by: user.id,
      visibility_role: 'intern',
      source: 'manual',
    } as any);
    if (insErr) { toast.error(insErr.message); return; }
    toast.success("Hochgeladen");
    qc.invalidateQueries({ queryKey: ['broker-files', propertyId] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('building_files').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['broker-files', propertyId] });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
      <Card>
        <CardContent className="p-2 space-y-1">
          {FOLDERS.map(([label, slug]) => (
            <button
              key={slug}
              onClick={() => setActiveFolder(slug)}
              className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                activeFolder === slug ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{FOLDERS.find(f => f[1] === activeFolder)?.[0]}</CardTitle>
          <label className="cursor-pointer">
            <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
            <Button asChild size="sm" variant="outline"><span><Upload className="h-4 w-4 mr-2" />Hochladen</span></Button>
          </label>
        </CardHeader>
        <CardContent className="space-y-1">
          {files.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Keine Dateien</p>}
          {files.map((f: any) => (
            <div key={f.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm truncate">{f.display_name}</p>
                  <p className="text-xs text-muted-foreground">{(f.file_size / 1024).toFixed(0)} KB · {new Date(f.created_at).toLocaleDateString('de-DE')}</p>
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(f.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
