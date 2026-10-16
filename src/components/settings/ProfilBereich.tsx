import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MySignatureSection } from "./MySignatureSection";

/** Einstellungen › Profil: Name, Telefon, Unterschrift. */
export function ProfilBereich() {
  const { profile, fetchProfile } = useAuth();
  const [vorname, setVorname] = useState(profile?.first_name ?? "");
  const [nachname, setNachname] = useState(profile?.last_name ?? "");
  const [telefon, setTelefon] = useState((profile as any)?.phone ?? "");
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    setVorname(profile?.first_name ?? "");
    setNachname(profile?.last_name ?? "");
    setTelefon((profile as any)?.phone ?? "");
  }, [profile]);

  if (!profile) return null;

  const geaendert =
    vorname !== (profile.first_name ?? "") || nachname !== (profile.last_name ?? "") || telefon !== ((profile as any).phone ?? "");
  const initialen = `${(vorname || profile.email || "?")[0] ?? ""}${nachname[0] ?? ""}`.toUpperCase();

  const speichern = async (e: React.FormEvent) => {
    e.preventDefault();
    setSpeichert(true);
    const { error } = await supabase
      .from("profiles")
      .update({ first_name: vorname.trim(), last_name: nachname.trim(), phone: telefon.trim() || null })
      .eq("user_id", profile.user_id);
    setSpeichert(false);
    if (error) {
      toast.error("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    toast.success("Profil gespeichert");
    await fetchProfile();
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row items-center gap-4 space-y-0">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
            {initialen}
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate">{[vorname, nachname].filter(Boolean).join(" ") || profile.email}</CardTitle>
            <CardDescription className="truncate">
              {profile.email} · {profile.role === "admin" ? "Admin" : "Mitarbeiter"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={speichern} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="vorname">Vorname</Label>
                <Input id="vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nachname">Nachname</Label>
                <Input id="nachname" value={nachname} onChange={(e) => setNachname(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="telefon">Telefon</Label>
                <Input id="telefon" type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="z. B. 0831 12345" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mail">E-Mail für die Anmeldung</Label>
                <Input id="mail" value={profile.email} disabled className="bg-muted" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              {geaendert && <span className="text-xs text-muted-foreground">Nicht gespeichert</span>}
              <Button type="submit" disabled={!geaendert || speichert}>
                {speichert && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Speichern
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <MySignatureSection />
    </div>
  );
}
