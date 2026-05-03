import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Trash2, Search, FileText, User, Building2, Pencil, Check, X } from "lucide-react";
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
  rag_enabled: boolean;
  created_at: string;
  building_id: string | null;
  assigned_user_id: string | null;
  category_id: string | null;
  management_mode: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
}

interface FileListProps {
  files: FileItem[];
  categories: Category[];
  isAdmin?: boolean;
  onDelete?: (fileId: string, filePath: string) => void;
  onToggleVisibility?: (fileId: string, visible: boolean) => void;
  onRenamed?: () => void;
  profiles?: { user_id: string; first_name: string | null; last_name: string | null }[];
  buildings?: { id: string; name: string }[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileList({ files, categories, isAdmin = false, onDelete, onToggleVisibility, onRenamed, profiles, buildings }: FileListProps) {
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [localNames, setLocalNames] = useState<Record<string, string>>({});

  const startRename = (file: FileItem) => {
    setRenamingId(file.id);
    setRenameValue(localNames[file.id] ?? file.display_name);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const saveRename = async (fileId: string) => {
    const newName = renameValue.trim();
    if (!newName) {
      toast.error("Name darf nicht leer sein");
      return;
    }
    setSavingRename(true);
    const { error } = await supabase
      .from("building_files")
      .update({ display_name: newName })
      .eq("id", fileId);
    setSavingRename(false);
    if (error) {
      toast.error("Umbenennen fehlgeschlagen");
    } else {
      toast.success("Umbenannt");
      setLocalNames((prev) => ({ ...prev, [fileId]: newName }));
      setRenamingId(null);
      setRenameValue("");
      onRenamed?.();
    }
  };

  const displayName = (f: FileItem) => localNames[f.id] ?? f.display_name;

  const filteredFiles = files.filter(f =>
    displayName(f).toLowerCase().includes(search.toLowerCase())
  );

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return null;
    return categories.find(c => c.id === categoryId);
  };

  const getPersonName = (userId: string | null) => {
    if (!userId || !profiles) return null;
    const p = profiles.find(p => p.user_id === userId);
    return p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : null;
  };

  const getBuildingName = (buildingId: string | null) => {
    if (!buildingId || !buildings) return null;
    return buildings.find(b => b.id === buildingId)?.name || null;
  };

  const handleDownload = async (file: FileItem) => {
    setDownloading(file.id);
    try {
      const { data, error } = await supabase.functions.invoke('get-building-file-url', {
        body: { filePath: file.file_path }
      });
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (e) {
      console.error('Download error:', e);
      toast.error("Download fehlgeschlagen");
    } finally {
      setDownloading(null);
    }
  };

  if (filteredFiles.length === 0 && !search) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p>Noch keine Dokumente vorhanden</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Dokument suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dokument</TableHead>
              <TableHead>Kategorie</TableHead>
              {isAdmin && <TableHead>Zuordnung</TableHead>}
              <TableHead>Größe</TableHead>
              <TableHead>Datum</TableHead>
              {isAdmin && <TableHead>Sichtbar</TableHead>}
              <TableHead className="w-[100px]">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFiles.map(file => {
              const cat = getCategoryName(file.category_id);
              return (
                <TableRow key={file.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      {renamingId === file.id ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRename(file.id);
                              if (e.key === "Escape") cancelRename();
                            }}
                            autoFocus
                            className="h-7 text-sm"
                            disabled={savingRename}
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => saveRename(file.id)} disabled={savingRename}>
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelRename} disabled={savingRename}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="font-medium truncate max-w-[200px]">{displayName(file)}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {cat && (
                      <Badge variant="outline" style={{ borderColor: cat.color, color: cat.color }}>
                        {cat.name}
                      </Badge>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        {file.assigned_user_id ? (
                          <>
                            <User className="w-3 h-3" />
                            <span>{getPersonName(file.assigned_user_id) || 'Person'}</span>
                          </>
                        ) : (
                          <>
                            <Building2 className="w-3 h-3" />
                            <span>{getBuildingName(file.building_id) || 'Alle'}</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground text-sm">
                    {formatFileSize(file.file_size)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(file.created_at), 'dd.MM.yyyy', { locale: de })}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Switch
                        checked={file.visible_to_users}
                        onCheckedChange={(checked) => onToggleVisibility?.(file.id, checked)}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {isAdmin && renamingId !== file.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startRename(file)}
                          title="Umbenennen"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(file)}
                        disabled={downloading === file.id}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      {isAdmin && onDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onDelete(file.id, file.file_path)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {search && filteredFiles.length === 0 && (
        <p className="text-center text-muted-foreground py-4">
          Keine Dokumente für „{search}" gefunden
        </p>
      )}
    </div>
  );
}
