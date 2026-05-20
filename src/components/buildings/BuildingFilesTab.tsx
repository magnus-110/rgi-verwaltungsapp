import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileList } from "@/components/files/FileList";
import { FileDropCard } from "@/components/files/FileDropCard";
import { FileCategoryManager } from "@/components/files/FileCategoryManager";
import { Plus, FolderCog, RefreshCw, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  management_mode: string;
  sort_order: number | null;
}

interface PersonProfile {
  contact_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface BuildingFilesTabProps {
  buildingId: string;
  managementMode: "weg" | "rent";
}

export const BuildingFilesTab = ({ buildingId, managementMode }: BuildingFilesTabProps) => {
  const { profile } = useAuth();

  const [files, setFiles] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [persons, setPersons] = useState<PersonProfile[]>([]);

  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("all"); // "all" | "general" | "2026" ...
  const [visibleToUsers, setVisibleToUsers] = useState(true);
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#6B7280");
  const [newCatOpen, setNewCatOpen] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [buildingId, managementMode]);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchFiles(), fetchCategories(), fetchPersons()]);
    setLoading(false);
  };

  const fetchFiles = async () => {
    const { data } = await supabase
      .from("building_files")
      .select("*")
      .eq("management_mode", managementMode)
      .eq("building_id", buildingId)
      .order("created_at", { ascending: false });
    if (data) setFiles(data);
  };

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("building_file_categories")
      .select("*")
      .eq("management_mode", managementMode)
      .order("sort_order");
    if (data) setCategories(data as Category[]);
  };

  const fetchPersons = async () => {
    // Query from the new contact system
    const { data: assignments } = await supabase
      .from("contact_building_assignments")
      .select("contact_id, contacts(id, first_name, last_name, short_name, company_name)")
      .eq("building_id", buildingId)
      .eq("is_active", true);

    if (!assignments || assignments.length === 0) {
      setPersons([]);
      return;
    }

    // Get emails for these contacts
    const contactIds = assignments.map(a => (a.contacts as any)?.id).filter(Boolean);
    const { data: emailData } = await supabase
      .from("contact_emails")
      .select("contact_id, email, is_primary")
      .in("contact_id", contactIds)
      .order("is_primary", { ascending: false });

    const emailMap = new Map<string, string>();
    (emailData || []).forEach(e => {
      if (!emailMap.has(e.contact_id)) emailMap.set(e.contact_id, e.email);
    });

    // Deduplicate by contact_id
    const seen = new Set<string>();
    const result: PersonProfile[] = [];
    for (const a of assignments) {
      const c = a.contacts as any;
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      result.push({
        contact_id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        email: emailMap.get(c.id) || null,
      });
    }
    setPersons(result);
  };

  const handleDelete = async (fileId: string, filePath: string) => {
    try {
      await supabase.storage.from("building-files").remove([filePath]);
      const { error } = await supabase.from("building_files").delete().eq("id", fileId);
      if (error) throw error;
      toast.success("Dokument gelöscht");
      fetchFiles();
    } catch {
      toast.error("Fehler beim Löschen");
    }
  };

  const handleToggleVisibility = async (fileId: string, visible: boolean) => {
    const { error } = await supabase
      .from("building_files")
      .update({ visible_to_users: visible })
      .eq("id", fileId);
    if (error) {
      toast.error("Fehler beim Aktualisieren");
    } else {
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, visible_to_users: visible } : f)));
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    const { data, error } = await supabase
      .from("building_file_categories")
      .insert({ name: newCatName.trim(), color: newCatColor, management_mode: managementMode, sort_order: categories.length })
      .select("id")
      .single();
    if (error) {
      toast.error("Fehler beim Erstellen");
    } else {
      toast.success("Kategorie erstellt");
      setNewCatName("");
      setNewCatColor("#6B7280");
      setNewCatOpen(false);
      await fetchCategories();
      if (data) setSelectedCategory(data.id);
    }
  };

  const handleDeleteCategory = async (catId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const { error } = await supabase.from("building_file_categories").delete().eq("id", catId);
    if (error) {
      toast.error("Fehler beim Löschen");
    } else {
      toast.success("Kategorie gelöscht");
      if (selectedCategory === catId) setSelectedCategory("");
      fetchCategories();
    }
  };

  // Year-Filter
  const availableYears = Array.from(
    new Set(files.map((f) => f.fiscal_year).filter((y) => y != null)),
  ).sort((a: number, b: number) => b - a);

  const filteredByYear = files.filter((f) => {
    if (selectedYear === "all") return true;
    if (selectedYear === "general") return f.fiscal_year == null;
    return String(f.fiscal_year) === selectedYear;
  });

  const buildingFiles = filteredByYear.filter((f) => !f.assigned_user_id);
  const getPersonFiles = (contactId: string) => filteredByYear.filter((f) => f.assigned_user_id === contactId);

  const getPersonName = (p: PersonProfile) => {
    return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Unbenannt";
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="space-y-3 p-4 border rounded-lg bg-card">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Kategorie (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Keine Kategorie</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  <div className="flex items-center gap-2 w-full">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || "#6B7280" }} />
                    <span className="flex-1">{cat.name}</span>
                    <button className="ml-2 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDeleteCategory(cat.id, e)}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover open={newCatOpen} onOpenChange={setNewCatOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10">
                <Plus className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-3">
              <p className="text-sm font-medium">Neue Kategorie</p>
              <div className="flex gap-2">
                <Input placeholder="Name..." value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()} className="flex-1" />
                <input type="color" value={newCatColor} onChange={(e) => setNewCatColor(e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer" />
              </div>
              <Button size="sm" className="w-full" onClick={handleCreateCategory} disabled={!newCatName.trim()}>
                Erstellen
              </Button>
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-2 ml-auto">
            <Label htmlFor="vis-toggle-building" className="text-sm text-muted-foreground">Sichtbar</Label>
            <Switch id="vis-toggle-building" checked={visibleToUsers} onCheckedChange={setVisibleToUsers} />
          </div>

          <Button variant="outline" size="sm" onClick={() => setCategoryManagerOpen(true)}>
            <FolderCog className="w-4 h-4 mr-2" />
            Kategorien
          </Button>

          <Button variant="ghost" size="icon" onClick={fetchAll}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        <div>
          <button className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
            onClick={() => setShowDescription(!showDescription)}>
            {showDescription ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Beschreibung {showDescription ? "ausblenden" : "hinzufügen"}
          </button>
          {showDescription && (
            <Input className="mt-2" placeholder="Optionale Beschreibung..." value={description}
              onChange={(e) => setDescription(e.target.value)} />
          )}
        </div>
      </div>

      {/* File cards */}
      <div className="space-y-4">
        <FileDropCard
          title="Gebäude-Dokumente"
          subtitle="Dateien für alle Bewohner hierher ziehen"
          icon="building"
          buildingId={buildingId}
          assignedUserId={null}
          categoryId={selectedCategory === "__none__" ? null : selectedCategory || null}
          visibleToUsers={visibleToUsers}
          description={description}
          managementMode={managementMode}
          files={buildingFiles}
          categories={categories}
          fullWidth
          onFileUploaded={fetchFiles}
          onDelete={handleDelete}
          onToggleVisibility={handleToggleVisibility}
        />

        {persons.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {persons.map((person) => (
              <FileDropCard
                key={person.contact_id}
                title={getPersonName(person)}
                subtitle={person.email || "Keine E-Mail"}
                icon="user"
                buildingId={buildingId}
                assignedUserId={person.contact_id}
                categoryId={selectedCategory === "__none__" ? null : selectedCategory || null}
                visibleToUsers={visibleToUsers}
                description={description}
                managementMode={managementMode}
                files={getPersonFiles(person.contact_id)}
                categories={categories}
                onFileUploaded={fetchFiles}
                onDelete={handleDelete}
                onToggleVisibility={handleToggleVisibility}
              />
            ))}
          </div>
        )}

        {persons.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Keine Kontakte für dieses Gebäude zugeordnet
          </p>
        )}
      </div>

      <FileCategoryManager
        open={categoryManagerOpen}
        onOpenChange={setCategoryManagerOpen}
        managementMode={managementMode}
        onCategoriesChanged={fetchCategories}
      />
    </div>
  );
};
