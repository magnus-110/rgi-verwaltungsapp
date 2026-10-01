import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PenLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMySignature, useSaveMySignature } from "@/lib/documentSigning";
import { SignatureDrawDialog } from "@/components/documents/SignatureDrawDialog";

/**
 * Einstellungen › Profil: die eigene Unterschrift hinterlegen.
 * Beim Unterschreiben von Dokumenten wird sie dann mit einem Tipp eingesetzt.
 */
export function MySignatureSection() {
  const { data: signature, isLoading } = useMySignature();
  const save = useSaveMySignature();
  const [drawOpen, setDrawOpen] = useState(false);

  const remove = async () => {
    if (!window.confirm("Hinterlegte Unterschrift wirklich löschen?")) return;
    try {
      await save(null);
      toast.success("Unterschrift gelöscht");
    } catch (e: any) {
      toast.error("Löschen fehlgeschlagen: " + (e?.message || e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine className="w-5 h-5" /> Meine Unterschrift
        </CardTitle>
        <CardDescription>
          Wird beim Unterschreiben von Dokumenten in der App mit einem Tipp eingesetzt. Nur du selbst kannst sie sehen
          und benutzen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? null : signature ? (
          <div className="rounded-lg border bg-white p-3 flex items-center justify-center">
            <img src={signature} alt="Meine Unterschrift" className="max-h-24 object-contain" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Noch keine Unterschrift hinterlegt.</p>
        )}
        <div className="flex gap-2">
          <Button onClick={() => setDrawOpen(true)} className="gap-1.5">
            <PenLine className="h-4 w-4" />
            {signature ? "Neu zeichnen" : "Unterschrift hinterlegen"}
          </Button>
          {signature && (
            <Button variant="outline" className="gap-1.5 text-destructive" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Löschen
            </Button>
          )}
        </div>
      </CardContent>
      <SignatureDrawDialog
        open={drawOpen}
        onOpenChange={setDrawOpen}
        offerSave={false}
        title="Meine Unterschrift"
        onDone={async (sig) => {
          try {
            await save(sig.dataUrl);
            toast.success("Unterschrift hinterlegt");
          } catch (e: any) {
            toast.error("Speichern fehlgeschlagen: " + (e?.message || e));
          }
        }}
      />
    </Card>
  );
}
