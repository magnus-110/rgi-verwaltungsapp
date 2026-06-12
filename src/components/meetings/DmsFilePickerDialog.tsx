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
  FileText,
  Folder,
  Search,
} from "lucide-react";

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
}
interface CategoryRow {
  id: string;
  name: string;
}
interface BuildingRow {
  id: string;
  name: string;
  address: string | null;
}

const NO_CAT = "__none__";

const formatSize = (b: number | null) => {
  if (b == null) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Beim Öffnen Zustand zurücksetzen
  useEffect(() => {
    if (open) {
      setSelectedBuildingId(buildingId);
      setSelected({});
      setSearch("");
      setExpanded(new Set());
    }
  }, [open, buildingId]);

  // Gebäudeauswahl
  const { data: buildings = [], isLoading: loadingBuildings } = useQuery({
    queryKey: ["dms-picker-buildings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address")
        .order("name");
      if (error) throw error;
      return (data || []) as BuildingRow[];
    },
    enabled: open && !selectedBuildingId,
  });

  // Dateien & Kategorien des gewählten Gebäudes
  const { data, isLoading } = useQuery({
    queryKey: ["dms-picker-files", selectedBuildingId],
    queryFn: async () => {
      const [filesRes, catRes] = await Promise.all([
        supabase
          .from("building_files")
          .select("id, display_name, file_path, file_size, mime_type, category_id, created_at, fiscal_year")
          .eq("building_id", selectedBuildingId!)
          .eq("is_current_version", true)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("building_file_categories")
          .select("id, name")
          .eq("building_id", selectedBuildingId!)
          .order("sort_order"),
      ]);
      if (filesRes.error) throw filesRes.error;
      if (catRes.error) throw catRes.error;
      return {
        files: (filesRes.data || []) as FileRow[],
        categories: (catRes.data || []) as CategoryRow[],
      };
    },
    enabled: open && !!selectedBuildingId,
  });

  const files = data?.files ?? [];
  const categories = data?.categories ?? [];

  const filtered = useMemo(() => {
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

  const grouped = useMemo(() => {
    const map = new Map<string, FileRow[]>();
    for (const f of filtered) {
      const key = f.category_id || NO_CAT;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return map;
  }, [filtered]);

  const folders = useMemo(() => {
    const arr: { id: string; name: string; files: FileRow[] }[] = [];
    categories.forEach((c) => {
      const list = grouped.get(c.id);
      if (list && list.length > 0) arr.push({ id: c.id, name: c.name, files: list });
    });
    const noCat = grouped.get(NO_CAT);
    if (noCat && noCat.length > 0) arr.push({ id: NO_CAT, name: "Ohne Kategorie", files: noCat });
    return arr.sort((a, b) => {
      if (a.id === NO_CAT) return 1;
      if (b.id === NO_CAT) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [categories, grouped]);

  // Bei aktiver Suche Ordner mit Treffern automatisch öffnen
  const effectiveExpanded = useMemo(() => {
    if (!search.trim()) return expanded;
    const set = new Set(expanded);
    folders.forEach((f) => set.add(f.id));
    return set;
  }, [expanded, folders, search]);

  const toggleFolder = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleFile = (f: FileRow, checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[f.id] = f;
      else delete next[f.id];
      return next;
    });
  };

  const toggleFolderAll = (folderFiles: FileRow[], checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      folderFiles.forEach((f) => {
        if (checked) next[f.id] = f;
        else delete next[f.id];
      });
      return next;
    });
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
  const currentBuilding = useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId),
    [buildings, selectedBuildingId],
  );

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
            <p className="text-xs text-muted-foreground truncate pl-0">
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

            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2 space-y-2">
              {isLoading ? (
                <p className="text-sm text-muted-foreground p-4">Wird geladen…</p>
              ) : folders.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  {search ? "Keine Treffer." : "Keine Dokumente in dieser Liegenschaft."}
                </p>
              ) : (
                folders.map((folder) => {
                  const isOpen = effectiveExpanded.has(folder.id);
                  const selectedInFolder = folder.files.filter((f) => selected[f.id]).length;
                  const allSelected = selectedInFolder === folder.files.length;
                  const someSelected = selectedInFolder > 0 && !allSelected;
                  return (
                    <Card key={folder.id} className="overflow-hidden">
                      <div className="w-full p-3 hover:bg-muted/50 transition flex items-center gap-3">
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={(c) => toggleFolderAll(folder.files, !!c)}
                          aria-label="Alle im Ordner auswählen"
                        />
                        <button
                          type="button"
                          onClick={() => toggleFolder(folder.id)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className="h-9 w-9 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                            <Folder className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{folder.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {folder.files.length}{" "}
                              {folder.files.length === 1 ? "Dokument" : "Dokumente"}
                              {selectedInFolder > 0 && ` · ${selectedInFolder} ausgewählt`}
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
                        <div className="border-t divide-y">
                          {folder.files.map((f) => (
                            <label
                              key={f.id}
                              className="flex items-center gap-3 p-2.5 pl-12 hover:bg-muted/50 cursor-pointer"
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
                            </label>
                          ))}
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
          <Button
            onClick={handleConfirm}
            disabled={selectedCount === 0 || showBuildingStep}
          >
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
