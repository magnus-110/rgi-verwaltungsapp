import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
}

interface Building {
  id: string;
  name: string;
}

interface UserProfile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  building_id: string | null;
}

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  buildings: Building[];
  users: UserProfile[];
  managementMode: 'weg' | 'rent';
  onUploaded: () => void;
}

export function FileUploadDialog({ open, onOpenChange, categories, buildings, users, managementMode, onUploaded }: FileUploadDialogProps) {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [description, setDescription] = useState("");
  const [visibleToUsers, setVisibleToUsers] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter users by selected building
  const filteredUsers = buildingId
    ? users.filter(u => u.building_id === buildingId)
    : users;

  const resetForm = () => {
    setFile(null);
    setDisplayName("");
    setCategoryId("");
    setBuildingId("");
    setAssignedUserId("");
    setDescription("");
    setVisibleToUsers(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.size > 50 * 1024 * 1024) {
        toast.error("Datei darf maximal 50 MB groß sein");
        return;
      }
      setFile(selected);
      if (!displayName) setDisplayName(selected.name);
    }
  };

  const handleUpload = async () => {
    if (!file || !displayName) {
      toast.error("Bitte Datei und Name angeben");
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ext = file.name.split('.').pop();
      const storagePath = `${buildingId || 'general'}/${crypto.randomUUID()}.${ext}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('building-files')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Insert file record
      const { error: insertError } = await supabase
        .from('building_files')
        .insert({
          display_name: displayName,
          file_path: storagePath,
          file_size: file.size,
          mime_type: file.type,
          category_id: categoryId || null,
          building_id: buildingId || null,
          assigned_user_id: assignedUserId || null,
          uploaded_by: user.id,
          management_mode: managementMode,
          description: description || null,
          visible_to_users: visibleToUsers,
        });

      if (insertError) throw insertError;

      toast.success("Dokument hochgeladen");
      resetForm();
      onOpenChange(false);
      onUploaded();
    } catch (e: any) {
      console.error('Upload error:', e);
      toast.error("Upload fehlgeschlagen: " + (e.message || 'Unbekannter Fehler'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Dokument hochladen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Datei</Label>
            <div
              className="mt-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {file ? file.name : "Klicken zum Auswählen oder Datei hierher ziehen"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">PDF, Word, Excel, Bilder (max. 50 MB)</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt"
              onChange={handleFileChange}
            />
          </div>

          <div>
            <Label htmlFor="displayName">Anzeigename</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="z.B. Nebenkostenabrechnung 2024"
            />
          </div>

          <div>
            <Label>Kategorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Kategorie wählen (optional)" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Gebäude</Label>
            <Select value={buildingId} onValueChange={(val) => { setBuildingId(val); setAssignedUserId(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Gebäude wählen (optional)" />
              </SelectTrigger>
              <SelectContent>
                {buildings.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Person zuordnen (optional)</Label>
            <Select value={assignedUserId} onValueChange={setAssignedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Für alle sichtbar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Für alle im Gebäude</SelectItem>
                {filteredUsers.map(u => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description">Beschreibung (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optionale Beschreibung..."
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="visible">Für Nutzer sichtbar</Label>
            <Switch id="visible" checked={visibleToUsers} onCheckedChange={setVisibleToUsers} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
            Abbrechen
          </Button>
          <Button onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Hochladen...</> : "Hochladen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
