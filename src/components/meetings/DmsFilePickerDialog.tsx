import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId?: string;
  excludePaths?: string[];
  onSelect: (paths: string[]) => void;
}

export const DmsFilePickerDialog = ({ open, onOpenChange, buildingId, excludePaths = [], onSelect }: Props) => {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["dms-files-for-picker", buildingId],
    queryFn: async () => {
      let q = supabase
        .from("building_files")
        .select("id, display_name, file_path, mime_type, file_size, created_at, category:building_file_categories(name)")
        .eq("is_current_version", true)
        .order("created_at", { ascending: false })
        .limit(500);
      if (buildingId) q = q.eq("building_id", buildingId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const filtered = files.filter((f: any) => {
    if (excludePaths.includes(f.file_path)) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (f.display_name || "").toLowerCase().includes(s) || (f.file_path || "").toLowerCase().includes(s);
  });

  const handleConfirm = () => {
    const paths = files.filter((f: any) => selected[f.id]).map((f: any) => f.file_path);
    onSelect(paths);
    setSelected({});
    setSearch("");
    onOpenChange(false);
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Aus DMS auswählen</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Datei suchen…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <ScrollArea className="flex-1 min-h-[300px] border rounded-md">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-4">Wird geladen…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Keine Dateien gefunden.</p>
          ) : (
            <div className="divide-y">
              {filtered.map((f: any) => (
                <label key={f.id} className="flex items-center gap-3 p-2.5 hover:bg-muted/50 cursor-pointer">
                  <Checkbox
                    checked={!!selected[f.id]}
                    onCheckedChange={(c) => setSelected((prev) => ({ ...prev, [f.id]: !!c }))}
                  />
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{f.display_name || f.file_path.split("/").pop()}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {f.category?.name && <span>{f.category.name} · </span>}
                      {f.mime_type}
                      {typeof f.file_size === "number" && ` · ${(f.file_size / 1024).toFixed(0)} KB`}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </ScrollArea>
        <DialogFooter className="gap-2">
          {selectedCount > 0 && <Badge variant="secondary" className="mr-auto">{selectedCount} ausgewählt</Badge>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleConfirm} disabled={selectedCount === 0}>Übernehmen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
