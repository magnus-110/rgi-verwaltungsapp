/**
 * Einstellungen › Team: Admins und Mitarbeiter in einer Liste.
 * Anlegen, Namen/Telefon ändern, Makler-Bereich freischalten, entfernen.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, MoreHorizontal, Pencil, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Rolle = "admin" | "employee";
interface Person {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  role: Rolle;
  broker_mode_enabled: boolean | null;
}

const ROLLEN: Record<Rolle, { name: string; text: string }> = {
  admin: { name: "Admin", text: "Sieht und darf alles, auch Einstellungen fürs Büro und das Team." },
  employee: { name: "Mitarbeiter", text: "Arbeitet mit allen Liegenschaften, ohne Büro-Einstellungen und RGI Intern." },
};

const name = (p: Pick<Person, "first_name" | "last_name" | "email">) =>
  [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;
const initialen = (p: Person) =>
  ((p.first_name?.[0] ?? p.email[0] ?? "") + (p.last_name?.[0] ?? "")).toUpperCase();

function neuesPasswort() {
  const zeichen = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const zufall = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(zufall, (z) => zeichen[z % zeichen.length]).join("");
}

export function TeamBereich() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [neu, setNeu] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Person | null>(null);
  const [loeschen, setLoeschen] = useState<Person | null>(null);

  const { data: team = [], isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("profiles") as any)
        .select("user_id, first_name, last_name, email, phone, role, broker_mode_enabled")
        .in("role", ["admin", "employee"])
        .order("first_name");
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });
  const neuLaden = () => qc.invalidateQueries({ queryKey: ["team"] });

  const maklerUmschalten = async (p: Person, an: boolean) => {
    const { error } = await (supabase.from("profiles") as any).update({ broker_mode_enabled: an }).eq("user_id", p.user_id);
    if (error) return toast.error("Fehler: " + error.message);
    toast.success(an ? `Makler-Bereich für ${name(p)} freigeschaltet` : `Makler-Bereich für ${name(p)} ausgeschaltet`);
    neuLaden();
  };

  const entfernen = async (p: Person) => {
    const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: { userId: p.user_id } });
    if (error || data?.error) return toast.error(data?.error || error?.message || "Entfernen fehlgeschlagen");
    toast.success(`${name(p)} entfernt`);
    setLoeschen(null);
    neuLaden();
  };

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div className="text-sm text-muted-foreground">
            {team.length} {team.length === 1 ? "Person" : "Personen"} · {team.filter((p) => p.role === "admin").length} Admins
          </div>
          <Button onClick={() => setNeu(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" /> Person hinzufügen
          </Button>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="divide-y">
              {team.map((p) => {
                const ich = p.user_id === user?.id;
                return (
                  <li key={p.user_id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {initialen(p)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-medium">{name(p)}</span>
                        {ich && <span className="text-xs text-muted-foreground">(du)</span>}
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-medium",
                            p.role === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {ROLLEN[p.role].name}
                        </span>
                        {p.broker_mode_enabled && (
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            Makler
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p.email}
                        {p.phone ? ` · ${p.phone}` : ""}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Aktionen für ${name(p)}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-60">
                        <DropdownMenuItem onClick={() => setBearbeiten(p)}>
                          <Pencil className="mr-2 h-4 w-4" /> Name & Telefon ändern
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => maklerUmschalten(p, !p.broker_mode_enabled)}>
                          <Switch checked={!!p.broker_mode_enabled} className="mr-2 scale-75" tabIndex={-1} />
                          Makler-Bereich
                        </DropdownMenuItem>
                        {!ich && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setLoeschen(p)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Zugang entfernen
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(ROLLEN) as Rolle[]).map((r) => (
          <div key={r} className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
            <div className="font-medium">{ROLLEN[r].name}</div>
            <div className="text-muted-foreground">{ROLLEN[r].text}</div>
          </div>
        ))}
      </div>

      <NeuePerson open={neu} onOpenChange={setNeu} onFertig={neuLaden} />
      {bearbeiten && <PersonBearbeiten person={bearbeiten} onClose={() => setBearbeiten(null)} onFertig={neuLaden} />}

      <AlertDialog open={!!loeschen} onOpenChange={(o) => !o && setLoeschen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zugang von {loeschen && name(loeschen)} entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Person kann sich danach nicht mehr anmelden. Was sie in der App erledigt hat (Notizen, Buchungen, Aufgaben), bleibt erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => loeschen && entfernen(loeschen)}>
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NeuePerson({ open, onOpenChange, onFertig }: { open: boolean; onOpenChange: (o: boolean) => void; onFertig: () => void }) {
  const leer = { vorname: "", nachname: "", email: "", telefon: "", rolle: "employee" as Rolle, passwort: neuesPasswort() };
  const [f, setF] = useState(leer);
  const [laeuft, setLaeuft] = useState(false);
  const [fertig, setFertig] = useState<{ email: string; passwort: string } | null>(null);

  const schliessen = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setF({ ...leer, passwort: neuesPasswort() });
      setFertig(null);
    }
  };

  const anlegen = async (e: React.FormEvent) => {
    e.preventDefault();
    setLaeuft(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email: f.email.trim(),
        password: f.passwort,
        role: f.rolle,
        first_name: f.vorname.trim(),
        last_name: f.nachname.trim(),
        phone: f.telefon.trim() || undefined,
      },
    });
    setLaeuft(false);
    if (error || data?.error) return toast.error(data?.error || error?.message || "Anlegen fehlgeschlagen");
    toast.success(`${f.vorname} ${f.nachname} angelegt`);
    setFertig({ email: f.email.trim(), passwort: f.passwort });
    onFertig();
  };

  const kopieren = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Kopiert"));
  };

  return (
    <Dialog open={open} onOpenChange={schliessen}>
      <DialogContent className="max-w-lg">
        {fertig ? (
          <>
            <DialogHeader>
              <DialogTitle>Zugang angelegt</DialogTitle>
              <DialogDescription>Gib diese Daten der Person persönlich weiter. Das Passwort kann sie danach unter Einstellungen selbst ändern.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">E-Mail</span>
                <span className="truncate font-medium">{fertig.email}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Passwort</span>
                <span className="flex items-center gap-1 font-mono">
                  {fertig.passwort}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => kopieren(fertig.passwort)} aria-label="Passwort kopieren">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => schliessen(false)}>Fertig</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={anlegen} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Person hinzufügen</DialogTitle>
              <DialogDescription>Legt einen Zugang zur App an.</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(ROLLEN) as Rolle[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setF({ ...f, rolle: r })}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                    f.rolle === r ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                  )}
                >
                  <div className="font-medium">{ROLLEN[r].name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{ROLLEN[r].text}</div>
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="np-vorname">Vorname</Label>
                <Input id="np-vorname" required value={f.vorname} onChange={(e) => setF({ ...f, vorname: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="np-nachname">Nachname</Label>
                <Input id="np-nachname" required value={f.nachname} onChange={(e) => setF({ ...f, nachname: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="np-mail">E-Mail</Label>
                <Input id="np-mail" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="np-tel">Telefon (optional)</Label>
                <Input id="np-tel" type="tel" value={f.telefon} onChange={(e) => setF({ ...f, telefon: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-pw">Erstes Passwort</Label>
              <div className="flex gap-2">
                <Input id="np-pw" required minLength={8} value={f.passwort} onChange={(e) => setF({ ...f, passwort: e.target.value })} className="font-mono" />
                <Button type="button" variant="outline" size="icon" onClick={() => setF({ ...f, passwort: neuesPasswort() })} aria-label="Neues Passwort erzeugen" title="Neues Passwort erzeugen">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Schon zufällig erzeugt. Die Person kann es nach der ersten Anmeldung ändern.</p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => schliessen(false)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={laeuft}>
                {laeuft && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Zugang anlegen
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PersonBearbeiten({ person, onClose, onFertig }: { person: Person; onClose: () => void; onFertig: () => void }) {
  const [f, setF] = useState({ vorname: person.first_name ?? "", nachname: person.last_name ?? "", telefon: person.phone ?? "" });
  const [laeuft, setLaeuft] = useState(false);

  const speichern = async (e: React.FormEvent) => {
    e.preventDefault();
    setLaeuft(true);
    const { error } = await supabase
      .from("profiles")
      .update({ first_name: f.vorname.trim(), last_name: f.nachname.trim(), phone: f.telefon.trim() || null })
      .eq("user_id", person.user_id);
    setLaeuft(false);
    if (error) return toast.error("Speichern fehlgeschlagen: " + error.message);
    toast.success("Gespeichert");
    onFertig();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={speichern} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{name(person)}</DialogTitle>
            <DialogDescription>
              {person.email} · {ROLLEN[person.role].name}. Die E-Mail für die Anmeldung bleibt gleich.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pb-vorname">Vorname</Label>
              <Input id="pb-vorname" value={f.vorname} onChange={(e) => setF({ ...f, vorname: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pb-nachname">Nachname</Label>
              <Input id="pb-nachname" value={f.nachname} onChange={(e) => setF({ ...f, nachname: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pb-tel">Telefon</Label>
            <Input id="pb-tel" type="tel" value={f.telefon} onChange={(e) => setF({ ...f, telefon: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={laeuft}>
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
