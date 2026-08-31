import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { isChunkLoadError, reloadOnceForNewVersion, forceReloadNow } from "@/lib/chunkReload";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
    // Chunk-Ladefehler = veraltete App-Version im Browser nach einem
    // Deployment. Einmalig automatisch neu laden (mit Schleifenschutz).
    if (isChunkLoadError(error)) {
      reloadOnceForNewVersion();
    }
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      const chunkError = isChunkLoadError(this.state.error);

      if (chunkError) {
        return (
          <div className="p-6 rounded-lg border border-border bg-muted/30 space-y-3 text-center">
            <RefreshCw className="h-8 w-8 text-muted-foreground mx-auto" />
            <div>
              <h3 className="font-semibold">Neue App-Version verfügbar</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Die Anwendung wurde aktualisiert. Bitte einmal neu laden.
              </p>
            </div>
            <Button size="sm" onClick={forceReloadNow}>
              Jetzt neu laden
            </Button>
          </div>
        );
      }

      return (
        <div className="p-6 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <div>
            <h3 className="font-semibold">{this.props.fallbackTitle || "Etwas ist schiefgelaufen"}</h3>
            <p className="text-sm text-muted-foreground mt-1 break-words">
              {this.state.error?.message || "Unbekannter Fehler"}
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <Button size="sm" variant="outline" onClick={this.reset}>
              Erneut versuchen
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Seite neu laden
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
