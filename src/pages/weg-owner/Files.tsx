import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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
  visibility_role: string | null;
  created_at: string;
  category_id: string | null;
  fiscal_year: number | null;
}

interface Category {
  id: string;
  name: string;
  color: string | null;
}

const NO_CAT = "__none__";
const NO_YEAR = "__noyear__";
const ALL_YEARS = "__all__";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilesBrowser({ files, categories, search }: { files: FileItem[]; categories: Category[]; search: string }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [yearFilter, setYearFilter] = useState<string>(ALL_YEARS);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    let hasNoYear = false;
    files.forEach(f => {
      if (f.fiscal_year != null) years.add(f.fiscal_year);
      else hasNoYear = true;
    });
    const sorted = Array.from(years).sort((a, b) => b - a);
    return { years: sorted, hasNoYear };
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

  const grouped = useMemo(() => {
    const map = new Map<string, FileItem[]>();
    for (const f of filtered) {
      const key = f.category_id || NO_CAT;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return map;
  }, [filtered]);

  const folderCards = useMemo(() => {
    const cards: { id: string; name: string; count: number }[] = [];
    categories.forEach(c => {
      const list = grouped.get(c.id);
      if (list && list.length > 0) {
        cards.push({ id: c.id, name: c.name, count: list.length });
      }
    });
    const noCatList = grouped.get(NO_CAT);
    if (noCatList && noCatList.length > 0) {
      cards.push({ id: NO_CAT, name: "Ohne Kategorie", count: noCatList.length });
    }
    return cards.sort((a, b) => {
      if (a.id === NO_CAT) return 1;
      if (b.id === NO_CAT) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [categories, grouped]);

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

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
    setDownloading(file.id);
    const url = await getSignedUrl(file);
    setDownloading(null);
    if (!url) {
      toast.error("Öffnen fehlgeschlagen");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const yearSelect = (
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
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-end">
        {yearSelect}
      </div>
      {folderCards.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {search || yearFilter !== ALL_YEARS
              ? "Keine Dokumente für die aktuelle Auswahl gefunden."
              : "Noch keine Dokumente vorhanden."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {folderCards.map((c) => {
            const isOpen = expandedIds.has(c.id);
            const list = grouped.get(c.id) || [];
            return (
              <Card key={c.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="w-full p-4 hover:bg-muted/50 transition-colors flex items-center gap-3 text-left"
                >
                  <div className="h-11 w-11 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                    <Folder className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.count} {c.count === 1 ? "Dokument" : "Dokumente"}</p>
                  </div>
                  {isOpen
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
                {isOpen && (
                  <div className="border-t px-2 py-2 space-y-1">
                    {list.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => { if (downloading !== file.id) handleOpen(file); }}
                        disabled={downloading === file.id}
                        className="w-full text-left flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-70"
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
                          <Download className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
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
