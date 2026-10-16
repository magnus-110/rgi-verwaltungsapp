import { useNavigate } from "react-router-dom";
import { ChevronRight, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { PasskeysSection } from "./PasskeysSection";

/** Einstellungen › Anmeldung & Sicherheit: Passwort und Passkeys. */
export function SicherheitBereich() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const ziel = "/admin/change-password";

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-0">
          <button
            type="button"
            onClick={() => navigate(ziel)}
            className="flex w-full items-center gap-4 rounded-lg px-5 py-4 text-left hover:bg-muted/50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">Passwort ändern</div>
              <div className="text-sm text-muted-foreground">Neues Passwort für die Anmeldung mit {profile?.email} festlegen.</div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </CardContent>
      </Card>
      <PasskeysSection />
    </div>
  );
}
