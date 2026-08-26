import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  MoreVertical,
  Pencil,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCompanyFolders,
  useCompanyFileCounts,
  useCreateCompanyFolder,
  useRenameCompanyFolder,
  useDeleteCompanyFolder,
  useMoveCompanyFiles,
} from "@/hooks/useCompanyDocuments";
import {
  CompanyFolder,
  VIRTUAL_INVOICES_IN,
  VIRTUAL_INVOICES_OUT,
} from "./types";

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

interface TreeNode extends CompanyFolder {
  children: TreeNode[];
}

export function CompanyFolderTree({ selectedId, onSelect }: Props) {
  const { data: folders = [], isLoading } = useCompanyFolders();
  const { data: counts = {} } = useCompanyFileCounts();
  const createFolder = useCreateCompanyFolder();
  const renameFolder = useRenameCompanyFolder();
  const deleteFolder = useDeleteCompanyFolder();
  const moveFiles = useMoveCompanyFiles();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Ordner, ueber dem gerade eine Datei schwebt — nur fuer die Hervorhebung.
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    { mode: "create"; parentId: string | null } | { mode: "rename"; id: string; name: string } | null
  >(null);
  const [draftName, setDraftName] = useState("");

  const tree = useMemo(() => {
    const byId = new Map<string, TreeNode>();
    folders.forEach((f) => byId.set(f.id, { ...f, children: [] }));
    const roots: TreeNode[] = [];
    byId.forEach((node) => {
      const parent = node.parent_id ? byId.get(node.parent_id) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    });
    return roots;
  }, [folders]);

  const totalCount = useMemo(
    () => Object.values(counts).reduce((sum, n) => sum + n, 0),
    [counts],
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Nimmt gezogene Dokumente auf und haengt sie an den Zielordner. */
  const acceptDrop = (categoryId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const raw = e.dataTransfer.getData("application/x-dms-file-ids");
    if (!raw) return;
    let ids: string[] = [];
    try {
      ids = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(ids) || ids.length === 0) return;
    moveFiles.mutate({ ids, categoryId });
  };

  const dropHandlers = (targetKey: string, categoryId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("application/x-dms-file-ids")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTarget(targetKey);
    },
    onDragLeave: () => setDropTarget((prev) => (prev === targetKey ? null : prev)),
    onDrop: (e: React.DragEvent) => acceptDrop(categoryId, e),
  });

  const openCreate = (parentId: string | null) => {
    setDraftName("");
    setDialog({ mode: "create", parentId });
  };

  const submitDialog = () => {
    if (!dialog || !draftName.trim()) return;
    if (dialog.mode === "create") {
      createFolder.mutate({ name: draftName, parentId: dialog.parentId });
    } else {
      renameFolder.mutate({ id: dialog.id, name: draftName });
    }
    setDialog(null);
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isOpen = expanded.has(node.id);
    const isActive = selectedId === node.id;
    const count = counts[node.id] ?? 0;
    return (
      <div key={node.id}>
        <div
          {...dropHandlers(node.id, node.id)}
          className={cn(
            "group flex items-center gap-1 rounded-md pr-1 hover:bg-muted/60",
            isActive && "bg-primary/10 text-primary",
            dropTarget === node.id && "ring-2 ring-primary ring-inset bg-primary/10",
          )}
          style={{ paddingLeft: depth * 12 }}
        >
          {node.children.length > 0 ? (
            <button
              className="p-1 text-muted-foreground hover:text-foreground"
              onClick={() => toggle(node.id)}
              aria-label={isOpen ? "Zuklappen" : "Aufklappen"}
            >
              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-[22px]" />
          )}
          <button
            className="flex flex-1 items-center gap-2 py-1.5 text-left text-sm min-w-0"
            onClick={() => onSelect(node.id)}
          >
            {isActive ? (
              <FolderOpen className="h-4 w-4 flex-shrink-0" />
            ) : (
              <Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{node.name}</span>
            {count > 0 && (
              <Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[10px]">
                {count}
              </Badge>
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                aria-label="Ordneraktionen"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openCreate(node.id)}>
                <FolderPlus className="mr-2 h-4 w-4" /> Unterordner
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setDraftName(node.name);
                  setDialog({ mode: "rename", id: node.id, name: node.name });
                }}
              >
                <Pencil className="mr-2 h-4 w-4" /> Umbenennen
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => deleteFolder.mutate(node.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {isOpen && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      <button
        {...dropHandlers("__root__", null)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60",
          selectedId === null && "bg-primary/10 text-primary",
          dropTarget === "__root__" && "ring-2 ring-primary ring-inset bg-primary/10",
        )}
        onClick={() => onSelect(null)}
        title="Dokumente hierher ziehen, um sie aus allen Ordnern zu nehmen"
      >
        <Layers className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">Alle Dokumente</span>
        {totalCount > 0 && (
          <Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[10px]">
            {totalCount}
          </Badge>
        )}
      </button>

      {isLoading && <p className="px-2 py-4 text-xs text-muted-foreground">Ordner werden geladen…</p>}
      {tree.map((node) => renderNode(node, 0))}

      <Button
        variant="ghost"
        size="sm"
        className="mt-2 w-full justify-start gap-2 text-muted-foreground"
        onClick={() => openCreate(null)}
      >
        <FolderPlus className="h-4 w-4" /> Neuer Ordner
      </Button>

      <div className="pt-3">
        <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Automatisch
        </p>
        {[
          { id: VIRTUAL_INVOICES_OUT, label: "Rechnungen an Kunden" },
          { id: VIRTUAL_INVOICES_IN, label: "Rechnungen von Lieferanten" },
        ].map((entry) => (
          <button
            key={entry.id}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60",
              selectedId === entry.id && "bg-primary/10 text-primary",
            )}
            onClick={() => onSelect(entry.id)}
          >
            <ReceiptText className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{entry.label}</span>
          </button>
        ))}
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "rename" ? "Ordner umbenennen" : "Neuer Ordner"}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={draftName}
            placeholder="Name des Ordners"
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitDialog();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Abbrechen
            </Button>
            <Button onClick={submitDialog} disabled={!draftName.trim()}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
