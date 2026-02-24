import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileList } from "@/components/files/FileList";
import { FileUploadDialog } from "@/components/files/FileUploadDialog";
import { FileCategoryManager } from "@/components/files/FileCategoryManager";
import { Plus, FolderCog, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function Files() {
  const { managementMode } = useManagementMode();
  const { profile } = useAuth();
  const [files, setFiles] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, [managementMode, selectedBuilding]);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchFiles(), fetchCategories(), fetchBuildings(), fetchUsers()]);
    setLoading(false);
  };

  const fetchFiles = async () => {
    let query = supabase
      .from('building_files')
      .select('*')
      .eq('management_mode', managementMode)
      .order('created_at', { ascending: false });

    if (selectedBuilding && selectedBuilding !== 'all') {
      query = query.eq('building_id', selectedBuilding);
    }

    const { data } = await query;
    if (data) setFiles(data);
  };

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('building_file_categories')
      .select('*')
      .eq('management_mode', managementMode)
      .order('sort_order');
    if (data) setCategories(data);
  };

  const fetchBuildings = async () => {
    const { data } = await supabase
      .from('buildings')
      .select('id, name')
      .eq('management_mode', managementMode)
      .order('name');
    if (data) setBuildings(data);
  };

  const fetchUsers = async () => {
    const role = managementMode === 'rent' ? 'tenant' : 'weg_owner';
    const { data } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name, email, building_id')
      .eq('role', role);
    if (data) {
      setUsers(data);
      setProfiles(data);
    }
  };

  const handleDelete = async (fileId: string, filePath: string) => {
    try {
      await supabase.storage.from('building-files').remove([filePath]);
      const { error } = await supabase.from('building_files').delete().eq('id', fileId);
      if (error) throw error;
      toast.success("Dokument gelöscht");
      fetchFiles();
    } catch (e) {
      toast.error("Fehler beim Löschen");
    }
  };

  const handleToggleVisibility = async (fileId: string, visible: boolean) => {
    const { error } = await supabase
      .from('building_files')
      .update({ visible_to_users: visible })
      .eq('id', fileId);
    if (error) {
      toast.error("Fehler beim Aktualisieren");
    } else {
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, visible_to_users: visible } : f));
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dokumente</h1>
          <p className="text-sm text-muted-foreground">
            Dokumente für Gebäude und Nutzer verwalten
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCategoryManagerOpen(true)}>
            <FolderCog className="w-4 h-4 mr-2" />
            Kategorien
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Hochladen
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Alle Gebäude" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Gebäude</SelectItem>
            {buildings.map(b => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={fetchAll}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Laden...</div>
      ) : (
        <FileList
          files={files}
          categories={categories}
          isAdmin={true}
          onDelete={handleDelete}
          onToggleVisibility={handleToggleVisibility}
          profiles={profiles}
          buildings={buildings}
        />
      )}

      <FileUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        categories={categories}
        buildings={buildings}
        users={users}
        managementMode={managementMode}
        onUploaded={fetchFiles}
      />

      <FileCategoryManager
        open={categoryManagerOpen}
        onOpenChange={setCategoryManagerOpen}
        managementMode={managementMode}
        onCategoriesChanged={fetchCategories}
      />
    </div>
  );
}
