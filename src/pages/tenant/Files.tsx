import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { User, Building2, Search, FileText, Download, Loader2, Folder, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface FileItem {
  id: string;
  display_name: string;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  description: string | null;
  visible_to_users: boolean;
  created_at: string;
  category_id: string | null;
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
  const orphan: FileItem[] = [];
  for (const f of files) {
    if (!f.category_id) { orphan.push(f); continue; }
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
  if (orphan.length > 0) {
    top.push({ id: NO_CAT, name: "Ohne Kategorie", files: orphan, children: [], totalCount: orphan.length });
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
                </p>
              </div>
              {downloading === file.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
              ) : (
                <Download className="w-4 h-4 text-muted-foreground" />
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

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return s ? files.filter(f => f.display_name.toLowerCase().includes(s)) : files;
  }, [files, search]);

  const tree = useMemo(() => buildTree(categories, filtered), [categories, filtered]);

  const handleDownload = async (file: FileItem) => {
    const targetWindow = window.open("", "_blank", "noopener");
    setDownloading(file.id);
    try {
      const { data, error } = await supabase.functions.invoke("get-building-file-url", {
        body: { filePath: file.file_path },
      });
      if (error) throw error;
      if (targetWindow) targetWindow.location.href = data.signedUrl;
      else window.location.href = data.signedUrl;
    } catch {
      targetWindow?.close();
      toast.error("Download fehlgeschlagen");
    } finally {
      setDownloading(null);
    }
  };

  if (tree.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">{search ? `Keine Dokumente für „${search}" gefunden` : "Noch keine Dokumente vorhanden"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tree.map(node => (
        <Card key={node.id} className="overflow-hidden">
          <FolderNode node={node} depth={0} onOpenFile={handleDownload} downloading={downloading} />
        </Card>
      ))}
    </div>
  );
}

export function TenantFiles() {
  const { profile } = useAuth();
  const [personalFiles, setPersonalFiles] = useState<FileItem[]>([]);
  const [buildingFiles, setBuildingFiles] = useState<FileItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (profile?.user_id) fetchFiles();
  }, [profile?.user_id]);

  const fetchFiles = async () => {
    setLoading(true);

    const [personalRes, buildingRes] = await Promise.all([
      supabase
        .from("building_files")
        .select("*")
        .eq("assigned_user_id", profile!.user_id)
        .eq("visible_to_users", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("building_files")
        .select("*")
        .is("assigned_user_id", null)
        .eq("visible_to_users", true)
        .order("created_at", { ascending: false }),
    ]);

    const personal = (personalRes.data || []) as FileItem[];
    const building = (buildingRes.data || []) as FileItem[];
    setPersonalFiles(personal);
    setBuildingFiles(building);

    const buildingIds = Array.from(new Set([...personal, ...building].map(f => f.building_id).filter(Boolean)));
    if (buildingIds.length > 0) {
      const { data: catRes } = await supabase
        .from("building_file_categories")
        .select("id, name, parent_id, sort_order, building_id")
        .in("building_id", buildingIds)
        .order("sort_order");
      setCategories((catRes || []) as Category[]);
    } else {
      setCategories([]);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meine Dokumente</h1>
        <p className="text-sm text-muted-foreground">Ihre persönlichen und Gebäude-Dokumente</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Dokument suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="personal">
        <TabsList variant="pill" className="w-full grid grid-cols-2">
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
          <FilesBrowser files={personalFiles} categories={categories} search={search} />
        </TabsContent>
        <TabsContent value="building" className="mt-4">
          <FilesBrowser files={buildingFiles} categories={categories} search={search} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
