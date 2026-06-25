import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Folder,
  Loader2,
  Search,
  User,
} from "lucide-react";
import { toast } from "sonner";

export interface DmsPickerItem {
  path: string;
  name: string;
  mimeType: string | null;
  size: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional vorbelegte Liegenschaft. Wenn gesetzt, Schritt 1 entfällt (Wechsel via Button möglich). */
  buildingId?: string;
  excludePaths?: string[];
  onSelect?: (paths: string[]) => void;
  onSelectItems?: (items: DmsPickerItem[]) => void;
}

interface FileRow {
  id: string;
  display_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  category_id: string | null;
  created_at: string;
  fiscal_year: number | null;
  assigned_user_id: string | null;
}
interface CategoryRow {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number | null;
}
interface FolderNode {
  id: string;
  name: string;
  files: FileRow[];
  children: FolderNode[];
  allFiles: FileRow[];
}
interface BuildingRow {
  id: string;
  name: string;
  address: string | null;
  management_mode: string | null;
}
interface PersonRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

const NO_CAT = "__none__";
const SEC_BUILDING = "__building__";

const formatSize = (b: number | null) => {
  if (b == null) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

const personName = (p: PersonRow) =>
  [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;

export const DmsFilePickerDialog = ({
  open,
  onOpenChange,
  buildingId,
  excludePaths = [],
  onSelect,
  onSelectItems,
}: Props) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | undefined>(buildingId);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, FileRow>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set([SEC_BUILDING]));
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedBuildingId(buildingId);
      setSelected({});
      setSearch("");
      setExpandedSections(new Set([SEC_BUILDING]));
      setExpandedFolders(new Set());
    }
  }, [open, buildingId]);

  // Gebäudeauswahl
  const { data: buildings = [], isLoading: loadingBuildings } = useQuery({
    queryKey: ["dms-picker-buildings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address, management_mode")
        .order("name");
      if (error) throw error;
      return (data || []) as BuildingRow[];
    },
    enabled: open && !selectedBuildingId,
  });

  // Falls Building über Prop kommt, separat nachladen für Header
  const { data: presetBuilding } = useQuery({
    queryKey: ["dms-picker-building", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("buildings")
        .select("id, name, address, management_mode")
        .eq("id", buildingId!)
        .maybeSingle();
      return (data || null) as BuildingRow | null;
    },
    enabled: open && !!buildingId,
  });

  const currentBuilding =
    buildings.find((b) => b.id === selectedBuildingId) ||
    (presetBuilding && presetBuilding.id === selectedBuildingId ? presetBuilding : null);

  // Dateien, Kategorien & Personen des gewählten Gebäudes
  const { data, isLoading } = useQuery({
    queryKey: ["dms-picker-files", selectedBuildingId, currentBuilding?.management_mode],
    queryFn: async () => {
      const mode = currentBuilding?.management_mode || "weg";
      const [filesRes, catRes] = await Promise.all([
        supabase
          .from("building_files")
          .select(
            "id, display_name, file_path, file_size, mime_type, category_id, created_at, fiscal_year, assigned_user_id",
          )
          .eq("building_id", selectedBuildingId!)
          .eq("is_current_version", true)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(3000),
        supabase
          .from("building_file_categories")
          .select("id, name, parent_id, sort_order")
          .eq("building_id", selectedBuildingId!)
          .order("sort_order"),
      ]);
      if (filesRes.error) throw filesRes.error;
      if (catRes.error) throw catRes.error;

      // Personen laden (analog Admin DMS)
      let persons: PersonRow[] = [];
      if (mode === "rent") {
        const { data: pData } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email")
          .eq("role", "tenant")
          .eq("building_id", selectedBuildingId!);
        persons = (pData || []) as PersonRow[];
      } else {
        const { data: wob } = await supabase
          .from("weg_owner_buildings")
          .select("user_id")
          .eq("building_id", selectedBuildingId!);
        const ids = (wob || []).map((w: any) => w.user_id);
        if (ids.length) {
          const { data: pData } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name, email")
            .in("user_id", ids);
          persons = (pData || []) as PersonRow[];
        }
      }

      return {
        files: (filesRes.data || []) as FileRow[],
        categories: (catRes.data || []) as CategoryRow[],
        persons,
      };
    },
    enabled: open && !!selectedBuildingId,
  });

  const files = data?.files ?? [];
  const categories = data?.categories ?? [];
  const persons = data?.persons ?? [];

  const filteredFiles = useMemo(() => {
    const s = search.trim().toLowerCase();
    return files.filter((f) => {
      if (excludePaths.includes(f.file_path)) return false;
      if (!s) return true;
      return (
        (f.display_name || "").toLowerCase().includes(s) ||
        (f.file_path || "").toLowerCase().includes(s)
      );
    });
  }, [files, search, excludePaths]);

  // Sektionen: Gebäude + je Person
  const sections = useMemo(() => {
    const personFor = new Map<string, PersonRow>();
    persons.forEach((p) => personFor.set(p.user_id, p));

    const bySection = new Map<string, FileRow[]>();
    bySection.set(SEC_BUILDING, []);
    persons.forEach((p) => bySection.set(p.user_id, []));

    for (const f of filteredFiles) {
      if (f.assigned_user_id && bySection.has(f.assigned_user_id)) {
        bySection.get(f.assigned_user_id)!.push(f);
      } else if (f.assigned_user_id && !bySection.has(f.assigned_user_id)) {
        // Eigentümer/Mieter nicht (mehr) im Building zugeordnet → eigene Sektion
        bySection.set(f.assigned_user_id, [f]);
      } else {
        bySection.get(SEC_BUILDING)!.push(f);
      }
    }

    const buildSection = (_sectionId: string, files: FileRow[]): FolderNode[] => {
      // Dateien je Kategorie (direkter Inhalt eines Ordners)
      const byCat = new Map<string, FileRow[]>();
      for (const f of files) {
        const k = f.category_id || NO_CAT;
        if (!byCat.has(k)) byCat.set(k, []);
        byCat.get(k)!.push(f);
      }

      // Kategorien nach parent_id gruppieren, Reihenfolge aus sort_order (Query liefert sortiert)
      const byParent = new Map<string, CategoryRow[]>();
      for (const c of categories) {
        const key = c.parent_id || "root";
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(c);
      }

      const build = (parentId: string | null): FolderNode[] => {
        const list = byParent.get(parentId || "root") || [];
        const nodes: FolderNode[] = [];
        for (const c of list) {
          const children = build(c.id);
          const direct = byCat.get(c.id) || [];
          const allFiles = [...direct, ...children.flatMap((ch) => ch.allFiles)];
          if (allFiles.length === 0) continue; // leere Äste ausblenden
          nodes.push({ id: c.id, name: c.name, files: direct, children, allFiles });
        }
        return nodes;
      };

      const tree = build(null);

      // "Ohne Kategorie" als letzter Eintrag, falls befüllt
      const noCat = byCat.get(NO_CAT);
      if (noCat && noCat.length) {
        tree.push({
          id: NO_CAT,
          name: "Ohne Kategorie",
          files: noCat,
          children: [],
          allFiles: noCat,
        });
      }
      return tree;
    };

    const out: {
      id: string;
      title: string;
      subtitle?: string;
      kind: "building" | "person";
      total: number;
      folders: FolderNode[];
    }[] = [];

    out.push({
      id: SEC_BUILDING,
      title: "Gebäude",
      subtitle: "Alle nicht-personenbezogenen Dokumente",
      kind: "building",
      total: bySection.get(SEC_BUILDING)!.length,
      folders: buildSection(SEC_BUILDING, bySection.get(SEC_BUILDING)!),
    });
    for (const [pid, list] of bySection.entries()) {
      if (pid === SEC_BUILDING) continue;
      if (list.length === 0) continue;
      const p = personFor.get(pid);
      out.push({
        id: pid,
        title: p ? personName(p) : "Person",
        subtitle: p?.email,
        kind: "person",
        total: list.length,
        folders: buildSection(pid, list),
      });
    }
    return out;
  }, [filteredFiles, persons, categories]);


  // Bei aktiver Suche alle Sektionen/Ordner automatisch öffnen
  const effSections = useMemo(() => {
    if (!search.trim()) return expandedSections;
    const s = new Set(expandedSections);
    sections.forEach((sec) => sec.total > 0 && s.add(sec.id));
    return s;
  }, [expandedSections, sections, search]);

  const effFolders = useMemo(() => {
    if (!search.trim()) return expandedFolders;
    const s = new Set(expandedFolders);
    const walk = (secId: string, nodes: FolderNode[]) => {
      nodes.forEach((n) => {
        s.add(`${secId}::${n.id}`);
        walk(secId, n.children);
      });
    };
    sections.forEach((sec) => walk(sec.id, sec.folders));
    return s;
  }, [expandedFolders, sections, search]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleFolder = (key: string) => {
    setExpandedFolders((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  const toggleFile = (f: FileRow, checked: boolean) => {
    setSelected((prev) => {
      const n = { ...prev };
      if (checked) n[f.id] = f;
      else delete n[f.id];
      return n;
    });
  };
  const toggleMany = (files: FileRow[], checked: boolean) => {
    setSelected((prev) => {
      const n = { ...prev };
      files.forEach((f) => {
        if (checked) n[f.id] = f;
        else delete n[f.id];
      });
      return n;
    });
  };

  const handlePreview = async (f: FileRow) => {
    setPreviewing(f.id);
    try {
      const { data, error } = await supabase.functions.invoke("get-building-file-url", {
        body: { filePath: f.file_path },
      });
      if (error || !data?.signedUrl) throw error || new Error("kein Link");
      window.open(data.signedUrl as string, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Vorschau fehlgeschlagen");
    } finally {
      setPreviewing(null);
    }
  };

  const handleConfirm = () => {
    const chosen = Object.values(selected);
    onSelect?.(chosen.map((f) => f.file_path));
    onSelectItems?.(
      chosen.map((f) => ({
        path: f.file_path,
        name: f.display_name || (f.file_path?.split("/").pop() ?? "Dokument"),
        mimeType: f.mime_type ?? null,
        size: typeof f.file_size === "number" ? f.file_size : null,
      })),
    );
    onOpenChange(false);
  };

  const selectedCount = Object.keys(selected).length;
  const showBuildingStep = !selectedBuildingId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85dvh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="p-4 pb-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            {!showBuildingStep && !buildingId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 -ml-2"
                onClick={() => {
                  setSelectedBuildingId(undefined);
                  setSelected({});
                  setSearch("");
                }}
                aria-label="Zurück"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <DialogTitle className="flex-1">
              {showBuildingStep ? "Liegenschaft wählen" : "Aus DMS auswählen"}
            </DialogTitle>
          </div>
          {!showBuildingStep && currentBuilding && (
            <p className="text-xs text-muted-foreground truncate">
              <Building2 className="inline h-3 w-3 mr-1 -mt-0.5" />
              {currentBuilding.name}
              {currentBuilding.address ? ` · ${currentBuilding.address}` : ""}
            </p>
          )}
        </DialogHeader>

        {showBuildingStep ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
            {loadingBuildings ? (
              <p className="text-sm text-muted-foreground p-4">Wird geladen…</p>
            ) : buildings.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">
                Keine Liegenschaften gefunden.
              </p>
            ) : (
              buildings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBuildingId(b.id)}
                  className="w-full text-left p-3 rounded-md border hover:bg-muted/50 hover:border-primary/50 transition flex items-center gap-3"
                >
                  <div className="h-10 w-10 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.name}</p>
                    {b.address && (
                      <p className="text-xs text-muted-foreground truncate">{b.address}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            <div className="p-4 pb-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Datei suchen…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2 space-y-3">
              {isLoading ? (
                <p className="text-sm text-muted-foreground p-4">Wird geladen…</p>
              ) : sections.every((s) => s.total === 0) ? (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  {search ? "Keine Treffer." : "Keine Dokumente in dieser Liegenschaft."}
                </p>
              ) : (
                sections
                  .filter((sec) => sec.total > 0 || sec.kind === "building")
                  .map((sec) => {
                    const isOpen = effSections.has(sec.id);
                    const allFilesInSec = sec.folders.flatMap((f) => f.files);
                    const selInSec = allFilesInSec.filter((f) => selected[f.id]).length;
                    const allSel = allFilesInSec.length > 0 && selInSec === allFilesInSec.length;
                    const someSel = selInSec > 0 && !allSel;

                    return (
                      <Card key={sec.id} className="overflow-hidden">
                        <div className="w-full p-3 bg-muted/30 flex items-center gap-3 border-b">
                          <Checkbox
                            checked={allSel ? true : someSel ? "indeterminate" : false}
                            onCheckedChange={(c) => toggleMany(allFilesInSec, !!c)}
                            disabled={allFilesInSec.length === 0}
                            aria-label="Alle in Sektion auswählen"
                          />
                          <button
                            type="button"
                            onClick={() => toggleSection(sec.id)}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left"
                          >
                            <div className="h-9 w-9 rounded-md bg-background border text-muted-foreground flex items-center justify-center shrink-0">
                              {sec.kind === "building" ? (
                                <Building2 className="h-4 w-4" />
                              ) : (
                                <User className="h-4 w-4" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{sec.title}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {sec.subtitle ? `${sec.subtitle} · ` : ""}
                                {sec.total} {sec.total === 1 ? "Dokument" : "Dokumente"}
                                {selInSec > 0 && ` · ${selInSec} ausgewählt`}
                              </p>
                            </div>
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        </div>

                        {isOpen && (
                          <div className="p-2 space-y-1.5">
                            {sec.folders.length === 0 ? (
                              <p className="text-xs text-muted-foreground p-3 text-center">
                                Keine Dokumente.
                              </p>
                            ) : (
                              sec.folders.map((folder) => {
                                const fkey = `${sec.id}::${folder.id}`;
                                const fOpen = effFolders.has(fkey);
                                const selInF = folder.files.filter((f) => selected[f.id]).length;
                                const allF = selInF === folder.files.length;
                                const someF = selInF > 0 && !allF;
                                return (
                                  <div key={fkey} className="border rounded-md overflow-hidden">
                                    <div className="w-full px-2 py-1.5 hover:bg-muted/50 transition flex items-center gap-2">
                                      <Checkbox
                                        checked={allF ? true : someF ? "indeterminate" : false}
                                        onCheckedChange={(c) => toggleMany(folder.files, !!c)}
                                        aria-label="Alle im Ordner auswählen"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => toggleFolder(fkey)}
                                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                      >
                                        <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                                        <span className="text-sm font-medium truncate flex-1">
                                          {folder.name}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">
                                          {folder.files.length}
                                          {selInF > 0 && ` · ${selInF}`}
                                        </span>
                                        {fOpen ? (
                                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                        ) : (
                                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                        )}
                                      </button>
                                    </div>
                                    {fOpen && (
                                      <div className="border-t divide-y bg-background">
                                        {folder.files.map((f) => (
                                          <div
                                            key={f.id}
                                            className="flex items-center gap-2 p-2 pl-9 hover:bg-muted/40"
                                          >
                                            <Checkbox
                                              checked={!!selected[f.id]}
                                              onCheckedChange={(c) => toggleFile(f, !!c)}
                                            />
                                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                            <div className="min-w-0 flex-1">
                                              <p className="text-sm font-medium truncate">
                                                {f.display_name || f.file_path.split("/").pop()}
                                              </p>
                                              <p className="text-[11px] text-muted-foreground truncate">
                                                {f.mime_type}
                                                {f.file_size != null && ` · ${formatSize(f.file_size)}`}
                                                {f.fiscal_year != null && ` · WJ ${f.fiscal_year}`}
                                              </p>
                                            </div>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 shrink-0"
                                              onClick={() => handlePreview(f)}
                                              disabled={previewing === f.id}
                                              title="Vorschau öffnen"
                                            >
                                              {previewing === f.id ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                              ) : (
                                                <Eye className="h-3.5 w-3.5" />
                                              )}
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })
              )}
            </div>
          </>
        )}

        <DialogFooter className="p-4 border-t shrink-0 gap-2">
          {selectedCount > 0 && (
            <Badge variant="secondary" className="mr-auto">
              {selectedCount} ausgewählt
            </Badge>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleConfirm} disabled={selectedCount === 0 || showBuildingStep}>
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
