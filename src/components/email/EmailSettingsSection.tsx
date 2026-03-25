import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, Plus, Edit, Trash2, Loader2, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface EmailAccount {
  id: string;
  display_name: string;
  email_address: string;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_password: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  use_ssl: boolean;
  is_active: boolean;
  delete_after_import: boolean;
  last_sync_at: string | null;
  last_sync_error: string | null;
  signature_html: string | null;
}

const emptyAccount = {
  display_name: "",
  email_address: "",
  imap_host: "imap.strato.de",
  imap_port: 993,
  imap_user: "",
  imap_password: "",
  smtp_host: "smtp.strato.de",
  smtp_port: 465,
  smtp_user: "",
  smtp_password: "",
  use_ssl: true,
  is_active: true,
  delete_after_import: true,
};

export const EmailSettingsSection = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyAccount);
  const [isSaving, setIsSaving] = useState(false);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [signatureAccountId, setSignatureAccountId] = useState<string | null>(null);
  const [signatureText, setSignatureText] = useState("");

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["email-accounts-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_accounts")
        .select("*")
        .order("display_name");
      if (error) throw error;
      return data as EmailAccount[];
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyAccount);
    setDialogOpen(true);
  };

  const openEdit = (acc: EmailAccount) => {
    setEditingId(acc.id);
    setForm({
      display_name: acc.display_name,
      email_address: acc.email_address,
      imap_host: acc.imap_host,
      imap_port: acc.imap_port,
      imap_user: acc.imap_user,
      imap_password: acc.imap_password,
      smtp_host: acc.smtp_host,
      smtp_port: acc.smtp_port,
      smtp_user: acc.smtp_user,
      smtp_password: acc.smtp_password,
      use_ssl: acc.use_ssl,
      is_active: acc.is_active,
      delete_after_import: acc.delete_after_import,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.display_name || !form.email_address || !form.imap_user || !form.imap_password) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    setIsSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from("email_accounts")
          .update(form)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("E-Mail-Konto aktualisiert");
      } else {
        const { error } = await supabase.from("email_accounts").insert(form);
        if (error) throw error;
        toast.success("E-Mail-Konto erstellt");
      }
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["email-accounts-settings"] });
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
    } catch (err: any) {
      toast.error(err.message || "Fehler beim Speichern");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("E-Mail-Konto wirklich löschen? Alle zugehörigen E-Mails werden ebenfalls gelöscht.")) return;
    try {
      const { error } = await supabase.from("email_accounts").delete().eq("id", id);
      if (error) throw error;
      toast.success("E-Mail-Konto gelöscht");
      queryClient.invalidateQueries({ queryKey: ["email-accounts-settings"] });
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
    } catch (err: any) {
      toast.error(err.message || "Fehler beim Löschen");
    }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    await supabase.from("email_accounts").update({ is_active: !currentActive }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["email-accounts-settings"] });
    queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
  };

  const openSignatureEditor = (acc: EmailAccount) => {
    setSignatureAccountId(acc.id);
    setSignatureText(acc.signature_html || "");
    setSignatureDialogOpen(true);
  };

  const saveSignature = async () => {
    if (!signatureAccountId) return;
    try {
      const { error } = await supabase.from("email_accounts").update({ signature_html: signatureText || null }).eq("id", signatureAccountId);
      if (error) throw error;
      toast.success("Signatur gespeichert");
      setSignatureDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["email-accounts-settings"] });
      queryClient.invalidateQueries({ queryKey: ["email-accounts-compose"] });
    } catch (err: any) {
      toast.error(err.message || "Fehler beim Speichern");
    }
  };

  const updateField = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              E-Mail-Konten
            </div>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Konto hinzufügen
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : accounts.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              Noch keine E-Mail-Konten konfiguriert.
            </p>
          ) : (
            <div className="space-y-3">
              {accounts.map(acc => (
                <div key={acc.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{acc.display_name}</span>
                      <Badge variant={acc.is_active ? "default" : "secondary"} className="text-xs">
                        {acc.is_active ? "Aktiv" : "Inaktiv"}
                      </Badge>
                      {acc.signature_html && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <FileSignature className="h-3 w-3" />
                          Signatur
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{acc.email_address}</div>
                    {acc.last_sync_at && (
                      <div className="text-xs text-muted-foreground">
                        Letzte Sync: {new Date(acc.last_sync_at).toLocaleString("de-DE")}
                      </div>
                    )}
                    {acc.last_sync_error && (
                      <div className="text-xs text-destructive">Fehler: {acc.last_sync_error}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={acc.is_active}
                      onCheckedChange={() => toggleActive(acc.id, acc.is_active)}
                    />
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openSignatureEditor(acc)} title="Signatur bearbeiten">
                      <FileSignature className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(acc)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => handleDelete(acc.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "E-Mail-Konto bearbeiten" : "Neues E-Mail-Konto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Anzeigename *</Label>
                <Input value={form.display_name} onChange={e => updateField("display_name", e.target.value)} placeholder="z.B. Hausverwaltung" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">E-Mail-Adresse *</Label>
                <Input value={form.email_address} onChange={e => updateField("email_address", e.target.value)} placeholder="info@firma.de" className="h-9" />
              </div>
            </div>

            <div className="border rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">IMAP (Empfang)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Host</Label>
                  <Input value={form.imap_host} onChange={e => updateField("imap_host", e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Port</Label>
                  <Input type="number" value={form.imap_port} onChange={e => updateField("imap_port", parseInt(e.target.value))} className="h-9" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Benutzer *</Label>
                  <Input value={form.imap_user} onChange={e => updateField("imap_user", e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Passwort *</Label>
                  <Input type="password" value={form.imap_password} onChange={e => updateField("imap_password", e.target.value)} className="h-9" />
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">SMTP (Versand)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Host</Label>
                  <Input value={form.smtp_host} onChange={e => updateField("smtp_host", e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Port</Label>
                  <Input type="number" value={form.smtp_port} onChange={e => updateField("smtp_port", parseInt(e.target.value))} className="h-9" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Benutzer</Label>
                  <Input value={form.smtp_user} onChange={e => updateField("smtp_user", e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Passwort</Label>
                  <Input type="password" value={form.smtp_password} onChange={e => updateField("smtp_password", e.target.value)} className="h-9" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">SSL/TLS verwenden</Label>
                <Switch checked={form.use_ssl} onCheckedChange={v => updateField("use_ssl", v)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Nach Import vom Server löschen</Label>
                  <p className="text-xs text-muted-foreground">E-Mails werden nur in der App gespeichert</p>
                </div>
                <Switch checked={form.delete_after_import} onCheckedChange={v => updateField("delete_after_import", v)} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {editingId ? "Speichern" : "Erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
