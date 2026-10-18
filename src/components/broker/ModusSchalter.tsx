import { Briefcase, Building2, KeyRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBrokerModeOptional } from "@/hooks/useBrokerMode";
import { cn } from "@/lib/utils";

interface Props {
  managementMode: "weg" | "rent";
  onModeChange: (mode: "weg" | "rent") => void;
  /** Schmale Seitenleiste: nur Symbole untereinander. */
  kompakt?: boolean;
  /** Nach dem Umschalten (z. B. mobiles Menü schließen). */
  onDone?: () => void;
  className?: string;
}

/**
 * WEG · Miete · Makler – ein Schalter für Seitenleiste und Handy-Menü.
 * „Makler" erscheint nur für Admins und freigeschaltete Mitarbeiter.
 */
export function ModusSchalter({ managementMode, onModeChange, kompakt, onDone, className }: Props) {
  const broker = useBrokerModeOptional();
  const navigate = useNavigate();
  const location = useLocation();
  const maklerAktiv = !!broker?.brokerActive;

  const waehle = (ziel: "weg" | "rent" | "makler") => {
    if (ziel === "makler") {
      broker?.setBrokerActive(true);
      if (!location.pathname.startsWith("/makler")) navigate("/makler");
    } else {
      broker?.setBrokerActive(false);
      onModeChange(ziel);
      if (location.pathname.startsWith("/makler")) navigate("/dashboard");
    }
    onDone?.();
  };

  const optionen: { key: "weg" | "rent" | "makler"; label: string; icon: typeof Building2; aktiv: boolean }[] = [
    { key: "weg", label: "WEG", icon: Building2, aktiv: !maklerAktiv && managementMode === "weg" },
    { key: "rent", label: "Miete", icon: KeyRound, aktiv: !maklerAktiv && managementMode === "rent" },
  ];
  if (broker?.brokerAllowed) optionen.push({ key: "makler", label: "Makler", icon: Briefcase, aktiv: maklerAktiv });

  if (kompakt) {
    return (
      <div className={cn("flex flex-col items-center gap-1", className)} role="group" aria-label="Bereich wählen">
        {optionen.map((o) => (
          <button
            key={o.key}
            type="button"
            title={o.label}
            aria-label={o.label}
            aria-pressed={o.aktiv}
            onClick={() => waehle(o.key)}
            className={cn(
              "h-9 w-9 flex items-center justify-center rounded-md transition-colors",
              o.aktiv ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <o.icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex bg-muted rounded-lg p-1 gap-1", className)} role="group" aria-label="Bereich wählen">
      {optionen.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={o.aktiv}
          onClick={() => waehle(o.key)}
          className={cn(
            "flex-1 min-h-9 px-2 rounded-md text-sm font-medium transition-colors",
            o.aktiv ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
