import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, ChevronDown, Folder, FolderOpen, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DocCategory } from "./types";

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: categories = [] } = useQuery({
    queryKey: ['stammakte-categories', buildingId],
    queryFn: async () => {
      // Ensure standard categories exist (idempotent)
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
        .is('deleted_at', null);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        if (row.category_id) map[row.category_id] = (map[row.category_id] || 0) + 1;
      });
      return map;
    },
  });

  const tree = useMemo(() => {
    const byParent: Record<string, DocCategory[]> = {};
    categories.forEach(c => {
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
  }, [categories, counts]);

  const toggle = (id: string) => {
    setExpanded(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isOpen = expanded.has(node.id);
    const isSelected = selectedCategoryId === node.id;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id}>
        <button
          onClick={() => onSelect(node.id)}
          className={cn(
            "w-full flex items-center gap-1.5 py-1.5 px-2 rounded-md text-sm hover:bg-accent text-left",
            isSelected && "bg-accent font-medium"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span
            onClick={(e) => { if (hasChildren) { e.stopPropagation(); toggle(node.id); } }}
            className="flex-shrink-0 w-4"
          >
            {hasChildren ? (
              isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
            ) : null}
          </span>
          {isOpen && hasChildren ? <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
          <span className="truncate flex-1">{node.name}</span>
          {node.is_recommended && node.fileCount === 0 && (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-label="Empfohlenes Dokument fehlt" />
          )}
          {node.fileCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{node.fileCount}</Badge>
          )}
        </button>
        {isOpen && hasChildren && (
          <div>{node.children.map(c => renderNode(c, depth + 1))}</div>
        )}
      </div>
    );
  };

  const totalCount = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "w-full flex items-center gap-1.5 py-1.5 px-2 rounded-md text-sm hover:bg-accent text-left",
          selectedCategoryId === null && "bg-accent font-medium"
        )}
      >
        <span className="w-4" />
        <Folder className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1">Alle Dokumente</span>
        {totalCount > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{totalCount}</Badge>}
      </button>
      {tree.map(n => renderNode(n, 0))}
    </div>
  );
}
