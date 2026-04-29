import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, ExternalLink } from "lucide-react";

const VIDEO_URL = "https://youtube.com/shorts/1LBJFaslZOQ?feature=share";

interface IntroVideoDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Wird einmalig nach Abschluss des Onboarding-Wizards gezeigt.
 * Markiert sich beim Schließen via localStorage als gesehen.
 */
export const IntroVideoDialog = ({ open, onClose }: IntroVideoDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Erklärvideo zur App</DialogTitle>
          <DialogDescription>
            Schauen Sie sich unser kurzes Erklärvideo an, um die wichtigsten Funktionen der App kennenzulernen.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center space-y-6 py-4">
          <a
            href={VIDEO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="relative group cursor-pointer rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
          >
            <img
              src="/images/video-thumbnail.png"
              alt="Erklärvideo zur RGI App"
              className="w-full max-w-md rounded-xl"
            />
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
              <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <Play className="w-8 h-8 text-primary ml-1" />
              </div>
            </div>
          </a>

          <div className="flex gap-3 w-full max-w-md">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Überspringen
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={() => {
                window.open(VIDEO_URL, "_blank");
                onClose();
              }}
            >
              <ExternalLink className="w-4 h-4" />
              Video ansehen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
