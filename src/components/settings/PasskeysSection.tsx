import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Fingerprint, KeyRound, Pencil, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface Passkey {
  id: string;
  friendly_name?: string | null;
  created_at: string;
  last_used_at?: string | null;
}

const browserSupportsPasskeys = () =>
  typeof window !== "undefined" && !!(window as any).PublicKeyCredential;

export const PasskeysSection = ({ schlicht = false }: { schlicht?: boolean } = {}) => {
  const [items, setItems] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Passkey | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Passkey | null>(null);
  const supported = browserSupportsPasskeys();

  const passkeyApi = () => (supabase.auth as any)?.passkey;

  const load = async () => {
    setLoading(true);
    try {
      const api = passkeyApi();
      if (!api?.list) {
        setItems([]);
        return;
      }
      const { data, error } = await api.list();
      if (error) throw error;
      setItems(Array.isArray(data) ? (data as Passkey[]) : []);
    } catch (e: any) {
      console.error("passkey.list failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRegister = async () => {
    if (!supported) {
      toast.error("Ihr Browser oder Gerät unterstützt keine Passkeys.");
      return;
    }
    const auth = supabase.auth as any;
    if (typeof auth.registerPasskey !== "function") {
      toast.error("Passkey-Funktion ist im Client nicht verfügbar.");
      return;
    }
    setRegistering(true);
    try {
      const { error } = await auth.registerPasskey();
      if (error) {
        if (error.name === "NotAllowedError" || error.code === "user_cancelled") {
          // User cancelled — silent
          return;
        }
        toast.error(error.message ?? "Passkey konnte nicht registriert werden.");
        return;
      }
      toast.success("Passkey erfolgreich registriert.");
      await load();
    } catch (e: any) {
      console.error("registerPasskey failed", e);
      toast.error(e?.message ?? "Passkey konnte nicht registriert werden.");
    } finally {
      setRegistering(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    try {
      const { error } = await passkeyApi().update({
        passkeyId: renameTarget.id,
        friendlyName: renameValue.trim().slice(0, 120),
      });
      if (error) throw error;
      toast.success("Passkey umbenannt.");
      setRenameTarget(null);
      setRenameValue("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Umbenennen fehlgeschlagen.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await passkeyApi().delete({ passkeyId: deleteTarget.id });
      if (error) throw error;
      toast.success("Passkey gelöscht.");
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Löschen fehlgeschlagen.");
    }
  };

  const fmt = (d?: string | null) =>
    d ? format(new Date(d), "dd.MM.yyyy HH:mm", { locale: de }) : "—";

  const liste = loading ? (
    <p className="text-sm text-muted-foreground">Lade Passkeys…</p>
  ) : items.length === 0 ? (
    <p className="text-sm text-muted-foreground">
      {schlicht ? "Auf diesem Konto ist noch keine Anmeldung per Fingerabdruck oder Gesicht eingerichtet." : "Sie haben noch keinen Passkey registriert."}
    </p>
  ) : (
    <ul className={schlicht ? "divide-y divide-foreground/[0.055]" : "divide-y divide-border rounded-md border"}>
      {items.map((pk) => (
        <li key={pk.id} className={schlicht ? "flex items-center gap-3 py-2.5" : "flex items-center gap-3 p-3"}>
          <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{pk.friendly_name || (schlicht ? "Gerät" : "Unbenannter Passkey")}</span>
              {pk.last_used_at && (
                <Badge variant="secondary" className="text-[10px]">zuletzt: {fmt(pk.last_used_at)}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">eingerichtet am {fmt(pk.created_at)}</p>
          </div>
          <Button size="icon" variant="ghost" className={schlicht ? "h-11 w-11" : undefined}
            onClick={() => { setRenameTarget(pk); setRenameValue(pk.friendly_name ?? ""); }} aria-label="Umbenennen">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className={schlicht ? "h-11 w-11" : undefined} onClick={() => setDeleteTarget(pk)} aria-label="Löschen">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </li>
      ))}
    </ul>
  );

  const nichtUnterstuetzt = !supported && (
    <p className="text-sm text-muted-foreground">Dieser Browser oder dieses Gerät unterstützt das leider nicht.</p>
  );

  const Huelle = ({ children }: { children: React.ReactNode }) =>
    schlicht ? (
      <div className="space-y-5">{children}</div>
    ) : (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5" /> Passkeys
          </CardTitle>
          <CardDescription>
            Melden Sie sich künftig ohne Passwort an – per Face ID, Touch ID, Windows Hello
            oder Sicherheitsschlüssel. Passkeys funktionieren nur unter{" "}
            <code className="text-xs">rgi-immobilien.app</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    );

  return (
    <>
    <Huelle>
      {schlicht ? (
        <>
          <section>
            <h3 className="font-display text-[11px] font-semibold uppercase tracking-[0.6px] text-muted-foreground/80 px-1 mb-2">Eingerichtete Geräte</h3>
            <div className="bg-card rounded-[14px] border border-border/60 shadow-sm px-4 py-3">{liste}</div>
          </section>
          {nichtUnterstuetzt}
          <Button onClick={handleRegister} disabled={!supported || registering} className="w-full h-12 text-base rounded-[12px]">
            <Plus className="h-4 w-4 mr-2" />
            {registering ? "Wird eingerichtet…" : "Auf diesem Gerät einrichten"}
          </Button>
          <p className="text-xs text-muted-foreground px-1 leading-relaxed">
            Ihr Fingerabdruck oder Gesicht bleibt auf Ihrem Gerät – wir bekommen ihn nie zu sehen.
          </p>
        </>
      ) : (
        <>
          {nichtUnterstuetzt}
          {liste}
          <Button onClick={handleRegister} disabled={!supported || registering}>
            <Plus className="h-4 w-4 mr-2" />
            {registering ? "Registriere…" : "Neuen Passkey registrieren"}
          </Button>
        </>
      )}
    </Huelle>

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Passkey umbenennen</DialogTitle>
            <DialogDescription>
              Geben Sie einen aussagekräftigen Namen ein, z. B. „MacBook Touch ID".
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={120}
            placeholder="Name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Abbrechen
            </Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Passkey löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{deleteTarget?.friendly_name || "Dieser Passkey"}" wird entfernt und kann nicht mehr für die Anmeldung verwendet werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
