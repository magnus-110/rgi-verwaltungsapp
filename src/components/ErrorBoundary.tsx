import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

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
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <div>
            <h3 className="font-semibold">{this.props.fallbackTitle || "Etwas ist schiefgelaufen"}</h3>
            <p className="text-sm text-muted-foreground mt-1 break-words">
              {this.state.error?.message || "Unbekannter Fehler"}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={this.reset}>
            Erneut versuchen
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
