import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FileList } from "@/components/files/FileList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Building2 } from "lucide-react";

export function WegOwnerFiles() {
  const { profile } = useAuth();
  const [personalFiles, setPersonalFiles] = useState<any[]>([]);
  const [buildingFiles, setBuildingFiles] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.user_id) fetchFiles();
  }, [profile?.user_id]);

  const fetchFiles = async () => {
    setLoading(true);

    const [personalRes, buildingRes, catRes] = await Promise.all([
      supabase
        .from('building_files')
        .select('*')
        .eq('assigned_user_id', profile!.user_id)
        .eq('visible_to_users', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('building_files')
        .select('*')
        .is('assigned_user_id', null)
        .eq('visible_to_users', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('building_file_categories')
        .select('*')
        .eq('management_mode', 'weg')
        .order('sort_order'),
    ]);

    if (personalRes.data) setPersonalFiles(personalRes.data);
    if (buildingRes.data) setBuildingFiles(buildingRes.data);
    if (catRes.data) setCategories(catRes.data);
    setLoading(false);
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meine Dokumente</h1>
        <p className="text-sm text-muted-foreground">Ihre persönlichen und Gebäude-Dokumente</p>
      </div>

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal" className="gap-2">
            <User className="w-4 h-4" />
            Persönlich ({personalFiles.length})
          </TabsTrigger>
          <TabsTrigger value="building" className="gap-2">
            <Building2 className="w-4 h-4" />
            Gebäude ({buildingFiles.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="personal" className="mt-4">
          <FileList files={personalFiles} categories={categories} />
        </TabsContent>
        <TabsContent value="building" className="mt-4">
          <FileList files={buildingFiles} categories={categories} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
