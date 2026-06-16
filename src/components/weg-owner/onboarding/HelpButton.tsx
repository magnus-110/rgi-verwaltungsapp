import { useState } from "react";
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
import { useGuidedTour } from "./GuidedTourProvider";

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
  const { startTour, isDisabled, disableTours } = useGuidedTour();
  const location = useLocation();
  const currentTour = tourForPath(location.pathname);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isDisabled()) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-tour="help-button"
            size="lg"
            className="fixed bottom-6 left-6 z-40 h-14 rounded-full pl-4 pr-5 shadow-lg gap-2 text-base"
            aria-label="Hilfe"
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
          <DropdownMenuLabel className="text-base">Hilfe</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {currentTour && (
            <DropdownMenuItem
              className="py-3 text-base cursor-pointer"
              onClick={() => startTour(currentTour)}
            >
              Diese Seite erklären
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>

      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hilfe dauerhaft ausblenden?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Hilfe-Touren und der Hilfe-Button werden für Ihren Account ausgeblendet.
              Sie können die Hilfe jederzeit in den <b>Einstellungen</b> wieder einschalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                disableTours();
                setConfirmOpen(false);
              }}
            >
              Ja, ausblenden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
