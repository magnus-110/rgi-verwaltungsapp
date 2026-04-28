import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Upload, FileText, Trash2, Download, FolderOpen, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface Props {
  buildingId: string;
  managementMode: "weg" | "rent";
}

const ONBOARDING_TAG = "onboarding";

const sanitizeFileName = (n: string): string => {
  const dot = n.lastIndexOf(".");
  const base = dot > 0 ? n.slice(0, dot) : n;
  const ext = dot > 0 ? n.slice(dot) : "";
  const cleaned = base
    .replace(/ü/g, "ue").replace(/Ü/g, "Ue")
    .replace(/ö/g, "oe").replace(/Ö/g, "Oe")
    .replace(/ä/g, "ae").replace(/Ä/g, "Ae")
    .replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (cleaned || "datei") + ext.toLowerCase();
};

const formatBytes = (b: number): string => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

export const OnboardingDocumentsCard = ({ buildingId, managementMode }: Props) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [visibleToOwners, setVisibleToOwners] = useState(true);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["onb-docs", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("building_files")
        .select("id, display_name, file_path, file_size, mime_type, created_at, visible_to_users, tags")
        .eq("building_id", buildingId)
        .contains("tags", [ONBOARDING_TAG])
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const acceptFile = (f: File | null | undefined) => {
    if (!f) return;
    setPendingFile(f);
    if (!displayName) {
      const dot = f.name.lastIndexOf(".");
      setDisplayName(dot > 0 ? f.name.slice(0, dot) : f.name);
    }
  };

  const handleUpload = async () => {
    if (!pendingFile) {
      toast({ title: "Keine Datei gewählt", variant: "destructive" });
      return;
    }
    if (!displayName.trim()) {
      toast({ title: "Bitte einen Anzeigenamen vergeben", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      const safeName = sanitizeFileName(pendingFile.name);
      const path = `${buildingId}/onboarding/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("building-files")
        .upload(path, pendingFile, { contentType: pendingFile.type || "application/octet-stream" });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("building_files").insert({
        building_id: buildingId,
        management_mode: managementMode,
        display_name: displayName.trim(),
        file_path: path,
        file_size: pendingFile.size,
        mime_type: pendingFile.type || null,
        uploaded_by: userId,
        tags: [ONBOARDING_TAG],
        visible_to_users: visibleToOwners,
        source: "manual_upload" as any,
      });
      if (insErr) {
        await supabase.storage.from("building-files").remove([path]);
        throw insErr;
      }

      toast({ title: "Dokument hochgeladen" });
      setPendingFile(null);
      setDisplayName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["onb-docs", buildingId] });
    } catch (e: any) {
      toast({ title: "Upload fehlgeschlagen", description: e?.message || "Unbekannter Fehler", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from("building-files")
      .createSignedUrl(filePath, 600);
    if (error || !data?.signedUrl) {
      toast({ title: "Download-Fehler", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (id: string, filePath: string) => {
    if (!confirm("Dokument wirklich löschen?")) return;
    await supabase.storage.from("building-files").remove([filePath]);
    const { error } = await supabase.from("building_files").delete().eq("id", id);
    if (error) {
      toast({ title: "Löschen fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Dokument gelöscht" });
    qc.invalidateQueries({ queryKey: ["onb-docs", buildingId] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" /> Onboarding-Dokumente
        </CardTitle>
        <CardDescription>
          Laden Sie Dateien hoch, die zum Onboarding dieser Liegenschaft gehören (z. B. Teilungserklärung, Pläne, Versicherungspolice, Vorverwalter-Übergabe). Sie werden im Dokumentenarchiv mit dem Tag „onboarding" abgelegt und sind dem Gebäude zugeordnet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload area */}
        {pendingFile ? (
          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" title={pendingFile.name}>{pendingFile.name}</div>
                <div className="text-xs text-muted-foreground">{formatBytes(pendingFile.size)}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPendingFile(null)} disabled={busy}>
                Entfernen
              </Button>
            </div>
            <div>
              <Label htmlFor="onb-doc-name">Anzeigename *</Label>
              <Input
                id="onb-doc-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="z. B. Teilungserklärung 2018"
                disabled={busy}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border bg-background p-2">
              <div>
                <Label htmlFor="onb-doc-visible" className="cursor-pointer text-sm">Für Eigentümer/Mieter sichtbar</Label>
                <p className="text-xs text-muted-foreground">Wenn aus, sehen nur Verwalter dieses Dokument.</p>
              </div>
              <Switch id="onb-doc-visible" checked={visibleToOwners} onCheckedChange={setVisibleToOwners} disabled={busy} />
            </div>
            <Button onClick={handleUpload} disabled={busy} className="w-full">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Hochladen
            </Button>
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/10" : "border-input hover:border-primary/40 hover:bg-accent/30"
            }`}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setIsDragging(true); }}
            onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              acceptFile(e.dataTransfer.files?.[0]);
            }}
          >
            <Upload className={`h-8 w-8 mx-auto mb-2 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => acceptFile(e.target.files?.[0])}
              className="hidden"
              id="onb-doc-upload"
            />
            <label htmlFor="onb-doc-upload" className="cursor-pointer">
              <div className="text-sm font-medium">
                <span className="text-primary hover:underline">Datei auswählen</span>
                <span className="text-muted-foreground"> oder hierher ziehen</span>
              </div>
            </label>
            <p className="text-xs text-muted-foreground mt-1">PDF, Word, Bilder, Excel u. v. m.</p>
          </div>
        )}

        {/* List */}
        <div className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Laden…</p>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3 text-center border border-dashed rounded">
              Noch keine Onboarding-Dokumente hochgeladen.
            </p>
          ) : (
            files.map((f: any) => (
              <div key={f.id} className="flex items-center gap-3 rounded-md border p-2 bg-card">
                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" title={f.display_name}>{f.display_name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{formatBytes(f.file_size || 0)}</span>
                    <span>·</span>
                    <span>{format(new Date(f.created_at), "dd.MM.yyyy", { locale: de })}</span>
                    {!f.visible_to_users && (
                      <Badge variant="outline" className="text-[10px] py-0">intern</Badge>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDownload(f.file_path)}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(f.id, f.file_path)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
