import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { User, Building2, Search, FileText, Eye, Loader2, Folder, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { BuildingFilterChips, BuildingChip } from "@/components/shared/BuildingFilterChips";
import { useAutoStartPageTour } from "@/components/weg-owner/onboarding/GuidedTourProvider";

interface FileItem {
  id: string;
  display_name: string;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  description: string | null;
  visible_to_users: boolean;
  visibility_role: string | null;
  created_at: string;
  category_id: string | null;
  fiscal_year: number | null;
  building_id: string;
}

interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number | null;
  building_id: string;
}

const NO_CAT = "__none__";
const NO_YEAR = "__noyear__";
const ALL_YEARS = "__all__";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface TreeNode {
  id: string;
  name: string;
  files: FileItem[];
  children: TreeNode[];
  totalCount: number;
}

function buildTree(categories: Category[], files: FileItem[]): TreeNode[] {
  const filesByCat = new Map<string, FileItem[]>();
  const orphanFiles: FileItem[] = [];
  for (const f of files) {
    if (!f.category_id) { orphanFiles.push(f); continue; }
    if (!filesByCat.has(f.category_id)) filesByCat.set(f.category_id, []);
    filesByCat.get(f.category_id)!.push(f);
  }
  const childrenOf = new Map<string | null, Category[]>();
  for (const c of categories) {
    const key = c.parent_id ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(c);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
  }
  const build = (parent: string | null): TreeNode[] => {
    const list = childrenOf.get(parent) || [];
    const nodes: TreeNode[] = [];
    for (const c of list) {
      const own = filesByCat.get(c.id) || [];
      const children = build(c.id);
      const total = own.length + children.reduce((s, n) => s + n.totalCount, 0);
      if (total === 0) continue;
      nodes.push({ id: c.id, name: c.name, files: own, children, totalCount: total });
    }
    return nodes;
  };
  const top = build(null);
  if (orphanFiles.length > 0) {
    top.push({ id: NO_CAT, name: "Ohne Kategorie", files: orphanFiles, children: [], totalCount: orphanFiles.length });
  }
  return top;
}

function FolderNode({ node, depth, onOpenFile, downloading }: {
  node: TreeNode;
  depth: number;
  onOpenFile: (f: FileItem) => void;
  downloading: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full p-4 hover:bg-muted/50 transition-colors flex items-center gap-3 text-left"
      >
        <div className="h-11 w-11 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
          <Folder className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{node.name}</p>
          <p className="text-xs text-muted-foreground">
            {node.totalCount} {node.totalCount === 1 ? "Dokument" : "Dokumente"}
          </p>
        </div>
        {open
          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t p-3 space-y-2 bg-muted/20">
          {node.files.map(file => (
            <button
              key={file.id}
              type="button"
              onClick={() => { if (downloading !== file.id) onOpenFile(file); }}
              disabled={downloading === file.id}
              className="w-full text-left flex items-center gap-3 py-2 px-3 rounded-md bg-card hover:bg-muted/50 transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-70 border border-border/60"
            >
              <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.display_name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.file_size)} · {format(new Date(file.created_at), "dd.MM.yyyy", { locale: de })}
                  {file.fiscal_year != null && <> · WJ {file.fiscal_year}</>}
                </p>
              </div>
              {downloading === file.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
              ) : (
                <Eye className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          ))}
          {node.children.map(child => (
            <FolderNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onOpenFile={onOpenFile}
              downloading={downloading}
            />
          ))}
        </div>
      )}
    </Card>
  );
}


function FilesBrowser({ files, categories, search }: { files: FileItem[]; categories: Category[]; search: string }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<string>(ALL_YEARS);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    let hasNoYear = false;
    files.forEach(f => {
      if (f.fiscal_year != null) years.add(f.fiscal_year);
      else hasNoYear = true;
    });
    return { years: Array.from(years).sort((a, b) => b - a), hasNoYear };
  }, [files]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return files.filter(f => {
      if (s && !f.display_name.toLowerCase().includes(s)) return false;
      if (yearFilter === ALL_YEARS) return true;
      if (yearFilter === NO_YEAR) return f.fiscal_year == null;
      return String(f.fiscal_year) === yearFilter;
    });
  }, [files, search, yearFilter]);

  const tree = useMemo(() => buildTree(categories, filtered), [categories, filtered]);

  const handleOpen = async (file: FileItem) => {
    setDownloading(file.id);
    try {
      const { data, error } = await supabase.functions.invoke("get-building-file-url", {
        body: { filePath: file.file_path },
      });
      if (error) throw error;
      window.open(data.signedUrl as string, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Öffnen fehlgeschlagen");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-end">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Wirtschaftsjahr" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_YEARS}>Alle Jahre</SelectItem>
            {yearOptions.years.map(y => (
              <SelectItem key={y} value={String(y)}>WJ {y}</SelectItem>
            ))}
            {yearOptions.hasNoYear && <SelectItem value={NO_YEAR}>Ohne Jahr</SelectItem>}
          </SelectContent>
        </Select>
      </div>
      {tree.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {search || yearFilter !== ALL_YEARS
              ? "Keine Dokumente für die aktuelle Auswahl gefunden."
              : "Noch keine Dokumente vorhanden."}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-tour="files-tree">
          {tree.map(node => (
            <FolderNode key={node.id} node={node} depth={0} onOpenFile={handleOpen} downloading={downloading} />
          ))}
        </div>
      )}
    </div>
  );
}

