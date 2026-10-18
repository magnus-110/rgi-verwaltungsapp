import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useBrokerAccess, useMaklerNeuLaden } from "@/hooks/useMakler";
import { exposeHochladen, fehler } from "@/lib/makler";

/** Knopf „Exposé hochladen": speichert beim Objekt und in der RGI-Ablage. */
export function ExposeHochladenKnopf({ propertyId }: { propertyId: string }) {
  const { userId } = useBrokerAccess();
  const neuLaden = useMaklerNeuLaden();
  const eingabe = useRef<HTMLInputElement>(null);
  const [laeuft, setLaeuft] = useState(false);

  const hochladen = async (file: File | undefined) => {
    if (!file) return;
    setLaeuft(true);
    try {
      await exposeHochladen(propertyId, file, userId);
      toast.success("Exposé gespeichert – auch in der RGI-Ablage unter „Makler“");
      neuLaden();
    } catch (e) {
      fehler("Exposé konnte nicht hochgeladen werden", e);
    } finally {
      setLaeuft(false);
      if (eingabe.current) eingabe.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={eingabe}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => hochladen(e.target.files?.[0])}
      />
      <Button variant="outline" className="h-11" disabled={laeuft} onClick={() => eingabe.current?.click()}>
        {laeuft ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileUp className="h-4 w-4 mr-1.5" />}
        Exposé hochladen
      </Button>
    </>
  );
}
