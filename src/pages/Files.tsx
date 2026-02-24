import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
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
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  building_id: string | null;
}

export function Files() {
  const { managementMode } = useManagementMode();
  const { profile } = useAuth();

  // Data
  const [files, setFiles] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [persons, setPersons] = useState<PersonProfile[]>([]);

  // Toolbar state
  const [selectedBuilding, setSelectedBuilding] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [visibleToUsers, setVisibleToUsers] = useState(true);
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);

  // UI state
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Inline category creation
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#6B7280");
  const [newCatOpen, setNewCatOpen] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [managementMode, selectedBuilding]);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchFiles(), fetchCategories(), fetchBuildings(), fetchPersons()]);
    setLoading(false);
  };

  const fetchFiles = async () => {
    let query = supabase
      .from("building_files")
      .select("*")
      .eq("management_mode", managementMode)
      .order("created_at", { ascending: false });

    if (selectedBuilding && selectedBuilding !== "all") {
      query = query.eq("building_id", selectedBuilding);
    }

    const { data } = await query;
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

  const fetchBuildings = async () => {
    const { data } = await supabase
      .from("buildings")
      .select("id, name")
      .eq("management_mode", managementMode)
      .order("name");
    if (data) setBuildings(data);
  };

  const fetchPersons = async () => {
    if (!selectedBuilding || selectedBuilding === "all") {
      setPersons([]);
      return;
    }

    if (managementMode === "rent") {
      // Tenants: profiles with building_id
      const { data } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email, building_id")
        .eq("role", "tenant")
        .eq("building_id", selectedBuilding);
      if (data) setPersons(data);
    } else {
      // WEG: get user_ids from weg_owner_buildings, then profiles
      const { data: wobData } = await supabase
        .from("weg_owner_buildings")
        .select("user_id")
        .eq("building_id", selectedBuilding);

      if (wobData && wobData.length > 0) {
        const userIds = wobData.map((w) => w.user_id);
        const { data: profileData } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email, building_id")
          .in("user_id", userIds);
        if (profileData) setPersons(profileData);
      } else {
        setPersons([]);
      }
    }
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
      .insert({
        name: newCatName.trim(),
        color: newCatColor,
        management_mode: managementMode,
        sort_order: categories.length,
      })
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

  // Filter files for tiles
  const buildingFiles = files.filter((f) => f.building_id === selectedBuilding && !f.assigned_user_id);
  const getPersonFiles = (userId: string) => files.filter((f) => f.assigned_user_id === userId && f.building_id === selectedBuilding);

  const selectedBuildingObj = buildings.find((b) => b.id === selectedBuilding);
  const isBuildingSelected = selectedBuilding && selectedBuilding !== "all";

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dokumente</h1>
          <p className="text-sm text-muted-foreground">Dokumente für Gebäude und Nutzer verwalten</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCategoryManagerOpen(true)}>
          <FolderCog className="w-4 h-4 mr-2" />
          Kategorien verwalten
        </Button>
      </div>

      {/* Toolbar */}
      <div className="space-y-3 p-4 border rounded-lg bg-card">
        <div className="flex flex-wrap items-center gap-3">
          {/* Building select */}
          <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Alle Gebäude" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Gebäude</SelectItem>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Category select with inline delete */}
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
                    <button
                      className="ml-2 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDeleteCategory(cat.id, e)}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Add category popover */}
          <Popover open={newCatOpen} onOpenChange={setNewCatOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10">
                <Plus className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-3">
              <p className="text-sm font-medium">Neue Kategorie</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Name..."
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()}
                  className="flex-1"
                />
                <input
                  type="color"
                  value={newCatColor}
                  onChange={(e) => setNewCatColor(e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
              </div>
              <Button size="sm" className="w-full" onClick={handleCreateCategory} disabled={!newCatName.trim()}>
                Erstellen
              </Button>
            </PopoverContent>
          </Popover>

          {/* Visibility toggle */}
          <div className="flex items-center gap-2 ml-auto">
            <Label htmlFor="vis-toggle" className="text-sm text-muted-foreground">Sichtbar</Label>
            <Switch id="vis-toggle" checked={visibleToUsers} onCheckedChange={setVisibleToUsers} />
          </div>

          {/* Refresh */}
          <Button variant="ghost" size="icon" onClick={fetchAll}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Description toggle */}
        <div>
          <button
            className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
            onClick={() => setShowDescription(!showDescription)}
          >
            {showDescription ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Beschreibung {showDescription ? "ausblenden" : "hinzufügen"}
          </button>
          {showDescription && (
            <Input
              className="mt-2"
              placeholder="Optionale Beschreibung für hochgeladene Dateien..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Laden...</div>
      ) : isBuildingSelected ? (
        /* Tile view */
        <div className="space-y-4">
          {/* Building tile - full width */}
          <FileDropCard
            title={selectedBuildingObj?.name || "Gebäude"}
            subtitle="Dateien für alle Bewohner hierher ziehen"
            icon="building"
            buildingId={selectedBuilding}
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
          />

          {/* Person tiles */}
          {persons.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {persons.map((person) => (
                <FileDropCard
                  key={person.user_id}
                  title={[person.first_name, person.last_name].filter(Boolean).join(" ") || person.email}
                  subtitle={person.email}
                  icon="user"
                  buildingId={selectedBuilding}
                  assignedUserId={person.user_id}
                  categoryId={selectedCategory === "__none__" ? null : selectedCategory || null}
                  visibleToUsers={visibleToUsers}
                  description={description}
                  managementMode={managementMode}
                  files={getPersonFiles(person.user_id)}
                  categories={categories}
                  onFileUploaded={fetchFiles}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {persons.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Keine {managementMode === "rent" ? "Mieter" : "Eigentümer"} für dieses Gebäude zugeordnet
            </p>
          )}
        </div>
      ) : (
        /* Table view for "all buildings" */
        <FileList
          files={files}
          categories={categories}
          isAdmin
          onDelete={handleDelete}
          onToggleVisibility={handleToggleVisibility}
          profiles={persons}
          buildings={buildings}
        />
      )}

      <FileCategoryManager
        open={categoryManagerOpen}
        onOpenChange={setCategoryManagerOpen}
        managementMode={managementMode}
        onCategoriesChanged={fetchCategories}
      />
    </div>
  );
}
