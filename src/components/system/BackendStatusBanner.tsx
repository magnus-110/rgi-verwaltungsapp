import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCcw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBackendHealth } from "@/hooks/useBackendHealth";

export const BackendStatusBanner = () => {
  const { status, checking, lastCheckedAt, checkNow } = useBackendHealth();
  const [showRecovered, setShowRecovered] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (status === "offline") {
      wasOffline.current = true;
      setShowRecovered(false);
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      setShowRecovered(true);
      const t = window.setTimeout(() => setShowRecovered(false), 5000);
      return () => window.clearTimeout(t);
    }
  }, [status]);

  if (status === "online" && !showRecovered) return null;

  if (status === "online") {
    return (
      <div className="w-full bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center gap-2 text-sm text-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
        <span>Verbindung wiederhergestellt.</span>
      </div>
    );
  }

  return (
    <div className="w-full bg-destructive/10 border-b border-destructive/30 px-4 py-2 flex flex-wrap items-center gap-2 text-sm text-foreground">
      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
      <span className="font-medium">Server vorübergehend nicht erreichbar</span>
      <span className="text-muted-foreground">— wir versuchen es automatisch weiter.</span>
      {lastCheckedAt && (
        <span className="text-muted-foreground text-xs">
          Letzter Versuch:{" "}
          {lastCheckedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="ml-auto h-7"
        disabled={checking}
        onClick={() => void checkNow()}
      >
        <RefreshCcw className={`h-3.5 w-3.5 mr-1.5 ${checking ? "animate-spin" : ""}`} />
        {checking ? "Prüfe…" : "Erneut versuchen"}
      </Button>
    </div>
  );
};
