import { useLocation } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGuidedTour } from "./GuidedTourProvider";
import { ALL_TOURS } from "./tours";

/** Bestimmt anhand der aktuellen Route die passende Seiten-Tour. */
function tourForPath(pathname: string): string | null {
  if (pathname === "/weg-owner") return "dashboard";
  if (pathname.startsWith("/weg-owner/reports")) return "reports";
  if (pathname.startsWith("/weg-owner/files")) return "files";
  if (pathname.startsWith("/weg-owner/resolutions")) return "resolutions";
  if (pathname.startsWith("/weg-owner/forum")) return "forum";
  if (pathname.startsWith("/weg-owner/meetings")) return "meetings";
  if (pathname.startsWith("/weg-owner/chatbot")) return "chatbot";
  if (pathname.startsWith("/weg-owner/settings")) return "settings";
  if (pathname.startsWith("/weg-owner/kassenpruefung")) return "cash-audit";
  return null;
}

export function HelpButton() {
  const { startTour, isDisabled } = useGuidedTour();
  const location = useLocation();
  const currentTour = tourForPath(location.pathname);

  if (isDisabled()) return null;


  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-tour="help-button"
          size="lg"
          className="fixed bottom-6 left-6 z-40 h-14 rounded-full pl-4 pr-5 shadow-lg gap-2 text-base"
          aria-label="Hilfe und Erste Schritte"
        >
          <HelpCircle className="h-6 w-6" />
          Hilfe
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-72 text-base"
        sideOffset={12}
      >
        <DropdownMenuLabel className="text-base">Erste Schritte</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {currentTour && (
          <>
            <DropdownMenuItem
              className="py-3 text-base cursor-pointer"
              onClick={() => startTour(currentTour)}
            >
              ▶ Diese Seite erklären
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          className="py-3 text-base cursor-pointer"
          onClick={() => startTour("dashboard")}
        >
          Komplette Einführung starten
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Einzelne Bereiche
        </DropdownMenuLabel>
        {ALL_TOURS.filter((t) => t.id !== "global").map((t) => (
          <DropdownMenuItem
            key={t.id}
            className="py-2.5 text-sm cursor-pointer"
            onClick={() => startTour(t.id)}
          >
            {t.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