export function WegOwnerFiles() {
  useAutoStartPageTour("files");
  const { profile } = useAuth();
  const [buildings, setBuildings] = useState<BuildingChip[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [personalFiles, setPersonalFiles] = useState<FileItem[]>([]);
  const [buildingFiles, setBuildingFiles] = useState<FileItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (profile?.user_id) fetchAll();
  }, [profile?.user_id]);

  const fetchAll = async () => {
    setLoading(true);

    // Buildings the user is an owner of
    const { data: wob } = await supabase
      .from("weg_owner_buildings")
      .select("building_id, buildings:building_id ( id, name )")
      .eq("user_id", profile!.user_id);
    const bList: BuildingChip[] = (wob || [])
      .map((r: any) => r.buildings)
      .filter(Boolean)
      .map((b: any) => ({ id: b.id as string, name: b.name as string }));
    bList.sort((a, b) => a.name.localeCompare(b.name));
    setBuildings(bList);
    const buildingIds = bList.map(b => b.id);
    if (!selectedBuildingId && bList.length > 0) setSelectedBuildingId(bList[0].id);

    // Contacts of the user (for visibility-based personal files)
    const { data: contactRows } = await supabase
      .from("contacts")
      .select("id")
      .eq("user_id", profile!.user_id);
    const contactIds = (contactRows || []).map((c: any) => c.id);

    let visibilityFileIds: string[] = [];
    if (contactIds.length > 0) {
      const { data: visRows } = await supabase
        .from("building_file_visibility")
        .select("file_id")
        .in("contact_id", contactIds);
      visibilityFileIds = Array.from(new Set((visRows || []).map((r: any) => r.file_id)));
    }

    const [assignedRes, personenRes, buildingRes, catRes] = await Promise.all([
      supabase
        .from("building_files")
        .select("*")
        .eq("assigned_user_id", profile!.user_id)
        .eq("visible_to_users", true)
        .order("created_at", { ascending: false }),
      visibilityFileIds.length > 0
        ? supabase
            .from("building_files")
            .select("*")
            .in("id", visibilityFileIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      buildingIds.length > 0
        ? supabase
            .from("building_files")
            .select("*")
            .in("building_id", buildingIds)
            .is("assigned_user_id", null)
            .eq("visible_to_users", true)
            .neq("visibility_role", "personen")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      buildingIds.length > 0
        ? supabase
            .from("building_file_categories")
            .select("id, name, parent_id, sort_order, building_id")
            .in("building_id", buildingIds)
            .order("sort_order")
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const personalMap = new Map<string, FileItem>();
    (assignedRes.data || []).forEach((f: any) => personalMap.set(f.id, f));
    (personenRes.data || []).forEach((f: any) => personalMap.set(f.id, f));
    setPersonalFiles(Array.from(personalMap.values()) as FileItem[]);

    setBuildingFiles((buildingRes.data || []) as FileItem[]);
    setCategories((catRes.data || []) as Category[]);
    setLoading(false);
  };

  const activeBuildingId = selectedBuildingId;
  const filteredPersonal = useMemo(
    () => activeBuildingId ? personalFiles.filter(f => f.building_id === activeBuildingId) : personalFiles,
    [personalFiles, activeBuildingId]
  );
  const filteredBuilding = useMemo(
    () => activeBuildingId ? buildingFiles.filter(f => f.building_id === activeBuildingId) : buildingFiles,
    [buildingFiles, activeBuildingId]
  );
  const filteredCategories = useMemo(
    () => activeBuildingId ? categories.filter(c => c.building_id === activeBuildingId) : categories,
    [categories, activeBuildingId]
  );

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meine Dokumente</h1>
        <p className="text-sm text-muted-foreground">Ihre persönlichen und Gebäude-Dokumente</p>
      </div>

      <BuildingFilterChips
        buildings={buildings}
        selectedId={selectedBuildingId}
        onSelect={setSelectedBuildingId}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Dokument suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="building">
        <TabsList variant="pill" className="w-full grid grid-cols-2">
          <TabsTrigger value="personal" className="gap-2">
            <User className="w-4 h-4" />
            Persönlich ({filteredPersonal.length})
          </TabsTrigger>
          <TabsTrigger value="building" className="gap-2">
            <Building2 className="w-4 h-4" />
            Gebäude ({filteredBuilding.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="personal" className="mt-4">
          <FilesBrowser files={filteredPersonal} categories={filteredCategories} search={search} />
        </TabsContent>
        <TabsContent value="building" className="mt-4">
          <FilesBrowser files={filteredBuilding} categories={filteredCategories} search={search} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
