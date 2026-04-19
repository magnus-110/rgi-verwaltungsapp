import { BillingTab } from "@/components/finance/BillingTab";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const Billing = () => {
  const navigate = useNavigate();

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/finanzen')} className="gap-1.5 h-10 -ml-2">
          <ArrowLeft className="w-4 h-4" />
          Finanzen
        </Button>
      </div>
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Jahresabrechnung</h1>
        <p className="text-muted-foreground text-xs md:text-sm mt-1">
          Gesamtabrechnung und Einzelabrechnungen Schritt für Schritt erstellen
        </p>
      </div>
      <BillingTab />
    </div>
  );
};
