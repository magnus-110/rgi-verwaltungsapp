import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Building2, Search, FileText, Download, Loader2 } from "lucide-react";
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
  visibility_role: string | null;
  created_at: string;
  category_id: string | null;
}

interface Category {
  id: string;
  name: string;
  color: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilesByCategory({ files, categories, search }: { files: FileItem[]; categories: Category[]; search: string }) {
  const [downloading, setDownloading] = useState<string | null>(null);

  const filtered = useMemo(() =>
    files.filter(f => f.display_name.toLowerCase().includes(search.toLowerCase())),
    [files, search]
  );

  const grouped = useMemo(() => {
    const map = new Map<string | null, { name: string; files: FileItem[] }>();

    // Group by category
    for (const file of filtered) {
      const catId = file.category_id;
      if (!map.has(catId)) {
        const cat = categories.find(c => c.id === catId);
        map.set(catId, { name: cat?.name || "Ohne Kategorie", files: [] });
      }
      map.get(catId)!.files.push(file);
    }

    // Sort: named categories first (by name), "Ohne Kategorie" last
    return Array.from(map.entries()).sort(([aId, a], [bId, b]) => {
      if (!aId) return 1;
      if (!bId) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, categories]);

  const getSignedUrl = async (file: FileItem): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("get-building-file-url", {
        body: { filePath: file.file_path },
      });
      if (error) throw error;
      return data.signedUrl as string;
    } catch {
      return null;
    }
  };

  const handleOpen = async (file: FileItem) => {
    const targetWindow = window.open("", "_blank", "noopener");
    setDownloading(file.id);
    const url = await getSignedUrl(file);
    setDownloading(null);
    if (!url) {
      targetWindow?.close();
      toast.error("Öffnen fehlgeschlagen");
      return;
    }
    if (targetWindow) {
      targetWindow.location.href = url;
    } else {
      window.location.href = url;
    }
  };

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">{search ? `Keine Dokumente für „${search}" gefunden` : "Noch keine Dokumente vorhanden"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(([catId, group]) => (
        <div key={catId || "__none__"}>
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3 px-1 flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-primary" />
            {group.name}
          </h3>
          <div className="space-y-1">
            {group.files.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => {
                  if (downloading === file.id) return;
                  handleOpen(file);
                }}
                disabled={downloading === file.id}
                className="w-full text-left flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors group cursor-pointer disabled:cursor-wait disabled:opacity-70"
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
                  <Download className="w-4 h-4" />
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function WegOwnerFiles() {
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

    // Find all contact ids linked to this user (a user may map to multiple contacts)
    const { data: contactRows } = await supabase
      .from("contacts")
      .select("id")
      .eq("user_id", profile!.user_id);
    const contactIds = (contactRows || []).map((c: any) => c.id);

    // File ids explicitly shared with these contacts
    let visibilityFileIds: string[] = [];
    if (contactIds.length > 0) {
      const { data: visRows } = await supabase
        .from("building_file_visibility")
        .select("file_id")
        .in("contact_id", contactIds);
      visibilityFileIds = Array.from(new Set((visRows || []).map((r: any) => r.file_id)));
    }

    const [assignedRes, personenRes, buildingRes, catRes] = await Promise.all([
      // Files directly assigned to this user
      supabase
        .from("building_files")
        .select("*")
        .eq("assigned_user_id", profile!.user_id)
        .eq("visible_to_users", true)
        .order("created_at", { ascending: false }),
      // Files shared specifically with one of this user's contacts
      visibilityFileIds.length > 0
        ? supabase
            .from("building_files")
            .select("*")
            .in("id", visibilityFileIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      // Building-wide files: visible to all, NOT person-specific, NOT individually assigned
      supabase
        .from("building_files")
        .select("*")
        .is("assigned_user_id", null)
        .eq("visible_to_users", true)
        .neq("visibility_role", "personen")
        .order("created_at", { ascending: false }),
      supabase
        .from("building_file_categories")
        .select("*")
        .eq("management_mode", "weg")
        .order("sort_order"),
    ]);

    // Merge personal sources, dedupe by id
    const personalMap = new Map<string, FileItem>();
    (assignedRes.data || []).forEach((f: any) => personalMap.set(f.id, f));
    (personenRes.data || []).forEach((f: any) => personalMap.set(f.id, f));
    setPersonalFiles(Array.from(personalMap.values()));

    if (buildingRes.data) setBuildingFiles(buildingRes.data as any);
    if (catRes.data) setCategories(catRes.data);
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

      {/* Search */}
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
          <FilesByCategory files={personalFiles} categories={categories} search={search} />
        </TabsContent>
        <TabsContent value="building" className="mt-4">
          <FilesByCategory files={buildingFiles} categories={categories} search={search} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
