import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AgbText, DatenschutzText } from "@/components/legal/LegalTexts";
import { recordLegalAcceptance } from "@/lib/legalAcceptance";

interface TermsAcceptanceDialogProps {
  open: boolean;
  userId: string;
  onAccepted: () => void;
}

export const TermsAcceptanceDialog = ({ open, userId, onAccepted }: TermsAcceptanceDialogProps) => {
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [datenschutzAcknowledged, setDatenschutzAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccept = async () => {
    if (!agbAccepted || !datenschutzAcknowledged) {
      toast.error("Bitte bestätigen Sie beide Punkte.");
      return;
    }
    setIsSubmitting(true);
    try {
      await recordLegalAcceptance(userId);
      toast.success("Vielen Dank für Ihre Bestätigung!");
      onAccepted();
    } catch (error) {
      console.error("Error recording legal acceptance:", error);
      toast.error("Fehler beim Speichern. Bitte versuchen Sie es erneut.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Rechtliche Hinweise</DialogTitle>
          <DialogDescription>
            Bitte lesen Sie die AGB und die Datenschutzerklärung, um die App nutzen zu können.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="agb" className="w-full">
          <TabsList variant="pill" className="grid w-full grid-cols-2">
            <TabsTrigger variant="pill" value="agb">AGB</TabsTrigger>
            <TabsTrigger variant="pill" value="datenschutz">Datenschutz</TabsTrigger>
          </TabsList>

          <TabsContent value="agb">
            <div className="w-full rounded-md border p-4 max-h-[50vh] overflow-y-auto">
              <AgbText />
            </div>
          </TabsContent>

          <TabsContent value="datenschutz">
            <div className="w-full rounded-md border p-4 max-h-[50vh] overflow-y-auto">
              <DatenschutzText />
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-start space-x-2">
            <Checkbox
              id="agb"
              checked={agbAccepted}
              onCheckedChange={(checked) => setAgbAccepted(checked === true)}
            />
            <label htmlFor="agb" className="text-sm leading-snug">
              Ich habe die <strong>Allgemeinen Geschäftsbedingungen (AGB)</strong> gelesen und akzeptiere sie.
            </label>
          </div>

          <div className="flex items-start space-x-2">
            <Checkbox
              id="datenschutz"
              checked={datenschutzAcknowledged}
              onCheckedChange={(checked) => setDatenschutzAcknowledged(checked === true)}
            />
            <label htmlFor="datenschutz" className="text-sm leading-snug">
              Ich habe die <strong>Datenschutzerklärung</strong> zur Kenntnis genommen.
            </label>
          </div>

          <Button
            onClick={handleAccept}
            disabled={!agbAccepted || !datenschutzAcknowledged || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Wird gespeichert..." : "Bestätigen und fortfahren"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
