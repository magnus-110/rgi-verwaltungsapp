import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  AlertCircle,
  MoreHorizontal,
  FolderPlus,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
  Archive,
  ArchiveRestore,

} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { DocCategory } from "./types";

export const ARCHIVE_CATEGORY_ID = "__archive__";

interface FolderTreeProps {
  buildingId: string;
  selectedCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
}

interface TreeNode extends DocCategory {
  children: TreeNode[];
  fileCount: number;
}

export function FolderTree({ buildingId, selectedCategoryId, onSelect }: FolderTreeProps) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [addingUnderId, setAddingUnderId] = useState<string | null | "root">(null);
  const [addingName, setAddingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TreeNode | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const handleDropOnFolder = async (categoryId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetId(null);
    const raw = e.dataTransfer.getData("application/x-dms-file-ids");
    if (!raw) return;
    let ids: string[] = [];
    try { ids = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(ids) || ids.length === 0) return;
    const { error } = await supabase
      .from('building_files')
      .update({ category_id: categoryId } as any)
      .in('id', ids);
    if (error) {
      toast.error("Verschieben fehlgeschlagen: " + error.message);
    } else {
      toast.success(`${ids.length} Dokument(e) verschoben`);
      qc.invalidateQueries({ queryKey: ['stammakte-files'] });
      qc.invalidateQueries({ queryKey: ['stammakte-counts', buildingId] });
    }
  };


  const { data: categories = [] } = useQuery({
    queryKey: ['stammakte-categories', buildingId],
    queryFn: async () => {
      await supabase.rpc('ensure_stammakte_categories', { p_building_id: buildingId });
      const { data, error } = await supabase
        .from('building_file_categories')
        .select('*')
        .eq('building_id', buildingId)
        .order('sort_order');
      if (error) throw error;
      return data as DocCategory[];
    },
  });

  const { data: counts = {} } = useQuery({
    queryKey: ['stammakte-counts', buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('building_files')
        .select('category_id')
        .eq('building_id', buildingId)
        .eq('is_current_version', true)
        .is('deleted_at', null)
        .is('archived_at', null);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        if (row.category_id) map[row.category_id] = (map[row.category_id] || 0) + 1;
      });
      return map;
    },
  });

  const { data: archivedFileCount = 0 } = useQuery({
    queryKey: ['stammakte-archived-count', buildingId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('building_files')
        .select('id', { count: 'exact', head: true })
        .eq('building_id', buildingId)
        .eq('is_current_version', true)
        .is('deleted_at', null)
        .not('archived_at', 'is', null);
      if (error) throw error;
      return count || 0;
    },
  });

  const activeCategories = useMemo(
    () => categories.filter((c: any) => !c.archived_at),
    [categories]
  );
  const archivedCategories = useMemo(
    () => categories.filter((c: any) => !!c.archived_at),
    [categories]
  );

  const tree = useMemo(() => {
    const byParent: Record<string, DocCategory[]> = {};
    activeCategories.forEach(c => {
      const key = c.parent_id || 'root';
      (byParent[key] ||= []).push(c);
    });
    const build = (parentId: string | null): TreeNode[] => {
      const list = byParent[parentId || 'root'] || [];
      return list.map(c => {
        const children = build(c.id);
        const ownCount = counts[c.id] || 0;
        const childSum = children.reduce((s, n) => s + n.fileCount, 0);
        return { ...c, children, fileCount: ownCount + childSum };
      });
    };
    return build(null);
  }, [activeCategories, counts]);


  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['stammakte-categories', buildingId] });
    qc.invalidateQueries({ queryKey: ['stammakte-counts', buildingId] });
    qc.invalidateQueries({ queryKey: ['stammakte-archived-count', buildingId] });
    qc.invalidateQueries({ queryKey: ['stammakte-files'] });
  };

  // Ordner (inkl. Unterordner und enthaltener Dateien) archivieren bzw.
  // wiederherstellen. Archivierte Einträge bleiben erhalten, werden aber
  // aus dem normalen Ordnerbaum ausgeblendet.
  const setFolderArchived = async (node: { id: string; name: string }, archived: boolean) => {
    const ids: string[] = [];
    const collect = (id: string) => {
      ids.push(id);
      categories.filter(c => c.parent_id === id).forEach(c => collect(c.id));
    };
    collect(node.id);
    const stamp = archived ? new Date().toISOString() : null;
    const { error: catErr } = await supabase
      .from('building_file_categories')
      .update({ archived_at: stamp } as any)
      .in('id', ids);
    if (catErr) {
      toast.error((archived ? "Archivieren" : "Wiederherstellen") + " fehlgeschlagen: " + catErr.message);
      return;
    }
    await supabase
      .from('building_files')
      .update({ archived_at: stamp } as any)
      .eq('building_id', buildingId)
      .in('category_id', ids);
    toast.success(archived ? `„${node.name}" archiviert` : `„${node.name}" wiederhergestellt`);
    if (archived && ids.includes(selectedCategoryId || '')) onSelect(null);
    refresh();
  };


  const toggle = (id: string) => {
    setExpanded(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const startRename = (node: TreeNode) => {
    setEditingId(node.id);
    setEditingName(node.name);
  };

  const commitRename = async () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) { setEditingId(null); return; }
    const { error } = await supabase
      .from('building_file_categories')
      .update({ name })
      .eq('id', editingId);
    if (error) {
      toast.error("Umbenennen fehlgeschlagen");
    } else {
      toast.success("Ordner umbenannt");
      refresh();
    }
    setEditingId(null);
  };

  const startAdd = (parentId: string | null) => {
    setAddingUnderId(parentId ?? "root");
    setAddingName("");
    if (parentId) {
      setExpanded(s => new Set(s).add(parentId));
    }
  };

  const commitAdd = async () => {
    const name = addingName.trim();
    if (!name) { setAddingUnderId(null); return; }
    const parent = addingUnderId === "root" ? null : addingUnderId;
    // Determine management_mode for this building
    const { data: bld } = await supabase
      .from('buildings')
      .select('management_mode')
      .eq('id', buildingId)
      .maybeSingle();
    const mgmt = (bld?.management_mode as string) || 'weg';
    const siblings = categories.filter(c => (c.parent_id || null) === parent);
    const nextSort = (siblings.reduce((m, c) => Math.max(m, c.sort_order || 0), 0) || 0) + 10;
    const { error } = await supabase
      .from('building_file_categories')
      .insert({
        name,
        parent_id: parent,
        building_id: buildingId,
        management_mode: mgmt,
        sort_order: nextSort,
        is_recommended: false,
        auto_rag_enabled: false,
      } as any);
    if (error) {
      toast.error("Anlegen fehlgeschlagen: " + error.message);
    } else {
      toast.success("Ordner angelegt");
      refresh();
    }
    setAddingUnderId(null);
    setAddingName("");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    // Block delete if any files in this category or any descendant
    const allIds: string[] = [];
    const collect = (n: TreeNode) => { allIds.push(n.id); n.children.forEach(collect); };
    collect(deleteTarget);
    const totalFiles = allIds.reduce((s, id) => s + (counts[id] || 0), 0);
    if (totalFiles > 0) {
      toast.error(`Ordner enthält ${totalFiles} Datei(en). Bitte zuerst verschieben oder löschen.`);
      setDeleteTarget(null);
      return;
    }
    const { error } = await supabase
      .from('building_file_categories')
      .delete()
      .in('id', allIds);
    if (error) {
      toast.error("Löschen fehlgeschlagen: " + error.message);
    } else {
      toast.success("Ordner gelöscht");
      refresh();
      if (allIds.includes(selectedCategoryId || '')) onSelect(null);
    }
    setDeleteTarget(null);
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isOpen = expanded.has(node.id);
    const isSelected = selectedCategoryId === node.id;
    const hasChildren = node.children.length > 0;
    const isEditing = editingId === node.id;

    return (
      <div key={node.id}>
        <div
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("application/x-dms-file-ids")) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dropTargetId !== node.id) setDropTargetId(node.id);
            }
          }}
          onDragLeave={() => { if (dropTargetId === node.id) setDropTargetId(null); }}
          onDrop={(e) => handleDropOnFolder(node.id, e)}
          className={cn(
            "group w-full flex items-center gap-1.5 py-1.5 px-2 rounded-md text-sm hover:bg-accent",
            isSelected && "bg-accent font-medium",
            dropTargetId === node.id && "ring-2 ring-primary bg-primary/10"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >

          <span
            onClick={(e) => { if (hasChildren) { e.stopPropagation(); toggle(node.id); } }}
            className="flex-shrink-0 w-4 cursor-pointer"
          >
            {hasChildren ? (
              isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
            ) : null}
          </span>
          {isOpen && hasChildren ? (
            <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}

          {isEditing ? (
            <div className="flex-1 flex items-center gap-1">
              <Input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="h-7 text-sm"
              />
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={commitRename}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <button
                onClick={() => {
                  onSelect(node.id);
                  if (hasChildren) toggle(node.id);
                }}
                className="truncate flex-1 text-left bg-transparent border-0 p-0"
              >
                {node.name}
              </button>
              {node.fileCount > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{node.fileCount}</Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => startAdd(node.id)}>
                    <FolderPlus className="h-4 w-4 mr-2" /> Unterordner anlegen
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => startRename(node)}>
                    <Pencil className="h-4 w-4 mr-2" /> Umbenennen
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFolderArchived(node, true)}>
                    <Archive className="h-4 w-4 mr-2" /> Archivieren
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteTarget(node)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Löschen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        {addingUnderId === node.id && (
          <div className="flex items-center gap-1 py-1" style={{ paddingLeft: `${(depth + 1) * 12 + 28}px` }}>
            <Input
              autoFocus
              placeholder="Ordnername..."
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitAdd();
                if (e.key === 'Escape') setAddingUnderId(null);
              }}
              className="h-7 text-sm"
            />
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={commitAdd}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAddingUnderId(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {isOpen && hasChildren && (
          <div>{node.children.map(c => renderNode(c, depth + 1))}</div>
        )}
      </div>
    );
  };

  const totalCount = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "flex-1 flex items-center gap-1.5 py-1.5 px-2 rounded-md text-sm hover:bg-accent text-left",
            selectedCategoryId === null && "bg-accent font-medium"
          )}
        >
          <Folder className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1">Alle Dokumente</span>
          {totalCount > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{totalCount}</Badge>}
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 ml-1"
          onClick={() => startAdd(null)}
          title="Ordner auf oberster Ebene anlegen"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {addingUnderId === "root" && (
        <div className="flex items-center gap-1 py-1 pl-3">
          <Input
            autoFocus
            placeholder="Ordnername..."
            value={addingName}
            onChange={(e) => setAddingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAdd();
              if (e.key === 'Escape') setAddingUnderId(null);
            }}
            className="h-7 text-sm"
          />
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={commitAdd}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAddingUnderId(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {tree.map(n => renderNode(n, 0))}

      {(archivedCategories.length > 0 || archivedFileCount > 0) && (
        <div className="mt-3 pt-2 border-t">
          <button
            onClick={() => onSelect(ARCHIVE_CATEGORY_ID)}
            className={cn(
              "w-full flex items-center gap-1.5 py-1.5 px-2 rounded-md text-sm hover:bg-accent text-left",
              selectedCategoryId === ARCHIVE_CATEGORY_ID && "bg-accent font-medium"
            )}
          >
            <Archive className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">Archiv</span>
            {archivedFileCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{archivedFileCount}</Badge>
            )}
          </button>
          {archivedCategories
            .filter((c: any) => !archivedCategories.some(p => p.id === c.parent_id))
            .map((c: any) => (
              <div
                key={c.id}
                className="group flex items-center gap-1.5 py-1 px-2 pl-7 rounded-md text-sm text-muted-foreground hover:bg-accent"
              >
                <Folder className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate flex-1">{c.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title="Wiederherstellen"
                  onClick={() => setFolderArchived(c, false)}
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
        </div>
      )}



      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ordner „{deleteTarget?.name}" löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Ordner und alle Unterordner werden gelöscht. Dateien müssen vorher verschoben oder gelöscht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
